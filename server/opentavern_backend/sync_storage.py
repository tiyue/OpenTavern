from contextlib import closing
import base64
import hashlib
import json
import os
import sqlite3
from . import config as backend_config, sync_protocol


def ensure_table(db_path):
    with closing(sqlite3.connect(db_path)) as conn, conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS opentavern_sync (
              token_hash TEXT PRIMARY KEY,
              data TEXT NOT NULL,
              updated_at INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS opentavern_sync_v2_meta (
              token_hash TEXT PRIMARY KEY,
              manifest_hash TEXT NOT NULL,
              manifest_chunks INTEGER NOT NULL,
              manifest_bytes INTEGER NOT NULL,
              revision INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              last_saved INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS opentavern_sync_v2_chunks (
              token_hash TEXT NOT NULL,
              object_hash TEXT NOT NULL,
              chunk_index INTEGER NOT NULL,
              chunk_count INTEGER NOT NULL,
              data TEXT NOT NULL,
              chunk_hash TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              PRIMARY KEY (token_hash, object_hash, chunk_index)
            )
            """
        )


def enforce_private_storage_permissions(db_path, image_dir=None):
    storage_dir = os.path.dirname(os.path.abspath(db_path))
    os.chmod(storage_dir, 0o750)
    if image_dir:
        os.chmod(image_dir, 0o750)
    for suffix in ("", "-wal", "-shm", "-journal"):
        candidate = db_path + suffix
        if os.path.exists(candidate):
            os.chmod(candidate, 0o640)


def read_sync_row(db_path, token_hash):
    with closing(sqlite3.connect(db_path)) as conn, conn:
        cur = conn.execute(
            "SELECT data, updated_at FROM opentavern_sync WHERE token_hash = ?",
            (token_hash,),
        )
        row = cur.fetchone()
    return {"data": row[0], "updated_at": row[1]} if row else None


def write_sync_row(db_path, token_hash, data, updated_at):
    with closing(sqlite3.connect(db_path)) as conn, conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO opentavern_sync (token_hash, data, updated_at)
            VALUES (?, ?, ?)
            """,
            (token_hash, data, updated_at),
        )


def delete_sync_row(db_path, token_hash):
    with closing(sqlite3.connect(db_path)) as conn, conn:
        cur = conn.execute(
            "DELETE FROM opentavern_sync WHERE token_hash = ?",
            (token_hash,),
        )
        return cur.rowcount > 0


def read_v2_meta(db_path, token_hash):
    with closing(sqlite3.connect(db_path)) as conn, conn:
        row = conn.execute(
            """
            SELECT manifest_hash, manifest_chunks, manifest_bytes,
                   revision, updated_at, last_saved
              FROM opentavern_sync_v2_meta
             WHERE token_hash = ?
            """,
            (token_hash,),
        ).fetchone()
    if not row:
        return None
    return {
        "manifest_hash": row[0],
        "manifest_chunks": row[1],
        "manifest_bytes": row[2],
        "revision": row[3],
        "updated_at": row[4],
        "last_saved": row[5],
    }


def read_v2_chunk(db_path, token_hash, object_hash, chunk_index):
    with closing(sqlite3.connect(db_path)) as conn, conn:
        row = conn.execute(
            """
            SELECT data, chunk_hash, chunk_count
              FROM opentavern_sync_v2_chunks
             WHERE token_hash = ? AND object_hash = ? AND chunk_index = ?
            """,
            (token_hash, object_hash, chunk_index),
        ).fetchone()
    if not row:
        return None
    return {"data": row[0], "chunk_hash": row[1], "chunk_count": row[2]}


def write_v2_chunk(db_path, token_hash, chunk):
    conn = sqlite3.connect(db_path, timeout=30)
    try:
        conn.execute("BEGIN IMMEDIATE")
        existing = conn.execute(
            """
            SELECT chunk_count, data, chunk_hash
              FROM opentavern_sync_v2_chunks
             WHERE token_hash = ? AND object_hash = ? AND chunk_index = ?
            """,
            (token_hash, chunk["object_hash"], chunk["index"]),
        ).fetchone()
        if existing:
            if (
                int(existing[0]) == chunk["total"]
                and existing[1] == chunk["data"]
                and existing[2] == chunk["chunk_hash"]
            ):
                conn.commit()
                return False
            raise backend_config.SyncV2ChunkConflictError(
                "Sync chunk conflicts with existing content-addressed data."
            )
        conn.execute(
            """
            INSERT INTO opentavern_sync_v2_chunks
              (token_hash, object_hash, chunk_index, chunk_count, data, chunk_hash, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                token_hash,
                chunk["object_hash"],
                chunk["index"],
                chunk["total"],
                chunk["data"],
                chunk["chunk_hash"],
                backend_config.now_ms(),
            ),
        )
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _read_v2_object_rows(conn, token_hash, object_hash):
    return conn.execute(
        """
        SELECT chunk_index, chunk_count, data, chunk_hash
          FROM opentavern_sync_v2_chunks
         WHERE token_hash = ? AND object_hash = ?
         ORDER BY chunk_index
        """,
        (token_hash, object_hash),
    ).fetchall()


def _v2_object_rows_complete(rows, expected_chunks):
    return (
        len(rows) == expected_chunks
        and all(
            int(row[0]) == index and int(row[1]) == expected_chunks
            for index, row in enumerate(rows)
        )
    )


def _validate_v2_object_rows(
    rows,
    object_hash,
    expected_chunks,
    expected_bytes=None,
    collect_bytes=False,
    hash_name="objectHash",
    bytes_name="object bytes",
):
    hasher = hashlib.sha256()
    total_bytes = 0
    parts = [] if collect_bytes else None
    for index, row in enumerate(rows):
        try:
            raw = base64.b64decode(row[2], validate=True)
        except Exception as error:
            raise ValueError("Stored sync chunk data is not valid base64.") from error
        if not raw or len(raw) > backend_config.SYNC_V2_CHUNK_BYTES:
            raise ValueError("Stored sync chunk size is invalid.")
        if index < expected_chunks - 1 and len(raw) != backend_config.SYNC_V2_CHUNK_BYTES:
            raise ValueError("Stored non-final sync chunk size is invalid.")
        if hashlib.sha256(raw).hexdigest() != row[3]:
            raise ValueError("Stored chunkHash does not match the decoded chunk data.")
        hasher.update(raw)
        total_bytes += len(raw)
        if parts is not None:
            parts.append(raw)

    if expected_bytes is not None and total_bytes != expected_bytes:
        raise ValueError("%s does not match the concatenated chunk data." % bytes_name)
    if hasher.hexdigest() != object_hash:
        raise ValueError("%s does not match the concatenated chunk data." % hash_name)
    return (b"".join(parts) if parts is not None else None), total_bytes


def _parse_v2_manifest_references(manifest_bytes, commit):
    try:
        manifest = json.loads(manifest_bytes.decode("utf-8"))
    except Exception as error:
        raise ValueError("Sync v2 manifest must be valid UTF-8 JSON.") from error
    if not backend_config.is_plain_object(manifest) or manifest.get("version") != 2 or manifest.get("app") != "OpenTavern":
        raise ValueError("Sync v2 manifest format is invalid.")
    items = manifest.get("items")
    if not backend_config.is_plain_object(items):
        raise ValueError("Sync v2 manifest items must be an object.")
    manifest_last_saved = sync_protocol.parse_v2_integer(manifest.get("lastSaved"), "manifest.lastSaved")
    if manifest_last_saved != commit["last_saved"]:
        raise ValueError("lastSaved does not match the sync v2 manifest.")

    references = {}
    for item_key, descriptor in items.items():
        if not isinstance(item_key, str) or not backend_config.is_plain_object(descriptor):
            raise ValueError("Sync v2 manifest contains an invalid object descriptor.")
        object_hash = sync_protocol.normalize_v2_hash(descriptor.get("objectHash"), "objectHash")
        object_bytes = sync_protocol.parse_v2_integer(
            descriptor.get("bytes"),
            "object bytes",
            minimum=1,
        )
        object_chunks = sync_protocol.parse_v2_integer(
            descriptor.get("chunks"),
            "object chunks",
            minimum=1,
        )
        if (object_bytes + backend_config.SYNC_V2_CHUNK_BYTES - 1) // backend_config.SYNC_V2_CHUNK_BYTES != object_chunks:
            raise ValueError("Sync v2 manifest object chunk metadata is inconsistent.")
        previous = references.get(object_hash)
        if previous and previous != (object_chunks, object_bytes):
            raise ValueError("Sync v2 manifest contains inconsistent duplicate object references.")
        references[object_hash] = (object_chunks, object_bytes)

    reachable_hashes = set(references)
    reachable_hashes.add(commit["manifest_hash"])
    return references, reachable_hashes


def _delete_v2_orphan_chunks(conn, token_hash, reachable_hashes):
    if not reachable_hashes:
        conn.execute(
            "DELETE FROM opentavern_sync_v2_chunks WHERE token_hash = ?",
            (token_hash,),
        )
        return
    conn.execute(
        """
        CREATE TEMP TABLE IF NOT EXISTS opentavern_sync_v2_reachable (
          object_hash TEXT PRIMARY KEY
        )
        """
    )
    conn.execute("DELETE FROM opentavern_sync_v2_reachable")
    conn.executemany(
        "INSERT INTO opentavern_sync_v2_reachable (object_hash) VALUES (?)",
        ((object_hash,) for object_hash in reachable_hashes),
    )
    conn.execute(
        """
        DELETE FROM opentavern_sync_v2_chunks
         WHERE token_hash = ?
           AND NOT EXISTS (
             SELECT 1
               FROM opentavern_sync_v2_reachable AS reachable
              WHERE reachable.object_hash = opentavern_sync_v2_chunks.object_hash
           )
        """,
        (token_hash,),
    )


def commit_v2_manifest(db_path, token_hash, commit):
    conn = sqlite3.connect(db_path, timeout=30)
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            """
            SELECT manifest_hash, manifest_chunks, manifest_bytes,
                   revision, updated_at, last_saved
              FROM opentavern_sync_v2_meta
             WHERE token_hash = ?
            """,
            (token_hash,),
        ).fetchone()
        current_revision = int(row[3]) if row else 0
        current_updated_at = int(row[4]) if row else None
        if commit["expected_revision"] != current_revision:
            conn.rollback()
            return None, {
                "current_revision": current_revision,
                "current_updated_at": current_updated_at,
            }, None

        manifest_rows = _read_v2_object_rows(conn, token_hash, commit["manifest_hash"])
        if not _v2_object_rows_complete(manifest_rows, commit["manifest_chunks"]):
            conn.rollback()
            return None, None, {
                "expected_chunks": commit["manifest_chunks"],
                "stored_chunks": len(manifest_rows),
            }
        manifest_bytes, actual_manifest_bytes = _validate_v2_object_rows(
            manifest_rows,
            commit["manifest_hash"],
            commit["manifest_chunks"],
            expected_bytes=commit["manifest_bytes"],
            collect_bytes=True,
            hash_name="manifestHash",
            bytes_name="manifestBytes",
        )
        references, reachable_hashes = _parse_v2_manifest_references(manifest_bytes, commit)

        validated_objects = {
            commit["manifest_hash"]: (commit["manifest_chunks"], actual_manifest_bytes),
        }
        for object_hash, (object_chunks, object_bytes) in references.items():
            previous = validated_objects.get(object_hash)
            if previous:
                if previous != (object_chunks, object_bytes):
                    raise ValueError("Sync v2 manifest object metadata is inconsistent.")
                continue
            object_rows = _read_v2_object_rows(conn, token_hash, object_hash)
            if not _v2_object_rows_complete(object_rows, object_chunks):
                raise ValueError("Sync v2 manifest references incomplete object chunks.")
            _validate_v2_object_rows(
                object_rows,
                object_hash,
                object_chunks,
                expected_bytes=object_bytes,
            )
            validated_objects[object_hash] = (object_chunks, object_bytes)

        revision = current_revision + 1
        updated_at = max(backend_config.now_ms(), (current_updated_at or 0) + 1)
        conn.execute(
            """
            INSERT OR REPLACE INTO opentavern_sync_v2_meta
              (token_hash, manifest_hash, manifest_chunks, manifest_bytes,
               revision, updated_at, last_saved)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                token_hash,
                commit["manifest_hash"],
                commit["manifest_chunks"],
                commit["manifest_bytes"],
                revision,
                updated_at,
                commit["last_saved"],
            ),
        )
        _delete_v2_orphan_chunks(conn, token_hash, reachable_hashes)
        conn.commit()
        return {
            "manifest_hash": commit["manifest_hash"],
            "manifest_chunks": commit["manifest_chunks"],
            "manifest_bytes": commit["manifest_bytes"],
            "revision": revision,
            "updated_at": updated_at,
            "last_saved": commit["last_saved"],
        }, None, None
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def delete_v2_sync(db_path, token_hash, expected_revision):
    conn = sqlite3.connect(db_path, timeout=30)
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT revision, updated_at FROM opentavern_sync_v2_meta WHERE token_hash = ?",
            (token_hash,),
        ).fetchone()
        current_revision = int(row[0]) if row else 0
        current_updated_at = int(row[1]) if row else None
        if expected_revision is not None and expected_revision != current_revision:
            conn.rollback()
            return None, {
                "current_revision": current_revision,
                "current_updated_at": current_updated_at,
            }
        deleted = conn.execute(
            "DELETE FROM opentavern_sync_v2_meta WHERE token_hash = ?",
            (token_hash,),
        ).rowcount > 0
        _delete_v2_orphan_chunks(conn, token_hash, set())
        conn.commit()
        return {
            "deleted": deleted,
            "previous_revision": current_revision,
            "previous_updated_at": current_updated_at,
        }, None
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

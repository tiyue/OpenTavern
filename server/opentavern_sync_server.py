#!/usr/bin/env python3
"""OpenTavern 的独立云同步后端，新手可以先把它理解成“保存云端快照的小服务器”。

浏览器把设置、角色和聊天记录整理成 JSON 快照，再通过 HTTP 请求交给本程序。本程序
验证同步令牌和数据大小，使用 SQLite 文件保存快照，并按照 GET、HEAD、POST、DELETE
分别完成读取元数据、读取正文、保存和删除。它与 Cloudflare Pages Function 版本使用
同一套协议，因此前端不需要知道部署的是哪一种后端。

程序只使用 Python 标准库，适合资源较少的 VPS。通常由 systemd 启动并监听
127.0.0.1:8787，再由 Nginx 提供公网 HTTPS 入口。修改时要特别保护令牌和用户快照，
不要把它们写进日志；数据库写入和并发条件检查也不能为了简化代码而绕过。
"""

import argparse
import base64
from collections import deque
from contextlib import closing
import hashlib
import hmac
import json
import os
import re
import secrets
import socket
import sqlite3
import struct
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse, parse_qs
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen


MAX_IMAGE_REQUEST_BYTES = 16 * 1024 * 1024
MAX_IMAGE_BYTES = 20 * 1024 * 1024
MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024
MAX_REFERENCE_IMAGE_DIMENSION = 3072
SYNC_V2_CHUNK_BYTES = 384 * 1024
SYNC_V2_MAX_BASE64_CHARS = 600000
MAX_PROMPT_CHARS = 5000
MAX_NEGATIVE_PROMPT_CHARS = 500
MAX_IMAGE_SEED = 2147483647
DEFAULT_IMAGE_MAX_CONCURRENT = 2
MIN_IMAGE_MAX_CONCURRENT = 1
MAX_IMAGE_MAX_CONCURRENT = 32
DEFAULT_IMAGE_REQUESTS_PER_MINUTE = 10
MIN_IMAGE_REQUESTS_PER_MINUTE = 1
MAX_IMAGE_REQUESTS_PER_MINUTE = 600
DEFAULT_IMAGE_MAX_STORAGE_BYTES = 5 * 1024 * 1024 * 1024
MIN_IMAGE_MAX_STORAGE_BYTES = 100 * 1024 * 1024
MAX_IMAGE_MAX_STORAGE_BYTES = 1024 * 1024 * 1024 * 1024
IMAGE_RATE_LIMIT_WINDOW_SECONDS = 60.0
QWEN_REQUEST_TIMEOUT_SECONDS = 180
IMAGE_DOWNLOAD_TIMEOUT_SECONDS = 60
DEFAULT_DB_PATH = "/var/lib/opentavern-sync/sync.sqlite3"
DEFAULT_IMAGE_DIR = "/var/lib/opentavern-sync/images"
DEFAULT_QWEN_IMAGE_MODEL = "qwen-image-2.0-pro"
IMAGE_MAX_CONCURRENT_ENV = "IMAGE_GATEWAY_MAX_CONCURRENT"
IMAGE_REQUESTS_PER_MINUTE_ENV = "IMAGE_GATEWAY_REQUESTS_PER_MINUTE"
IMAGE_MAX_STORAGE_BYTES_ENV = "IMAGE_GATEWAY_MAX_STORAGE_BYTES"
SYNC_PATHS = {"/api/sync", "/opentavern-sync", "/opentavern-sync/"}
IMAGE_GENERATE_PATHS = {"/api/image/generate", "/opentavern-image/generate"}
IMAGE_ASSET_PREFIX = "/api/image/assets/"
IMAGE_ASSET_COMPAT_PREFIX = "/opentavern-image/assets/"
IMAGE_ASSET_PREFIXES = (IMAGE_ASSET_PREFIX, IMAGE_ASSET_COMPAT_PREFIX)
IMAGE_ASSET_ID_PATTERN = re.compile(r"^[a-f0-9]{48}$")
SYNC_V2_HASH_PATTERN = re.compile(r"^[a-f0-9]{64}$")
WORKSPACE_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
QWEN_ERROR_TEXT_MAX_CHARS = 500
QWEN_ERROR_CODE_MAX_CHARS = 128
QWEN_REQUEST_ID_MAX_CHARS = 128
QWEN_IMAGE_SIZES = {
    "2048*2048": (2048, 2048),
    "2688*1536": (2688, 1536),
    "1536*2688": (1536, 2688),
    "2368*1728": (2368, 1728),
    "1728*2368": (1728, 2368),
}
IMAGE_MIME_EXTENSIONS = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
}


def validate_qwen_image_url(image_url):
    parsed = urlparse(image_url)
    hostname = (parsed.hostname or "").lower().rstrip(".")
    if (
        parsed.scheme != "https"
        or not hostname.endswith(".aliyuncs.com")
        or parsed.username
        or parsed.password
    ):
        raise ImageGatewayError("Qwen returned an invalid image URL.")
    return parsed


def get_image_asset_prefix_for_generate_path(request_path):
    if request_path == "/opentavern-image/generate":
        return IMAGE_ASSET_COMPAT_PREFIX
    return IMAGE_ASSET_PREFIX


class QwenImageRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_qwen_image_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class ImageGatewayError(Exception):
    def __init__(
        self,
        message,
        status=502,
        request_id=None,
        provider=None,
        code=None,
        upstream_code=None,
        reason=None,
        upstream_status=None,
    ):
        super().__init__(message)
        self.status = status
        self.request_id = request_id
        self.provider = provider
        self.code = code
        self.upstream_code = upstream_code
        self.reason = reason
        self.upstream_status = upstream_status


class SyncV2ChunkConflictError(ValueError):
    pass


def parse_bounded_env_int(environ, name, default, minimum, maximum):
    raw_value = environ.get(name)
    if raw_value is None:
        return default
    try:
        value = int(raw_value.strip(), 10)
    except (AttributeError, TypeError, ValueError):
        return default
    if value < minimum or value > maximum:
        return default
    return value


def load_image_gateway_limits(environ=None):
    environ = os.environ if environ is None else environ
    return {
        "max_concurrent": parse_bounded_env_int(
            environ,
            IMAGE_MAX_CONCURRENT_ENV,
            DEFAULT_IMAGE_MAX_CONCURRENT,
            MIN_IMAGE_MAX_CONCURRENT,
            MAX_IMAGE_MAX_CONCURRENT,
        ),
        "requests_per_minute": parse_bounded_env_int(
            environ,
            IMAGE_REQUESTS_PER_MINUTE_ENV,
            DEFAULT_IMAGE_REQUESTS_PER_MINUTE,
            MIN_IMAGE_REQUESTS_PER_MINUTE,
            MAX_IMAGE_REQUESTS_PER_MINUTE,
        ),
    }


def load_image_storage_limit(environ=None):
    environ = os.environ if environ is None else environ
    return parse_bounded_env_int(
        environ,
        IMAGE_MAX_STORAGE_BYTES_ENV,
        DEFAULT_IMAGE_MAX_STORAGE_BYTES,
        MIN_IMAGE_MAX_STORAGE_BYTES,
        MAX_IMAGE_MAX_STORAGE_BYTES,
    )


class ImageGenerationLimiter:
    def __init__(self, max_concurrent, requests_per_minute, clock=None):
        if (
            isinstance(max_concurrent, bool)
            or not isinstance(max_concurrent, int)
            or max_concurrent < 1
            or isinstance(requests_per_minute, bool)
            or not isinstance(requests_per_minute, int)
            or requests_per_minute < 1
        ):
            raise ValueError("Image generation limits must be positive integers.")
        self.max_concurrent = max_concurrent
        self.requests_per_minute = requests_per_minute
        self._clock = clock or time.monotonic
        self._lock = threading.Lock()
        self._active_requests = 0
        self._request_times = deque()

    def acquire(self):
        with self._lock:
            now = self._clock()
            cutoff = now - IMAGE_RATE_LIMIT_WINDOW_SECONDS
            while self._request_times and self._request_times[0] <= cutoff:
                self._request_times.popleft()
            if len(self._request_times) >= self.requests_per_minute:
                raise ImageGatewayError("Image generation rate limit exceeded.", status=429)
            if self._active_requests >= self.max_concurrent:
                raise ImageGatewayError(
                    "Too many concurrent image generation requests.",
                    status=429,
                )
            self._request_times.append(now)
            self._active_requests += 1

    def release(self):
        with self._lock:
            if self._active_requests < 1:
                raise RuntimeError("Image generation limiter released without an active request.")
            self._active_requests -= 1


def now_ms():
    return int(time.time() * 1000)


def byte_length(text):
    return len(text.encode("utf-8"))


def is_plain_object(value):
    return isinstance(value, dict)


def normalize_object_map(value):
    return value if is_plain_object(value) else {}


def normalize_timestamp(value, fallback=None):
    if fallback is None:
        fallback = now_ms()
    try:
        timestamp = float(value)
        if timestamp == timestamp:
            return int(timestamp)
    except (TypeError, ValueError):
        pass
    return fallback


def normalize_boolean(value):
    if value is True or value == 1:
        return True
    if isinstance(value, str):
        return value.strip().lower() in {"true", "yes", "1"}
    return False


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
            raise SyncV2ChunkConflictError(
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
                now_ms(),
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
        if not raw or len(raw) > SYNC_V2_CHUNK_BYTES:
            raise ValueError("Stored sync chunk size is invalid.")
        if index < expected_chunks - 1 and len(raw) != SYNC_V2_CHUNK_BYTES:
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
    if not is_plain_object(manifest) or manifest.get("version") != 2 or manifest.get("app") != "OpenTavern":
        raise ValueError("Sync v2 manifest format is invalid.")
    items = manifest.get("items")
    if not is_plain_object(items):
        raise ValueError("Sync v2 manifest items must be an object.")
    manifest_last_saved = parse_v2_integer(manifest.get("lastSaved"), "manifest.lastSaved")
    if manifest_last_saved != commit["last_saved"]:
        raise ValueError("lastSaved does not match the sync v2 manifest.")

    references = {}
    for item_key, descriptor in items.items():
        if not isinstance(item_key, str) or not is_plain_object(descriptor):
            raise ValueError("Sync v2 manifest contains an invalid object descriptor.")
        object_hash = normalize_v2_hash(descriptor.get("objectHash"), "objectHash")
        object_bytes = parse_v2_integer(
            descriptor.get("bytes"),
            "object bytes",
            minimum=1,
        )
        object_chunks = parse_v2_integer(
            descriptor.get("chunks"),
            "object chunks",
            minimum=1,
        )
        if (object_bytes + SYNC_V2_CHUNK_BYTES - 1) // SYNC_V2_CHUNK_BYTES != object_chunks:
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
        updated_at = max(now_ms(), (current_updated_at or 0) + 1)
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


def hash_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def get_token(headers):
    auth = headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return headers.get("X-OpenTavern-Token", "").strip()


def validate_token(token):
    if not token or len(token) < 8:
        return "A sync token with at least 8 characters is required.", 401
    if len(token) > 512:
        return "Sync token is too long.", 400
    return None, None


def parse_v2_integer(value, name, minimum=0, maximum=9007199254740991):
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("%s must be an integer." % name)
    if value < minimum or value > maximum:
        raise ValueError("%s is out of range." % name)
    return value


def normalize_v2_hash(value, name):
    if not isinstance(value, str):
        raise ValueError("%s must be a SHA-256 hash." % name)
    value = value.strip().lower()
    if not SYNC_V2_HASH_PATTERN.fullmatch(value):
        raise ValueError("%s must be a 64-character SHA-256 hash." % name)
    return value


def parse_v2_chunk_payload(body):
    if not is_plain_object(body):
        raise ValueError("Invalid sync chunk payload.")
    object_hash = normalize_v2_hash(body.get("objectHash"), "objectHash")
    chunk_hash = normalize_v2_hash(body.get("chunkHash"), "chunkHash")
    index = parse_v2_integer(body.get("index"), "index")
    total = parse_v2_integer(body.get("total"), "total", minimum=1)
    if index >= total:
        raise ValueError("index must be smaller than total.")

    encoded = body.get("data")
    if not isinstance(encoded, str):
        raise ValueError("data must be a base64 string.")
    if len(encoded) > SYNC_V2_MAX_BASE64_CHARS:
        raise OverflowError("Encoded sync chunk is too large.")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except Exception as error:
        raise ValueError("data must be valid base64.") from error
    if not raw or len(raw) > SYNC_V2_CHUNK_BYTES:
        raise OverflowError("Sync chunk is too large or empty.")
    if index < total - 1 and len(raw) != SYNC_V2_CHUNK_BYTES:
        raise ValueError("Every non-final sync chunk must be exactly %s bytes." % SYNC_V2_CHUNK_BYTES)
    if hashlib.sha256(raw).hexdigest() != chunk_hash:
        raise ValueError("chunkHash does not match the decoded chunk data.")
    return {
        "object_hash": object_hash,
        "chunk_hash": chunk_hash,
        "index": index,
        "total": total,
        "data": encoded,
        "bytes": len(raw),
    }


def parse_v2_commit_payload(body):
    if not is_plain_object(body):
        raise ValueError("Invalid sync commit payload.")
    return {
        "expected_revision": parse_v2_integer(body.get("expectedRevision"), "expectedRevision"),
        "manifest_hash": normalize_v2_hash(body.get("manifestHash"), "manifestHash"),
        "manifest_chunks": parse_v2_integer(
            body.get("manifestChunks"),
            "manifestChunks",
            minimum=1,
        ),
        "manifest_bytes": parse_v2_integer(
            body.get("manifestBytes"),
            "manifestBytes",
            minimum=1,
        ),
        "last_saved": parse_v2_integer(body.get("lastSaved"), "lastSaved"),
    }


def parse_v2_if_match(headers):
    raw = headers.get("If-Match")
    if raw is None or raw.strip() == "":
        return None
    raw = raw.strip()
    if raw.startswith("W/"):
        raw = raw[2:].strip()
    if len(raw) >= 2 and raw[0] == '"' and raw[-1] == '"':
        raw = raw[1:-1]
    if not re.fullmatch(r"\d+", raw):
        raise ValueError("If-Match must contain a non-negative revision.")
    return parse_v2_integer(int(raw), "If-Match")


def v2_headers(meta=None, revision=None, extra=None):
    headers = dict(extra or {})
    headers["X-OpenTavern-Protocol"] = "2"
    if meta is not None:
        revision = int(meta["revision"])
        headers["X-OpenTavern-Updated-At"] = str(int(meta["updated_at"]))
        headers["ETag"] = '"%s"' % revision
    if revision is not None:
        revision = int(revision)
        headers["X-OpenTavern-Revision"] = str(revision)
    return headers


def get_image_gateway_token(headers):
    token = headers.get("X-OpenTavern-Image-Token", "").strip()
    if token:
        return token
    auth = headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return ""


def validate_image_gateway_token(headers, configured_token, upstream_api_key):
    if not configured_token:
        raise ImageGatewayError("Image generation is not configured.", status=503)
    if upstream_api_key and hmac.compare_digest(configured_token, upstream_api_key):
        raise ImageGatewayError("Image gateway token must be different from the upstream API key.", status=503)
    supplied_token = get_image_gateway_token(headers)
    if not supplied_token or not hmac.compare_digest(supplied_token, configured_token):
        raise ImageGatewayError("Invalid image gateway token.", status=401)


def get_image_gateway_health(server):
    configured = bool(
        server.image_gateway_token
        and server.dashscope_api_key
        and server.dashscope_workspace_id
        and not hmac.compare_digest(server.image_gateway_token, server.dashscope_api_key)
    )
    storage_writable = bool(
        os.path.isdir(server.image_dir)
        and os.access(server.image_dir, os.W_OK | os.X_OK)
    )
    return {
        "configured": configured,
        "storageWritable": storage_writable,
        "ready": configured and storage_writable,
        "model": server.qwen_image_model,
        "maxStorageBytes": server.image_max_storage_bytes,
    }


def validate_image_generation_request(body):
    if not is_plain_object(body):
        raise ValueError("Invalid image generation payload.")

    prompt = body.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("Prompt is required.")
    prompt = prompt.strip()
    if len(prompt) > MAX_PROMPT_CHARS:
        raise ValueError("Prompt is too long.")

    negative_prompt = body.get("negativePrompt", body.get("negative_prompt", ""))
    if negative_prompt is None:
        negative_prompt = ""
    if not isinstance(negative_prompt, str):
        raise ValueError("Negative prompt must be a string.")
    if len(negative_prompt) > MAX_NEGATIVE_PROMPT_CHARS:
        raise ValueError("Negative prompt must not exceed 500 characters.")

    size = body.get("size", "2048*2048")
    if size not in QWEN_IMAGE_SIZES:
        raise ValueError("Unsupported image size.")

    prompt_extend = body.get("promptExtend", body.get("prompt_extend", True))
    if not isinstance(prompt_extend, bool):
        raise ValueError("promptExtend must be a boolean.")

    seed = body.get("seed")
    if seed is not None:
        if isinstance(seed, bool) or not isinstance(seed, int):
            raise ValueError("Seed must be an integer.")
        if seed < 0 or seed > MAX_IMAGE_SEED:
            raise ValueError("Seed must be between 0 and 2147483647.")

    reference_image = body.get("referenceImage", body.get("reference_image"))
    if reference_image in (None, ""):
        reference_image = None
    else:
        reference_image = validate_image_generation_reference_image(reference_image)

    return {
        "prompt": prompt,
        "reference_image": reference_image,
        "negative_prompt": negative_prompt,
        "size": size,
        "prompt_extend": prompt_extend,
        "seed": seed,
    }


def validate_image_generation_reference_image(value):
    if not isinstance(value, str):
        raise ValueError("referenceImage must be a Base64 image data URL.")
    if len(value) > (MAX_REFERENCE_IMAGE_BYTES * 4 // 3) + 1024:
        raise OverflowError("Reference image exceeds 10 MiB.")
    try:
        prefix, encoded = value.split(",", 1)
    except ValueError as error:
        raise ValueError("referenceImage must be a Base64 image data URL.") from error
    mime_by_prefix = {
        "data:image/png;base64": "image/png",
        "data:image/jpeg;base64": "image/jpeg",
        "data:image/jpg;base64": "image/jpeg",
    }
    mime = mime_by_prefix.get(prefix.strip().lower())
    if not mime or not encoded or not re.fullmatch(r"[A-Za-z0-9+/]+={0,2}", encoded):
        raise ValueError("referenceImage must be a PNG or JPEG Base64 data URL.")
    try:
        data = base64.b64decode(encoded, validate=True)
    except Exception as error:
        raise ValueError("referenceImage contains invalid Base64 data.") from error
    if not data:
        raise ValueError("referenceImage is empty.")
    if len(data) > MAX_REFERENCE_IMAGE_BYTES:
        raise OverflowError("Reference image exceeds 10 MiB.")
    try:
        detected_mime, width, height = inspect_image(data)
    except ImageGatewayError as error:
        raise ValueError("referenceImage is not a supported PNG or JPEG image.") from error
    if detected_mime != mime:
        raise ValueError("referenceImage MIME type does not match its image data.")
    if width > MAX_REFERENCE_IMAGE_DIMENSION or height > MAX_REFERENCE_IMAGE_DIMENSION:
        raise ValueError("referenceImage width and height must not exceed 3072 pixels.")
    canonical_prefix = "data:%s;base64" % mime
    if prefix == canonical_prefix:
        return value
    return "%s,%s" % (canonical_prefix, encoded)


def sanitize_qwen_error_text(value, secrets_to_redact=()):
    if not isinstance(value, (str, int, float)):
        return ""
    raw_text = str(value)[:4096]
    raw_text = re.sub(
        r"(?i)data:image/[A-Za-z0-9.+-]+;base64,(?:[A-Za-z0-9+/=]+[ \t\r\n]*)+",
        "data:image/[REDACTED];base64,[REDACTED]",
        raw_text,
    )
    text = " ".join(raw_text.split()).strip()
    if not text:
        return ""
    for secret in secrets_to_redact:
        secret = str(secret or "").strip()
        if secret:
            text = text.replace(secret, "[REDACTED]")
    text = re.sub(
        r"(?i)\b(authorization|api[-_ ]?key|access[-_ ]?token|token|signature|access[-_ ]?key(?:id)?|security[-_ ]?token|credential)\b\s*[:=]\s*(?:bearer\s+)?[^\s,;]+",
        lambda match: "%s=[REDACTED]" % match.group(1),
        text,
    )
    text = re.sub(
        r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}",
        "Bearer [REDACTED]",
        text,
    )
    text = re.sub(r"\bsk-[A-Za-z0-9_-]{8,}\b", "[REDACTED]", text)
    text = re.sub(
        r"(?i)data:image/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=]+",
        "data:image/[REDACTED];base64,[REDACTED]",
        text,
    )
    text = re.sub(
        r"(?i)([?&](?:api_key|access_token|token|signature|x-oss-signature|x-amz-signature|accesskeyid|securitytoken|credential)=)[^&\s]+",
        r"\1[REDACTED]",
        text,
    )
    text = re.sub(r"(?i)https?://[^\s]+", "[URL]", text)
    text = re.sub(r"<[^>]{1,200}>", " ", text)
    text = " ".join(text.split())
    return text[:QWEN_ERROR_TEXT_MAX_CHARS]


def sanitize_qwen_error_code(value, secrets_to_redact=()):
    text = sanitize_qwen_error_text(value, secrets_to_redact)
    text = re.sub(r"[^A-Za-z0-9_.:-]+", "_", text).strip("_")
    return text[:QWEN_ERROR_CODE_MAX_CHARS]


def sanitize_qwen_request_id(value, secrets_to_redact=()):
    text = sanitize_qwen_error_text(value, secrets_to_redact)
    text = re.sub(r"[^A-Za-z0-9_.:-]+", "", text)
    return text[:QWEN_REQUEST_ID_MAX_CHARS]


def extract_qwen_error_details(payload, secrets_to_redact=()):
    if not isinstance(payload, dict):
        return "", ""

    containers = [payload]
    for key in ("error", "output"):
        value = payload.get(key)
        if isinstance(value, dict):
            containers.append(value)
            nested_error = value.get("error")
            if isinstance(nested_error, dict):
                containers.append(nested_error)

    code = ""
    reason = ""
    scalar_error = payload.get("error")
    if isinstance(scalar_error, (str, int, float)):
        reason = sanitize_qwen_error_text(scalar_error, secrets_to_redact)
    for container in containers:
        if not code:
            for key in ("code", "error_code", "errorCode", "finish_reason", "task_status", "status"):
                candidate = container.get(key)
                if isinstance(candidate, (str, int, float)):
                    normalized = sanitize_qwen_error_code(candidate, secrets_to_redact)
                    if normalized.lower() not in ("stop", "success", "succeeded"):
                        code = normalized
                        break
        if not reason:
            for key in ("message", "msg", "error_message", "errorMessage", "detail", "reason"):
                candidate = container.get(key)
                if isinstance(candidate, (str, int, float)):
                    reason = sanitize_qwen_error_text(candidate, secrets_to_redact)
                    if reason:
                        break

    output = payload.get("output")
    choices = output.get("choices", []) if isinstance(output, dict) else []
    if isinstance(choices, list):
        for choice in choices:
            if not isinstance(choice, dict):
                continue
            if not code:
                finish_reason = sanitize_qwen_error_code(choice.get("finish_reason"), secrets_to_redact)
                if finish_reason.lower() not in ("", "stop", "success", "succeeded"):
                    code = finish_reason
            if reason:
                continue
            message = choice.get("message")
            content = message.get("content", []) if isinstance(message, dict) else []
            if isinstance(content, (str, int, float)):
                reason = sanitize_qwen_error_text(content, secrets_to_redact)
                continue
            if isinstance(content, list):
                for item in content:
                    text = item.get("text") if isinstance(item, dict) else None
                    reason = sanitize_qwen_error_text(text, secrets_to_redact)
                    if reason:
                        break

    return code, reason


def qwen_response_has_explicit_failure(payload):
    if not isinstance(payload, dict):
        return False

    success_values = {"", "stop", "ok", "success", "succeeded", "complete", "completed"}
    failure_values = {
        "failed", "failure", "error", "rejected", "cancelled", "canceled",
        "content_filter", "content_filtered", "safety", "blocked",
    }
    containers = [payload]
    output = payload.get("output")
    if isinstance(output, dict):
        containers.append(output)
    error_value = payload.get("error")
    if isinstance(error_value, dict):
        containers.append(error_value)
    elif isinstance(error_value, (str, int, float)) and str(error_value).strip():
        return True

    for container in containers:
        for key in ("task_status", "status"):
            status = sanitize_qwen_error_code(container.get(key)).lower()
            if status in failure_values:
                return True
        for key in ("code", "error_code", "errorCode"):
            code = sanitize_qwen_error_code(container.get(key)).lower()
            if code and code not in success_values and code != "200":
                return True

    choices = output.get("choices", []) if isinstance(output, dict) else []
    if isinstance(choices, list):
        for choice in choices:
            if not isinstance(choice, dict):
                continue
            finish_reason = sanitize_qwen_error_code(choice.get("finish_reason")).lower()
            if finish_reason and finish_reason not in success_values:
                return True
    return False


def get_qwen_request_id(headers, payload=None, secrets_to_redact=()):
    headers = headers or {}
    payload = payload if isinstance(payload, dict) else {}
    candidates = (
        payload.get("request_id"),
        payload.get("requestId"),
        headers.get("X-DashScope-Request-Id"),
        headers.get("X-Request-Id"),
    )
    for candidate in candidates:
        request_id = sanitize_qwen_request_id(candidate, secrets_to_redact)
        if request_id:
            return request_id
    return ""


def read_limited_response(response, max_bytes, error_message):
    content_length = response.headers.get("Content-Length")
    if content_length:
        try:
            if int(content_length) > max_bytes:
                raise ImageGatewayError(error_message)
        except ValueError:
            pass
    data = response.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ImageGatewayError(error_message)
    return data


def call_qwen_image_api(config, image_request):
    api_key = config.get("api_key", "").strip()
    workspace_id = config.get("workspace_id", "").strip()
    model = config.get("model", "").strip() or DEFAULT_QWEN_IMAGE_MODEL
    if not api_key or not workspace_id:
        raise ImageGatewayError("Qwen image generation is not configured.", status=503)
    if not WORKSPACE_ID_PATTERN.fullmatch(workspace_id):
        raise ImageGatewayError("Invalid DashScope workspace configuration.", status=503)

    parameters = {
        "negative_prompt": image_request["negative_prompt"],
        "prompt_extend": image_request["prompt_extend"],
        "watermark": False,
        "size": image_request["size"],
        "n": 1,
    }
    if image_request["seed"] is not None:
        parameters["seed"] = image_request["seed"]

    content = []
    if image_request.get("reference_image"):
        content.append({"image": image_request["reference_image"]})
    content.append({"text": image_request["prompt"]})

    payload = {
        "model": model,
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": content,
                }
            ]
        },
        "parameters": parameters,
    }
    endpoint = (
        "https://%s.cn-beijing.maas.aliyuncs.com/api/v1/services/"
        "aigc/multimodal-generation/generation" % workspace_id
    )
    request = Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
        headers={
            "Authorization": "Bearer %s" % api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "OpenTavernImageGateway/1.0",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=QWEN_REQUEST_TIMEOUT_SECONDS) as response:
            response_headers = response.headers
            try:
                raw = read_limited_response(response, 2 * 1024 * 1024, "Qwen response is too large.")
            except ImageGatewayError as error:
                error.request_id = error.request_id or get_qwen_request_id(
                    response_headers,
                    secrets_to_redact=(api_key,),
                )
                error.provider = error.provider or "qwen"
                error.code = error.code or "QWEN_INVALID_RESPONSE"
                error.reason = error.reason or str(error)
                raise
    except HTTPError as error:
        request_id = get_qwen_request_id(error.headers, secrets_to_redact=(api_key,))
        error_payload = None
        try:
            error_payload = json.loads(error.read(64 * 1024).decode("utf-8"))
            request_id = get_qwen_request_id(
                error.headers,
                error_payload,
                secrets_to_redact=(api_key,),
            )
        except Exception:
            pass
        finally:
            try:
                error.close()
            except Exception:
                pass
        error_code, error_reason = extract_qwen_error_details(
            error_payload,
            secrets_to_redact=(api_key,),
        )
        if not error_code:
            error_code = "HTTP_%s" % error.code
        if not error_reason:
            error_reason = "Qwen rejected the request with HTTP %s." % error.code
        status = 429 if error.code == 429 else 502
        raise ImageGatewayError(
            "Qwen image generation failed.",
            status=status,
            request_id=request_id,
            provider="qwen",
            code="QWEN_UPSTREAM_FAILED",
            upstream_code=error_code,
            reason=error_reason,
            upstream_status=error.code,
        ) from error
    except (URLError, socket.timeout, TimeoutError) as error:
        raise ImageGatewayError(
            "Qwen image generation timed out or is unavailable.",
            status=504,
            provider="qwen",
            code="QWEN_UPSTREAM_UNAVAILABLE",
            reason="Qwen did not respond before the gateway timeout or could not be reached.",
        ) from error

    request_id = get_qwen_request_id(response_headers, secrets_to_redact=(api_key,))
    try:
        response_payload = json.loads(raw.decode("utf-8"))
    except Exception as error:
        raise ImageGatewayError(
            "Qwen returned an invalid response.",
            request_id=request_id,
            provider="qwen",
            code="QWEN_INVALID_RESPONSE",
            reason="Qwen returned a response that was not valid JSON.",
        ) from error
    if not isinstance(response_payload, dict):
        raise ImageGatewayError(
            "Qwen returned an invalid response.",
            request_id=request_id,
            provider="qwen",
            code="QWEN_INVALID_RESPONSE",
            reason="Qwen returned JSON with an unexpected structure.",
        )

    request_id = get_qwen_request_id(
        response_headers,
        response_payload,
        secrets_to_redact=(api_key,),
    )
    error_code, error_reason = extract_qwen_error_details(
        response_payload,
        secrets_to_redact=(api_key,),
    )
    if qwen_response_has_explicit_failure(response_payload):
        raise ImageGatewayError(
            "Qwen image generation failed.",
            request_id=request_id,
            provider="qwen",
            code="QWEN_UPSTREAM_FAILED",
            upstream_code=error_code,
            reason=error_reason or "Qwen reported an explicit failure status.",
        )

    output = response_payload.get("output")
    choices = output.get("choices", []) if isinstance(output, dict) else []
    if isinstance(choices, list):
        for choice in choices:
            message = choice.get("message") if isinstance(choice, dict) else None
            content = message.get("content", []) if isinstance(message, dict) else []
            if not isinstance(content, list):
                continue
            for item in content:
                image_url = item.get("image") if isinstance(item, dict) else None
                if isinstance(image_url, str) and image_url.strip():
                    return image_url.strip(), request_id, model
    raise ImageGatewayError(
        "Qwen image generation failed.",
        request_id=request_id,
        provider="qwen",
        code="QWEN_NO_IMAGE",
        upstream_code=error_code,
        reason=error_reason or "Qwen completed the request without returning a generated image.",
    )


def inspect_image(data):
    if len(data) >= 24 and data.startswith(b"\x89PNG\r\n\x1a\n"):
        width, height = struct.unpack(">II", data[16:24])
        if width > 0 and height > 0:
            return "image/png", width, height

    if len(data) >= 4 and data.startswith(b"\xff\xd8"):
        offset = 2
        sof_markers = {
            0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
            0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF,
        }
        while offset + 4 <= len(data):
            if data[offset] != 0xFF:
                offset += 1
                continue
            while offset < len(data) and data[offset] == 0xFF:
                offset += 1
            if offset >= len(data):
                break
            marker = data[offset]
            offset += 1
            if marker in {0x01, 0xD8, 0xD9} or 0xD0 <= marker <= 0xD7:
                continue
            if offset + 2 > len(data):
                break
            segment_length = struct.unpack(">H", data[offset:offset + 2])[0]
            if segment_length < 2 or offset + segment_length > len(data):
                break
            if marker in sof_markers and segment_length >= 7:
                height = struct.unpack(">H", data[offset + 3:offset + 5])[0]
                width = struct.unpack(">H", data[offset + 5:offset + 7])[0]
                if width > 0 and height > 0:
                    return "image/jpeg", width, height
            offset += segment_length

    raise ImageGatewayError("Downloaded file is not a supported image.")


def download_generated_image(image_url, expected_size):
    validate_qwen_image_url(image_url)

    request = Request(
        image_url,
        headers={"Accept": "image/png,image/jpeg", "User-Agent": "OpenTavernImageGateway/1.0"},
        method="GET",
    )
    try:
        opener = build_opener(QwenImageRedirectHandler())
        with opener.open(request, timeout=IMAGE_DOWNLOAD_TIMEOUT_SECONDS) as response:
            validate_qwen_image_url(response.geturl())
            content_type = response.headers.get_content_type().lower()
            data = read_limited_response(response, MAX_IMAGE_BYTES, "Generated image exceeds 20 MiB.")
    except HTTPError as error:
        try:
            error.close()
        except Exception:
            pass
        raise ImageGatewayError(
            "Generated image could not be downloaded.",
            provider="qwen",
            code="QWEN_IMAGE_DOWNLOAD_FAILED",
            upstream_code="HTTP_%s" % error.code,
            reason="The generated image URL returned HTTP %s." % error.code,
            upstream_status=error.code,
        ) from error
    except (URLError, socket.timeout, TimeoutError) as error:
        raise ImageGatewayError(
            "Generated image download timed out or is unavailable.",
            status=504,
            provider="qwen",
            code="QWEN_IMAGE_DOWNLOAD_FAILED",
            upstream_code="UPSTREAM_UNAVAILABLE",
            reason="The generated image could not be downloaded before the gateway timeout.",
        ) from error

    detected_mime, width, height = inspect_image(data)
    if (width, height) != expected_size:
        raise ImageGatewayError("Generated image dimensions do not match the requested size.")
    if content_type == "image/jpg":
        content_type = "image/jpeg"
    if content_type not in IMAGE_MIME_EXTENSIONS or content_type != detected_mime:
        raise ImageGatewayError("Generated image MIME type is invalid.")
    return data, detected_mime, width, height


def get_image_asset_storage_bytes(image_dir):
    total = 0
    try:
        entries = os.scandir(image_dir)
    except FileNotFoundError:
        return 0
    with entries:
        for entry in entries:
            if not entry.is_file(follow_symlinks=False):
                continue
            stem, extension = os.path.splitext(entry.name)
            if extension not in IMAGE_MIME_EXTENSIONS.values() or not IMAGE_ASSET_ID_PATTERN.fullmatch(stem):
                continue
            total += entry.stat(follow_symlinks=False).st_size
    return total


def save_image_asset(image_dir, data, mime, max_storage_bytes=None):
    extension = IMAGE_MIME_EXTENSIONS[mime]
    os.makedirs(image_dir, mode=0o750, exist_ok=True)
    if max_storage_bytes is not None:
        current_bytes = get_image_asset_storage_bytes(image_dir)
        if len(data) > max_storage_bytes or current_bytes > max_storage_bytes - len(data):
            raise ImageGatewayError("Image storage capacity has been reached.", status=507)
    asset_id = secrets.token_hex(24)
    final_path = os.path.join(image_dir, asset_id + extension)
    fd, temporary_path = tempfile.mkstemp(prefix=".image-", dir=image_dir)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary_path, 0o640)
        os.replace(temporary_path, final_path)
    except Exception:
        try:
            os.unlink(temporary_path)
        except FileNotFoundError:
            pass
        raise
    return asset_id


def find_image_asset(image_dir, asset_id):
    if not IMAGE_ASSET_ID_PATTERN.fullmatch(asset_id):
        return None, None
    image_root = os.path.realpath(image_dir)
    for mime, extension in IMAGE_MIME_EXTENSIONS.items():
        candidate = os.path.realpath(os.path.join(image_root, asset_id + extension))
        try:
            if os.path.commonpath([image_root, candidate]) != image_root:
                continue
        except ValueError:
            continue
        if os.path.isfile(candidate):
            return candidate, mime
    return None, None


def normalize_encrypted_iterations(value):
    iterations = 210000 if value in (None, "") else value
    try:
        iterations = int(iterations)
    except (TypeError, ValueError):
        raise ValueError("Invalid encrypted sync payload.")
    if iterations < 1:
        raise ValueError("Invalid encrypted sync payload.")
    return iterations


def is_non_empty_string(value):
    return isinstance(value, str) and value.strip() != ""


def validate_encrypted_snapshot(snapshot):
    if not (
        is_non_empty_string(snapshot.get("payload"))
        and is_non_empty_string(snapshot.get("iv"))
        and is_non_empty_string(snapshot.get("salt"))
    ):
        raise ValueError("Invalid encrypted sync payload.")
    if snapshot.get("algorithm") != "AES-GCM":
        raise ValueError("Unsupported encrypted sync payload algorithm.")
    if snapshot.get("kdf") not in (None, "PBKDF2-SHA256"):
        raise ValueError("Unsupported encrypted sync payload key derivation.")
    snapshot["iterations"] = normalize_encrypted_iterations(snapshot.get("iterations"))


def normalize_conversation_order(snapshot):
    conversations = snapshot.get("conversations", {})
    known = set(conversations.keys())
    seen = set()
    order = []
    if isinstance(snapshot.get("conversationOrder"), list):
        for conv_id in snapshot["conversationOrder"]:
            if conv_id in known and conv_id not in seen:
                seen.add(conv_id)
                order.append(conv_id)
    for conv_id in conversations.keys():
        if conv_id not in seen:
            seen.add(conv_id)
            order.append(conv_id)
    snapshot["conversationOrder"] = order


def normalize_active_conversation(snapshot):
    conversations = snapshot.get("conversations", {})
    active = snapshot.get("activeConvId")
    if active not in conversations:
        snapshot["activeConvId"] = snapshot.get("conversationOrder", [None])[0] if snapshot.get("conversationOrder") else None


def extract_snapshot(body):
    snapshot = body.get("data") if isinstance(body, dict) and "data" in body else body
    if not is_plain_object(snapshot):
        raise ValueError("Invalid sync payload.")
    if isinstance(body, dict) and body.get("encrypted") is True:
        snapshot["encrypted"] = True
    if snapshot.get("encrypted") is True:
        validate_encrypted_snapshot(snapshot)
        snapshot["lastSaved"] = normalize_timestamp(snapshot.get("lastSaved") or body.get("updatedAt") if isinstance(body, dict) else None)
        return snapshot

    snapshot["conversations"] = normalize_object_map(snapshot.get("conversations"))
    snapshot["settings"] = normalize_object_map(snapshot.get("settings"))
    snapshot["characters"] = normalize_object_map(snapshot.get("characters"))
    snapshot["worldBooks"] = normalize_object_map(snapshot.get("worldBooks"))
    normalize_conversation_order(snapshot)
    normalize_active_conversation(snapshot)
    snapshot["charactersMigrated"] = normalize_boolean(snapshot.get("charactersMigrated"))
    snapshot["lastSaved"] = normalize_timestamp(snapshot.get("lastSaved"))
    return snapshot


def parse_expected_updated_at(headers):
    raw = headers.get("X-OpenTavern-If-Match-Updated-At") or headers.get("If-Match")
    if not raw:
        return None
    value = raw.strip()
    if value.startswith("W/"):
        value = value[2:]
    value = value.strip('"')
    if value == "*":
        return "*"
    try:
        timestamp = int(float(value))
    except ValueError:
        raise ValueError("Invalid sync precondition timestamp.")
    if timestamp < 0:
        raise ValueError("Invalid sync precondition timestamp.")
    return timestamp


def assert_precondition(expected_updated_at, current_row):
    if expected_updated_at is None:
        return
    if expected_updated_at == "*":
        if not current_row:
            error = RuntimeError("Cloud snapshot does not exist.")
            error.status = 412
            error.current_updated_at = None
            raise error
        return
    current = int(current_row["updated_at"]) if current_row else 0
    if current != expected_updated_at:
        error = RuntimeError("Cloud snapshot was modified by another client.")
        error.status = 409
        error.current_updated_at = current if current_row else None
        raise error


def next_updated_at(current_row):
    current = int(current_row["updated_at"]) if current_row else 0
    return max(now_ms(), current + 1)


def metadata_headers(row, data=None, extra=None):
    headers = dict(extra or {})
    if not row:
        return headers
    data_text = row["data"] if data is None else data
    headers["ETag"] = '"{}"'.format(int(row["updated_at"]))
    headers["X-OpenTavern-Updated-At"] = str(int(row["updated_at"]))
    headers["X-OpenTavern-Data-Bytes"] = str(byte_length(data_text or ""))
    try:
        parsed = json.loads(data_text)
        headers["X-OpenTavern-Encrypted"] = "true" if parsed.get("encrypted") is True else "false"
    except Exception:
        pass
    return headers


class SyncHandler(BaseHTTPRequestHandler):
    """处理单个 HTTP 请求的控制器。

    Python 的 HTTPServer 会根据请求方法自动调用 do_GET、do_POST 等方法；这些短方法再统一
    进入 handle_sync，避免认证、路径检查和响应格式在多个地方重复实现。一个 Handler 实例
    只服务一次请求，请求头、请求正文和输出流分别位于 self.headers、self.rfile、self.wfile。
    """

    server_version = "OpenTavernSync/2.0"

    def cors_headers(self):
        return {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type, If-Match, X-OpenTavern-If-Match-Updated-At, X-OpenTavern-Image-Token, X-OpenTavern-Token",
            "Access-Control-Expose-Headers": "ETag, X-OpenTavern-Updated-At, X-OpenTavern-Data-Bytes, X-OpenTavern-Encrypted, X-OpenTavern-Exists, X-OpenTavern-Revision, X-OpenTavern-Protocol",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        }

    def send_headers(self, status, headers=None, content_type="application/json"):
        self.send_response(status)
        merged = self.cors_headers()
        merged.update(headers or {})
        if content_type:
            merged["Content-Type"] = content_type
        for key, value in merged.items():
            self.send_header(key, str(value))
        self.end_headers()

    def send_json(self, status, payload, headers=None):
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        all_headers = {"Content-Length": str(len(body))}
        all_headers.update(headers or {})
        self.send_headers(status, all_headers)
        self.wfile.write(body)

    def send_empty(self, status=204, headers=None):
        self.send_headers(status, headers or {}, content_type=None)

    def do_OPTIONS(self):
        self.send_empty(204)

    def do_HEAD(self):
        self.handle_sync(head_only=True)

    def do_GET(self):
        parsed = urlparse(self.path)
        for asset_prefix in IMAGE_ASSET_PREFIXES:
            if parsed.path.startswith(asset_prefix):
                self.handle_image_asset(parsed.path[len(asset_prefix):])
                return
        self.handle_sync()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path in IMAGE_GENERATE_PATHS:
            self.handle_image_generate()
            return
        self.handle_sync()

    def do_DELETE(self):
        self.handle_sync()

    def handle_sync(self, head_only=False):
        """验证公共条件，再把请求分派给查询、保存或删除分支。

        处理顺序是路径检查、健康检查、令牌验证、令牌哈希、数据库初始化，最后才按照 HTTP
        方法操作数据。数据库只保存令牌的 SHA-256 哈希，不保存用户提交的原始令牌。
        head_only 由 HEAD 请求传入；HEAD 只需要响应头，所以不会返回 JSON 正文。
        """

        parsed = urlparse(self.path)
        if parsed.path not in SYNC_PATHS:
            self.send_json(404, {"success": False, "error": "Not found."})
            return

        query = parse_qs(parsed.query)
        if self.command == "GET" and query.get("health") == ["1"]:
            self.send_json(200, {
                "success": True,
                "service": "opentavern-sync",
                "storage": "sqlite",
                "protocols": [1, 2],
                "chunkBytes": SYNC_V2_CHUNK_BYTES,
                "maxBytes": None,
                "imageGeneration": get_image_gateway_health(self.server),
                "methods": ["GET", "HEAD", "POST", "DELETE", "OPTIONS"],
            })
            return

        token = get_token(self.headers)
        token_error, token_status = validate_token(token)
        if token_error:
            self.send_json(token_status, {"success": False, "error": token_error})
            return

        token_hash = hash_token(token)
        db_path = self.server.db_path
        if not getattr(self.server, "sync_tables_ready", False):
            ensure_table(db_path)
            self.server.sync_tables_ready = True

        if query.get("v") == ["2"]:
            self.handle_sync_v2(db_path, token_hash, query)
            return

        if self.command == "HEAD":
            row = read_sync_row(db_path, token_hash)
            self.send_empty(200, metadata_headers(row, extra={"X-OpenTavern-Exists": "true" if row else "false"}))
            return

        if self.command == "GET":
            row = read_sync_row(db_path, token_hash)
            if not row:
                self.send_json(200, {"success": True, "data": None, "updatedAt": None}, {"X-OpenTavern-Exists": "false"})
                return
            try:
                data = json.loads(row["data"])
            except Exception:
                self.send_json(500, {"success": False, "error": "Stored sync snapshot is corrupted."})
                return
            self.send_json(200, {
                "success": True,
                "data": data,
                "updatedAt": row["updated_at"],
                "bytes": byte_length(row["data"]),
            }, metadata_headers(row, extra={"X-OpenTavern-Exists": "true"}))
            return

        if self.command == "POST":
            self.handle_post(db_path, token_hash)
            return

        if self.command == "DELETE":
            self.handle_delete(db_path, token_hash)
            return

        self.send_json(405, {"success": False, "error": "Method not allowed."})

    def handle_sync_v2(self, db_path, token_hash, query):
        op = query.get("op", [""])[0]
        if self.command == "GET" and op == "meta":
            meta = read_v2_meta(db_path, token_hash)
            if not meta:
                self.send_json(200, {
                    "success": True,
                    "exists": False,
                    "protocol": 2,
                    "revision": 0,
                }, v2_headers(revision=0))
                return
            self.send_json(200, {
                "success": True,
                "exists": True,
                "protocol": 2,
                "manifestHash": meta["manifest_hash"],
                "manifestChunks": meta["manifest_chunks"],
                "manifestBytes": meta["manifest_bytes"],
                "revision": meta["revision"],
                "updatedAt": meta["updated_at"],
                "lastSaved": meta["last_saved"],
            }, v2_headers(meta))
            return

        if self.command == "GET" and op == "chunk":
            try:
                object_hash = normalize_v2_hash(query.get("hash", [None])[0], "hash")
                raw_index = query.get("index", [None])[0]
                if raw_index is None or not re.fullmatch(r"\d+", raw_index):
                    raise ValueError("index must be a non-negative integer.")
                chunk_index = parse_v2_integer(
                    int(raw_index),
                    "index",
                )
            except ValueError as error:
                self.send_json(400, {"success": False, "error": str(error)}, v2_headers())
                return
            chunk = read_v2_chunk(db_path, token_hash, object_hash, chunk_index)
            if not chunk:
                self.send_json(404, {"success": False, "error": "Sync chunk not found."}, v2_headers())
                return
            self.send_json(200, {
                "success": True,
                "data": chunk["data"],
                "chunkHash": chunk["chunk_hash"],
                "index": chunk_index,
                "total": chunk["chunk_count"],
            }, v2_headers())
            return

        if self.command == "POST" and op == "chunk":
            try:
                body = self.read_json_body(
                    max_bytes=SYNC_V2_MAX_BASE64_CHARS + 4096,
                    too_large_message="Encoded sync chunk is too large.",
                )
                chunk = parse_v2_chunk_payload(body)
                uploaded = write_v2_chunk(db_path, token_hash, chunk)
            except OverflowError as error:
                self.send_json(413, {"success": False, "error": str(error)}, v2_headers())
                return
            except SyncV2ChunkConflictError as error:
                self.send_json(409, {"success": False, "error": str(error)}, v2_headers())
                return
            except ValueError as error:
                self.send_json(400, {"success": False, "error": str(error)}, v2_headers())
                return
            self.send_json(200, {
                "success": True,
                "uploaded": uploaded,
            }, v2_headers())
            return

        if self.command == "POST" and op == "commit":
            try:
                commit = parse_v2_commit_payload(self.read_json_body(max_bytes=64 * 1024))
                meta, conflict, incomplete = commit_v2_manifest(db_path, token_hash, commit)
            except OverflowError as error:
                self.send_json(413, {"success": False, "error": str(error)}, v2_headers())
                return
            except ValueError as error:
                self.send_json(400, {"success": False, "error": str(error)}, v2_headers())
                return
            if incomplete:
                self.send_json(409, {
                    "success": False,
                    "error": "Manifest chunks are incomplete or inconsistent.",
                    "expectedChunks": incomplete["expected_chunks"],
                    "storedChunks": incomplete["stored_chunks"],
                }, v2_headers())
                return
            if conflict:
                conflict_meta = None
                if conflict["current_updated_at"] is not None:
                    conflict_meta = {
                        "revision": conflict["current_revision"],
                        "updated_at": conflict["current_updated_at"],
                    }
                self.send_json(409, {
                    "success": False,
                    "error": "Cloud manifest was modified by another client.",
                    "currentRevision": conflict["current_revision"],
                    "currentUpdatedAt": conflict["current_updated_at"],
                }, v2_headers(conflict_meta, revision=conflict["current_revision"]))
                return
            self.send_json(200, {
                "success": True,
                "protocol": 2,
                "revision": meta["revision"],
                "updatedAt": meta["updated_at"],
                "lastSaved": meta["last_saved"],
                "manifestHash": meta["manifest_hash"],
                "manifestChunks": meta["manifest_chunks"],
                "manifestBytes": meta["manifest_bytes"],
            }, v2_headers(meta))
            return

        if self.command == "DELETE":
            try:
                expected_revision = parse_v2_if_match(self.headers)
                result, conflict = delete_v2_sync(db_path, token_hash, expected_revision)
            except ValueError as error:
                self.send_json(400, {"success": False, "error": str(error)}, v2_headers())
                return
            if conflict:
                conflict_meta = None
                if conflict["current_updated_at"] is not None:
                    conflict_meta = {
                        "revision": conflict["current_revision"],
                        "updated_at": conflict["current_updated_at"],
                    }
                self.send_json(409, {
                    "success": False,
                    "error": "Cloud manifest was modified by another client.",
                    "currentRevision": conflict["current_revision"],
                    "currentUpdatedAt": conflict["current_updated_at"],
                }, v2_headers(conflict_meta, revision=conflict["current_revision"]))
                return
            self.send_json(200, {
                "success": True,
                "deleted": result["deleted"],
                "protocol": 2,
                "previousRevision": result["previous_revision"],
                "previousUpdatedAt": result["previous_updated_at"],
            }, v2_headers(revision=0, extra={"X-OpenTavern-Exists": "false"}))
            return

        self.send_json(405, {"success": False, "error": "Unsupported sync v2 operation."}, v2_headers())

    def read_json_body(self, max_bytes=None, too_large_message="Sync payload is too large."):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError as error:
            raise ValueError("Invalid Content-Length header.") from error
        if length < 0:
            raise ValueError("Invalid Content-Length header.")
        if max_bytes is not None and length > max_bytes:
            raise OverflowError(too_large_message)
        raw = self.rfile.read(length)
        if max_bytes is not None and len(raw) > max_bytes:
            raise OverflowError(too_large_message)
        try:
            return json.loads(raw)
        except Exception:
            return None

    def handle_image_generate(self):
        limiter_acquired = False
        request_id = None
        try:
            validate_image_gateway_token(
                self.headers,
                self.server.image_gateway_token,
                self.server.dashscope_api_key,
            )
            self.server.image_generation_limiter.acquire()
            limiter_acquired = True
            body = self.read_json_body(
                max_bytes=MAX_IMAGE_REQUEST_BYTES,
                too_large_message="Image generation payload is too large.",
            )
            image_request = validate_image_generation_request(body)
            image_url, request_id, model = call_qwen_image_api(
                {
                    "api_key": self.server.dashscope_api_key,
                    "workspace_id": self.server.dashscope_workspace_id,
                    "model": self.server.qwen_image_model,
                },
                image_request,
            )
            image_data, mime, width, height = download_generated_image(
                image_url,
                QWEN_IMAGE_SIZES[image_request["size"]],
            )
            with self.server.image_storage_lock:
                asset_id = save_image_asset(
                    self.server.image_dir,
                    image_data,
                    mime,
                    self.server.image_max_storage_bytes,
                )
        except OverflowError as error:
            self.send_json(413, {"success": False, "error": str(error)})
            return
        except ValueError as error:
            self.send_json(400, {"success": False, "error": str(error)})
            return
        except ImageGatewayError as error:
            payload = {"success": False, "error": str(error)}
            response_request_id = error.request_id or request_id
            if response_request_id:
                payload["requestId"] = response_request_id
            if error.provider:
                payload["provider"] = error.provider
            if error.code:
                payload["code"] = error.code
            if error.upstream_code:
                payload["upstreamCode"] = error.upstream_code
            if error.reason:
                payload["reason"] = error.reason
            if error.upstream_status is not None:
                payload["upstreamStatus"] = error.upstream_status
            self.send_json(error.status, payload)
            return
        except OSError:
            payload = {"success": False, "error": "Generated image could not be stored."}
            if request_id:
                payload["requestId"] = request_id
            self.send_json(500, payload)
            return
        finally:
            if limiter_acquired:
                self.server.image_generation_limiter.release()

        self.send_json(200, {
            "success": True,
            "asset": {
                "id": asset_id,
                "url": get_image_asset_prefix_for_generate_path(urlparse(self.path).path) + asset_id,
                "mime": mime,
                "width": width,
                "height": height,
            },
            "requestId": request_id,
            "model": model,
        })

    def handle_image_asset(self, asset_id):
        asset_path, mime = find_image_asset(self.server.image_dir, asset_id)
        if not asset_path:
            self.send_json(404, {"success": False, "error": "Image asset not found."})
            return
        try:
            content_length = os.path.getsize(asset_path)
            handle = open(asset_path, "rb")
        except OSError:
            self.send_json(404, {"success": False, "error": "Image asset not found."})
            return

        with handle:
            self.send_headers(200, {
                "Content-Length": str(content_length),
                "Content-Disposition": "inline",
                "Cache-Control": "private, max-age=31536000, immutable",
                "Cross-Origin-Resource-Policy": "cross-origin",
                "X-Robots-Tag": "noindex, nofollow, noarchive",
                "ETag": '"%s"' % asset_id,
            }, content_type=mime)
            while True:
                chunk = handle.read(64 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def handle_post(self, db_path, token_hash):
        """验证并保存一份新快照。

        请求正文先经过大小限制与 JSON 解析，再规范化成内部快照。随后检查客户端提供的
        updated_at 前置条件，确保它仍基于最新云端版本；不匹配时返回冲突而不是覆盖数据。
        写入成功后返回新的更新时间和 ETag，供客户端下一次条件更新使用。
        """

        try:
            body = self.read_json_body()
            snapshot = extract_snapshot(body)
            serialized = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"))
        except OverflowError as error:
            self.send_json(413, {"success": False, "error": str(error)})
            return
        except Exception as error:
            self.send_json(400, {"success": False, "error": str(error) or "Invalid sync payload."})
            return

        bytes_count = byte_length(serialized)

        try:
            expected = parse_expected_updated_at(self.headers)
        except Exception as error:
            self.send_json(400, {"success": False, "error": str(error) or "Invalid sync precondition."})
            return

        current_row = read_sync_row(db_path, token_hash)
        try:
            assert_precondition(expected, current_row)
        except RuntimeError as error:
            self.send_json(getattr(error, "status", 412), {
                "success": False,
                "error": str(error),
                "currentUpdatedAt": getattr(error, "current_updated_at", None),
            }, metadata_headers(current_row, extra={"X-OpenTavern-Exists": "true" if current_row else "false"}))
            return

        updated_at = next_updated_at(current_row)
        write_sync_row(db_path, token_hash, serialized, updated_at)
        row = {"data": serialized, "updated_at": updated_at}
        self.send_json(200, {"success": True, "updatedAt": updated_at, "bytes": bytes_count}, metadata_headers(row, extra={"X-OpenTavern-Exists": "true"}))

    def handle_delete(self, db_path, token_hash):
        try:
            expected = parse_expected_updated_at(self.headers)
        except Exception as error:
            self.send_json(400, {"success": False, "error": str(error) or "Invalid sync precondition."})
            return

        current_row = read_sync_row(db_path, token_hash)
        try:
            assert_precondition(expected, current_row)
        except RuntimeError as error:
            self.send_json(getattr(error, "status", 412), {
                "success": False,
                "error": str(error),
                "currentUpdatedAt": getattr(error, "current_updated_at", None),
            }, metadata_headers(current_row, extra={"X-OpenTavern-Exists": "true" if current_row else "false"}))
            return

        deleted = delete_sync_row(db_path, token_hash) if current_row else False
        self.send_json(200, {
            "success": True,
            "deleted": deleted,
            "previousUpdatedAt": current_row["updated_at"] if current_row else None,
        }, {
            "X-OpenTavern-Deleted": "true" if deleted else "false",
            "X-OpenTavern-Exists": "false",
        })

    def log_message(self, fmt, *args):
        print("%s - - [%s] %s" % (self.address_string(), self.log_date_time_string(), fmt % args))


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=os.environ.get("OPENTAVERN_SYNC_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("OPENTAVERN_SYNC_PORT", "8787")))
    parser.add_argument("--db", default=os.environ.get("OPENTAVERN_SYNC_DB", DEFAULT_DB_PATH))
    parser.add_argument("--image-dir", default=os.environ.get("OPENTAVERN_IMAGE_DIR", DEFAULT_IMAGE_DIR))
    return parser.parse_args()


def main():
    """读取启动参数、准备 SQLite 表，然后持续监听 HTTP 请求。

    serve_forever 会一直阻塞运行，这是服务器程序的正常状态；systemd 负责在进程异常退出时
    重启它。ThreadingHTTPServer 允许多个设备并发连接，每个请求在线程中独立处理。
    """

    args = parse_args()
    os.umask(0o027)
    storage_dir = os.path.dirname(os.path.abspath(args.db))
    os.makedirs(storage_dir, mode=0o750, exist_ok=True)
    os.makedirs(args.image_dir, mode=0o750, exist_ok=True)
    ensure_table(args.db)
    enforce_private_storage_permissions(args.db, args.image_dir)
    server = ThreadingHTTPServer((args.host, args.port), SyncHandler)
    server.db_path = args.db
    server.sync_tables_ready = True
    server.image_dir = args.image_dir
    server.image_gateway_token = os.environ.get("IMAGE_GATEWAY_TOKEN", "")
    server.dashscope_api_key = os.environ.get("DASHSCOPE_API_KEY", "")
    server.dashscope_workspace_id = os.environ.get("DASHSCOPE_WORKSPACE_ID", "")
    server.qwen_image_model = os.environ.get("QWEN_IMAGE_MODEL", DEFAULT_QWEN_IMAGE_MODEL)
    server.image_max_storage_bytes = load_image_storage_limit()
    server.image_storage_lock = threading.Lock()
    image_limits = load_image_gateway_limits()
    server.image_generation_limiter = ImageGenerationLimiter(**image_limits)
    image_enabled = bool(
        server.image_gateway_token
        and server.dashscope_api_key
        and server.dashscope_workspace_id
        and not hmac.compare_digest(server.image_gateway_token, server.dashscope_api_key)
    )
    print(
        "OpenTavern backend listening on %s:%s, db=%s, imageDir=%s, imageEnabled=%s, "
        "imageModel=%s, imageMaxConcurrent=%s, imageRequestsPerMinute=%s, imageMaxStorageBytes=%s"
        % (
            args.host,
            args.port,
            args.db,
            args.image_dir,
            image_enabled,
            server.qwen_image_model,
            image_limits["max_concurrent"],
            image_limits["requests_per_minute"],
            server.image_max_storage_bytes,
        ),
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()

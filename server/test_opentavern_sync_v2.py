import base64
from contextlib import closing
import hashlib
import json
import os
import sqlite3
import tempfile
import unittest

try:
    from server import opentavern_sync_server as sync_server
except ModuleNotFoundError:
    import opentavern_sync_server as sync_server


def sha256_hex(data):
    return hashlib.sha256(data).hexdigest()


class SyncV2StorageTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "sync.sqlite3")
        self.token_hash = sha256_hex(b"test-sync-token")
        sync_server.ensure_table(self.db_path)

    def tearDown(self):
        self.temp_dir.cleanup()

    def upload_object(self, data, object_hash=None, token_hash=None):
        object_hash = object_hash or sha256_hex(data)
        token_hash = token_hash or self.token_hash
        chunks = [
            data[offset:offset + sync_server.SYNC_V2_CHUNK_BYTES]
            for offset in range(0, len(data), sync_server.SYNC_V2_CHUNK_BYTES)
        ]
        self.assertTrue(chunks)
        for index, raw in enumerate(chunks):
            chunk = sync_server.parse_v2_chunk_payload({
                "objectHash": object_hash,
                "chunkHash": sha256_hex(raw),
                "index": index,
                "total": len(chunks),
                "data": base64.b64encode(raw).decode("ascii"),
            })
            sync_server.write_v2_chunk(self.db_path, token_hash, chunk)
        return object_hash, len(chunks), len(data)

    def make_manifest(self, descriptors, last_saved=123456789):
        manifest = {
            "version": 2,
            "app": "OpenTavern",
            "lastSaved": last_saved,
            "encrypted": False,
            "crypto": None,
            "items": descriptors,
        }
        return json.dumps(
            manifest,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")

    def upload_manifest(self, descriptors, last_saved=123456789, object_hash=None):
        manifest_bytes = self.make_manifest(descriptors, last_saved=last_saved)
        manifest_hash, manifest_chunks, manifest_size = self.upload_object(
            manifest_bytes,
            object_hash=object_hash,
        )
        return manifest_hash, manifest_chunks, manifest_size

    def make_commit(
        self,
        manifest_hash,
        manifest_chunks,
        manifest_bytes,
        expected_revision=0,
        last_saved=123456789,
    ):
        return {
            "expected_revision": expected_revision,
            "manifest_hash": manifest_hash,
            "manifest_chunks": manifest_chunks,
            "manifest_bytes": manifest_bytes,
            "last_saved": last_saved,
        }

    def stored_hashes(self, token_hash=None):
        token_hash = token_hash or self.token_hash
        with closing(sqlite3.connect(self.db_path)) as conn:
            return {
                row[0]
                for row in conn.execute(
                    "SELECT DISTINCT object_hash FROM opentavern_sync_v2_chunks WHERE token_hash = ?",
                    (token_hash,),
                )
            }

    def stored_chunk_count(self, token_hash=None):
        token_hash = token_hash or self.token_hash
        with closing(sqlite3.connect(self.db_path)) as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM opentavern_sync_v2_chunks WHERE token_hash = ?",
                (token_hash,),
            ).fetchone()[0]

    def test_commit_validates_references_and_cleans_only_orphans(self):
        sync_server.write_sync_row(self.db_path, self.token_hash, '{"version":1}', 10)
        object_data = b'{"theme":"night"}'
        object_hash, object_chunks, object_bytes = self.upload_object(object_data)
        orphan_hash, _, _ = self.upload_object(b"stale upload")
        descriptors = {
            "settings": {
                "hash": object_hash,
                "objectHash": object_hash,
                "bytes": object_bytes,
                "chunks": object_chunks,
            },
        }
        manifest_hash, manifest_chunks, manifest_bytes = self.upload_manifest(descriptors)

        meta, conflict, incomplete = sync_server.commit_v2_manifest(
            self.db_path,
            self.token_hash,
            self.make_commit(manifest_hash, manifest_chunks, manifest_bytes),
        )

        self.assertIsNone(conflict)
        self.assertIsNone(incomplete)
        self.assertEqual(meta["revision"], 1)
        self.assertEqual(self.stored_hashes(), {manifest_hash, object_hash})
        self.assertNotIn(orphan_hash, self.stored_hashes())
        self.assertEqual(sync_server.read_sync_row(self.db_path, self.token_hash)["updated_at"], 10)

    def test_commit_rejects_incorrect_manifest_bytes(self):
        object_hash, object_chunks, object_bytes = self.upload_object(b"settings")
        descriptors = {
            "settings": {
                "objectHash": object_hash,
                "bytes": object_bytes,
                "chunks": object_chunks,
            },
        }
        manifest_hash, manifest_chunks, manifest_bytes = self.upload_manifest(descriptors)

        with self.assertRaisesRegex(ValueError, "manifestBytes"):
            sync_server.commit_v2_manifest(
                self.db_path,
                self.token_hash,
                self.make_commit(manifest_hash, manifest_chunks, manifest_bytes + 1),
            )
        self.assertIsNone(sync_server.read_v2_meta(self.db_path, self.token_hash))

    def test_commit_rejects_manifest_hash_that_does_not_match_content(self):
        object_hash, object_chunks, object_bytes = self.upload_object(b"settings")
        descriptors = {
            "settings": {
                "objectHash": object_hash,
                "bytes": object_bytes,
                "chunks": object_chunks,
            },
        }
        wrong_manifest_hash = "f" * 64
        manifest_hash, manifest_chunks, manifest_bytes = self.upload_manifest(
            descriptors,
            object_hash=wrong_manifest_hash,
        )
        self.assertEqual(manifest_hash, wrong_manifest_hash)

        with self.assertRaisesRegex(ValueError, "manifestHash"):
            sync_server.commit_v2_manifest(
                self.db_path,
                self.token_hash,
                self.make_commit(manifest_hash, manifest_chunks, manifest_bytes),
            )
        self.assertIsNone(sync_server.read_v2_meta(self.db_path, self.token_hash))

    def test_commit_rejects_object_hash_that_does_not_match_content(self):
        wrong_object_hash = "e" * 64
        object_hash, object_chunks, object_bytes = self.upload_object(
            b"settings",
            object_hash=wrong_object_hash,
        )
        descriptors = {
            "settings": {
                "objectHash": object_hash,
                "bytes": object_bytes,
                "chunks": object_chunks,
            },
        }
        manifest_hash, manifest_chunks, manifest_bytes = self.upload_manifest(descriptors)

        with self.assertRaisesRegex(ValueError, "objectHash"):
            sync_server.commit_v2_manifest(
                self.db_path,
                self.token_hash,
                self.make_commit(manifest_hash, manifest_chunks, manifest_bytes),
            )
        self.assertIsNone(sync_server.read_v2_meta(self.db_path, self.token_hash))

    def test_upload_and_commit_allow_totals_above_legacy_per_token_limits(self):
        former_object_limit = 1025
        former_chunk_limit = 2048
        former_storage_limit = 64 * 1024 * 1024
        bytes_per_seeded_object = former_storage_limit // former_chunk_limit
        self.assertEqual(
            bytes_per_seeded_object * former_chunk_limit,
            former_storage_limit,
        )

        descriptors = {}
        padding = b"x" * (bytes_per_seeded_object - 4)

        def seeded_rows():
            for index in range(former_chunk_limit):
                raw = index.to_bytes(4, "big") + padding
                object_hash = sha256_hex(raw)
                descriptors["seed:%04d" % index] = {
                    "objectHash": object_hash,
                    "bytes": len(raw),
                    "chunks": 1,
                }
                yield (
                    self.token_hash,
                    object_hash,
                    0,
                    1,
                    base64.b64encode(raw).decode("ascii"),
                    object_hash,
                    1,
                )

        with closing(sqlite3.connect(self.db_path)) as conn, conn:
            conn.executemany(
                """
                INSERT INTO opentavern_sync_v2_chunks
                  (token_hash, object_hash, chunk_index, chunk_count,
                   data, chunk_hash, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                seeded_rows(),
            )

        self.assertGreater(len(descriptors), former_object_limit)
        self.assertEqual(self.stored_chunk_count(), former_chunk_limit)
        self.assertEqual(
            sum(descriptor["bytes"] for descriptor in descriptors.values()),
            former_storage_limit,
        )

        object_hash, object_chunks, object_bytes = self.upload_object(
            b"beyond legacy per-token totals"
        )
        descriptors["beyond-legacy-totals"] = {
            "objectHash": object_hash,
            "bytes": object_bytes,
            "chunks": object_chunks,
        }
        manifest_hash, manifest_chunks, manifest_bytes = self.upload_manifest(descriptors)

        referenced_objects = len(descriptors) + 1
        referenced_chunks = (
            sum(descriptor["chunks"] for descriptor in descriptors.values())
            + manifest_chunks
        )
        referenced_bytes = (
            sum(descriptor["bytes"] for descriptor in descriptors.values())
            + manifest_bytes
        )
        self.assertGreater(referenced_objects, former_object_limit)
        self.assertGreater(referenced_chunks, former_chunk_limit)
        self.assertGreater(referenced_bytes, former_storage_limit)

        commit = sync_server.parse_v2_commit_payload({
            "expectedRevision": 0,
            "manifestHash": manifest_hash,
            "manifestChunks": manifest_chunks,
            "manifestBytes": manifest_bytes,
            "lastSaved": 123456789,
        })
        meta, conflict, incomplete = sync_server.commit_v2_manifest(
            self.db_path,
            self.token_hash,
            commit,
        )

        self.assertIsNone(conflict)
        self.assertIsNone(incomplete)
        self.assertEqual(meta["revision"], 1)
        self.assertEqual(meta["manifest_hash"], manifest_hash)
        self.assertEqual(meta["manifest_chunks"], manifest_chunks)
        self.assertEqual(meta["manifest_bytes"], manifest_bytes)
        self.assertEqual(sync_server.read_v2_meta(self.db_path, self.token_hash), meta)
        self.assertEqual(self.stored_chunk_count(), referenced_chunks)

    def test_conflict_does_not_cleanup_but_successful_commit_does(self):
        object_hash, object_chunks, object_bytes = self.upload_object(b"settings")
        descriptors = {
            "settings": {
                "objectHash": object_hash,
                "bytes": object_bytes,
                "chunks": object_chunks,
            },
        }
        manifest_hash, manifest_chunks, manifest_bytes = self.upload_manifest(descriptors)
        commit = self.make_commit(manifest_hash, manifest_chunks, manifest_bytes)
        meta, _, _ = sync_server.commit_v2_manifest(self.db_path, self.token_hash, commit)
        self.assertEqual(meta["revision"], 1)

        orphan_hash, _, _ = self.upload_object(b"uncommitted")
        _, conflict, incomplete = sync_server.commit_v2_manifest(
            self.db_path,
            self.token_hash,
            commit,
        )
        self.assertIsNone(incomplete)
        self.assertEqual(conflict["current_revision"], 1)
        self.assertIn(orphan_hash, self.stored_hashes())

        commit["expected_revision"] = 1
        meta, conflict, incomplete = sync_server.commit_v2_manifest(
            self.db_path,
            self.token_hash,
            commit,
        )
        self.assertIsNone(conflict)
        self.assertIsNone(incomplete)
        self.assertEqual(meta["revision"], 2)
        self.assertEqual(self.stored_hashes(), {manifest_hash, object_hash})

    def test_delete_cleans_all_v2_chunks_without_touching_v1(self):
        sync_server.write_sync_row(self.db_path, self.token_hash, '{"legacy":true}', 20)
        object_hash, object_chunks, object_bytes = self.upload_object(b"settings")
        descriptors = {
            "settings": {
                "objectHash": object_hash,
                "bytes": object_bytes,
                "chunks": object_chunks,
            },
        }
        manifest_hash, manifest_chunks, manifest_bytes = self.upload_manifest(descriptors)
        sync_server.commit_v2_manifest(
            self.db_path,
            self.token_hash,
            self.make_commit(manifest_hash, manifest_chunks, manifest_bytes),
        )
        self.upload_object(b"orphan after commit")

        result, conflict = sync_server.delete_v2_sync(self.db_path, self.token_hash, 1)

        self.assertIsNone(conflict)
        self.assertTrue(result["deleted"])
        self.assertEqual(self.stored_chunk_count(), 0)
        self.assertIsNone(sync_server.read_v2_meta(self.db_path, self.token_hash))
        self.assertEqual(json.loads(sync_server.read_sync_row(self.db_path, self.token_hash)["data"]), {"legacy": True})


if __name__ == "__main__":
    unittest.main()

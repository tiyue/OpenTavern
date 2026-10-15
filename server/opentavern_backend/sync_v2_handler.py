import re
from . import config as backend_config, sync_protocol, sync_storage


class SyncV2HandlerMixin:
    def handle_sync_v2(self, db_path, token_hash, query):
        op = query.get("op", [""])[0]
        if self.command == "GET" and op == "meta":
            meta = sync_storage.read_v2_meta(db_path, token_hash)
            if not meta:
                self.send_json(200, {
                    "success": True,
                    "exists": False,
                    "protocol": 2,
                    "revision": 0,
                }, sync_protocol.v2_headers(revision=0))
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
            }, sync_protocol.v2_headers(meta))
            return

        if self.command == "GET" and op == "chunk":
            try:
                object_hash = sync_protocol.normalize_v2_hash(query.get("hash", [None])[0], "hash")
                raw_index = query.get("index", [None])[0]
                if raw_index is None or not re.fullmatch(r"\d+", raw_index):
                    raise ValueError("index must be a non-negative integer.")
                chunk_index = sync_protocol.parse_v2_integer(
                    int(raw_index),
                    "index",
                )
            except ValueError as error:
                self.send_json(400, {"success": False, "error": str(error)}, sync_protocol.v2_headers())
                return
            chunk = sync_storage.read_v2_chunk(db_path, token_hash, object_hash, chunk_index)
            if not chunk:
                self.send_json(404, {"success": False, "error": "Sync chunk not found."}, sync_protocol.v2_headers())
                return
            self.send_json(200, {
                "success": True,
                "data": chunk["data"],
                "chunkHash": chunk["chunk_hash"],
                "index": chunk_index,
                "total": chunk["chunk_count"],
            }, sync_protocol.v2_headers())
            return

        if self.command == "POST" and op == "chunk":
            try:
                body = self.read_json_body(
                    max_bytes=backend_config.SYNC_V2_MAX_BASE64_CHARS + 4096,
                    too_large_message="Encoded sync chunk is too large.",
                )
                chunk = sync_protocol.parse_v2_chunk_payload(body)
                uploaded = sync_storage.write_v2_chunk(db_path, token_hash, chunk)
            except OverflowError as error:
                self.send_json(413, {"success": False, "error": str(error)}, sync_protocol.v2_headers())
                return
            except backend_config.SyncV2ChunkConflictError as error:
                self.send_json(409, {"success": False, "error": str(error)}, sync_protocol.v2_headers())
                return
            except ValueError as error:
                self.send_json(400, {"success": False, "error": str(error)}, sync_protocol.v2_headers())
                return
            self.send_json(200, {
                "success": True,
                "uploaded": uploaded,
            }, sync_protocol.v2_headers())
            return

        if self.command == "POST" and op == "commit":
            try:
                commit = sync_protocol.parse_v2_commit_payload(self.read_json_body(max_bytes=64 * 1024))
                meta, conflict, incomplete = sync_storage.commit_v2_manifest(db_path, token_hash, commit)
            except OverflowError as error:
                self.send_json(413, {"success": False, "error": str(error)}, sync_protocol.v2_headers())
                return
            except ValueError as error:
                self.send_json(400, {"success": False, "error": str(error)}, sync_protocol.v2_headers())
                return
            if incomplete:
                self.send_json(409, {
                    "success": False,
                    "error": "Manifest chunks are incomplete or inconsistent.",
                    "expectedChunks": incomplete["expected_chunks"],
                    "storedChunks": incomplete["stored_chunks"],
                }, sync_protocol.v2_headers())
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
                }, sync_protocol.v2_headers(conflict_meta, revision=conflict["current_revision"]))
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
            }, sync_protocol.v2_headers(meta))
            return

        if self.command == "DELETE":
            try:
                expected_revision = sync_protocol.parse_v2_if_match(self.headers)
                result, conflict = sync_storage.delete_v2_sync(db_path, token_hash, expected_revision)
            except ValueError as error:
                self.send_json(400, {"success": False, "error": str(error)}, sync_protocol.v2_headers())
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
                }, sync_protocol.v2_headers(conflict_meta, revision=conflict["current_revision"]))
                return
            self.send_json(200, {
                "success": True,
                "deleted": result["deleted"],
                "protocol": 2,
                "previousRevision": result["previous_revision"],
                "previousUpdatedAt": result["previous_updated_at"],
            }, sync_protocol.v2_headers(revision=0, extra={"X-OpenTavern-Exists": "false"}))
            return

        self.send_json(405, {"success": False, "error": "Unsupported sync v2 operation."}, sync_protocol.v2_headers())

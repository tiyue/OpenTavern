from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
from . import config as backend_config, image_handler, image_limits, sync_protocol, sync_storage, sync_v2_handler


class SyncHandler(image_handler.ImageHandlerMixin, sync_v2_handler.SyncV2HandlerMixin, BaseHTTPRequestHandler):
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
        for asset_prefix in backend_config.IMAGE_ASSET_PREFIXES:
            if parsed.path.startswith(asset_prefix):
                self.handle_image_asset(parsed.path[len(asset_prefix):])
                return
        self.handle_sync()


    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path in backend_config.IMAGE_GENERATE_PATHS:
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
        if parsed.path not in backend_config.SYNC_PATHS:
            self.send_json(404, {"success": False, "error": "Not found."})
            return

        query = parse_qs(parsed.query)
        if self.command == "GET" and query.get("health") == ["1"]:
            self.send_json(200, {
                "success": True,
                "service": "opentavern-sync",
                "storage": "sqlite",
                "protocols": [1, 2],
                "chunkBytes": backend_config.SYNC_V2_CHUNK_BYTES,
                "maxBytes": None,
                "imageGeneration": image_limits.get_image_gateway_health(self.server),
                "methods": ["GET", "HEAD", "POST", "DELETE", "OPTIONS"],
            })
            return

        token = sync_protocol.get_token(self.headers)
        token_error, token_status = sync_protocol.validate_token(token)
        if token_error:
            self.send_json(token_status, {"success": False, "error": token_error})
            return

        token_hash = sync_protocol.hash_token(token)
        db_path = self.server.db_path
        if not getattr(self.server, "sync_tables_ready", False):
            sync_storage.ensure_table(db_path)
            self.server.sync_tables_ready = True

        if query.get("v") == ["2"]:
            self.handle_sync_v2(db_path, token_hash, query)
            return

        if self.command == "HEAD":
            row = sync_storage.read_sync_row(db_path, token_hash)
            self.send_empty(200, sync_protocol.metadata_headers(row, extra={"X-OpenTavern-Exists": "true" if row else "false"}))
            return

        if self.command == "GET":
            row = sync_storage.read_sync_row(db_path, token_hash)
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
                "bytes": backend_config.byte_length(row["data"]),
            }, sync_protocol.metadata_headers(row, extra={"X-OpenTavern-Exists": "true"}))
            return

        if self.command == "POST":
            self.handle_post(db_path, token_hash)
            return

        if self.command == "DELETE":
            self.handle_delete(db_path, token_hash)
            return

        self.send_json(405, {"success": False, "error": "Method not allowed."})


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


    def handle_post(self, db_path, token_hash):
        """验证并保存一份新快照。

        请求正文先经过大小限制与 JSON 解析，再规范化成内部快照。随后检查客户端提供的
        updated_at 前置条件，确保它仍基于最新云端版本；不匹配时返回冲突而不是覆盖数据。
        写入成功后返回新的更新时间和 ETag，供客户端下一次条件更新使用。
        """

        try:
            body = self.read_json_body()
            snapshot = sync_protocol.extract_snapshot(body)
            serialized = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"))
        except OverflowError as error:
            self.send_json(413, {"success": False, "error": str(error)})
            return
        except Exception as error:
            self.send_json(400, {"success": False, "error": str(error) or "Invalid sync payload."})
            return

        bytes_count = backend_config.byte_length(serialized)

        try:
            expected = sync_protocol.parse_expected_updated_at(self.headers)
        except Exception as error:
            self.send_json(400, {"success": False, "error": str(error) or "Invalid sync precondition."})
            return

        current_row = sync_storage.read_sync_row(db_path, token_hash)
        try:
            sync_protocol.assert_precondition(expected, current_row)
        except RuntimeError as error:
            self.send_json(getattr(error, "status", 412), {
                "success": False,
                "error": str(error),
                "currentUpdatedAt": getattr(error, "current_updated_at", None),
            }, sync_protocol.metadata_headers(current_row, extra={"X-OpenTavern-Exists": "true" if current_row else "false"}))
            return

        updated_at = sync_protocol.next_updated_at(current_row)
        sync_storage.write_sync_row(db_path, token_hash, serialized, updated_at)
        row = {"data": serialized, "updated_at": updated_at}
        self.send_json(200, {"success": True, "updatedAt": updated_at, "bytes": bytes_count}, sync_protocol.metadata_headers(row, extra={"X-OpenTavern-Exists": "true"}))


    def handle_delete(self, db_path, token_hash):
        try:
            expected = sync_protocol.parse_expected_updated_at(self.headers)
        except Exception as error:
            self.send_json(400, {"success": False, "error": str(error) or "Invalid sync precondition."})
            return

        current_row = sync_storage.read_sync_row(db_path, token_hash)
        try:
            sync_protocol.assert_precondition(expected, current_row)
        except RuntimeError as error:
            self.send_json(getattr(error, "status", 412), {
                "success": False,
                "error": str(error),
                "currentUpdatedAt": getattr(error, "current_updated_at", None),
            }, sync_protocol.metadata_headers(current_row, extra={"X-OpenTavern-Exists": "true" if current_row else "false"}))
            return

        deleted = sync_storage.delete_sync_row(db_path, token_hash) if current_row else False
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

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
import hashlib
import json
import os
import sqlite3
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, parse_qs


MAX_SYNC_BYTES = 10 * 1024 * 1024
DEFAULT_DB_PATH = "/var/lib/opentavern-sync/sync.sqlite3"
SYNC_PATHS = {"/api/sync", "/opentavern-sync", "/opentavern-sync/"}


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
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS opentavern_sync (
              token_hash TEXT PRIMARY KEY,
              data TEXT NOT NULL,
              updated_at INTEGER NOT NULL
            )
            """
        )


def read_sync_row(db_path, token_hash):
    with sqlite3.connect(db_path) as conn:
        cur = conn.execute(
            "SELECT data, updated_at FROM opentavern_sync WHERE token_hash = ?",
            (token_hash,),
        )
        row = cur.fetchone()
    return {"data": row[0], "updated_at": row[1]} if row else None


def write_sync_row(db_path, token_hash, data, updated_at):
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO opentavern_sync (token_hash, data, updated_at)
            VALUES (?, ?, ?)
            """,
            (token_hash, data, updated_at),
        )


def delete_sync_row(db_path, token_hash):
    with sqlite3.connect(db_path) as conn:
        cur = conn.execute(
            "DELETE FROM opentavern_sync WHERE token_hash = ?",
            (token_hash,),
        )
        return cur.rowcount > 0


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

    server_version = "OpenTavernSync/1.0"

    def cors_headers(self):
        return {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type, If-Match, X-OpenTavern-If-Match-Updated-At, X-OpenTavern-Token",
            "Access-Control-Expose-Headers": "ETag, X-OpenTavern-Updated-At, X-OpenTavern-Data-Bytes, X-OpenTavern-Encrypted, X-OpenTavern-Exists",
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
        self.handle_sync()

    def do_POST(self):
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

        if self.command == "GET" and parse_qs(parsed.query).get("health") == ["1"]:
            self.send_json(200, {
                "success": True,
                "service": "opentavern-sync",
                "storage": "sqlite",
                "maxBytes": MAX_SYNC_BYTES,
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
        ensure_table(db_path)

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

    def read_json_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_SYNC_BYTES + 1024:
            raise OverflowError("Sync payload is too large.")
        raw = self.rfile.read(length)
        if len(raw) > MAX_SYNC_BYTES + 1024:
            raise OverflowError("Sync payload is too large.")
        try:
            return json.loads(raw.decode("utf-8"))
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
            snapshot = extract_snapshot(body)
            serialized = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"))
        except OverflowError as error:
            self.send_json(413, {"success": False, "error": str(error)})
            return
        except Exception as error:
            self.send_json(400, {"success": False, "error": str(error) or "Invalid sync payload."})
            return

        bytes_count = byte_length(serialized)
        if bytes_count > MAX_SYNC_BYTES:
            self.send_json(413, {"success": False, "error": "Sync payload is too large."})
            return

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
    return parser.parse_args()


def main():
    """读取启动参数、准备 SQLite 表，然后持续监听 HTTP 请求。

    serve_forever 会一直阻塞运行，这是服务器程序的正常状态；systemd 负责在进程异常退出时
    重启它。ThreadingHTTPServer 允许多个设备并发连接，每个请求在线程中独立处理。
    """

    args = parse_args()
    os.makedirs(os.path.dirname(args.db), exist_ok=True)
    ensure_table(args.db)
    server = ThreadingHTTPServer((args.host, args.port), SyncHandler)
    server.db_path = args.db
    print("OpenTavern sync backend listening on %s:%s, db=%s" % (args.host, args.port, args.db), flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()

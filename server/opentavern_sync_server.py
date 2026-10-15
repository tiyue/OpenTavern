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
import ipaddress
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


if __package__:
    from .opentavern_backend import *
else:
    from opentavern_backend import *


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
    server.packy_api_token = os.environ.get("PACKY_API_TOKEN", "")
    server.packy_image_endpoint = os.environ.get(
        "PACKY_IMAGE_ENDPOINT",
        DEFAULT_PACKY_IMAGE_ENDPOINT,
    )
    server.packy_image_model = os.environ.get("PACKY_IMAGE_MODEL", DEFAULT_PACKY_IMAGE_MODEL)
    server.packy_image_quality = os.environ.get(
        "PACKY_IMAGE_QUALITY",
        DEFAULT_PACKY_IMAGE_QUALITY,
    ).strip().lower()
    server.image_max_storage_bytes = load_image_storage_limit()
    server.image_storage_lock = threading.Lock()
    image_limits = load_image_gateway_limits()
    server.image_generation_limiter = ImageGenerationLimiter(**image_limits)
    image_enabled = bool(
        server.image_gateway_token
        and server.packy_api_token
        and server.packy_image_model
        and server.packy_image_quality
        and not hmac.compare_digest(server.image_gateway_token, server.packy_api_token)
    )
    try:
        validate_packy_endpoint(server.packy_image_endpoint)
        validate_packy_image_quality(server.packy_image_quality)
    except ImageGatewayError:
        image_enabled = False
    print(
        "OpenTavern backend listening on %s:%s, db=%s, imageDir=%s, imageEnabled=%s, "
        "imageModel=%s, imageQuality=%s, imageMaxConcurrent=%s, imageRequestsPerMinute=%s, "
        "imageMaxStorageBytes=%s"
        % (
            args.host,
            args.port,
            args.db,
            args.image_dir,
            image_enabled,
            server.packy_image_model,
            server.packy_image_quality,
            image_limits["max_concurrent"],
            image_limits["requests_per_minute"],
            server.image_max_storage_bytes,
        ),
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()

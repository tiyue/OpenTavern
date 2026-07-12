# OpenTavern Sync Server

OpenTavern Sync Server 是一个独立的 Python + SQLite 后端程序，专门为 OpenTavern 提供云同步功能。它完整实现了 Cloudflare Pages 中 `/api/sync` 的通信协议，适合在没有 Cloudflare Functions 的小型 VPS 上部署。

## 文件组成

- `opentavern_sync_server.py`：仅依赖标准库的 HTTP 同步 API 服务代码。
- `opentavern-sync.service`：systemd 服务单元模板，用于将服务托管为系统服务。
- `nginx-opentavern-sync-location.conf`：Nginx 反向代理的 location 配置模板。

## 默认访问端点

服务默认监听在 `127.0.0.1:8787`。搭配 Nginx location 模板后，对外暴露的公开地址为：

```
http://<服务器地址>:8088/opentavern-sync
```

当 OpenTavern 通过 `file://` 协议打开或从不同主机访问时，需在应用的云同步设置中填入这个完整 URL。

## API 说明

- `GET /opentavern-sync?health=1`：健康检查。
- `GET /opentavern-sync`：根据令牌读取当前同步快照。
- `HEAD /opentavern-sync`：读取快照的元信息。
- `POST /opentavern-sync`：上传同步快照。
- `DELETE /opentavern-sync`：删除同步快照。

认证方式支持两种请求头：`Authorization: Bearer <令牌>` 或 `X-OpenTavern-Token: <令牌>`。出于安全考虑，服务端仅存储令牌的 SHA-256 哈希值，不保存明文。
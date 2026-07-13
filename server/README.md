# OpenTavern Sync Server

OpenTavern Server 是一个独立的 Python 标准库后端，为 OpenTavern 提供 SQLite 云同步，以及百炼 Qwen-Image 图片生成代理和图片持久化。它适合部署在小型 VPS 上，由 Nginx 提供公网入口。

后端兼容 Python 3.6 与 SQLite 3.7.17，适用于仍使用 systemd 219 的旧版服务器。v2 分块采用
不可变的内容寻址写入：相同分块可幂等重传，但同一对象哈希和分块序号不能被不同内容覆盖。

## 文件组成

- `opentavern_sync_server.py`：仅依赖标准库的同步、图片生成和图片资源 API 服务代码。
- `opentavern-sync.service`：systemd 服务单元模板，用于将服务托管为系统服务。
- `opentavern-sync-modern-hardening.conf`：仅供 systemd 245+ 安装的可选加固 drop-in。
- `opentavern-sync.tmpfiles.conf`：旧版 systemd 用于创建数据目录并修正权限的 tmpfiles 配置。
- `nginx-opentavern-sync-location.conf`：Nginx 反向代理的 location 配置模板。

## 默认访问端点

服务默认监听在 `127.0.0.1:8787`。搭配 Nginx location 模板后，对外暴露的公开地址为：

```
http://<服务器地址>:8088/opentavern-sync
```

当 OpenTavern 通过 `file://` 协议打开或从不同主机访问时，需在应用的云同步设置中填入这个完整 URL。
前后端同源部署时，前端默认使用 `/api/sync`，Nginx 模板也会把该路径转发到同一个后端。

## API 说明

- `GET /opentavern-sync?health=1`：健康检查。
- `GET /opentavern-sync`：根据令牌读取当前同步快照。
- `HEAD /opentavern-sync`：读取快照的元信息。
- `POST /opentavern-sync`：上传同步快照。
- `DELETE /opentavern-sync`：删除同步快照。

认证方式支持两种请求头：`Authorization: Bearer <令牌>` 或 `X-OpenTavern-Token: <令牌>`。出于安全考虑，服务端仅存储令牌的 SHA-256 哈希值，不保存明文。

同步协议 v2 使用内容寻址的增量对象和分块传输，接口为：

- `GET /opentavern-sync?v=2&op=meta`：读取当前清单版本和哈希。
- `GET /opentavern-sync?v=2&op=chunk&hash=<SHA-256>&index=<序号>`：下载对象分块。
- `POST /opentavern-sync?v=2&op=chunk`：上传对象分块。
- `POST /opentavern-sync?v=2&op=commit`：以 `expectedRevision` 条件提交新清单。
- `DELETE /opentavern-sync?v=2`：删除当前清单；可通过 `If-Match` 指定 revision。

v2 使用固定的 393216 字节原始小分块，每次只传输组成变更对象和新清单所需的分块；
提交操作使用 SQLite 事务进行 revision 比较与交换，冲突时返回 HTTP 409，避免覆盖其他设备刚提交的版本。
客户端判断本地和云端数据新旧时只比较 `lastSaved`。
内容寻址让新清单复用当前远端清单中哈希未变化的对象；删除清单时会同时清理该令牌的 v2 分块。
v2 后端仅透明保存分块；v2 增量加密尚未实现，启用加密时会明确阻止上传，不会退化为明文。
已有的 v1 AES-GCM 加密快照仍可读取。

Python 服务仍兼容 v1 协议。v2 对同步总量不设置应用层固定上限；实际能力仅受 393216 字节
单块边界、可用内存、SQLite 或平台存储容量、反向代理或平台请求时长等基础设施限制。
生产环境应配套磁盘配额、监控和备份策略。
健康检查会返回 `protocols: [1, 2]`、`chunkBytes: 393216` 和 `maxBytes: null`。

## Qwen-Image API

图片生成接口：

- `POST /api/image/generate`：调用北京地域百炼 Qwen-Image 同步生成接口。
- `POST /opentavern-image/generate`：兼容路径，行为与上面的接口一致。
- `GET /api/image/assets/<assetId>`：读取已经持久化的图片资源，无需令牌。
- `GET /opentavern-image/assets/<assetId>`：兼容入口生成结果对应的图片资源路径。

生成接口使用独立的 `IMAGE_GATEWAY_TOKEN` 鉴权。客户端可以发送
`X-OpenTavern-Image-Token: <令牌>`，也可以发送 `Authorization: Bearer <令牌>`。
这个令牌只用于访问 OpenTavern 图片网关，不能填写百炼 API Key，也必须与百炼 API Key 不同。
百炼 API Key 仅保存在服务器环境文件中。

生产环境应通过 HTTPS 提供前端和图片网关。客户端不会把已保存的图片网关令牌发送到任意外部
明文 HTTP 地址；`localhost` 和当前同源 HTTP 地址仅用于本地开发或迁移，公网部署应尽快切换到 HTTPS。

请求示例：

```bash
curl -X POST http://127.0.0.1:8787/api/image/generate \
  -H 'Content-Type: application/json' \
  -H 'X-OpenTavern-Image-Token: replace-with-gateway-token' \
  -d '{
    "prompt": "文本大模型总结后的安全场景描述",
    "referenceImage": "data:image/jpeg;base64,<角色卡图片 Base64>",
    "negativePrompt": "低画质，模糊，文字",
    "size": "2048*2048",
    "promptExtend": true,
    "seed": 123456
  }'
```

成功响应：

```json
{
  "success": true,
  "asset": {
    "id": "随机且不可猜的资源 ID",
    "url": "/api/image/assets/随机且不可猜的资源 ID",
    "mime": "image/png",
    "width": 2048,
    "height": 2048
  },
  "requestId": "百炼请求 ID",
  "model": "qwen-image-2.0-pro"
}
```

百炼拒绝请求或生成失败时，网关会保留兼容的 `error` 摘要，并把经过过滤的具体原因返回给前端：

```json
{
  "success": false,
  "error": "Qwen image generation failed.",
  "provider": "qwen",
  "code": "QWEN_UPSTREAM_FAILED",
  "upstreamCode": "DataInspectionFailed",
  "reason": "Input data may contain inappropriate content.",
  "upstreamStatus": 400,
  "requestId": "百炼请求 ID"
}
```

`reason`、`upstreamCode` 和 `requestId` 都会限制长度与字符范围；API Key、Bearer 凭据、
带签名的 URL、HTML 和控制字符不会原样返回。百炼自身的 401/403 会映射为网关 502，
避免前端把上游鉴权失败误判成 `IMAGE_GATEWAY_TOKEN` 错误；百炼 429 仍返回 429。
生成成功但临时图片下载失败时，错误响应仍会携带本次百炼 `requestId`。

支持的 `size` 为：

- `2048*2048`
- `2688*1536`
- `1536*2688`
- `2368*1728`
- `1728*2368`

服务端固定向百炼发送 `watermark=false` 和 `n=1`。`negativePrompt` 最多 500 个字符，
`seed` 范围为 `0` 到 `2147483647`。提示词不能为空，网关额外限制为 5000 个字符；
百炼模型自身的 Token 限制仍然适用。

当前前端会读取最近一次 `stage=main` 的助手正文，排除二段选项与状态块，再调用配置的文本总结模型生成
不超过 1300 Token 的安全画面描述。同时读取对应角色卡的 `previewImage || avatar`，在浏览器中栅格化、
缩放并重新编码为 JPEG，以删除角色卡 PNG 元数据。网关接受 PNG/JPEG Base64 data URL，解码后单图不得超过
10 MiB，宽高均不得超过 3072 像素；发送给百炼时内容顺序固定为 `[{"image": ...}, {"text": ...}]`。
旧客户端仍可省略 `referenceImage` 使用纯文字模式，新前端不会静默降级：缺少角色图或总结失败时会阻止生图。

百炼返回的临时 OSS URL 只用于服务端立即下载。服务端会验证 PNG/JPEG MIME、文件头和尺寸，
拒绝超过 20 MiB 的文件，再通过临时文件和原子替换保存到 `OPENTAVERN_IMAGE_DIR`。
会话应保存返回的稳定资源 URL，不应保存百炼临时 URL。

图片资源无需鉴权即可读取，因此资源 ID 使用 192 位随机值且严格校验，无法通过路径构造访问其他文件。
响应包含一年期不可变缓存头。生产环境应将图片目录纳入备份，并根据业务保留周期单独配置清理任务。

## 环境配置

systemd 服务从 `/etc/opentavern-sync/opentavern-sync.env` 加载配置。密钥和真实令牌不要写入仓库或服务单元。

```dotenv
OPENTAVERN_SYNC_HOST=127.0.0.1
OPENTAVERN_SYNC_PORT=8787
OPENTAVERN_SYNC_DB=/var/lib/opentavern-sync/sync.sqlite3
OPENTAVERN_IMAGE_DIR=/var/lib/opentavern-sync/images

IMAGE_GATEWAY_TOKEN=请使用高强度随机令牌
DASHSCOPE_API_KEY=请填写百炼_API_Key
DASHSCOPE_WORKSPACE_ID=请填写北京地域_WorkspaceId
QWEN_IMAGE_MODEL=qwen-image-2.0-pro
IMAGE_GATEWAY_MAX_CONCURRENT=2
IMAGE_GATEWAY_REQUESTS_PER_MINUTE=10
IMAGE_GATEWAY_MAX_STORAGE_BYTES=5368709120
```

`IMAGE_GATEWAY_MAX_CONCURRENT` 可设置为 `1-32`，`IMAGE_GATEWAY_REQUESTS_PER_MINUTE`
可设置为 `1-600`；无效值会回退到上面的保守默认值。应用层限流按整个 Python 服务计算，
用于限制同时占用的百炼请求和一分钟内的总调用次数。

`IMAGE_GATEWAY_MAX_STORAGE_BYTES` 默认限制图片目录最多使用 5 GiB；达到上限后新生成请求返回
HTTP 507，不会继续写满磁盘。资源 ID 具有 192 位随机性，图片地址无需令牌即可由聊天消息直接加载，
响应使用私有缓存并禁止搜索引擎收录。生产环境仍应按业务保留周期定期备份和清理旧图片。

建议的目录和权限：

```bash
sudo install -d -o opentavern -g opentavern -m 0750 /etc/opentavern-sync
sudo install -d -o opentavern -g opentavern -m 0750 /var/lib/opentavern-sync/images
sudo chmod 0640 /etc/opentavern-sync/opentavern-sync.env
sudo chown root:opentavern /etc/opentavern-sync/opentavern-sync.env
```

基础 systemd 单元兼容 systemd 219：通过 `ReadOnlyDirectories=/` 把整个文件系统挂载为只读，
再只开放 `/var/lib/opentavern-sync` 写入。`ExecStartPre` 会在旧系统上创建数据目录；Python 进程
启动时还会把数据目录修正为 `0750`、SQLite 文件修正为 `0640`。部署代码目录应归 `root:root`，
服务账号只需要读取 `/opt/opentavern-sync`：

```bash
sudo chown -R root:root /opt/opentavern-sync
sudo install -o root -g root -m 0644 server/opentavern-sync.tmpfiles.conf \
  /etc/tmpfiles.d/opentavern-sync.conf
sudo systemd-tmpfiles --create /etc/tmpfiles.d/opentavern-sync.conf
```

如果修改数据库或图片目录到其他位置，需要同步调整 unit 的 `ReadWriteDirectories`、tmpfiles 配置
和环境文件，否则服务会因只读文件系统保护而无法写入。

`opentavern-sync-modern-hardening.conf` 是可选的现代加固 drop-in。只有 `systemctl --version`
显示 systemd 245 或更高时，才安装到：

```text
/etc/systemd/system/opentavern-sync.service.d/modern-hardening.conf
```

旧版 systemd 不应安装该 drop-in，否则会产生未知指令警告。基础 unit 已保留旧版可用的
`NoNewPrivileges`、私有临时目录/设备、只读根文件系统和空 capability 集。

Nginx 配置分成两段：

```nginx
http {
    include /etc/nginx/snippets/nginx-opentavern-rate-limit-http.conf;

    server {
        include /etc/nginx/snippets/nginx-opentavern-sync-location.conf;
    }
}
```

`nginx-opentavern-rate-limit-http.conf` 必须先在 `http` 块声明限流 zone，location 文件才能引用。
Nginx 默认按客户端 IP 将生图限制为平均每分钟 2 次，并允许 2 次短时突发；Python 后端仍会执行
独立的全局限流，因此绕过 Nginx 也不能无限调用百炼。

部署或更新后执行：

```bash
sudo systemctl daemon-reload
sudo systemctl restart opentavern-sync
sudo systemctl status opentavern-sync
sudo nginx -t
sudo systemctl reload nginx
```

Qwen-Image 的上游生成请求最长 180 秒，随后图片下载最长 60 秒，Nginx 示例使用 300 秒读取超时。CORS 已允许
`X-OpenTavern-Image-Token` 请求头。

本地完整检查可执行：

```bash
npm run check
```

该命令包含前端、Cloudflare/Python 云同步 v2、图片网关、旧版 SQLite 兼容和 systemd 配置回归测试。

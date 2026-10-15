# OpenTavern Sync Server

OpenTavern Server 是一个独立的 Python 标准库后端，为 OpenTavern 提供 SQLite 云同步，以及 PackyAPI GPT Image 图片生成代理和图片持久化。它适合部署在小型 VPS 上，由 Nginx 提供公网入口。

后端兼容 Python 3.6 与 SQLite 3.7.17，适用于仍使用 systemd 219 的旧版服务器。v2 分块采用
不可变的内容寻址写入：相同分块可幂等重传，但同一对象哈希和分块序号不能被不同内容覆盖。

## 文件组成

- `opentavern_sync_server.py`：启动入口、命令行参数和兼容导出，仅依赖标准库。
- `opentavern_backend/`：同步协议/SQLite 存储、图片校验/限流/上游/资源、HTTP 请求处理模块。部署时必须和入口文件一起复制；模块职责见 [源码结构](../docs/SOURCE_STRUCTURE.md)。
- `opentavern-sync.service`：systemd 服务单元模板，用于将服务托管为系统服务。
- `opentavern-sync-modern-hardening.conf`：仅供 systemd 245+ 安装的可选加固 drop-in。
- `opentavern-sync.tmpfiles.conf`：旧版 systemd 用于创建数据目录并修正权限的 tmpfiles 配置。
- `opentavern-sync.env.example`：不含真实密钥的环境变量模板。
- `nginx-opentavern-sync-location.conf`：Nginx 反向代理的 location 配置模板。

## 默认访问端点

代码部署目录须保留以下结构，systemd 的 `ExecStart` 路径不变：

```text
/opt/opentavern-sync/
  opentavern_sync_server.py
  opentavern_backend/
    __init__.py
    config.py
    ...其余业务模块
```

从项目根目录更新代码时复制完整包目录：

```bash
sudo install -d -o root -g root -m 0755 /opt/opentavern-sync
sudo install -o root -g root -m 0644 server/opentavern_sync_server.py /opt/opentavern-sync/
sudo cp -R server/opentavern_backend /opt/opentavern-sync/
```

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

## PackyAPI GPT Image API

图片生成接口：

- `POST /api/image/generate`：通过 PackyAPI 的 GPT Image 编辑接口同步生成图片。
- `POST /opentavern-image/generate`：兼容路径，行为与上面的接口一致。
- `GET /api/image/assets/<assetId>`：读取已经持久化的图片资源，无需令牌。
- `GET /opentavern-image/assets/<assetId>`：兼容入口生成结果对应的图片资源路径。

生成接口使用独立的 `IMAGE_GATEWAY_TOKEN` 鉴权。客户端可以发送
`X-OpenTavern-Image-Token: <令牌>`，也可以发送 `Authorization: Bearer <令牌>`。
这个令牌只用于访问 OpenTavern 图片网关，不能填写 PackyAPI 密钥，也必须与 `PACKY_API_TOKEN` 不同。
`PACKY_API_TOKEN` 仅保存在服务器环境文件中，不能发送给浏览器或写入仓库。

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
    "size": "1024x1024"
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
    "width": 1024,
    "height": 1024
  },
  "requestId": "PackyAPI 请求 ID（如果上游提供）",
  "model": "gpt-image-2"
}
```

PackyAPI 拒绝请求或生成失败时，网关会保留兼容的 `error` 摘要，并把经过过滤的具体原因返回给前端：

```json
{
  "success": false,
  "error": "Packy image generation failed.",
  "provider": "packy",
  "code": "PACKY_UPSTREAM_FAILED",
  "upstreamCode": "上游错误码",
  "reason": "经过过滤的上游失败原因",
  "upstreamStatus": 400,
  "requestId": "PackyAPI 请求 ID（如果上游提供）"
}
```

`reason`、`upstreamCode` 和 `requestId` 都会限制长度与字符范围；API Key、Bearer 凭据、
带签名的 URL、HTML、Base64 图片正文和控制字符不会原样返回。PackyAPI 自身的 401/403 会映射为网关 502，
避免前端把上游鉴权失败误判成 `IMAGE_GATEWAY_TOKEN` 错误；上游 429 仍返回 429。
如果上游改为返回临时图片 URL，下载失败时错误响应仍会尽量携带本次 `requestId`。

支持的 `size` 为：

- `1024x1024`
- `1536x1024`
- `1024x1536`
- `2048*2048`
- `2688*1536`
- `1536*2688`
- `2368*1728`
- `1728*2368`

前三种原生尺寸也接受 `*` 分隔的别名。为兼容旧客户端，后五种尺寸会保留原宽高，仅把分隔符规范为
PackyAPI 所需的 `x` 后原样发送，不再缩小或映射到其他画幅。旧的 `negativePrompt`、`promptExtend`
和 `seed` 字段可以被兼容接收，但不会发送给 PackyAPI。提示词不能为空，网关额外限制为 5000 个字符；
模型自身限制仍然适用。

服务端调用 `PACKY_IMAGE_ENDPOINT` 时使用 `multipart/form-data`，发送 `model`、`prompt`、`size`、
`quality=<PACKY_IMAGE_QUALITY>`、`output_format=png` 和必填的 `image` 文件字段。图片质量默认使用
`high`，也可配置为 `low`、`medium` 或 `auto`。当前 PackyAPI 线上接口会把
`response_format` 判定为未知参数，并明确返回 `gpt-image-2` 不支持 `input_fidelity`，因此网关不会发送
这两个字段。实测成功响应默认位于
`data[0].b64_json`；解析器同时兼容未来可能返回的 `data[0].url`，但不能依赖
`revised_prompt` 一定存在。上游鉴权使用 `Authorization: Bearer <PACKY_API_TOKEN>`，该请求头只在
服务器端构造。上游生成 POST 禁止跟随重定向，避免 Bearer 密钥被转发到另一个地址。生成 POST 可能已经
产生计费，连接中断或超时后不要在代理层自动盲目重试。

当前前端会读取最近一次 `stage=main` 的助手正文，排除二段选项与状态块，并结合用户在生图面板填写的补充要求，
再调用配置的文本总结模型生成
不超过 1300 Token 的安全画面描述。总结成功后，前端会追加可编辑的 `imageGenerationStylePrompt`；默认值要求
人物均为二次元角色，整体参考《碧蓝档案》的高质量日系动画插画风格。最终提示词按“总结结果 + 风格要求”
组装，最多 5000 个字符并优先保留风格要求；旧的负面提示词不会迁移为风格提示词。
同时读取对应角色卡的 `previewImage || avatar`，在浏览器中栅格化、
缩放并重新编码为 JPEG，以删除角色卡 PNG 元数据。网关接受 PNG/JPEG Base64 data URL，解码后单图不得超过
10 MiB，宽高均不得超过 3072 像素；服务端会将解码后的图片作为 multipart 的 `image` 文件字段发送给 PackyAPI。
当前默认端点是 `/v1/images/edits`，因此 `referenceImage` 是必填字段；缺少角色图或总结失败时，
新前端会直接阻止生图，直接调用网关但缺少参考图也会收到参数错误。

PackyAPI 当前默认返回 Base64 图片；服务端会先解码并验证 PNG/JPEG MIME、文件头和尺寸，
拒绝超过 20 MiB 的文件，再通过临时文件和原子替换保存到 `OPENTAVERN_IMAGE_DIR`。如果上游返回 URL，
网关只接受主机名严格等于 `external-resources.packyapi.com` 的 HTTPS 地址，并在每次下载重定向后重新验证
主机名和公网 IP；该 URL 只用于服务端立即下载。会话应保存网关返回的稳定资源 URL，不应保存 Base64 正文
或上游临时 URL。

图片资源无需鉴权即可读取，因此资源 ID 使用 192 位随机值且严格校验，无法通过路径构造访问其他文件。
响应包含一年期不可变缓存头。生产环境应将图片目录纳入备份，并根据业务保留周期单独配置清理任务。

## 环境配置

systemd 服务从 `/etc/opentavern-sync/opentavern-sync.env` 加载配置。密钥和真实令牌不要写入仓库或服务单元。
可以复制仓库内的 `opentavern-sync.env.example` 作为起点，再只在服务器上填写真实值。

```dotenv
OPENTAVERN_SYNC_HOST=127.0.0.1
OPENTAVERN_SYNC_PORT=8787
OPENTAVERN_SYNC_DB=/var/lib/opentavern-sync/sync.sqlite3
OPENTAVERN_IMAGE_DIR=/var/lib/opentavern-sync/images

IMAGE_GATEWAY_TOKEN=
PACKY_API_TOKEN=
PACKY_IMAGE_ENDPOINT=https://www.packyapi.com/v1/images/edits
PACKY_IMAGE_MODEL=gpt-image-2
PACKY_IMAGE_QUALITY=high
IMAGE_GATEWAY_MAX_CONCURRENT=2
IMAGE_GATEWAY_REQUESTS_PER_MINUTE=10
IMAGE_GATEWAY_MAX_STORAGE_BYTES=5368709120
```

`PACKY_IMAGE_ENDPOINT` 应保持为受信任的 HTTPS 地址。不要把 `PACKY_API_TOKEN` 填到前端的图片访问令牌中，
也不要把 `IMAGE_GATEWAY_TOKEN` 当作上游 API 密钥；二者权限不同，必须使用不同的随机值。模板故意将
两个令牌留空，使未完成密钥配置的服务保持为“图片生成未就绪”，避免占位符被误当成生产凭据。

`PACKY_IMAGE_QUALITY` 默认为 `high`，允许值为 `low`、`medium`、`high`、`auto`。其他值会使
健康检查把图片生成功能标记为未就绪，实际生成请求返回配置错误。

`IMAGE_GATEWAY_MAX_CONCURRENT` 可设置为 `1-32`，`IMAGE_GATEWAY_REQUESTS_PER_MINUTE`
可设置为 `1-600`；无效值会回退到上面的保守默认值。应用层限流按整个 Python 服务计算，
用于限制同时占用的 PackyAPI 请求和一分钟内的总调用次数。

`IMAGE_GATEWAY_MAX_STORAGE_BYTES` 默认限制图片目录最多使用 5 GiB；达到上限后新生成请求返回
HTTP 507，不会继续写满磁盘。资源 ID 具有 192 位随机性，图片地址无需令牌即可由聊天消息直接加载，
响应使用私有缓存并禁止搜索引擎收录。生产环境仍应按业务保留周期定期备份和清理旧图片。

建议的目录和权限：

```bash
sudo install -d -o opentavern -g opentavern -m 0750 /etc/opentavern-sync
sudo install -d -o opentavern -g opentavern -m 0750 /var/lib/opentavern-sync/images
sudo install -o root -g opentavern -m 0640 server/opentavern-sync.env.example \
  /etc/opentavern-sync/opentavern-sync.env
sudoedit /etc/opentavern-sync/opentavern-sync.env
```

`sudoedit` 中至少要替换 `IMAGE_GATEWAY_TOKEN` 和 `PACKY_API_TOKEN` 的占位值。更新密钥后重启服务，
并确认健康检查只报告图片服务是否就绪，不回显任何令牌。

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
独立的全局限流，因此绕过 Nginx 也不能无限调用 PackyAPI。

部署或更新后执行：

```bash
sudo systemctl daemon-reload
sudo systemctl restart opentavern-sync
sudo systemctl status opentavern-sync
sudo nginx -t
sudo systemctl reload nginx
```

PackyAPI 图片生成是同步长请求，后端上游超时为 300 秒。Nginx 的两个生成入口使用 600 秒读取超时，
为后端超时处理、错误净化和响应传输留出余量；不要把生产反向代理或 CDN 的超时配置得短于后端超时。
CORS 已允许 `X-OpenTavern-Image-Token` 请求头。

本地完整检查可执行：

```bash
npm run check
```

该命令包含前端、Cloudflare/Python 云同步 v2、图片网关、旧版 SQLite 兼容和 systemd 配置回归测试。

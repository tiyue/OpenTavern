# ECS 备份部署与回退

## 当前发布与边界（2026-11-09）

2026-11-09 12:54:14（北京时间）先发布 12 项酒馆扩展功能到 [ECS 入口](http://39.105.48.52:8888/)，通过公网验收后于 13:05:47 发布 Sites 第 20 版。功能源码 `4650fc0f39928e31d58a1632afbe348312df1b47`，Sites 推送/打包源码 `9c506acdbbf14e0b030ff688be5c3c0cfc45d433`，两端同一被测 releaseId `afa8c8d0d9d836d61cf092ba`。功能与验证边界见 [开发验收记录](tavern-feature-acceptance-20261107.md)。

- 当前前端 root：`/opt/opentavern/releases/ecs-tavern-features-20261109T045329Z/verified/frontend`；原后端 `/opt/opentavern/releases/ecs-v17-20261022T161850Z/verified/server`、服务进程和环境保持，不执行数据库迁移。
- 静态包 344 文件、143,962,397 bytes；复用 320 文件，上传 24 文件差量（压缩包 1,792,968 bytes）。全部 344 文件磁盘和回环 HTTP 大小/SHA-256 一致；保留 14 个旧不可变版本共 252 文件。公网 25 项字节核对通过，旧版 bundle 仍可读取。
- 实际 Python 3.6.8 / SQLite 3.7.17 的 66 项后端测试通过；健康 200、匿名同步 401、OPTIONS 204、图片 ready，其他 8088/8090 站点 200。切换窗口前后数据库 inode/内容摘要相同，5 条 v1、12 条 v2 元数据和 259 分块保持；7 张私有图片共 36,477,591 bytes 摘要保持。未下载用户数据库、图片或凭据到开发机。
- 在线 SQLite 备份 55,736,320 bytes、quick_check=ok，图片/配置备份位于本版 `backup/` 且仅 root 可读。前端回退仅恢复 `/opt/opentavern/releases/ecs-tavern-features-20261109T045329Z/backup/opentavern.conf`，`nginx -t` 后 reload，确认旧 root `/opt/opentavern/releases/ecs-chat-scroll-20261106T153832Z/verified/frontend`；不自动恢复数据库或图片，不改后端软链，避免覆盖新上传。
- 原 33 组功能验收及本轮完整检查、十组发布浏览器门禁通过。实际公网 ECS Chrome 再通过 D2 整组 24 流程、5 次合成模型请求、9 张截图，覆盖插件真实 Worker 生命周期/受控网络、普通聊天、模型工具、总结和刷新恢复；390/1280px 浅暗/系统无横向溢出，0 pageError，代表截图已视觉检查。未运行真实模型供应商、Embedding 中文质量或 iPhone 真机。
- 证据目录 `/path/to/local-release-evidence`：`ecs-ready.json`、`ecs-deployment-final.json`、`ecs-public-http.json`、`ecs-browser/report.json`，以及 `gate-final/release-2026-11-09T04-47-48-479Z-42468/release-report.json`；服务器本版目录保留 `deployment-final.json` 与 `backup/`。当前 ECS 仍为 HTTP，沿用 IndexedDB，不承诺安全来源限定的离线导航；Sites 与 ECS 的用户数据独立。

## 第 19 版历史发布（2026-11-06）

2026-11-06 23:46:42（北京时间）先发布聊天进入定位修复到 [ECS 入口](http://39.105.48.52:8888/)，随后 2026-11-06 23:49:54 发布 Sites 第 19 版。准确功能/发布源码 `c114ab2e010af8304261d57eb3e5376244f1dc2f`，两端同一被测产物 releaseId `fc677344d1452b9817ba3da2`。本次修复进入长会话停在旧消息的问题，普通重绘和上翻历史继续保留阅读位置。

- 当前前端 root：`/opt/opentavern/releases/ecs-chat-scroll-20261106T153832Z/verified/frontend`。原后端 `/opt/opentavern/releases/ecs-v17-20261022T161850Z/verified/server`、服务进程、环境文件和代理保持，不做数据迁移。
- 本版静态包 344 文件、141,771,435 bytes；复用 322 文件，上传 22 文件差量。全部 344 文件的服务器磁盘及回环 HTTP 大小/SHA-256 一致；保留 13 个旧不可变版本共 234 文件。公网 25 项字节核对通过，旧快照仍可读取。
- 实际 Python 3.6.8 / SQLite 3.7.17 的 66 项后端测试通过；健康 200、匿名同步 401、OPTIONS 204、图片 ready，其他 8088/8090 站点 200。数据库切换窗口前后摘要及 inode 相同，5 条 v1、12 条 v2 元数据、257 分块保持；7 张私有图片共 36,477,591 bytes 摘要一致。
- 在线 SQLite 备份 47,943,680 bytes、quick_check=ok；备份及回退配置仅 root 可读。仅回退前端时恢复 `/opt/opentavern/releases/ecs-chat-scroll-20261106T153832Z/backup/opentavern.conf`，nginx -t 后 reload，核对旧 root `/opt/opentavern/releases/ecs-storage-20261031T125001Z/verified/frontend`；不恢复旧数据库，不改后端软链。
- 完整发布门禁通过构建、完整检查、十组 Chrome、源码/产物稳定及预览/dist 一致，自有服务 cleanup=removed。公网独立浏览器 18 项进入/切换/重载检查通过；390/1280px 浅暗/系统、最新消息可见、底部间距为 0、普通重绘保留历史阅读位置，无页面异常，代表截图已视觉检查。未访问用户浏览器数据或调用模型；本次没有 iPhone 真机结果。
- 证据：`/path/to/local-release-evidence` 下 `ecs-deployment-final.json`、`ecs-public-http.json`、`ecs-browser/`；完整报告 `gate/release-2026-11-06T15-44-05-072Z-21208/release-report.json`。服务器当前版本目录保留报告与 backup/。当前 ECS 仍为 HTTP，沿用 IndexedDB，不承诺安全来源才支持的离线导航。

## 第 18 版历史发布（2026-10-31）

2026-10-31 21:04:49（北京时间）已先将本地保存超时恢复修复发布到 [ECS 入口](http://39.105.48.52:8888/)，随后于 21:11:55 发布 Sites 第 18 版，符合本轮先 ECS、后 Sites 的顺序。功能提交 `ec2cec501ce9007eab2c270ac1c51b7642fb3de2`；两端同一被测静态产物 releaseId `8834ee5fc1732c00d00b5647`。Sites 发布源码提交另含测试夹具和构建生成物，见 [Sites 记录](SITES.md)。

- 仅切换前端。当前 Nginx root 为 `/opt/opentavern/releases/ecs-storage-20261031T125001Z/verified/frontend`；后端和 `/opt/opentavern-sync` 继续使用 `/opt/opentavern/releases/ecs-v17-20261022T161850Z/verified/server`，服务进程保持不变，不执行数据库迁移。
- 本版前端 344 文件、141,770,153 bytes，包含 17 核心及 296 公共资源；保留 12 个旧版不可变目录共 216 文件。按大小与 SHA-256 复用 321 文件，上传 23 文件的差量；全部 344 文件经服务器磁盘及回环 HTTP 字节核对一致，未包含 `cards/qiong.json`。
- 保留原 Nginx 静态缓存片段、同步/图片代理、端口和凭据。`nginx -t` 通过；健康 200、匿名同步 401、OPTIONS 204、图片网关 `ready=true`，其他 8088/8090 站点仍为 200。
- 在原 Python 3.6.8 / SQLite 3.7.17 上通过 66 项服务端测试。切换窗口前后数据库完整内容摘要相同，仍为 5 条 v1、12 条 v2 元数据、225 个分块，数据库 inode 不变；7 个私有图片共 36,477,591 bytes 原摘要保持，环境文件不变。
- 切换前通过 SQLite 在线 `.backup` 取得独立副本，30,511,104 bytes、`quick_check=ok`，并备份图片与 Nginx 配置；备份目录 `/opt/opentavern/releases/ecs-storage-20261031T125001Z/backup-2/` 仅 root 可读。未下载用户数据库、图片或凭据到开发机。
- 公网 25 项入口/清单/SW/运行资源/核心快照/公共卡逐项字节一致，旧第 17 版 bundle 仍可读取。隔离 Chrome 对实际 HTTP 入口通过正常保存刷新、发送存储超时失败/恢复、摘要超时失败/恢复，共 4 次模拟模型请求；390/1280px 浅暗及系统主题、无横向溢出、无 pageerror 均通过，代表截图已视觉检查。未调用真实模型或图片供应商，未完成 iPhone 真机验证。
- ECS 仍为远程普通 HTTP，保持 IndexedDB 路径；此入口不承诺 Service Worker/OPFS 或离线重新导航。两端浏览器来源与 SQLite/D1 数据继续独立，版本发布不复制用户数据。

首轮切换的立即校验命中 reload 交接期间的旧 Nginx worker，已仅恢复原配置并保留诊断。第二轮增加连续三次命中新入口及 bundle 摘要的就绪判据，观察到一次旧响应后连续三次新响应，再完成全量校验；未恢复旧数据库，也未修改业务或缓存策略来绕过校验。

手机恢复观察：2026-10-31 用户 iPhone 真机回报：第 18 版先显示 `IndexedDB save timed out`；复制未发送文字后，关闭所有 OpenTavern 标签页并从多任务界面彻底退出 Chrome，再打开原 ECS HTTP 网址，发送恢复正常。随后同一会话总结成功，刷新后新消息与总结均仍存在。此为用户操作和结果回报，协调者未直接采集手机控制台或 IndexedDB 日志；支持“重启后已恢复且保存留存”的结论，不足以确认具体 WebKit 缺陷、配额不足或永久消除复发。本轮未清除网站数据、未追加应用代码或重新发布。

### 本版发布与回退

仅前端发布时，先在独立目录准备并逐文件核对同一被测产物，保留旧不可变资源；通过在线 SQLite 备份、私有图片和配置摘要核对保护数据。后端无变化时保持服务运行。切换 Nginx root 后执行 `nginx -t`、reload、连续新版本就绪判定、全量回环及公网/浏览器验收。

本版回退仅恢复 `/opt/opentavern/releases/ecs-storage-20261031T125001Z/backup-2/opentavern.conf`，通过 `nginx -t` 后 reload 并核对旧 root `/opt/opentavern/releases/ecs-v17-20261022T161850Z/verified/frontend`。不改服务软链，不自动恢复任何数据库或图片快照，避免覆盖发布后的新数据。当前前端、后端、旧不可变资源、备份和报告均须保留。若未来更新后端，使用下方历史流程的停服一致性快照与独立迁移验证要求，不能将本次前端步骤当作后端迁移流程。

本机证据：`/path/to/local-release-evidence` 下 `ecs-deployment-final.json`、`ecs-public-http.json`、`ecs-browser.log`、`ecs-browser/`；服务器报告位于新版本目录的 `deployment-final.json`。完整构建/检查与十组浏览器报告为 `gate-final/release-2026-10-31T12-57-51-021Z-5200/release-report.json`。旧版记录下方保留，不能用旧版路径覆盖本节当前前端/后端分别指向。

## 第 17 版历史发布与边界

2026-10-23 00:29:18（北京时间）已将 Sites 第 17 版功能同步发布到 [ECS 备用入口](http://39.105.48.52:8888/)。正式 Sites 入口继续保留；本次不修改 DNS。后续功能发布应同时部署两端，并分别记录成功、失败及实际验证结果，单端上线不代表另一端已更新。

- 功能源码基线：`95fe4f66318ed423202c77d06ed2d68596a34f52`，releaseId `36f9ceac4966107061269e5c`，与 Sites 第 17 版相同。部署配置和测试兼容修改单独记录，不重新实现聊天业务。
- 静态前端来自已通过完整发布门禁的 `.sites-public/`：542 文件、177,969,982 bytes，17 核心及 296 公共文件；每个文件均与被测 Sites 产物逐字节一致。没有打包未跟踪角色卡 `cards/qiong.json`。
- 后端使用现有 Python 3.6.8、SQLite 3.7.17 和 `opentavern-sync.service`，保留 127.0.0.1:8787 与公网 8888；入口文件及整个 `opentavern_backend/` 包一起发布，不在 ECS 运行 Sites Worker/D1。
- 两端的浏览器来源、IndexedDB/OPFS 和云端数据库独立。ECS 继续使用原 SQLite，Sites 使用原 D1；同步发布是版本同步，不会自动合并或复制两端用户数据。切换入口需要按 [数据迁移](SITES.md#旧数据迁移) 导入备份，或继续使用已确认的同步端点；不要覆盖较新的云端数据。
- ECS 当前沿用普通 HTTP。真实 Chrome 确认 `isSecureContext=false`、IndexedDB 可用、Service Worker 和 OPFS 不可用；图片、版本、草稿恢复等在 IndexedDB 回退下通过。全站断网重开仍需 HTTPS 或本机安全来源，不能把 Sites 的离线导航验收直接套到该 HTTP 地址。

## 第 17 版服务器文件

版本目录：`/opt/opentavern/releases/ecs-v17-20261022T161850Z/`。目录名使用 UTC，用户可读时间使用北京时间。

| 位置 | 职责 |
| --- | --- |
| `verified/frontend/` | Nginx 当前 root；完整已验收静态包 |
| `verified/server/` | 配套 Python 代码、完整包与模板 |
| `/opt/opentavern-sync` | 指向本版 `verified/server/` 的软链，原 systemd ExecStart 路径保持不变 |
| `/etc/nginx/conf.d/opentavern.conf` | 保留原同步/图片代理，仅切换版本 root 并 include 本轮静态资源片段 |
| `/etc/nginx/snippets/nginx-opentavern-static-location.conf` | 来自仓库 [静态缓存片段](../server/nginx-opentavern-static-location.conf) |
| `/var/lib/opentavern-sync/` | 原 SQLite 与私有图片，继续原地使用，不属于发布包 |
| `/etc/opentavern-sync/opentavern-sync.env` | 原凭据与端点，只在服务器保存，未修改 |
| `rollback-live/` | 停服时取得的旧代码、Nginx、环境文件、unit 与 SQLite/图片快照；权限 0700 |
| `/opt/opentavern/frontend/` | 发布前的旧前端完整保留，不再是当前 Nginx root |

前两项和 `rollback-live/` 均相对于上面的版本目录。不要删除当前 Nginx root 或服务软链所指向的版本目录。systemd unit、其他站点配置及原凭据均经摘要核对未变；未下载用户数据库或私有图片到开发机。

静态片段要求 `offline-manifest.json` 和 `opentavern-sw.js` 重校验，`assets/offline/<releaseId>/` 长期不可变缓存，缺失快照返回 404；`.txt` 外壳必须为 `text/plain`。后续版本切换时还须保留前版的不可变快照目录，不能覆盖其字节，避免尚未切换的页面失去旧资源。

## 第 17 版验收

- 前端沿用第 17 版已经通过的完整 `check` 与十组浏览器门禁，部署前重新逐文件核对相同产物；本轮没有改动应用 JS、HTML、CSS 或数据库协议。
- 本地及 ECS 实际旧运行时均通过 66 项 Python 测试。发现四处测试使用新 Python 才支持的 `mock.call_args.args` 后，仅改用 `call_args[0]`，保留全部原断言；生产实现不变。
- 在独立临时数据库、仅本机 18787 端口启动真实后端，验证健康、匿名拒绝、v2 分块上传/提交/下载/删除闭环。临时数据库与进程已经清理，未调用模型或图片供应商。
- `nginx -t` 与服务启动通过。ECS 回环 HTTP 对全部 542 静态文件逐项核对大小与 SHA-256；公网直连核对 10 项资源以及根入口，包含应用、固定版本外壳、清单、SW、正则 Worker 和一份公共角色卡。同步健康 200、匿名同步 401、OPTIONS 204，图片网关健康 `ready=true`；未执行实际计费生图或推理。
- 对公网 ECS 运行 `scripts/test-upstream-alignment-browser.mjs`，图片独立发送/刷新、用户版本与分支、显式重试、两阶段思考、IndexedDB 草稿恢复、预设失败/重试、JSONL 预览提交、角色世界书复用与排序通过。9 次模型请求为合成端点；全新隔离浏览器不使用用户现有浏览器数据。
- 390/1280px 浅暗及系统主题检查通过，无页面异常或横向溢出；生成 24 张截图，桌面聊天、手机聊天、用户编辑、预设和世界书代表截图已经视觉复查。
- 切换时原 5 条 v1 快照、10 条 v2 元数据、147 个 v2 分块的完整内容摘要前后相同；7 个私有图片（36,477,591 bytes）均已备份并保持原摘要。8088 与 8090 上其他站点仍返回 200。

发布过程中，首轮探针误用了 `protocol=2` 而触发自动回退，正确契约为 `v=2`；隔离夹具的 `items` 必须为对象，数组输入被正确拒绝。诊断保留，修正探针后完整闭环通过。期间有正常客户端上传使早期快照过期，因此最终使用停服时的新快照，没有把任何旧数据库回写生产。最终切换窗口的数据摘要一致，不将正常客户端后续更新记作数据损坏。

## 第 17 版后端发布与回退流程

1. 功能有变更时完成现行构建和发布门禁；对同一源码的 `.sites-public/` 与 Sites 产物逐文件核对，排除本机凭据、用户卡、数据库、缓存和开发依赖。后端必须带完整模块包，在目标机实际 Python/SQLite 上测试。
2. 上传到独立版本目录，验证归档及每个文件的大小/SHA-256，再验证 Nginx 片段与隔离 HTTP 同步闭环；此时不改当前入口。
3. 短暂停止同步服务，取得当前 SQLite 与图片一致性快照，并核对副本完整性；用副本验证新代码初始化不会改变现有记录。备份目录仅 root 可读，不将备份放入 Nginx root。
4. 保留旧代码，将固定服务路径指向新包；启动服务并确认健康。仅更新 OpenTavern 的 Nginx root/include，通过 `nginx -t` 后 reload，再校验回环、公网和隔离浏览器。保留前版不可变资源与回退版本。
5. 失败时停止同步服务，确认 `/opt/opentavern-sync` 仍指向本次版本后移除该软链，将 `rollback-live/backend` 移回固定路径；恢复 `rollback-live/opentavern.conf`，撤去本轮静态 include 文件，通过 `nginx -t` 后启动服务并 reload。回退代码和路由不自动恢复旧数据库，避免覆盖上线后的新用户上传；数据恢复必须单独确定恢复点和写入边界。
6. 两端分别更新发布记录和规格，确认没有同项目其他活动会话后提交本次文件。GitHub 推送另按公开源码脱敏流程执行，不把部署当作 GitHub 推送。

## 第 17 版证据

- 本机证据目录：`/path/to/local-release-evidence`。
- 成功发布：`deployment-final.json`；实际服务器测试：`backend-tests.log`；隔离 HTTP：`isolated-http-smoke.json`；公网：`public-http-verification.json`；浏览器：`browser-acceptance.json`、`browser-platform.json` 与 `browser/` 截图。
- 服务器同版本目录保留 `preflight.json`、`deployment-final.json`、隔离 HTTP 日志及回退诊断；备份和含私有元数据的报告仅 root 可读。
- 原部署 gzip：141,187,976 bytes，SHA-256 `015012602d2329175b6053e2da5b9f28bcacd5c5e97b323a8d2f3812390dec02`。成功发布后可清理传输包和失败预检副本，保留当前 `verified/`、`rollback-live/` 与验收报告。

本轮已清理本机/服务器传输包、失败预检的 `stage/` 和重复迁移试验数据库；当前 `verified/`、两次时间点的回退快照、发布报告与截图保留。清理后入口摘要仍一致，临时 18787 端口已释放，见 `cleanup.json`。

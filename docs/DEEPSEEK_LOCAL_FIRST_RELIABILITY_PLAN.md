# OpenTavern 本地优先、局部渲染与代理故障可靠性开发任务书

日期：2026-10-15。审查基线：`2538639`，分支 `codex/tiyu`。执行对象：全局 DeepSeek 执行器，主协调者负责审查、验收与发布。

**状态：全站 R0–R7 方案仍待开发；用户随后批准优先处理正则问题，相关专项已独立验收并发布第 14 版，见第 2.5 节。** 不将正则专项等同于全部 R2 或全站离线能力完成，不替代现有 T01–T11 验收记录。下文源码审查行号对应开头的历史基线。

## 1. 目标、边界与成功标准

用户要求：界面尽量局部更新；使用已有 DeepSeek 设置直接请求；页面与资料优先从本机读取，有服务端更新时后台下载，尽量不受网络代理故障影响。

交付应满足：

1. 已准备好离线资源的设备，在站点或代理不可达时仍能重新打开应用、阅读和编辑历史、管理角色/世界书/预设/设置、搜索、导入导出及可靠保存。
2. DeepSeek 可达时直接生成，不依赖站点更新检查、公共库下载、云同步或其他 CDN 成功。模型服务不可达时准确报错，停止和本地操作仍可用，不自动重发计费请求。
3. 当前可见窗口内，消息或会话没有变化时保留原 DOM；收藏、编辑、版本切换、删除等只更新实际受影响部分，保持阅读位置、输入焦点和卡片运行实例。
4. 应用先用完整的本地版本启动；后台检测并下载更新，校验完成后才提供切换入口。下载失败继续使用原版本，不出现新 HTML 配旧 JS/旧 Worker。
5. 公共资料提供完整的本地准备流程及可核对的完成状态；已导入资料与用户自己的修改不被服务端公共资料更新覆盖。
6. 保留 HTTP、本机和 HTTPS 使用方式。普通远程 HTTP 无法使用 Service Worker 时必须明确能力差异，不能重新增加强制 HTTPS 限制。

### 本轮范围与禁止事项

最初的文档回合仅新增本文及索引，未授权实施。2026-10-15 用户随后明确要求“之前的文档功能……没有实现请继续实现”，授权 R0–R7 全部实施；本次仍按具体白名单隔离执行，不得修改无关部分。实际进度与返工见第 10 节。

后续不得借此重做 UI、迁移框架、引入通用状态管理/PWA 框架、修改同步协议、部署远端 L3、开发 TTS、自动修改系统代理/TUN/DNS，或清空用户数据。不要为了离线功能重写现有可靠保存。

## 2. 已核实的现状与证据

### 2.1 源码审查结论

| 优先级 | 发现与影响 | 源码依据 |
| --- | --- | --- |
| P0 | 没有应用自己的 Service Worker、CacheStorage 资源版本或离线导航回退；普通浏览器 HTTP 缓存不能作为可靠离线启动承诺。 | 全量应用/入口检索；`bootstrap/72-app-init.js`、`72-app-init-storage.js`；隔离浏览器注册数为 0。 |
| P0 | 公共卡片“已放在发布包”不等于“已下载到用户设备”。目录内嵌在 JS 中，导入 JSON 仍实时 fetch；预览图使用 URL。 | `src/app/library/60-public-card-data.js:78`、`60-public-card-import-ui.js:15`、`60-public-card-assets.js`、`60-library-public-card-item-ui.js`。 |
| P1 | 普通 `index.html` 仍依赖 Tailwind CDN 和 DOMPurify CDN，外部失败会影响样式/格式化。**当前 `.sites-public` 入口已经替换成本地资源**，不能把这个缺口当作当前预览入口故障的既定原因。 | `src/ui/html/00-document-start.html:26`；`scripts/prepare-sites-public.mjs` 的复制与替换流程。 |
| P1 | 消息已有“追加新消息”和流式气泡更新，并非完全没有局部渲染。但消息数不变时会重建窗口；侧栏每次重建整个列表。 | `src/app/chat/61-chat-message-renderer.js`、`61-chat-message-window-state.js:45`、`61-chat-message-window-render.js:32`、`src/app/conversation/64-conversation-list-ui.js:27`。 |
| P1 | 重建消息窗口后无条件滚到最底；`renderMessagesOnly()` 只限定区域，仍可能重建该区域全部节点。 | `src/app/core/33-render-shortcuts.js:24`、`src/app/chat/61-chat-message-window-render.js:33`。 |
| P1 | 图像生成结果保存的是服务端图片 URL，不能据“消息已经保存”声称图片字节也在本机。渲染器已有 `att.dataUrl` 优先分支，可以复用。 | `src/app/image/51-image-generation-message.js:10`、`51-image-generation-client.js`、`src/app/chat/61-message-attachments-render.js`。 |
| P1 | 固定卡片库依赖已有本地文件及摘要验证；任意外链模块和部分 ESM 别名仍会触网。L3 本身依赖独立服务。不能取消审核或静默联网来实现离线。 | `src/app/card-runtime/61-card-runtime-vendors.js`、`61-card-runtime-dependencies.js:71`；`card-runtime/README.md`。 |
| 已有能力 | 聊天、设置、角色、世界书等已有本地恢复和保存；IDB 为主，localStorage 为紧急回退，OPFS 为附加后端。初始化不等待云端下载。 | `src/app/storage/20-storage-service-init.js`、`src/app/state/34-state-init.js`、`34-state-init-load.js`。 |
| 已有能力 | 保存后才调度自动上传，上传失败有独立状态；不可因网络改造把本地 ACK 重新绑定到云同步。 | `src/app/state/35-state-persistence.js:143`、`src/app/sync/22-cloud-sync-scheduler.js`。 |
| 已有能力 | 主模型请求已经直接调用设置中的端点，不经过 OpenTavern 后端代理；API 地址规范化支持 DeepSeek。摘要、代写也有各自请求路径，须逐项验证。 | `src/app/generation/50-generation-integrations.js`、`50-generation-transport-module.js:284`、`50-generation-api-request.js`、`src/app/api/31-api-endpoint-normalizer.js`、`src/app/summary/53-summary-api-client.js`、`src/app/chat/67-user-draft.js`。 |

公共目录实际引用 **296 个唯一文件，133,434,841 bytes，约 127.25 MiB**，由当前源码字段 `coverImage/previewImage/jsonUrl` 去重并逐文件统计。`prepare-sites-public.mjs` 将这些文件复制进发布目录，未实现浏览器完整下载、增量校验或离线就绪状态。不能把 127 MiB 纳入首次启动的阻塞请求。

### 2.2 本次实际验证

所有浏览器操作使用新建的无用户数据上下文和合成消息；没有操作原生产会话，没有向模型发送用户历史，没有改系统网络设置。

| 验证 | 实际结果 | 解释与限制 |
| --- | --- | --- |
| 普通入口，阻断所有外部来源 | 应用可初始化，但出现 `tailwind is not defined`；两个 CDN 请求被阻断。 | 证明普通入口有外部依赖；不代表所有本地功能都不可用。 |
| `.sites-public` 入口，阻断所有外部来源 | 初始化及合成消息显示成功，无外部请求、无页面异常。 | 当前预览入口的核心页面依赖已经同源化。 |
| 两个入口重复渲染相同两条消息和相同会话列表 | 消息节点与列表节点的对象身份均改变。 | 复现没有内容变化仍替换节点的行为。 |
| 两个入口成功加载后，阻断全部请求再刷新 | `ERR_INTERNET_DISCONNECTED`，没有应用输入框；Service Worker 为 0、CacheStorage 为空。 | 测试路由禁用普通 HTTP 缓存，故意不依赖偶然缓存；证明当前没有受控离线导航保障，不声称每种普通缓存状态下都必然失败。 |
| 使用已有 `DEEPSEEK_API_KEY`，Python 明确不使用 HTTP 代理 | `deepseek-flash` HTTP 200，0.51 秒，回复 `OK`，结束原因 stop。 | 真实鉴权及生成成功。进程绕过 HTTP 代理不能证明绕过系统 TUN。 |
| 同一时刻使用系统代理发现配置 | HTTP 200，0.83 秒，回复 `OK`；当时没有发现 HTTP/HTTPS 代理。 | 此组也实际直连，**不能当作有效代理路径成功的对照**。 |
| 隔离 Chrome，实际应用传输函数直接请求 DeepSeek | 约 717ms，回复 `OK`，结束原因 stop，`isGenerating=false`。 | 验证实际网页请求和该环境的跨来源调用可用；使用合成上下文，不依赖用户生产数据。 |
| 同一应用请求，隔离 Chrome 配置临时故障 HTTP 代理 | 约 8ms 报 `Failed to fetch`，`isGenerating=false`，本地输入区仍存在。 | 模拟代理断路，未关闭真实代理。说明浏览器路由到故障代理时，供应商可直连也不会让 fetch 自动绕过它；并未复现整站全功能锁死。 |

真实调用的提示仅为连接测试，单次 `max_tokens=32`；两次 Python 成功请求各使用 15 tokens，浏览器成功请求没有另行记录用量。故障浏览器请求未获得供应商回复。没有调用编码执行器。

证据在本机：

- `<local-evidence>/opentavern-local-first-audit-20261015/browser-audit.json`
- `<local-evidence>/opentavern-local-first-audit-20261015/network-audit.json`
- `<local-evidence>/opentavern-local-first-audit-20261015/real-deepseek-audit.json`
- `<local-evidence>/opentavern-local-first-audit-20261015/real-browser-deepseek-audit.json`
- `<local-evidence>/opentavern-local-first-audit-20261015/regex-worker-audit.json`

原环境提示的 8765 当时连接被拒绝，因此另启只读 8877 静态服务完成隔离审查；这说明本地服务未运行也需要单独排查，不能全部解释成代理故障。匿名 HTTP 客户端直连正式域取得 403，未验证该响应的边缘挑战原因，不能用它判断真实浏览器是否可访问或断言站点必须使用代理。

### 2.3 可以确认与尚不能确认的原因

可确认：缺乏受控离线启动、普通入口外部 CDN、公共资料按需取网、部分整区重建，均有源码和隔离证据。当前 DeepSeek 直接生成已经成功，不能再增加一个必经模型代理来“修复直连”。

不能确认：用户此前每次代理崩溃时具体是 HTTP 代理残留、TUN/DNS 故障、站点不可达、本地服务停止，还是页面业务异常。没有实际关闭用户代理，也没有得到当时的浏览器失败请求记录。后续验收必须分层记录，不能把所有 `TypeError/Failed to fetch` 判定为 CORS 或某个代理错误。

### 2.4 用户补充：正则“超过 10 秒”

**正则执行不需要境外网站或大模型。** `src/app/prompt/40-regex-worker-runtime.js:172` 从与页面相同来源加载 `assets/js/regex-worker.js?v=20261010-ready-1`；该文件只有浏览器内 RegExp/字符串替换与消息通信，没有 fetch、importScripts 或外部库。

当前存在两个不同期限：10 秒是 Worker 构造后等待 `ready` 握手的装载期限（源码第 17、182 行）；500ms 是收到 ready 后的正则执行期限（第 18、166 行），Worker 还回传实际执行耗时。两者必须分别诊断，不能把“10 秒未就绪”写成“正则执行太慢”。

补充隔离实测：屏蔽所有外部来源，同源 Worker 连续三次替换分别约 26/8/9ms 成功；模拟脚本存在但不回复 ready，约 10,006ms 准确复现“正则 Worker 加载失败：超过 10 秒未就绪”；恢复脚本后下一任务约 9ms 成功。该测试不需要供应商密钥或外部连接，证据见 `regex-worker-audit.json`。

还确认每个未命中缓存的任务都会新建 Worker，结束后 terminate。多规则格式化和重复重绘会重复创建/装载脚本；浏览器是否复用 HTTP 缓存另行决定，不能声称每次必然下载字节。R2 应同时补齐 Worker 的版本固定、本地资源就绪、单实例串行复用及失效重建，R6 减少无效重绘；不是简单把 10 秒加长。

诊断至少区分：构造/脚本错误、等待 ready 超时、执行超时、协议不匹配与队列取消。错误记录仅包含阶段、规则名、脱敏后的本地脚本路径和版本，不采集原聊天。用户当时那次失败仍需实际 Network/Worker 错误确定原因；本次复现的是同一提示的产生条件，不证明其历史根因。

### 2.5 后续获准实施：正则 Worker 专项

用户确认错误发生于正式网站，并要求先排查处理。专项以 `dcd4c79` 为起点：Worker 唯一源码由构建精确内嵌，优先本地 Blob 启动，健康实例串行复用；失败/超时清理后按需新建。任务编号隔离旧响应，非法响应立即报告协议问题，空闲异常也会清理；10s 装载期限、500ms 执行保护、旧页面协议与同源回退均保留。

独立浏览器已验证：阻断独立脚本仍可首次执行和复用；在正式域名隔离注入修复版、第一次正则前完全断网，首次约 9ms 成功，灾难规则约 506ms 终止，随后约 6ms 离线重建成功，无独立 Worker HTTP 请求。新增必测浏览器组使用真正灾难规则触发超时，并覆盖缺 Blob 回退、独立任务结果及 390/1280px 浅暗/系统主题。已视觉检查截图，完整发布门禁与部署由协调者另记。

实施及返工通过全局 DeepSeek 在独立副本完成；两轮 CLI 正常退出且 `runtime_cleanup=removed`。原始执行报告均标为 failed：首轮仅因构建生成 app.js/index.html 未登记白名单；返工轮因协调者在其运行期间生成 `.sites-public/` 预览而被范围检查计入。已逐项核对这些偏差均为构建产物，没有额外业务源码越界，未将执行器报告冒充验收通过。协调者另行审查实际 diff，在正常环境运行验收；执行器内部 spawn EPERM 的结构/浏览器限制没有被当成通过证据。

证据目录：`<local-evidence>/opentavern-regex-20261015-1700/`，包含正式站原始探测、同域隔离基线、修复版完全断网报告、`regex-browser-offline/` 截图；两轮执行报告分别在 `work/runs/2026-10-15T09-03-28-142Z-29100` 与 `work/runs/2026-10-15T09-18-10-048Z-15804`。新增浏览器脚本为 `scripts/test-regex-worker-browser.mjs`，已接入七组门禁。没有实现全站 Service Worker、版本清单、公共库完整本地准备或局部渲染 R6。

最终结果：完整 check/七组浏览器/完整资源树门禁通过，报告在上述目录 `final-release-gate/release-2026-10-15T09-35-12-736Z-33876/release-report.json`。原生成格式测试的 HTTP 装载计数改为真实内嵌 Worker 构造与 900ms 就绪握手，保留原超时、旧协议、二阶段和显示安全断言。协调者另用现有凭据完成正则处理后 DeepSeek `deepseek-flash` 真请求，回复 OK、stop、生成状态释放；工具报告的供应商 not-run 未被篡改，单独结果为 `real-deepseek-after.json` 和 `coordinator-release-decision.json`。

第 14 版于 2026-10-15 17:46（北京时间）原生部署 succeeded，源码 `49a762e35f288d3931eff5dd2f4940e5229211ca`。正式站实际产物再次验证首次完全断网约 25ms 成功、灾难规则约 506ms 终止、随后约 5ms 离线重建，零独立脚本请求；四项关键资源与被测产物一致，HTML 的一个明确边缘注入脚本单独扣除后应用核心一致。记录见 [Sites 发布记录](SITES.md)，`online-verification.json` 与 `published-html-parity.json`。未实测 iPhone 真机或复原用户当时的网络现场。

## 3. 技术边界：先消除不必要联网，再区分网络路径

DeepSeek 官方 OpenAI 兼容基址是 `https://api.deepseek.com`，项目已支持。网页 fetch 没有配置系统代理直连的选项；Chrome 路由可由系统、策略、扩展、命令行/PAC 等控制。Service Worker 的缓存拦截也不能修复操作系统网络路由。[DeepSeek 接口文档](https://api-docs.deepseek.com/)、[Chromium 代理说明](https://chromium.googlesource.com/chromium/src/net/+/HEAD/docs/proxy.md)、[RequestInit](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit)。

因此目标是：**即便网络完全不可用，本地业务仍可用；DeepSeek 本身可经当前路由到达时生成才可用。** 对“系统代理指向已退出程序”“TUN 抢占路由”提供分层诊断说明，不自动替用户更改系统设置，不假设网站加一个 `direct` 参数就能解决。HTTP 代理绕过与 TUN 绕过不能混为一谈。

`navigator.onLine` 只作提示，不能据此关闭本地按钮或禁止用户尝试模型请求；有局域网不代表有互联网，VPN 也可能影响其判断。[MDN onLine](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine)。

Service Worker 受安全上下文限制，本机 loopback 和 HTTPS 应检测实际能力；普通远程 HTTP 保留现有功能，但没有首次离线导航保障。完整离线重开应使用支持 Service Worker 的来源，或本机完整静态包与仍在运行的本地服务，不能将项目整体改成仅 HTTPS。[MDN Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)、[注册与作用域](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register)。

## 4. 目标数据与更新策略

### 4.1 资源分层

| 类别 | 本地位置/读取策略 | 更新行为 |
| --- | --- | --- |
| HTML 外壳、JS/CSS、主题预加载、净化器、Markdown、正则 Worker、固定卡片依赖 | 完整版本的应用资源缓存；所有入口使用本地构建文件。 | 版本清单发现新版本，后台完整准备核心资源，通过校验后才允许切换。 |
| 公共目录、卡片 JSON、封面/预览图 | 默认后台准备全部当前公共资源；先读已验证本地副本。目录首期继续随应用版本内嵌，不引入第二套实时目录接口。 | 内容摘要不变不重复下载；下载失败保留旧副本，尚未准备的单项明确提示。 |
| 用户聊天、角色、世界书、预设、设置与本机凭据 | 继续由现有 StorageService 与可靠保存处理。 | 本地写入完成即成功；云同步另行调度，公共资料更新不得覆盖用户导入后编辑的副本。 |
| 已保存的私有图片/头像 | 已有 data URL 保留；对 URL 型图片补本地字节副本，优先复用附件 `dataUrl` 的现有保存和导出路径。 | 原 URL 保留作来源/兼容回退。保存前校验 MIME、实际大小和内容；跨域不允许读取时明确未准备，不能用 opaque 响应伪装成功。 |
| 卡片的任意远程依赖、外部媒体 | 仅在已有授权与依赖审核流程中下载；字节缓存不等于执行许可。 | 固定依赖优先本地镜像，任意远程来源不得为凑齐离线包而自动抓取或执行。 |
| 主生成、二阶段、摘要、代写、图片生成 | 按操作发起实际网络请求；不做响应缓存或离线重放。 | 网络恢复后由用户重新发起，不自动续跑原计费任务。 |
| 云同步 | 继续现有认证、加密与冲突规则。 | 网络故障不得阻塞本地编辑/保存，恢复后仍按原比较基线处理。 |

“全部资料在本地”的状态必须可核对：核心应用是否就绪、公共资源已准备数量/总量、私有 URL 图片有多少未准备、失败原因。不能只有一个笼统的“已离线”。没有访问或没有授权下载的外部网站、卡片联网接口、实时大模型结果不属于可离线执行内容。

### 4.2 版本与缓存契约

建议使用项目内的小模块和原生浏览器 API，不新增 PWA 框架。职责分成：构建时清单/资源快照、浏览器缓存与更新、公共资料访问、现有用户数据存储。

1. 新建生成步骤，读取完整构建结果，产出 `offline-manifest.json`：格式版本、releaseId、应用数据兼容版本、每个文件的相对路径/用途/MIME/字节数/SHA-256，以及核心与公共资料两组总量。不得扫描用户数据目录或把凭据/私有图片加入公共包。
2. releaseId 来源于排序后的输入资源摘要，排除清单本身、Service Worker 生成结果和上轮生成目录，避免自引用。相同输入产生相同清单。不得只用时间戳伪装完整性。
3. 核心资源产出不可变版本地址，例如 `assets/offline/<releaseId>/…`，包含该版 HTML 外壳快照。HTML 中的 JS/CSS/主题脚本与运行时 Worker/固定依赖都固定到同一版；保留兼容入口。只增加查询参数、却在服务器覆盖同一路径字节，无法保证旧页面更新期间还能取到旧资源。
4. 公共文件按内容摘要复用字节，不为每版复制 127 MiB。清单绑定公共目录所属应用版本；服务端发布包含本版需要的文件，旧版活动客户端所需资源不能提前清理。
5. 核心文件使用待提交缓存下载，验证 HTTP 状态、来源、最终路径、MIME、大小与摘要；全部成功后才写“完整”标记。404、重定向登录页、200 HTML 挑战页、截断响应、摘要不符、缓存写失败都不能提交新版本。SHA-256 用于一致性，不能宣称它能认证被篡改的 HTTP 来源。
6. 导航直接使用完整已验证本地外壳，更新检查在后台。首次没有完整副本时正常联网加载；缺少离线准备不能伪装离线成功。核心完整与公共库完整分别计算，公共库失败不阻塞应用启动。
7. 远端入口与更新清单保留 HTTP 重校验语义；Service Worker 的显式离线缓存是额外保障。现行 spec 的“生产入口不缓存”需在实现时改为这套精确规则，不能简单删掉更新约束，亦不能仍要求离线时先等网络 HTML。
8. 更新检查使用短超时、取消和退避，不放进 initState、渲染、输入或可靠保存的等待链；同一页面合并重复检查。没有变化仅取清单/重校验，不重新下载全部资料。
9. 新版就绪只显示简洁入口“更新已就绪”。有生成、编辑草稿、未确认保存、恢复任务或其他活动标签页时不强制刷新，不无条件 `skipWaiting()`。切换前等待可靠保存；失败保留旧版本和草稿。
10. 旧标签页必须继续匹配自己的资源版本；清理仅针对本应用确定不再使用的资源缓存。中断下载不得删除当前完整版本、用户 IDB、localStorage、OPFS、云数据或卡片许可。更新重试从已校验项继续。

Service Worker 在线上根目录和 `/.sites-public/` 预览目录各按实际入口注册与测试；不要求扩大预览作用域。导航只接管 `/`、`/index.html`、`/opentavern`、`/opentavern.html` 及对应预览入口；静态请求只处理清单白名单，不能把同源所有 GET 一律缓存。不同基础路径、查询参数、绝对 `/cards/` 路径和旧入口都需验收。

**绝不进入公共 CacheStorage 的内容**：带 Authorization/同步令牌的请求、模型/摘要/代写/图片生成 POST、`/api/sync` 与兼容同步端点、私有图片 API、个人备份、授权回调及任何未知 API。未知导航不能回退成聊天 HTML。卡片外链请求不因被缓存而获得宿主或联网权限。

### 4.3 下载、配额与数据保全

默认在应用可交互后后台准备公共资源，限并发为 2；记录已验证项目和字节进度，网络失败暂停/退避，恢复后补缺失项。首次启动和用户操作优先，不将全部公共资源放进 Service Worker 安装的必成功集合。

下载前后使用实际可用的 `navigator.storage.estimate()` 估算；预留用户写入空间，不同时无上限保留多个公共资源全量副本。可在合适的存储操作入口申请持久化，但拒绝或不支持不能阻止使用。浏览器存储仍可能被用户清理、按配额淘汰，不能保证永久保留。[MDN 配额与淘汰](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)。

配额不足时只停止新资源下载并报告已准备/未准备数量；不得触发现有“清空所有资料”来腾空间。恢复时重新核查实际文件，不能只相信 localStorage 的完成标记。已确认的私有资料必须继续走原可靠保存和备份，不把它们降级成可随意淘汰的公共缓存。

私有 URL 图片优先复用现有 `dataUrl` 字段及可靠保存，避免先造一套新的用户数据库协议。执行前测量现有图片大小与快照成本，验证字段会随 JSON/备份/云同步正常往返；如实测确需独立 Blob 仓库，由协调者先补充接口、备份字节携带与文件白名单，再实施，禁止只存 blob URL 或悬空 ID。跨域无法下载、超出可安全保存大小或配额不足均需保留原引用并显示未准备，不报完整成功。

## 5. 局部渲染契约

复用现有 IIFE、appStore、显示模型和 `data-message-id`，不迁移 React，不另起通用虚拟 DOM。

- 按会话 ID 和消息稳定 ID 维护当前窗口节点，比较实际显示依赖：正文 revision、选中回复版本、收藏/显示设置、角色信息、二阶段 parent 关系、CoT/选项及 MVU 派生状态。不能只看消息数量，也不能只比较 content。
- 相同输入不替换节点；追加只追加，删除只删除/更新相关行；收藏只更新目标按钮。普通编辑或回复版本变化更新该消息，MVU/摘要等会影响后续显示时明确失效受影响后缀。主题、语言等全局显示变化可以重算可见内容，但不能无理由重建应用外壳。
- 统一主回复完成追加与普通窗口行的稳定标识。当前 `33-final-assistant-message-ui.js` 另建行，不能漏掉它，导致完成后第一次局部刷新重复插入。
- 当前动作按钮使用 `data-msg-idx`；复用节点后删除前面的消息会让索引过期。动作分发应由行上的稳定 ID 解析最新消息，再取得当前索引，保留既有操作接口与身份校验。
- 保留当前 150 条初始窗口和“加载更早”行为，按稳定 ID 维护窗口边界；不能只优化 2 条消息。窗口达到 150 条后的滑动、system/二阶段过滤及群聊也要验证。
- 更新前记录是否接近底部；仅在跟随底部时自动滚动。阅读旧消息时使用首个可见消息 ID 与像素偏移恢复位置；加载更早消息保留锚点。不能靠每次 `scrollTop=scrollHeight` 遮掩定位问题。
- 流式 token 只影响当前气泡，合并同一帧中的重复工作；结构化内容继续复用现有 prepareMessageDisplay/F17 净化。保留 regex Worker 的装载/执行期限、队列隔离、提示词与显示缓存边界。
- F19 iframe 只在实际执行源、依赖摘要或许可变化时按原规则重建；收藏、列表刷新等不应让其他卡片重新运行。未授权或刷新后的卡片继续原审核，不持久化执行许可。
- 会话侧栏按 `data-conv-id` 更新条目、活动态和顺序，保留既有事件委托或仅给新增节点绑定一次；不得因局部更新重复绑定。

所有派生节点/渲染标记保持运行时性质，不能写进用户快照、改变消息 revision 或污染模型输入。先可靠保存再展示已确认修改的既有规则不变。

## 6. DeepSeek 逐项执行任务

执行前重新核对基线和项目规范。以下是**最小候选白名单**，每项从该清单中选择实际要改的文件；没有使用的文件不要顺手改。标有“新建”的路径尚不存在。若真实依赖要求另一个文件，先由协调者解释并更新白名单，执行器不得自行扩大。

每项任务报告必须包含：复现/基线、实际变更文件、命令与退出码、关键结果、未完成项、失败原因、回滚方法。`completed` 仅是执行器状态，不代表通过验收。建议顺序 R0 → R1 → R2 → R3 → R4 → R5 → R6 → R7；R6 与资源方案接口固定后可独立实施，合并仍需统一构建验收。

### R0：固定故障与局部渲染基线（P0）

目标：把第 2.2 节的合成测试做成可重复检查，覆盖两个入口，建立后续修复前后证据。测试名称/运行输出不得把当前缺口标成通过；先记录基线，再逐项切换成明确断言。

AllowedFiles：

```text
scripts/test-local-first-browser.mjs                         新建
scripts/test-local-first-runtime.mjs                         新建
docs/DEEPSEEK_LOCAL_FIRST_RELIABILITY_PLAN.md
```

验收：在独立浏览器和自有临时端口复现外部资源失败、全部断网重开、相同节点替换、同源路径/Worker、合成用户数据往返。测试退出清理自己的服务，不终止别人的 8765/8766；默认不调用真实供应商。回滚仅删除本项新增测试，不触碰用户存储。

### R1：统一入口的本地依赖（P0）

目标：普通入口和 Sites 入口都使用本地 Tailwind CSS、DOMPurify、marked、主题脚本、哈希库。利用已有锁定依赖与 Tailwind 构建，不新增第三方 CDN 或在线 fallback。

AllowedFiles：

```text
src/ui/html/00-document-start.html
scripts/prepare-runtime-assets.mjs                          新建
scripts/prepare-sites-public.mjs
scripts/test-runtime-assets.mjs                             新建
scripts/test-local-first-browser.mjs
package.json
```

要求：构建链先生成公共运行资源，再装配入口，Sites 复制同一份结果；移除原来“必须先匹配 CDN 再替换”的假设。普通开发构建也必须得到本地依赖，不得只修 `.sites-public`。固定 vendor 不因离线改造升级版本。DOMPurify 缺失仍按现有安全回退，不允许直接输出未净化 HTML。

验收：清洁副本执行 build 和 prepare:sites，逐项验证引用文件存在、锁定字节一致；阻断所有外部域，两入口无初始化异常，F17 格式化与浅暗主题正常。回滚本项源文件并重建，不能手改 HTML/CSS 产物。

### R2：可验证的资源清单与版本快照（P0）

目标：落实第 4.2 节构建契约，包括运行时正则 Worker 和固定 vendor 的版本定位，以及第 2.4 节的 Worker 就绪/复用；先解决新旧字节混用，再添加离线缓存。

AllowedFiles：

```text
scripts/build-offline-manifest.mjs                           新建
scripts/test-offline-manifest.mjs                            新建
scripts/test-regex-queue-runtime.mjs
scripts/prepare-sites-public.mjs
src/app/core/10-runtime-assets.js                            新建
src/app/prompt/40-regex-worker-runtime.js
assets/js/regex-worker.js
src/app/card-runtime/61-card-runtime-dependencies.js
src/app/manifest.json
src/ui/html/00-document-start.html
src/ui/html/99-document-end.html
package.json
```

要求：运行时资源定位只有一个明确入口，默认保留旧地址兼容；版本信息由构建产生，不手填散落的发布参数。公开卡片目录首期随同版应用包，避免先重写 `PUBLIC_CARDS`/`CONTRIBUTOR_CARDS` 数据协议。新 JS 分片必须登记 manifest，保持共享 IIFE 顺序。

正则使用一个就绪后的 Worker 串行处理任务，保留提示词优先、去重、有界队列和取消规则；每次任务完成不销毁正常 Worker。装载失败、真实执行超时或协议错误才销毁并失效就绪状态，下一任务可重建；超时任务本身不自动重试。若引入任务编号/握手版本，必须隔离旧实例迟到消息，兼容旧页面直接发任务的现有协议。不能改为主线程执行复杂正则，也不能放宽现有执行期限来掩盖问题。

验收：相同输入清单一致；修改一个资源只改变相关摘要/releaseId；清单缺文件、路径穿越、URL 带凭据、重复规范路径、MIME/字节不符、非完整产物均拒绝；构建失败不留下可误认完整的新版本。验证源入口、预览与 Sites dist 的核心和 296 个公共引用一致。正则另测正常多任务只初始化一个 Worker、无 ready/脚本错误/真实灾难正则/取消后的队列恢复，保持 10s 装载与 500ms 执行区分及旧协议断言；不得删掉原负向测试以迁就复用。回滚切回旧入口与原 Worker 管理；不清缓存中的当前完整版本。

### R3：本地启动与后台安全更新（P0）

目标：实现 Service Worker 的受限缓存、完整标记、离线导航及更新状态，遵守 HTTP 降级和多标签页规则。

AllowedFiles：

```text
src/offline/opentavern-sw.js                                 新建
src/app/offline/21-local-resource-manager.js                  新建
src/app/offline/21-local-resource-ui.js                       新建
src/app/bootstrap/72-app-startup-runtime.js
src/app/settings/68-settings-storage-ui.js
src/app/core/60-dom-cache-ids.js
src/app/manifest.json
src/ui/html/settings/workspace.html
src/ui/css/50-settings.css
scripts/prepare-sites-public.mjs
scripts/build-offline-manifest.mjs
worker/index.ts
scripts/test-offline-runtime.mjs                             新建
scripts/test-local-first-browser.mjs
```

要求：资源管理与用户快照职责分离；启动完成后异步安装/检查，不 await 远端清单再开放本地界面。存储二级设置内展示核心/公共资源准备状态、“检查更新/准备资料/清理可重下资源”等必要入口，避免增加新的顶层标签或技术配置表单。更新就绪不自动打断用户；HTTP 不支持时显示真实限制。Worker 仅调整静态文件/更新清单响应，保持同步路由不变。

验收：完整缓存后全断网刷新/新开页/浏览器重启可打开；首次访问无缓存断网如实失败；新版本部分下载/错误 MIME/摘要不符/配额写失败/多标签页有未保存草稿均保留旧版。API 和私有响应没有进入公共缓存；未知 API 404 不能变成 HTML。回滚使用上一版完整缓存；仅卸载本应用注册，禁止清空用户数据。

### R4：全部公共资料的本地准备与增量下载（P0）

目标：后台准备所有当前公共文件，导入和预览优先本地；服务端变化仅下载新内容。公共资源读取接口复用 R3，避免各卡片维护独立缓存。

AllowedFiles：

```text
src/app/offline/21-local-resource-manager.js
src/app/offline/21-local-resource-ui.js
src/app/library/60-public-card-assets.js
src/app/library/60-public-card-import-ui.js
src/app/library/60-public-card-import-helpers.js
src/app/card-runtime/61-card-runtime-dependencies.js
scripts/build-offline-manifest.mjs
scripts/test-local-first-runtime.mjs
scripts/test-local-first-browser.mjs
```

要求：遵守第 4.3 节并发/配额/恢复规则；保留公共导入的正则确认、内嵌世界书、角色注册与可靠保存顺序。固定依赖读取走同版本地资源；ESM 别名仅在已有版本与审核语义完全对应时使用本地镜像，不用全局 Vue 替代 ESM。任意 URL、远端 L3 失败仍单独提示。

验收：完成后核对 296/296 的文件与字节，断网站点下能查看全部公共预览及导入此前未点开的卡片；中断后只补未完成项；一文件更新只下载该摘要，其他字节复用；公共删除/更新不影响用户导入后的编辑版。拒绝恶意清单路径和越界 URL。缓存被清理后完成状态重新校正，不能假成功。回滚恢复网络取资源路径，保留已经导入的用户副本。

### R5：URL 图片本地保存与网络失败边界（P1）

目标：补齐个人资料里仅有远程 URL 的图片副本；验证模型/云同步失败不会阻塞本地功能。**已验证可用的主模型直连与错误结算不重写**；只修本项测试实际复现的阻塞和诊断缺口。

AllowedFiles：

```text
src/app/offline/21-private-media-local.js                     新建
src/app/offline/21-local-resource-ui.js
src/app/image/51-image-generation-message.js
src/app/chat/61-message-attachments-render.js
src/app/library/60-public-card-import-helpers.js
src/app/library/60-library-my-card-preview-ui.js
src/app/api/31-api-connection-result-ui.js
src/app/core/12-i18n-zh-cn.js
src/app/core/12-i18n-zh-tw.js
src/app/core/12-i18n-en.js
src/app/manifest.json
scripts/test-local-first-runtime.mjs
scripts/test-local-first-browser.mjs
```

要求：优先现有 `dataUrl`/本地角色字段；网络下载与字节转换完成后，确认目标消息/角色仍然存在且版本/URL 未变，再用可靠保存提交候选。失败、取消、迟到回调不得覆盖新编辑或重新创建已删除记录；不能在渲染函数中下载/保存。私有媒体不得放进公共资源 CacheStorage，也不能把密钥加到图片 URL 或发给任意外站。

诊断显示区分“本地可用”“模型请求失败”“资料尚未下载”“云同步失败”，不把模糊 fetch 错误断言为 CORS。不得根据 navigator.onLine 全局禁用。自动下载/更新请求有有界超时，模型保留现有停止与用户配置的流式空闲期限（当前默认 0），不偷改用户超时偏好。

验收：历史 URL 图片批次与新生成图片保存后断网刷新显示；JSON 及备份往返确实携带本地字节，不能只保留 blob URL。MIME 不符、截断、过大、CORS、配额不足、删除/编辑竞态均不破坏原记录。故障模型不自动重试，主/二段/摘要/代写/图片生成各自结束或可停止；云端拒绝/断路时本地设置、搜索、编辑、保存仍可用。若需改摘要/同步生命周期，先提供失败复现和最小新增白名单，不凭猜测改旁边模块。

### R6：消息与侧栏局部渲染（P1）

目标：落实第 5 节，保留已有业务和安全边界。缓存/更新 UI 变化不触发聊天区整区刷新。

AllowedFiles：

```text
src/app/core/33-render-subscriptions.js
src/app/core/33-render-shortcuts.js
src/app/core/33-final-assistant-message-ui.js
src/app/chat/61-chat-message-renderer.js
src/app/chat/61-chat-message-window-state.js
src/app/chat/61-chat-message-window-render.js
src/app/chat/61-chat-message-html.js
src/app/chat/61-chat-history-window-ui.js
src/app/chat/67-message-action-helpers.js
src/app/conversation/64-conversation-list-ui.js
src/app/events/71-event-message-action-bindings.js
src/app/generation/52-generation-stream-animation.js
scripts/test-local-first-runtime.mjs
scripts/test-local-first-browser.mjs
```

验收：用 DOM 对象身份和 MutationObserver 断言未变节点保留；同帧重复通知不重复执行相同区域工作；收藏/版本/编辑/删除/增加消息后动作仍指向正确 ID。覆盖 150/151/500 条消息、加载更早、群聊、二段、MVU 影响后缀、正则格式化、流式停止和切换会话。阅读中锚点/焦点保持，底部才跟随，未变化 iframe 不重启。390/1280px 浅暗/系统主题截图必须实际检查。记录固定设备与样本下的刷新耗时/长任务，不能用随意绝对毫秒阈值代替正确性。回滚本项 renderer 源码并重建，不迁移/删除用户数据。

### R7：统一回归、文档与发布门禁（P0）

目标：把新增检查接入现有门禁，更新规格和部署说明，完成后才标“已实现”。

AllowedFiles：

```text
package.json
scripts/check-release.mjs
scripts/test-release-gate.mjs
scripts/test-sites-build.mjs
scripts/test-source-structure.mjs
scripts/test-local-first-browser.mjs
scripts/test-local-first-runtime.mjs
scripts/test-runtime-assets.mjs
scripts/test-offline-manifest.mjs
scripts/test-offline-runtime.mjs
docs/spec.md
docs/SOURCE_STRUCTURE.md
docs/SITES.md
docs/DEEPSEEK_LOCAL_FIRST_RELIABILITY_PLAN.md
AGENTS.md
```

构建产物仅由构建重建；执行器不得直接编辑 `assets/js/app.js`、`index.html`、`assets/css/app.css`、`.sites-public/`、`dist/` 或清单生成目录。需要提交的生成产物由协调者基于已验收源码重建并核对；不得通过白名单排除实际源码差异。

验收至少包括：`npm run build`、`npm run check`、`npm run check:structure`、`npm run check:app-contracts`、`npm run check:release-tool`，然后同一源码 `npm run check:release`。新增测试必须进入对应检查链，不只留一条无人运行的命令。现有六组浏览器继续通过，新增离线/更新/局部渲染组也要纳入真实运行、资源哈希记录和失败退出检查。新增分片涉及的 VM 装载列表必须同步；若现有测试需更改，协调者先把精确路径补入该项白名单。

真实供应商验收使用本机现有凭据及应用实际设置，不向模型发送原生产历史；模拟故障默认不产生供应商请求。发布需要协调者按当时用户授权单独执行，执行器不得部署或推送。回滚验收需覆盖服务器回退旧版本且用户本地仍保有新旧缓存的情况，不能只测试清缓存后的首次安装。

## 7. 必测故障矩阵

| 编号 | 操作/故障 | 必须观察到的结果 |
| --- | --- | --- |
| A01 | 两个入口阻断所有外部 CDN | 正常启动、主题和净化格式化可用，没有新增外部运行依赖。 |
| A02 | 完整准备后站点不可达，刷新/新开/重启浏览器 | 支持的来源使用完整本地版本；历史和已准备资料可用，无需先等更新超时。 |
| A03 | 全新浏览器未准备，第一次就断网 | 明确无法首次取得应用；不伪造已缓存/已保存。 |
| A04 | 仅更新服务/公共库/云同步不可达，DeepSeek 可达 | 主回复与二阶段仍可直发；本地保存与所有离线操作不等待其他服务。 |
| A05 | 隔离浏览器故障代理；站点从本地打开 | 模型请求失败或可停止，本地编辑/设置/导出不锁死；不宣称自动绕过代理。 |
| A06 | 完整旧版存在，新版缺文件、错误 HTML/MIME/摘要或缓存写失败 | 新版不提交；旧版可重新打开。API 错误不能缓存成正常资源。 |
| A07 | 新版下载中断；恢复后清单不变 | 只补缺失/损坏项，下载完后才通知就绪；未变化内容不重复下载。 |
| A08 | 配额不足、持久化申请被拒绝、缓存被用户清理 | 用户原始数据不被主动清理；就绪状态与实际字节重新核对。 |
| A09 | 两个标签页：一页生成/编辑，一页检查更新 | 原页不强刷、不混版本；待保存完成再切换；旧版资源不提前删除。 |
| A10 | 核心完成而公共资料只完成一部分 | 核心照常用；单项区分已准备/未准备，不能显示“全部离线”。 |
| A11 | 准备 296 个公共文件后断网，导入从未点击的卡片 | 仍能读取本地 JSON/图片，保留正则审核与世界书导入，用户编辑副本不被更新覆盖。 |
| A12 | URL 图片准备成功/失败、保存失败、下载中删除目标 | 成功副本刷新/备份往返可用；失败或迟到不覆盖/复活记录，不丢原 URL。 |
| A13 | 相同渲染、收藏、前部删除、版本切换、500 条历史 | 未变行节点保持，按钮作用于正确 ID；滚动和焦点稳定；影响后缀正确失效。 |
| A14 | F18/F19/正则、固定依赖本地就绪、L3 服务断路 | 本地能力继续，远端能力单独失败；审核/沙箱/净化/执行时限不放松。 |
| A15 | 远程普通 HTTP、localhost/127.0.0.1、HTTPS、不同路径入口 | 各自能力如实呈现；不强制 HTTPS；HTTP 不支持 SW 时已有本地操作仍可用。 |
| A16 | SW 遇到模型 POST/带凭据 GET/同步/图片 API/未知路径 | 不缓存、不离线重放、不返回应用 HTML、不泄露凭据；取消后不自动恢复计费。 |
| A17 | 内容不变检查更新；全局主题/语言改变 | 前者不刷新聊天、不重下全部资产；后者正确更新显示，用户数据不变化。 |

至少导出一份机器可读报告：源码 SHA、入口、浏览器/版本、故障注入方式、网络请求分类、当前/待下载 releaseId、文件数/字节与哈希、节点身份/滚动断言、用户数据前后比较、截图路径、未测限制及服务清理状态。凭据、完整 prompt、私聊原文不得写进报告。

## 8. 全局 DeepSeek 执行方式

协调者先建立 `<local-evidence>/` 下的独立源码工作副本，保留用户主目录修改；将本任务书、相关规格及本项目标/实际白名单写入独立 TaskFile。`AllowedFiles` 必须是当前任务的真实相对路径数组，不使用整个目录或 `**`。每项独立执行、审查后合并，避免多个任务覆盖共享 manifest/package/build 文件。

已核对本机入口：`<worker-root>/worker.ps1`，PowerShell 7，`Provider=deepseek`，写入使用 `Mode=workspace-write`；参数包括 `Workspace/TaskFile/AllowedFiles/TimeoutSeconds`。具体调用规则见本机 `<worker-root>/README.md`，不要把凭据写入任务、命令或源码。

执行器不得递归启动模型/执行器，不负责提交、推送或发布。结束后协调者检查 `report.json`、`last-message.md`、实际 diff、测试和 `runtime_cleanup`；失败明确返工，不能只采信自述。若需要扩白名单或独立 Blob 存储等设计变化，先补充本文后再下发。任务结束按项目规则检查其他同项目会话，再决定提交。

## 9. 本次文档交付验证

本次完成了源码和发布构建逻辑审查、296 个公共资源统计、两个入口的隔离浏览器故障/节点身份测试、已有密钥的真实 DeepSeek 调用、隔离故障代理对照，以及正则同源运行/10s 未就绪/恢复测试。

- 文档冒烟通过：8 项任务、17 组验收场景、白名单既有/计划路径、源码行号、Markdown 链接、代码围栏与本机密钥未泄漏校验。
- `node scripts/test-regex-queue-runtime.mjs` 通过；保留现有提示词优先、去重、500ms 终止、失败重试/队列恢复、显示链失效及无 Worker 保护基线。
- `npm run check:app-contracts` 通过，包含 AST 作用域、T07/T08 接口/装配顺序与失败构建原子性。
- 文档差异限定为本文、`docs/spec.md` 和 `AGENTS.md`；没有修改应用源码或构建产物。

应用功能开发、离线能力实现、真实整机代理崩溃、双设备同步和新版发布均没有计为本次完成项。

## 10. 全量实施与协调验收（2026-10-15）

本节更新原文档交付时的状态。R0–R7 已实施，通过九组真实浏览器与同版完整门禁、真实 DeepSeek 请求及正式站点完整断网验收，并于 2026-10-15 22:45 发布第 16 版；准确源码、版本、部署与证据见 [SITES](SITES.md)。未将执行器自述当作整体验收。

| 项目 | 实现及证据 |
| --- | --- |
| R0 | `baseline.json` 在普通/Sites 两入口复现 CDN 失败、全断网刷新失败和重复渲染替换节点。新增离线更新、局部渲染浏览器组。 |
| R1 | 两入口共用锁定的本地 CSS/净化器/Markdown/主题/哈希文件；运行时资源测试校验字节。 |
| R2 | 17 核心/296 公共文件清单、内容摘要版本、不可变快照和固定运行时定位。补相同版本 Vue/js-yaml 的 ESM 镜像，npm 包完整性已核对；不升级依赖。 |
| R3 | 完整标记、按版本缓存、受限 SW、离线导航、后台更新及显式安全切换；错误 MIME/摘要/配额、新版暂存、草稿和多标签页均有故障检查。普通 HTTP 保留原用法。 |
| R4 | 后台并发 2、摘要复用、断点续传与配额保护；真实浏览器全断网读取核对全部 296 个文件，导入之前未打开的十六夜野宫卡。角色与世界书登记已补可靠 ACK，失败和竞态测试通过。 |
| R5 | URL 位图本地 `dataUrl`、实际解码、来源保留、限量批次、迟到版本/编辑/删除保护及可靠保存；真实离线刷新/完整备份保有图片字节；已准备公共预览可离线转成私人副本。 |
| R6 | 稳定 ID 对齐、零多余子树变更、150/151/500 窗口及加载更早保留节点、焦点/滚动；通知合并绘制最终状态。正则异步链及 MVU 显示依赖纳入失效判断。 |
| R7 | 六组 `check:local-first` 契约接入完整检查，保留原七组浏览器并增加两组；根快照与整个预览/dist 树纳入资源一致性门禁。最终报告见发布记录。 |

独立副本与证据根为 `<local-evidence>/opentavern-local-first-20261015/`。资源、渲染、私有媒体初轮及资源/构建/渲染/图片/公共导入返工由全局 DeepSeek 按精确白名单执行，原始报告均无范围越界、`runtime_cleanup=removed`。协调者另审查差异、运行正常环境检查并补跨模块修复，不修改模型或用户凭据。

返工修复了发现新版提前改资源定位、未读取表单草稿、只限制响应头未限制正文、缓存响应已读后再次 clone、渲染合并丢后续状态、无 MVU 时整后缀重建、系统消息索引、异步正则完成未显示等问题。`scripts/tests/frontend/core.mjs` 仅调整微任务等待；`library.mjs` 保留原 UI 断言并增加 ACK 边界，真实保存故障由新套件覆盖，没有删除门禁。

已视觉检查 390/1280px 浅暗和跟随系统截图。只在全新浏览器配置与合成会话中测试，不使用原生产历史。首访未准备不能离线，普通远程 HTTP 不承诺断网重开，跨域图片无法读取时如实未准备，实时模型/远端 L3 仍需相应网络；未验收 iPhone 真机，不新增 TTS、不部署远端 L3、不修改系统代理。

正式托管验收另发现静态层覆盖 Worker 的 `no-transform` 并对 HTML 注入 938 字节，导致第 15 版的核心校验如实失败；不能把本地门禁当作正式离线成功。修复采用同字节纯文本外壳传输，严格 MIME/大小/摘要后仍按原 HTML 缓存，保留联机入口平台差异；已增加损坏副本和包装错误故障回归，实际发布与线上断网结果见 SITES 最终记录。

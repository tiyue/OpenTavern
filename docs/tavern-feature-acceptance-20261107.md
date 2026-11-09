# 酒馆扩展功能开发验收记录

日期：2026-11-07–2026-11-09。当前状态：阶段 A（03/04/09/10/13）、B（01/02）、C1（11）、C2（12）、C3（14）、D1（05）与 D2（15）均已通过主协调者最终本地验收，保留的 12 项开发与本地验收完成。06/07/08、TTS、本地推理/WebLLM、ComfyUI 不在范围。本批未推送或发布，线上仍为第 19 版；真实供应商、Embedding 中文质量、iPhone 真机与生产部署未验收。各轮失败与未运行项保留为历史，当前以本段及最终验收为准。

## 阶段 D2 最终本地验收（原编号 15，2026-11-09，通过）

D2 最终 release `afa8c8d0d9d836d61cf092ba`（503 项 JS、33 个业务目录、22 项 HTML、11 项 CSS，17 core/296 public），33 组验证全部通过，运行资源的 5 项 SHA-256 在全部检查期间保持一致；此前 11 项与本项合计 12 项通过本地验收。源码和生成物均在独立工作副本验收，再本地集成；本批未发布。

- **实际管理与使用**：D2 整组 Chrome 24 个流程通过，覆盖本地示例包导入预览、默认停止/未授权、能力确认、真实 Worker 统计与私有保存、保存后事件、刷新后显式再启用、v2 差异与输出、候选抛错/CPU 循环/保存拒绝保持旧版、回退、停止、卸载保留数据导出、明确清除目标命名空间，以及全部关闭后的普通聊天、总结、D1 工具与刷新恢复。v1/v2 的统计结果来自真实插件代码，宿主未硬编码统计器。
- **可靠保存独立检查**：真实 `StorageService.saveAll` 已写后持有 ACK，再停止旧实例，迟到 RPC 被拒绝且 live/磁盘不复活旧数据；正常插件写入 ACK 后，后续已捕获的普通 pending 快照保留确认过的数据。实际发送用户消息的 ACK 等待期间统计仍为旧 2 条、模型请求 0，确认后统计 4 条、模型请求 1。六项独立事务断言覆盖旧授权/更新预览、字节/来源/权限授权绑定、非法包及跨插件命名空间。
- **实际隔离与联网**：远程非安全 HTTP、本机 HTTP、合成 HTTPS 三父来源均通过产品运行器检查。插件中的 `</script>`/引号不进入 srcdoc；直接 fetch/XHR/WS/importScripts/动态 import/远程 Worker/IDB/导航/WebTransport 等适用通道未穿透路由。另用独立真实 Python HTTP 服务完成受权网络 RPC、禁止来源/方法/头、无 Cookie、拒绝重定向、声明与流式超量、CORS、整段超时及撤权中止实际读流；未增加平台代理或后端。
- **实际终止**：Chrome CDP 观察到根/子/孙 3 个 Worker，停止后全部销毁。无限 CPU 正例确实占用处理器，失联后实际 Worker close、目标最终销毁、600ms 观察窗处理器增量为 0；此例约 8.2 秒结算，恶意原始 RPC 洪泛有限失败。原生页面/opaque iframe 对照同样证明线程最终销毁且 CPU 增量为 0。Chromium 强制结束执行有约 2 秒宽限，因此检查最终销毁及 CPU，而不把 UI 的停止状态当成同步回收证明，依据见 [Chromium WorkerThread 源码](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/workers/worker_thread.cc)。不承诺硬内存配额或硬实时线程回收。
- **真实双端同步**：实际隔离 Python HTTP/SQLite v1/v2、两个独立浏览器客户端共 35 请求，插件定义、代码、资源、回退版本、私有数据与已卸载保留数据往返一致；授权不便携，导入/下载/刷新不执行第三方代码，新版不能沿用旧批准。同步测试零模型请求。
- **既有能力回归**：完整检查含 66 项 Python；旧消息修订/剧情事实、场景、自动化与内容模块独立检查通过；D1 原生 OpenAI/Anthropic JSON/SSE 本地 HTTP 四流程、恢复 checkpoint ACK、真实场景保存 ACK 与模块发送通过，A/B/C1/C2/C3/D1 六阶段整组 Chrome 均在本 release 上通过。
- **视觉检查**：D2 整组 9 张移动/桌面浅暗/系统截图，以及额外真实统计浅/暗/系统暗和 390/1280 更新差异详情截图已由协调者查看。实际界面为二级对话框、有限文本/按钮，完整摘要可换行，无横向溢出或占位翻译键；更新差异截图直接显示 1.0.0→2.0.0、来源/摘要/入口大小变化。
- **审计与返工**：两个 D2 执行器报告均 completed/exit 0/scope violations 空、runtime cleanup removed；实际 file_change 事件及 shell 写入复核均在各自清单内，临时测试夹具与产品源修改区分记录。首轮四项产品缺陷和本轮修复保留在下方历史。协调者只修测试夹具：顶层窗口初始化、等候视图尚未产生时的判空、动态 data-URL 测试中的相对文件定位、同步测试来源与端点路径的区分，以及原生线程回收宽限测量；未删除产品断言或屏蔽真实 pageError。
- **证据**：`/path/to/local-release-evidence`（33 步、manifest、5 项资源哈希）、`stage-d2-worker-audit.json`、`stage-d2-browser-verified`、`stage-d2-independent-{lifecycle,isolation,network,storage,pending,saved-stats,sync,termination,visual}`、`worker-terminate-control.json` 与 `stage-{a,b,c1,c2,c3,d1}-with-stage-d2-browser`。失败夹具报告与返工前真实失败报告另外保留。
- **限制**：仅显式本地 JSON 包安装，无市场/后台自动更新；刷新需显式再次启用。网络依赖浏览器 CORS/混合内容规则，无可有界读取的 reader 时拒绝非空响应。06/07/08、TTS、本地推理/WebLLM、ComfyUI 不在范围。本批未推送或发布，线上仍为第 19 版；真实供应商、Embedding 中文质量、iPhone 真机与生产部署未验收。

## 阶段 D1 最终本地验收（原编号 05，2026-11-09，通过）

D1 最终 release `5518c947004db9034ef65acf`（499 项 JS、32 个业务目录），28 组验证全部通过：构建、完整检查（含 66 项 Python）、11 项独立协议/调用身份/旧数据兼容断言、实际 Chrome 8 流程、OpenAI/Anthropic JSON/SSE 四种真实本地 HTTP 流程、真实总超时与工具后刷新恢复、恢复数据库阻塞、持有实际恢复写入 ACK、真实 HTTP/SQLite v1/v2 双客户端同步与回复版本切换，以及此前各阶段独立检查和 A/B/C1/C2/C3 整组 Chrome 回归。

- 当前工具为只读当前会话搜索，默认关闭、本机会话授权不便携；摘要、代写、二阶段沿用普通请求。工具结果保留原文字面量，只读已保存正文，不能访问其他会话、草稿、思考、设置或凭据。
- 原生协议保真：OpenAI 调用 ID、reasoning_content 与结果消息，Anthropic thinking/signature/redacted/tool_use/tool_result 块及顺序均由真实本地 HTTP JSON/SSE 检查。4 流程、8 请求、4 次实际搜索，最终回复只保存一次；刷新不执行旧调用。实际 v1/v2 双端同步 32 请求验证工具记录、原生块、两回复版本及真实版本切换、本机许可隔离。
- 独立故障修复：截断/缺完成标记不能执行；缺失、空、过长与冲突 ID 的原始整轮不能过滤后部分执行；120 秒总预算真实中止所属请求；工具轮恢复记录必须 ACK 后才续轮，拒绝或撤销不续轮；已执行工具后刷新仍能读到本机恢复记录；恢复库打开/事务与最终清理各有 5 秒内部期限，阻塞不再永久卡住生成。
- 可靠保存故障：真实新增助手候选的 StorageService.saveAll 拒绝，当前聊天不冒充保存成功；真实本机草稿保留调用记录，显式恢复写入带 interrupted 的历史，零额外工具或模型请求。旧的 3 条消息修订和 3 条既存剧情事实使用升级前固定样本验证，保持兼容。
- 范围审计：初轮执行器曾将 2 个新文件写入 generation，并临时改动后还原 2 个清单外文件；该轮被拒绝，4 项事件与实际范围失败已记录。后续按字节把协议/运行时归位 tools，最终实际差异落回原 48 路径加协调者生成物；没有将“最终无差异”当作未发生违规。各轮返工报告、清理与实际差异均独立复核。
- 证据根目录 `/path/to/local-release-evidence`：总表 `stage-d1-final-verification.json`（28 步、manifest、5 项运行资源哈希），`stage-d1-browser-verified`、`stage-d1-independent-wire`、`stage-d1-independent-lifecycle`、`stage-d1-independent-draft-storage`、`stage-d1-independent-draft-ack`、`stage-d1-independent-sync`、旧场景 ACK/模块发送与 `stage-{a,b,c1,c2,c3}-with-stage-d1-browser`。实际移动/桌面浅暗/系统截图另经检查。
- 限制：4 工具轮/6 次调用，单参数 8 KiB、单结果 16 KiB、总结果 32 KiB、单执行 4 秒、总任务 120 秒、原生/记录保存有界。真实供应商工具支持、iPhone 真机和正式发布未验收；15 继续开发，未将本阶段等同全部完成。

以下是历史实施和返工记录，当时的未运行项不覆盖以上最终验收。

## 阶段 D2 实施与返工历史（原编号 15，2026-11-09；最终结果见上）

**范围**：协调者 D2 AllowedFiles 为 `AGENTS.md`、`docs/spec.md`、`docs/SOURCE_STRUCTURE.md`、`docs/tavern-feature-plan-20261107.md`、`docs/tavern-feature-acceptance-20261107.md`、`package.json`、`src/app/manifest.json`、`src/app/plugins/{32-plugin-packages,40-plugin-isolation,50-plugin-runtime,68-plugins-ui}.js`、`examples/plugins/conversation-stats-v{1,2}.json`、三语言 i18n、默认/初始化设置、会话可靠保存钩子、渲染订阅、设置弹窗、云同步策略/应用、备份恢复计划/运行时、扩展设置模板、功能 UI CSS、D2 runtime/browser 与私有设置/设置/备份恢复测试。实际改动只在上述路径；未修改角色卡运行器、`card-runtime/`、后端/服务、部署、凭据、生成物或清单外文件。

**实际实现**：

- `32-plugin-packages.js`：严格本地包格式、稳定 ID/版本/schema/来源、精确依赖、能力/网络声明、保留名与未知字段拒绝、读取前 `file.size`、UTF-8 字节上限、宿主重算 SHA-256 canonical 摘要、最多一版回退快照、按插件 ID 的有界私有 JSON、本机授权 fingerprint（版本/摘要/来源/能力/网络）与可靠保存事务。
- `40-plugin-isolation.js`：仅受信引导的 srcdoc iframe（`sandbox="allow-scripts"`、无 same-origin），CSP `connect-src 'none'`、`script-src nonce + blob`、`worker-src blob`；插件 entry 与 SDK 在 iframe 内组装为 Blob DedicatedWorker，不进入 srcdoc/宿主 DOM；Worker SDK 提供 ready/fail、事件、统计、私有存储、受控 UI、网络 RPC，跟踪嵌套 Worker，并响应心跳/探针。
- `50-plugin-runtime.js`：实例 token/端口/实例 ID/插件 ID+摘要+version/调用 ID/授权指纹绑定，启动握手、稳定探针、2 秒心跳/6 秒失联终止，订阅与 ACK 后 `conversation-saved`，当前会话有界统计，私有写入走同一可靠保存事务，UI 文本/按钮校验，网络按 origin/method/header/credentials/redirect/body/response/timeout/abort 限制；禁用/卸载/更新/撤权先停实例、撤销端口/Blob/后代、迟到消息按世代拒绝；依赖缺失/版本不符/循环拒绝，停依赖停依赖者；云同步/备份恢复停止全部实例。
- `68-plugins-ui.js` + `extensions.html` + CSS：二级管理对话框，导入预览、安装（停止且未授权）、显式能力授权、启用/停止、故障状态、更新差异、回退、卸载、导出/明确清除私有数据、未安装数据列表；插件输出只渲染纯文本与有限按钮。`examples/plugins/conversation-stats-v{1,2}.json` 是真实 JS 插件，v1 统计消息/字数并保存私有状态，v2 使用资源标记与不同输出，非宿主硬编码统计器。
- 持久边界：`plugins`/`pluginPrivateData` 随普通设置同步/备份，`pluginGrants` 加入云同步本机保留键；备份恢复校验插件/私有数据并停止实例；刷新保留授权但不自动运行；插件私有数据与授权分开。

**首轮独立验收失败与返工（2026-11-09）**：协调者独立浏览器与代码级验收复现四项产品缺陷，首轮 D2 未通过，不能记作 12 项全部完成：

- 真实 `independent-plugin-lifecycle-browser.mjs` 在导入/授权/启用后 12 秒无输出，状态 `running`、视图 `null`、私有数据为空。原因是 iframe 把宿主 `plugin-host-rpc-result`/`plugin-host-event` 原样转给 Worker，而 SDK 只监听 `plugin-rpc-result`/`plugin-event`。返工在可信引导内显式转换消息类型，使 `stats.get`/`storage.set`/`ui.render`、事件和按钮真实回程；保留首轮启动定时器清理。
- 真实 `independent-plugin-storage-browser.mjs` 在 `StorageService.saveAll` 已写入、ACK 被持住时停止实例，RPC 虽最终报错但 live 与磁盘均已出现 `MUST_NOT_RESURRECT`。返工在 `savePluginSettingsChange` 的 `onPersistSuccess` 增加提交前存活校验（实例/世代/指纹/授权），失败时沿用 `persistState` 的已写纠正路径；覆盖停止、卸载、更新和重新授权后的迟到写。
- 真实 `independent-plugin-pending-browser.mjs` 中插件写成功，但稍后普通 `persistState` 用旧插件字段覆盖磁盘。返工按已提交候选和事务所有权把目标插件命名空间合并进后续 pending 快照，只替换仍停留在旧基线的命名空间，不覆盖其他插件的新数据。
- `independent-plugin-transactions.mjs` 第 3 项复现旧 v1 授权对话框可给已安装 v2 授权。返工要求授权提交、保存 ACK 期间和提交前都匹配审阅记录的完整 fingerprint，并拒绝审阅包能力之外的选项；同 ID 同能力不同版本同样拒绝。
- 同一轮还修通既定边界：入口按实例限制排队条数/字节/消息频率，超限有限失败并清队列/停止；SDK 调用 ID 使用递增序列与有界集合，旧 ID 不再因窗口清空而重放；网络响应无流式 reader 时不再用 `response.text()` 整段读取，明确空响应之外如实拒绝；v1/v2 示例在自身代码内串行/合并刷新，避免并发 `storage.set` 互相覆盖。

**实际运行**：

- `node --check`：`src/app/plugins/32-plugin-packages.js`、`40-plugin-isolation.js`、`50-plugin-runtime.js`、`68-plugins-ui.js`、`scripts/test-tavern-stage-d2-browser.mjs` 全部通过。
- `node scripts/test-tavern-stage-d2-runtime.mjs`：通过，覆盖原有包/摘要/保留名/原型键、授权指纹、依赖缺失/循环、真实 v1/v2 示例代码、统计边界、私有命名空间、UI 限制、网络策略、探针拒绝、重复/限频/迟到调用和保存失败；本轮新增源码级实际 iframe 引导与 Blob Worker SDK 消息回程、ACK 期间停止/卸载、pending 快照合并、过时授权对话框、超限/洪泛/循环消息和调用 ID 重放断言（VM 模拟传输，不是浏览器验收）。
- `node scripts/test-private-settings-runtime.mjs`、`node scripts/test-settings-runtime.mjs`、`node scripts/test-backup-restore-runtime.mjs`：通过；新增插件授权排除、插件定义/私有数据可移植、恢复后停实例与非法插件包拒绝断言。
- `node scripts/test-tavern-stage-d1-runtime.mjs`：通过，确认会话保存钩子未破坏 D1 工具闭环。
- `node scripts/check-app-contracts.mjs`：通过；`scripts/test-source-structure.mjs` 在本执行环境仍因 `spawnSync(process.execPath,...)` EPERM 在临时构建夹具处中止（与上一阶段记录的 `test-app-contracts` 受限情况同类，非本次源码断言失败）。

**未运行/限制**：

- 未运行 `npm run build`/`build:ui`、完整 `npm run check`、`scripts/test-tavern-stage-d2-browser.mjs`、实际 Chrome/Playwright、三个合成父来源（远程 HTTP、本机 HTTP、HTTPS）正式矩阵、真实供应商、iPhone 真机、v1/v2 双端同步、Sites/ECS 部署或提交/推送。浏览器脚本已提供但未由执行器启动，不能宣称其通过。
- 不承诺硬内存配额；网络响应无流式 reader 且非明确空响应时拒绝，不再先读取文本再检查字节；CSP 与 opaque origin 的实际拦截、Worker/嵌套 Worker 终止和截图由协调者用真实 Chrome 独立验收。首轮独立浏览器证据（生命周期/存储/pending/隔离/保存后统计）在返工后必须由协调者重新运行确认，不能沿用首轮中间版本结论。

## 阶段 D1 历史实施记录（原编号 05 模型工具，2026-11-08，待主协调者最终验收）

**范围**：协调者提供的 D1 AllowedFiles 包含 `src/app/tools/32-model-tools.js`、`src/app/tools/50-model-tool-protocol.js`、`src/app/tools/50-model-tool-runtime.js`、`src/app/tools/68-model-tools-ui.js` 与 `scripts/test-tavern-stage-d1-runtime.mjs`、`scripts/test-tavern-stage-d1-browser.mjs`；功能改动还涉及生成传输、API 协议、提示词回放、消息身份/版本、流式草稿、设置、同步/备份边界、原型三语言和扩展设置页。首轮执行器未完全在 AllowedFiles 内实施，见下条范围返工。未加入 15、06/07/08、TTS/WebLLM/ComfyUI，未新增后端、代理、依赖、模型或部署。

**范围返工（2026-11-08，协调者拒绝首轮验收）**：首轮执行器把 `50-model-tool-protocol.js`、`50-model-tool-runtime.js` 新建在 `src/app/generation/`，而不是 AllowedFiles 指定的 `src/app/tools/`；过程中还曾修改未列入名单的 `src/app/chat/61-chat-message-html.js` 与 `src/app/prompt/41-prompt-controls.js` 后还原，`git diff` 现在虽无差异，临时越界本身仍记为违规，不能以事后还原抵消。协调者据此把该轮判为 failed（`stage-d1-scope-audit.json`），D1 源码功能仍未独立验收。纠正轮不做功能修改：确认两个源文件是本轮新增未跟踪文件、目标 `src/app/tools/` 同名文件不存在后按字节移动，移动前后 SHA-256 一致（`A166852C1C8D2FFA9B6DBF7B67A7443632559361B7C06DF208347699154062CD`、`8BD2A57F83F973661C62B1CA2D7C655513526951BF792CCF8EEF6773D083F9C5`），只同步 `src/app/manifest.json` 原位置字符串、`scripts/test-tavern-stage-d1-runtime.mjs` 加载路径与 5 份文档中的文件位置/模块归属，未改函数行为、接口或测试断言，也未再写入上述两个聊天/提示词分片。

**实际实现**：

- 独立工具注册与严格 schema 子集；首个工具 `search_conversation` 只读当前 live 会话已保存正文，结果含消息 ID/修订和有界片段，不读取其他会话、设置、凭据、草稿或思考。授权默认关闭，按真实本机会话许可和当前设置检查；导入/同步不携带本机授权，插件名字不会自动授予能力。
- OpenAI `tools/tool_calls/tool` 与 Anthropic `tools/tool_use/tool_result` 的 JSON/SSE 路径；SSE 按 index/原生块累积，`input_json_delta` 完整关闭后才解析，`input:{}` 不提前执行；thinking/signature/redacted 块按原顺序保留。关闭工具的请求不增加工具声明、`tool_choice` 或原生历史，二阶段/摘要/代写不自动获得工具。
- 同 ID 结果回传、调用缓存与重复 ID 冲突、未知/未授权/非法/超量参数错误结果、多调用、轮数/总调用/参数/结果/总结果/单次执行/总任务上限。原始调用 id 缺失、为空、超长或流中前后冲突使整轮协议失败，不静默丢弃、不伪造 ID 结果、不提前执行同轮其余调用。停止、撤权、切会话、连接或源修订变化后不开始下一轮；意外 EOF/缺 stop 记录为未完成，不执行或重放。
- 最终正文只可靠保存一次；工具记录随消息版本、刷新、导出/导入/备份/v1v2 同步和版本切换保留；纯工具中断/无正文时保留可读 trace，恢复草稿带同一有界记录且刷新不自动重跑。没有 trace 的旧消息修订保持原值，只有真实工具/原生思考记录进入身份。
- 设置“扩展”提供当前会话授权开关、工具说明/schema 与最近执行记录；消息内只读显示调用/参数/状态/结果预览，协议记录与展示分离。390/1280、浅暗/系统样式由浏览器脚本覆盖。

**本轮执行器实际运行**：

- `node scripts/test-tavern-stage-d1-runtime.mjs`：通过；覆盖 schema/授权、OpenAI JSON+SSE、Anthropic JSON+SSE、任意字节切分与中文 UTF-8、同 ID/重复 ID/未知/未授权/非法/超量参数、多调用、轮数/调用上限、意外 EOF、停止/撤权/切会话/源变化、off-path、原生历史回放、持久 trace、旧修订与便携设置排除、`postProcessPromptMessages` 原生消息隔离。
- `node scripts/test-api-protocol-runtime.mjs`、`node scripts/test-stream-drafts-runtime.mjs`、`node scripts/test-settings-runtime.mjs`、`node scripts/test-message-reliability-runtime.mjs`、`node scripts/test-private-settings-runtime.mjs`、`node scripts/test-backup-restore-runtime.mjs`：均通过。
- 既有酒馆阶段 `test-tavern-stage-a/b/c1/c2/c3-runtime.mjs`、会话传输、聊天操作、便捷功能、用户图片/版本、提示词控制、存储超时、流式传输、世界书绑定与预设事务运行回归均通过；没有把这些结果当作 D1 最终浏览器或发布验收。
- `node --check` 通过本轮修改的 JS、三份 i18n、设置页脚本与两个 D1 测试脚本；`node scripts/test-app-contracts.mjs`、`node scripts/check-app-contracts.mjs` 通过；按 manifest 文件覆盖核对为 499 项、0 缺失/0 重复/0 额外。

**范围归位轮实际运行（2026-11-08）**：

- `node --check src/app/tools/50-model-tool-protocol.js`、`node --check src/app/tools/50-model-tool-runtime.js`：通过。
- `node scripts/test-tavern-stage-d1-runtime.mjs`：通过；归位后按新路径装载，断言与首轮相同。
- `node scripts/check-app-contracts.mjs`、`node scripts/test-app-contracts.mjs`：通过。
- `git diff --check`：无空白错误；按 manifest 覆盖核对为 499 项、0 缺失/0 重复/0 额外。
- 未运行 `npm run build`、完整 `npm run check`、Chrome/Playwright、真实供应商或 v1/v2 双客户端同步，仍由主协调者执行。

**第二轮返工（2026-11-08，协调者独立异常测试复现）**：

- 复现事实：协调者构建 release `56f69014496234703babc45c`（499 项 JS、32 个业务目录）后，旧 revision 与既存 scene golden 4 组通过；实际 Chrome 8 流程、独立 HTTP 四种 OpenAI/Anthropic JSON/SSE 8 请求及原生 reasoning/signature/redacted 保真通过。但外部异常测试有三类真实失败：外部 `independent-model-tools-completion.mjs` 5 例只有正例通过，OpenAI JSON `finish_reason=length`、JSON 缺 `finish_reason`、SSE 有 `[DONE]` 但缺 `tool_calls` 结束、Anthropic `max_tokens` 四例仍执行 1 次搜索并发起下一请求；`independent-model-tools-lifecycle-browser.mjs` 的 deadline 在 80 ms 测试预算下实际 1682 ms 才结算（未中止在途流）；midflight-reload 已执行 1 次搜索并把同 ID 结果送入第二个 HTTP 请求，但刷新后 `streamDraftStorage('getAll')` 为 0 条。
- 修复：①`buildCompletion`/传输层不再只看 `ending`，要求协议明确结束（OpenAI `tool_calls`、Anthropic `tool_use`）且调用结构完整（合法 ID/名称、参数字符串可解析为对象）；长度/过滤/缺结束/意外 EOF/参数截断都结算为 `interrupted`/`unknown`，0 次执行、0 次下一请求，并保留 `not-run` 部分调用与原生记录。②传输层以工具运行时提供的绝对截止时间启动真实计时器，覆盖网络、流、工具与续轮；到期设置超时标记、中止所属 `AbortController`、用部分累积器结算一次并清理计时器；`MODEL_TOOL_MAX_TASK_MS` 保持 120 秒，80 ms 只为测试内改写常量。③传输层在每个实际完成的工具轮后回调 `onToolRoundComplete`，生成有界规范化 trace（状态 `unknown`，保留原生 assistant/结果/参数/状态），集成层复用既有 `stream-drafts` 排队并立即写入本机事务；最终正文 ACK 后删除该草稿，保存失败保留；显式恢复只写 `interrupted` 历史事实，不执行工具或模型请求，迟到写入仍按原 ownership/source 隔离。
- 本轮执行器实际运行：`node --check` 通过本轮修改的 `src/app/generation/50-generation-transport-module.js`、`src/app/tools/50-model-tool-runtime.js`、`src/app/generation/50-generation-integrations.js` 与 `scripts/test-tavern-stage-d1-runtime.mjs`；`node scripts/test-tavern-stage-d1-runtime.mjs` 通过（新增 5 组不完整工具轮反例、真实 `AbortController` + 停滞 `ReadableStream` 的 80 ms 有界总时限样本、工具轮恢复快照保留原生调用与结果断言）；用外部 completion 脚本同一 fixture 内联运行 5/5 通过（不写外部报告文件）；外部 legacy 4 项内联运行 4/4 通过。`scripts/test-tavern-stage-d1-browser.mjs` 保留协调者上轮修正的夹具与断言，本轮未修改；未运行构建、完整检查、实际 Chrome、独立 lifecycle/wire 浏览器脚本、真实供应商或 v1/v2 同步，均留待协调者执行，不能宣称已通过。
- D1 仍未通过最终验收；C3 已验收不回退；15 仍待开发。

**未运行/未验收**：未运行 `npm run build`/`npm run build:sites`、完整 `npm run check`、实际 Chrome/Playwright、真实供应商或 v1/v2 双客户端同步；未推送、未部署。`scripts/test-tavern-stage-d1-browser.mjs` 已提供，但本轮执行器未启动 Chrome。`node scripts/test-source-structure.mjs` 在本环境失败于临时夹具 `spawnSync` 返回 `status=null`（与历史 C3 记录同类的环境错误），未宣称该检查通过；`node scripts/test-local-first-runtime.mjs` 因未运行构建、`index.html` 仍指向旧 release 而失败（提示运行 `npm run build`），这是生成物未更新，不是 D1 运行回归通过。D1 不能等同于 05 最终验收或 15 已完成，真实供应商、iPhone 真机和生产部署单独记录。

**第三轮最小修复（2026-11-08，实际 Chrome 失败：Illegal invocation）**：

- 协调者构建 `87f4612856b5bb397f4ec752` 后报告：completion 正例与 legacy 4 项通过、完整检查（含 66 项 Python）通过；但外部独立 lifecycle 浏览器脚本真实失败，`stage-d1-independent-lifecycle/report.json` 为 `status: failed`、`outcomes: []`。`pageErrors` 记录 `TypeError: Illegal invocation`，调用栈为 `timeout`（`app.js` 28817） → `armTaskDeadline`（29160） → `Object.request`（29332） → `streamChatWithMessages`（30102） → `streamChat`（30202），随后 `waitForFunction` 4000 ms 超时，deadline 例生成卡住且没有任何正常结算。
- 根因：`streamChatWithMessages` 的 `clock` 依赖把原生 `setTimeout`/`clearTimeout` 直接作为普通对象属性注入，传输层 `timeout(callback, delay)` 以 `clock` 为 receiver 调用 `clock.setTimeout(...)`，Chromium 的 WebIDL 计时器拒绝以非 Window 对象调用；该 helper 此前没有实际调用点，本轮新增的总任务计时第一次走到这里。
- 修复（只改 `src/app/generation/50-generation-integrations.js`）：`clock` 改为函数内直接调用原生 `setTimeout`/`clearTimeout` 的薄包装，避免把 Window 方法当任意对象方法；factory 的 `clock.setTimeout/clearTimeout` 方法式依赖契约与合成 clock 的既有 receiver 语义不变，120 秒总任务预算、完成判据、本机恢复逻辑及其他功能/断言均未改动。
- 本轮执行器实际运行：`node --check src/app/generation/50-generation-integrations.js` 通过；`node scripts/test-tavern-stage-d1-runtime.mjs` 通过（含真实总任务截止 `AbortController` 中止与超时结算记录）；`node scripts/test-app-contracts.mjs`、`node scripts/check-app-contracts.mjs` 通过；`git diff --check` 无空白错误；另用一个不入库的临时 Node 冒烟以 strict receiver 模拟 Chromium 计时器：旧形态 `{ setTimeout: setTimeout }` 被以对象方法调用时抛 `TypeError: Illegal invocation`（复现页面错误），新形态 `clock.now/setTimeout/clearTimeout` 正常计时与取消，真实 `50-generation-transport-module.js` 的 `armTaskDeadline` 在 30 ms 截止下以 `{ interrupted: true, completionReason: "timeout" }` 结算一次。
- 未运行/未验收：未运行 `npm run build`（仓库内 `assets/js/app.js`、`index.html` 与 `assets/offline/87f4612856b5bb397f4ec752/` 仍是失败那次的构建，不含本次源码修复）、未运行完整 `npm run check`、未运行实际 Chrome/Playwright；因此不能声称实际浏览器已修复通过，需协调者重建后重跑独立 HTTP、lifecycle、整组与 v1/v2 同步验证。D1 仍未最终验收；C3 已验收不回退；15 仍待开发。

**第四轮返工（2026-11-08，外部无效调用身份复现）**：

- 复现事实：协调者外部脚本 `independent-model-tools-invalid-id.mjs`（实际 `createGenerationTransport`，无假业务）报告两例真实失败。①OpenAI JSON 只有一个调用但缺少 `id`、`finish_reason:"tool_calls"`：实际 0 次执行、1 次请求，但只得到空正文的 interrupted 完成回调，没有明确协议错误；②同一 JSON 轮含一个合法 ID 调用和一个缺 ID 调用：非法项在累积器中被静默丢弃，合法项实际执行 1 次并继续发起第 2 次模型请求，形成部分执行后声称完整。
- 根因：`consumeOpenAiModelToolChunk` 的完整消息分支和 SSE 分支都用 `if (!id) return` 跳过无效身份；Anthropic 收尾也缺少同等身份校验。非法调用因此既不进入执行，也不阻止同轮其余调用。
- 修复（只改 `src/app/tools/50-model-tool-protocol.js`、`src/app/generation/50-generation-transport-module.js`）：保留每个原始调用的存在、index/位置、合法 id 与身份冲突信息，在整轮结束后统一检查。id 缺失、空串、超过 128 字符、或流中同一 index 改 ID 都判定为协议失败；整轮 0 次工具执行、0 次下一模型请求，不为非法调用生成伪造 ID 结果，也不提前执行同轮合法调用。SSE 允许参数片段先到、合法 ID 后到，只在收尾判定，不误杀后到 ID。JSON/SSE 的 OpenAI 与 Anthropic 遵守同一结构边界；合法多调用、增量参数、重复/同 ID 工具错误结果，以及未知工具或 schema 非法但有合法 ID 的结构化错误合同保持不变。尚未执行任何工具时走既有 `onError`/生成错误展示；若先前工具轮已执行，则保留既有执行记录、本轮 `not-run` 与 `unknown` 恢复状态，不丢前面事实。本机 draft checkpoint 和总任务 deadline/cleanup 逻辑未改动。
- 本轮执行器实际运行：`node --check src/app/tools/50-model-tool-protocol.js`、`node --check src/app/generation/50-generation-transport-module.js`、`node --check scripts/test-tavern-stage-d1-runtime.mjs` 通过；`node scripts/test-tavern-stage-d1-runtime.mjs` 通过（新增合法正例、JSON 缺/空/超长 ID、合法+缺 ID 不得部分执行、SSE 缺 ID、SSE 同 index 改 ID、SSE 参数先到而 ID 后到正例、Anthropic JSON/SSE 缺 ID、先前已执行后坏身份保留记录）；`node scripts/test-api-protocol-runtime.mjs`、`node scripts/test-stream-drafts-runtime.mjs`、`node scripts/test-app-contracts.mjs`、`node scripts/check-app-contracts.mjs` 通过；`git diff --check` 无空白错误。
- 未运行/未验收：未运行 `npm run build`/`npm run build:sites`、完整 `npm run check`、实际 Chrome/Playwright、协调者外部 `independent-model-tools-invalid-id.mjs`、legacy 4 外部断言、独立 HTTP/lifecycle/wire 验证、真实供应商或 v1/v2 双客户端同步；因此不能宣称 D1 已通过最终验收。D1 仍未最终验收；C3 已验收不回退；15 仍待开发。

**第五轮最小修复（2026-11-09，协调者实际 Chrome 恢复草稿存储停滞）**：

- 复现事实：协调者外部 `independent-model-tools-draft-storage-browser.mjs`（`stage-d1-independent-draft-storage/report.json`）在隔离合成 context 中只让 `indexedDB.open('opentavern-stream-drafts-v1')` 返回永不触发回调的 request，其余真实 IndexedDB/StorageService 照常；工具总任务预算 80ms、真实 HTTP 工具参数停 1.5 秒。正常对照约 262ms 结算，故障例超过 6000ms 仍未结束。`finalState` 为 `generating=true`、`composerBusy=false`、`commitPending=false`，用户消息和一条 main assistant `traceStatus=interrupted` 已在 live 历史，无 pageError；后台 HTTP abort 是正常取消结果，不是供应商错误。
- 根因：主会话候选已 ACK 后，`finishAssistantMessage` 继续 `await finishStreamDraft`；`finishStreamDraft` 等待没有时限的草稿数据库打开/事务清理，导致“生成中”卡住。工具轮 checkpoint 与最终 ACK 清理共用同一草稿库。
- 修复范围仅 `src/app/generation/50-stream-drafts.js`、`scripts/test-stream-drafts-runtime.mjs`、`docs/spec.md` 与本文件。打开与事务各加固定 5000ms 内部期限（无用户配置，与本地存储既有固定期限一致）；打开超时有限拒绝并清空缓存，下一次操作可重开，迟到连接只关闭、不接入、不写入；事务 complete/error/abort/超时只结算一次，超时/失败尽量 abort 迟到写并摘除监听；`finishStreamDraft` 只在先前写队列成功后才删除对应记录，失败/超时保留可恢复记录，等待本身也有 5s 上限，不叠加第二次打开超时。未清理任何数据，未改 schema、主存储合同、工具协议/身份/本机授权/原生历史/来源或总任务 deadline。
- 本轮执行器实际运行：`node --check src/app/generation/50-stream-drafts.js`、`node --check scripts/test-stream-drafts-runtime.mjs` 通过；`node scripts/test-stream-drafts-runtime.mjs` 通过（永不响应打开有限拒绝、迟到连接关闭且零事务、重开成功、事务超时只结算一次并 abort、事务 abort 单次结算、已落盘记录在 ACK 清理失败后保留、挂起队列下清理 5s 内结算且不重复等待打开、重试 flush 成功；既有队列/失败重试/ACK 删除/恢复去重/迟到 token 断言保留）；`node scripts/test-tavern-stage-d1-runtime.mjs`、`node scripts/test-storage-timeouts-runtime.mjs`、`node scripts/test-app-contracts.mjs`、`node scripts/check-app-contracts.mjs` 通过；`git diff --check` 无空白错误。另用 HEAD 旧源码在系统临时目录配同一新测试做反例，旧实现未通过“ACK 清理不得在写入失败后删除可恢复记录”断言，确认测试能捕获本轮缺陷；临时副本不在仓库内。
- 未运行/未验收：未运行 `npm run build`/`npm run build:sites`、完整 `npm run check`、实际 Chrome/Playwright、协调者外部 draft-storage 脚本的 6 秒结算/0 工具执行/1 请求/canonical trace 断言、真实供应商或 v1/v2 双客户端同步；未提交、未推送、未部署。该复现是 Chrome 故障注入，不等同 iPhone 真机验收。D1 仍未最终验收；C3 已验收不回退；15 仍待开发。

**第六轮最小修复（2026-11-09，协调者外部工具轮 ACK 顺序复现）**：

- 复现事实：协调者外部 `independent-model-tools-draft-ack-browser.mjs` / `stage-d1-independent-draft-ack/report.json` 使用真实 HTTP 模型与真实 `streamDraftStorage` put；在恢复记录实际写入后只挂起应用侧收到的写入确认 promise。实际搜索已执行 1 次，`__draftAckWaiting=true` 时模型 HTTP 请求已达 2 个（期望 ACK 前只有第 1 个、release 后第 2 个），原断言 `2 !== 1` 失败，无 pageError。
- 根因：`src/app/generation/50-generation-integrations.js` 的 `onToolRoundComplete` 调用 `flushStreamDraftWrites().catch(reportStreamDraftError)` 但不返回 promise；`src/app/generation/50-generation-transport-module.js` 的 `persistToolRoundDraft` 调用回调不等待、以空 catch 吞掉，随即 `fetchRound(false)`。此前报告把“下一请求前持久保存”当作已满足，实际只是 fire-and-forget；本轮按真实合同修正，未改测试断言、未只改文档掩盖。
- 修复（只改上述两个源文件、D1 运行测试、本文件与 `docs/spec.md`）：`onToolRoundComplete` 返回实际 flush promise，失败不再吞掉；传输层 checkpoint 返回 promise，并在拼接/发送下一轮前等待；checkpoint 拒绝时保留已发生的工具轮记录与失败信息，本轮按 interrupted（`finishToolInterruption('unknown', ...)`）有限结算，不发起下一轮、不重跑工具。await 期间总任务 deadline 仍独立计时并在到期时中止结算；ACK 迟到后重新核对 `settled`/`isCurrent`/`isTaskExpired`，取消、撤权、切会话、连接或源变化后不恢复旧请求。最终正文仍只可靠保存一次，且仅在其 ACK 后删除对应草稿；失败/超时保留既有记录。未改主存储合同、工具协议/身份/授权/原生历史、5s 有界草稿存储和既有去重。
- 本轮执行器实际运行：`node --check` 通过本轮修改的两个分片与 D1 运行测试；`node scripts/test-tavern-stage-d1-runtime.mjs` 通过——保留 schema/授权、OpenAI 与 Anthropic JSON+SSE、旧修订/off-path、无效身份、停止/撤权/切会话/源变化、80ms 真实总任务超时与工具轮恢复记录，并新增真实集成层 deferred ACK 正例（两协议，挂起时 1 个 HTTP、release 后 2 个）、checkpoint 拒绝反例（搜索 1 次、HTTP 1 个、interrupted 完成、已发生 trace 与失败文本可读、不重跑）以及 cancel/revoke/source 后迟到 ACK 不发起下一请求的三种反例；`node scripts/test-stream-drafts-runtime.mjs`、`node scripts/test-api-protocol-runtime.mjs`、`node scripts/test-app-contracts.mjs`、`node scripts/check-app-contracts.mjs` 通过；`git diff --check` 无空白错误。另在系统临时目录复制同一测试与旧实现做反例，旧 fire-and-forget 形态在“checkpoint ACK 挂起时不得发起下一轮”断言上以 `2 !== 1` 失败，证明新增断言能捕获本轮缺陷；临时副本已删除，不在仓库内。
- 未运行/未验收：未运行 `npm run build`/`npm run build:sites`、完整 `npm run check`、实际 Chrome/Playwright、协调者外部 `independent-model-tools-draft-ack-browser.mjs` 及既有 D1 外部脚本、真实供应商或 v1/v2 双客户端同步；未提交、未推送、未部署。D1 仍未最终验收；C3 已验收不回退；15 仍待开发；不把原 fire-and-forget 视为持久 ACK。

## 阶段 C3 最终本地验收（原编号 14，2026-11-08，通过）

C3 最终构建 release `c80cc7f03d08160a2bc46ff8`（495 项 JS、31 个业务目录），22 组验证全部通过：构建、完整检查（含 66 项 Python）、16 项独立模块断言、20 项既有场景和 21 项自动化断言、实际 Chrome 9 步/1 个合成请求/18 张截图、独立界面 4 流程/9 张截图、发送授权 3 流程/1 个合成请求、真实 Python HTTP/SQLite v1/v2 双客户端同步 39 请求、真实素材量测及刷新校验、既有场景保存 ACK 生命周期与 A/B/C1/C2 整组 Chrome 回归。

- 当前交付：真实内容模块库，作者选择已有世界书/正则/规则/场景和位图素材；安装预览、导入导出、复制、全局/角色/会话绑定、继承停用、只读装配、差异更新、可靠失败重试和旧版回退。本机内容许可与发送许可分别绑定 SHA-256 内容/版本/来源，导入与同步不携带。
- 独立复核修复：分隔符身份碰撞与规则查找、作者世界书 automationId 语义关联、超量原始列表被静默截断、弱摘要/自报素材 hash、候选校验被 WeakSet 跳过造成重复 ID 和副本授权混淆、特殊模块 ID 无法正常授权，以及素材数量占位符。全部有失败证据、合法正例和修复后验证。新副本具有新 ID/无本机授权/空回退状态，原授权与绑定保持，刷新后仍一致。
- 实际故障与恢复：真正 `StorageService.saveAll` 配额拒绝保留旧版定义、素材、版本、绑定与许可；真实管理器重试原候选后成功。更新不继承新内容许可。恢复会话冲突副本重映射绑定/会话停用记录；仅设置恢复不关联现有私人会话。
- 真实素材样本：2 张 512×512 RGB PNG，每张 787,252 字节；当前与旧版各 1,574,504 字节，模块 JSON 4,200,832 字节。真实解码、保存、刷新与独立 Node SHA-256 对照通过。量测仅代表本机合成样本，实际时间见外部媒体报告，不代表 iPhone 性能或最大数量压力测试。
- 证据根目录：`/path/to/local-release-evidence`；总表 `stage-c3-final-verification.json`（22 步/各日志/manifest/5 项资源哈希），`stage-c3-browser-verified`、`stage-c3-independent-ui`、`stage-c3-independent-send`、`stage-c3-independent-sync`、`stage-c3-independent-media`、`stage-c2-lifecycle-with-stage-c3` 及 `stage-{a,b,c1,c2}-with-stage-c3-browser`。实际 390/1280 浅暗/系统与系统深色截图已检查，无页面异常或横向溢出。
- 限制：包读取前 16 MiB 限额，单素材 1 MiB/当前合计 2 MiB/最多 4 项、最多 1 个旧版；本阶段完整图片解码在作者/管理导入入口执行，备份/同步规范化采用有界字节、签名/MIME、总量与 SHA-256，未宣称每条恢复路径均完整解码。真实供应商、iPhone 真机、正式发布未验收。05/15 继续开发，不将本阶段等同全部完成。

以下为历史实施和返工过程，当时未运行的检查不覆盖上述最终验收。

## 阶段 C3 历史实施记录（原编号 14，2026-11-08，待协调者构建与验收）

**范围**：只在协调者确认的 43 个 AllowedFiles 内实施；新增 `src/app/modules/` 四个分片（`21-content-module-media.js`、`32-content-modules.js`、`40-content-module-runtime.js`、`68-content-modules-ui.js`）与两个 C3 测试脚本。未加入 05/15、TTS/WebLLM/ComfyUI，未新增后端、代理、部署或依赖。

**实际实现**：

- `settings.contentModules` 保存稳定模块 ID、包格式版本 1、精确 `x.y.z` 版本、递增 revision、名称/说明/来源、世界书/正则/C1 规则/C2 场景/本地位图素材、精确依赖与宿主快捷回复引用；内部项 ID 在模块内唯一。首轮运行时命名为 `cm:<moduleId>:<kind>:<id>`，第二轮改为逐段 URI 编码并为世界书条目同时编码 book/entry，避免含分隔符的 ID 碰撞。
- 严格导入：只接受 `{type, formatVersion:1, module}` 与已知模块字段；未知字段/格式、非法版本、非法项、悬空 `module-entry:`/素材引用、循环/缺失/版本不符依赖、HTML/SVG/脚本伪装、声明 MIME 不符和超量素材拒绝。导出可经同一入口重新导入为独立副本。
- 本机许可 `settings.contentModuleGrants[moduleId].approved[version]` 绑定实际安装的内容指纹；导入/恢复/云同步不携带；内容或版本变化后旧许可失效，旧版本许可保留以便回退。模块规则只允许全局范围；首轮拒绝 `send-message`，第二轮改为保留规则并要求单独的本机发送许可。
- 只读运行时：世界书激活集合按“宿主 → 模块库顺序 → 内联”追加命名空间条目；模块正则排在宿主组后进入同一隔离 Worker；C1 规则/C2 场景通过现有 `dispatchAutomationEvent`/`runSceneDispatchEvent`、条件、去重、忙碌与可靠保存接口投影执行；模块 InitVar 只在没有已存 `conv.mvu.initial` 时参与，停用不重算历史。
- 会话停用继承只写入 `settings.contentModuleConversationDisabled`，不删除其他绑定或原内容；同一模块在多范围只装配一次。世界书缓存键、正则上下文键、`capturePromptBuildSource.moduleStamp` 和 `rebindSourceAfterSave` 都纳入模块装配签名；已排队自动发送额外保存 moduleStamp，停用/更新/切换会话后拒绝迟到结果。
- 管理界面接入设置“扩展”：从现有内容新建、真实本地 PNG 上传、导入预览、授权、绑定全局/角色/会话、各范围启停、会话停用继承、装配顺序/来源、素材预览/下载、复制、导出、更新差异/失败保留/成功切换/回退。所有文本转义，素材只使用已校验 data URL。
- 备份恢复：模块定义/绑定/会话停用记录随普通设置进入完整/分项备份与 v1/v2 便携快照；本机许可保留在设备。会话范围绑定随 `convMap` 改绑，仅设置恢复/目标未导入时停用为 `disabled:`；会话停用记录只在对应会话同时恢复时保留。C1/C2/A/B 既有保护未回退。

**本轮实际运行**：

- `node scripts/test-tavern-stage-c3-runtime.mjs`：通过。覆盖严格包/未知字段/版本/依赖循环与缺失、许可随内容变化失效、素材 HTML/声明不符/超量、宿主复制不改原数组、多范围去重、会话停用继承、世界书顺序与缓存键、正则顺序、两个模块同内部 ID 不互相触发、模块停用后迟到片段为零、宿主快捷回复引用缺失拒绝装配、C2 场景真实保存与停用不追加、提示词 moduleStamp 与 ACK 重绑定拒绝、MVU InitVar 历史边界和云同步排除。首轮量测样本为旧 68 字节 PNG；第二轮夹具使用协调者提供的真实 128×80 PNG（解码 640 字节）。
- `node scripts/test-backup-restore-runtime.mjs`：通过；新增内容模块定义/绑定恢复、会话范围改绑、会话停用记录映射、settings-only 停用与本地许可保留、非法素材拒绝，原有 64 种选择与 A/B/C1/C2 恢复断言保持通过。
- `node scripts/test-settings-runtime.mjs`、`node scripts/test-private-settings-runtime.mjs`：通过；新增默认字段、便携定义/绑定/停用记录与 `contentModuleGrants` 本机排除。
- `node scripts/test-prompt-controls-runtime.mjs`、`node scripts/test-tavern-stage-c1-runtime.mjs`、`node scripts/test-tavern-stage-c2-runtime.mjs`、`node scripts/test-convenience-runtime.mjs`、`node scripts/test-conversation-transfer-runtime.mjs`、`node scripts/test-sync-v2.mjs`、`node scripts/test-mvu-integration.mjs`：通过，未发现既有回归。
- `node scripts/test-app-contracts.mjs` 与 `node scripts/check-app-contracts.mjs`：通过；新增分片无顶层重复符号，manifest 装配顺序可解析。
- `node --check` 覆盖新增四文件与所有修改 JS/测试脚本：通过。
- `node scripts/test-source-structure.mjs`：本轮环境失败于 `spawnSync` EPERM（`C:\soft\node.js\node.exe`），与源码无关；未以该结果宣称结构检查通过。manifest 495 项与文件覆盖已用脚本单独核对。

**未运行/未验收**：

- 未运行 `npm run build`、未重建 `assets/js/app.js`、`index.html`、`assets/css/app.css` 或离线缓存；未运行完整 `npm run check`。
- 未启动 Chrome；`scripts/test-tavern-stage-c3-browser.mjs` 仅准备并由 `node --check` 校验。实际界面、390/1280 浅暗/系统截图、pageerror/溢出/外部点击收起、刷新与备份恢复 UI 待协调者运行。
- 未运行真实 v1/v2 双客户端同步、真实供应商、iPhone 真机或生产部署；本轮只验证便携策略与本机运行。
- 内容模块单素材 1 MiB、每模块合计 2 MiB、最多 4 个、模块最多 12 个是按普通设置/备份体量保守取值；未用真实大图量测跨设备同步体量。素材完整解码依赖浏览器能力，运行测试只验证签名/MIME/上限与 HTML 拒绝。

### C3 第二轮返工（2026-11-08，协调者实际复现后）

协调者复现并指定修复的 4 项问题及本轮实际落地：

1. **身份碰撞**：运行时命名空间改为逐段 URI 编码；`book a:b / entry c` 与 `book a / entry b:c` 得到不同 uid，`module id package:2026` 的规则可由 `getContentModuleAutomationRuleById` 解析；入口、场景事件与取消前缀使用同一编码。接受后再损坏的路径已消除。
2. **作者引用重映射**：真实 `contentModuleFromHost` 选中的世界书条目及其同模块 `automationId` 条件在安装规范化时改写为 `module-entry:<entryId>`；投影后 `worldbook-activated` 实际 matched=1。另一模块使用相同 `automationId` 的条目只触发自身规则（反例断言为 `OTHER_EFFECT`）。
3. **超量与错误数据**：移除 `slice + Math.min` 的静默前缀安装；`worldBooks`（含总条目）、`regexScripts`、`automationRules`、`scenePackages`、`assets`、`dependencies`、`hostQuickReplyRefs`、`previousVersions` 的超量、错误类型、重复 ID 与损坏/超量旧版素材均使整个模块 `invalid`，导入/更新/备份恢复/同步拒绝；合法旧版快照仍通过。包大小上限 16 MiB 在 `file.text()` 前检查，读取后再按实际 UTF-8 字节复核；本轮实测当前最大合法包 3,998,866 字节、含一份旧版快照 7,997,544 字节。
4. **本机许可**：`contentModuleFingerprint` 与素材 hash 改用现有 vendor SHA-256，覆盖模块 ID、版本、来源、执行顺序、可执行项、素材实际 data URL 字节、依赖与宿主引用；包声明的 `asset.hash` 不参与且被重新计算。`__contentModuleReady` 改为非序列化 WeakSet 身份标记，云端/JSON 注入同名字段不能跳过校验。

**发送权限边界**：模块规则中的 `send-message` 不再在导入时静默丢弃；默认本机内容许可不授予发送。模块 UI 对含发送动作的模块显示“发送需单独许可”并提供独立“授权发送”按钮，发送许可存放在 `contentModuleGrants[moduleId].send[version]`，与内容指纹绑定且不进入便携快照。未授权时 C1 发送动作以缺少许可失败，不另建发送器；停用/更新/撤销后 C1 队列在真实执行前重新查询安装、绑定、内容与发送许可。运行回归断言：撤销发送许可后，原本有效的待发送候选由 `automationPendingStillValid` 返回 false。

**本轮实际运行**：

- `node scripts/test-tavern-stage-c3-runtime.mjs`：通过。新增逐段身份/规则查找、作者 API 正例+另一模块反例、全部列表与旧版快照超量/错误类型/重复 ID、包大小先于 `file.text()`、SHA-256 许可与外来 hash 伪造、字节/来源/顺序变更失效、伪造 ready 标记、真实 `persistState` + `StorageService.saveAll` 拒绝保持当前版/素材/绑定/许可、管理界面失败候选可重试且过期候选拒绝覆盖较新成功、回退重新规范化后仍匹配原批准指纹，以及既有 C1/C2/MVU/提示词来源/同步排除断言。
- `independent-content-modules-core.mjs`：协调者外部原件在本机写入报告时触发 EPERM；复制到系统临时目录并保持原断言运行，结果 7/7 通过（原 3 PASS / 4 FAIL）。
- `node scripts/test-backup-restore-runtime.mjs`：通过；保留 64 种选择、会话改绑/停用、旧版素材拒绝和本地许可保留，恢复夹具改用 SHA-256 许可值。
- `node scripts/test-settings-runtime.mjs`、`node scripts/test-private-settings-runtime.mjs`、`node scripts/test-prompt-controls-runtime.mjs`：通过，未发现既有回归。
- `node scripts/test-tavern-stage-c1-runtime.mjs`、`node scripts/test-tavern-stage-c2-runtime.mjs`：通过；C1/C2 既有发送授权、场景、版本和可靠保存保护未回退。
- `node scripts/check-app-contracts.mjs`、`node scripts/test-app-contracts.mjs`：通过；新增顶层函数无重名，装配顺序与临时构建夹具通过。
- `node --check` 覆盖本轮修改的 4 个模块分片、3 份 i18n 与 6 个测试脚本：13/13 通过。另以 vendor `js-sha256-1.0.0.min.js` 在 VM 中冒烟，确认字符串/Uint8Array 均得到标准 SHA-256，`contentModuleFingerprint` 返回 `sha256:` 前缀。
- 协调者提供的 `stage-c3-browser-review-6`：真实 Chrome 通过 8 步、1 次合成模型请求、18 张截图、无 pageerror，覆盖实际创建/素材预览/多范围绑定/世界书正则规则场景/更新回退/导入导出/刷新备份；该结果由协调者记录，不替代故障注入或双端同步。

**本轮未运行/未验收**：未运行 `npm run build`、完整 `npm run check`、本执行器的 Chrome/Playwright、v1/v2 双客户端同步或部署；实际浏览器 StorageService、发送授权 UI 和真实大图/跨设备体量仍需协调者验收。C3 仍不能宣称最终通过，05/15 仍待开发。

素材完整解码的入口边界：管理新建与导入预览调用 `verifyPrivateMediaImageDecodes`；备份恢复/云同步的同步规范化只做有界字节、签名/MIME、总量与 SHA-256 复核，本轮没有宣称这些入口完成位图完整解码。

### C3 真实界面缺陷修复（2026-11-08，详情素材标题占位符）

- 协调者已通过的基线（不得回退）：release `7f81f5c87d07026e14c454bc` 的完整 `npm run check`（含 66 项 Python）、独立 core 7 项/边界 5 项/恢复 4 项断言、真实 Python HTTP/SQLite v1/v2 双端 39 次请求、实际发送授权 UI 3 流程，以及真实 2 张 512×512 PNG（各 787252 字节）、当前与旧版 JSON 4200832 字节的解码/保存/刷新/Node SHA-256 交叉验证；`stage-c3-browser-review-6` 的真实 Chrome 主流程通过。
- 真实失败（协调者只读外部 `independent-content-modules-ui-browser.mjs` review2，证据 `stage-c3-independent-ui-review2.log`、`report.json`）：该流程在真实 `StorageService.saveAll` 配额故障时保持完整旧版、关闭并重开管理界面后点击真实“重试”可靠保存候选（重试本身已通过），随后断言详情失败——`openContentModuleDetail` 的素材区标题直接使用 `t('content_module_assets')`，未替换 `{count}`，真实界面显示“{count} 个素材”。
- 本轮修复（仅 `src/app/modules/68-content-modules-ui.js`）：该标题改为 `t('content_module_assets').replace('{count}', String((module.assets || []).length))`，与状态摘要、导入预览等既有用法一致；简繁中文与英文均渲染实际数量，不新增管理功能或文案键。
- 新增回归断言（`scripts/test-tavern-stage-c3-browser.mjs`）：在真实详情对话框上依次切换 zh-CN/zh-TW/en，断言素材区标题为“1 个素材”“1 個素材”“1 assets”，且详情全文不出现形如 `{placeholder}` 的未替换占位；随后恢复原语言再进入既有 390/1280 浅暗/系统主题截图。原 PNG 夹具、创建/授权/绑定/世界书正则规则场景/更新回退/导入导出/刷新备份断言保持不变；未扩展配额重试流程。
- 本轮执行器实际运行：`node --check src/app/modules/68-content-modules-ui.js`、`node --check scripts/test-tavern-stage-c3-browser.mjs` 均通过；`git diff --check` 通过（仅提示工作树 CRLF 将在提交时转 LF）。未运行 `npm run build`、完整 `npm run check` 或 Chrome/Playwright。
- 本轮未验收：重新构建后的整组实际 Chrome（含外部独立 UI review 中该标题断言与全部真实行为断言）、完整检查与 v1/v2 双端同步由协调者执行。C3 仍不宣称最终通过，05/15 仍待开发，D 尚未实施。
- 实际修改文件（本轮）：`src/app/modules/68-content-modules-ui.js`、`scripts/test-tavern-stage-c3-browser.mjs`、`docs/spec.md`、本记录。未修改生成物、其他源码或外部独立断言。

### C3 最终回归返工（2026-11-08，导入副本重复身份）

- **协调者基线（不得回退）**：构建 `a240414f461717bb192303b1` 的完整检查通过（含 66 项 Python）；独立 core 7 项、bounds 5 项、restore 4 项和既有场景 20 项、自动化 21 项断言通过。
- **真实失败**：整组实际 Chrome 跑到导出后再导入为副本时失败；`state.modules.length=2`，但两个模块 ID 均为 `content-module-mw7qe6f5-uc4798`，`assert.notEqual` 在浏览器脚本第 315 行失败。来源为 `stage-c3-browser-verified/report.json` 及日志，没有 pageerror；此前 release `9f59` 的同一流程通过，新 WeakSet 就绪优化引入回归。
- **根因**：`ensureContentModuleSettings` 只要 `WeakSet.has(settings)` 就返回，不区分无参 live 读取与显式外来 apply；`saveContentModulesChange` 第一次 `ensure(candidate)` 已把候选标为就绪，mutator 改坏候选后第二次调用被跳过，重复模块 ID 也没有检查；非更新导入还依赖某次读取静默改 ID。
- **修复**：只有无参 live 读取命中就绪缓存，显式传入对象（候选、恢复、外来 apply）总是重新规范化；候选在 mutator 后检查重复模块 ID，并拒绝本次新产生的无效模块（既有无效模块可在无关事务中保留，避免卡死其他保存）；非更新导入遇到已有 ID 时在真实 UI 内按现有复制合同调用 `cloneContentModuleForCopy` 生成新 ID、清空旧版快照且不继承本机许可，原模块授权与绑定不变。SHA-256 内容指纹和真实 WeakSet 反伪造措施保持不变。
- **新增回归**：`scripts/test-tavern-stage-c3-runtime.mjs` 覆盖候选首次规范化后被 mutator 改为非法素材/重复模块 ID、显式 apply 到同一 live settings、正常新建和合法更新，以及复制合同的新 ID/空旧版状态/不继承许可与绑定；`scripts/test-tavern-stage-c3-browser.mjs` 在原有不同 ID 断言后新增副本未授权、原模块授权/绑定不变、刷新后仍保持，并保留真实 PNG 与三语言占位修复断言。
- **本轮执行器实际运行**：`node --check` 覆盖 4 个修改的 JS/测试文件通过；`node scripts/test-tavern-stage-c3-runtime.mjs` 通过；`node scripts/test-backup-restore-runtime.mjs`、`node scripts/test-settings-runtime.mjs`、`node scripts/test-private-settings-runtime.mjs`、`node scripts/check-app-contracts.mjs`、`node scripts/test-app-contracts.mjs`、`node scripts/test-prompt-controls-runtime.mjs`、`node scripts/test-tavern-stage-c1-runtime.mjs`、`node scripts/test-tavern-stage-c2-runtime.mjs` 均通过。
- **未运行/未验收**：未运行 `npm run build`、完整 `npm run check`、本执行器 Chrome/Playwright 或 v1/v2 双客户端同步；重新构建后的整组实际 Chrome、故障注入与双端同步仍由协调者验收。C3 仍不能宣称最终通过，05/15 仍待开发，D 尚未实施。
- **实际修改文件（本轮）**：`src/app/modules/32-content-modules.js`、`src/app/modules/68-content-modules-ui.js`、`scripts/test-tavern-stage-c3-runtime.mjs`、`scripts/test-tavern-stage-c3-browser.mjs`、`docs/spec.md`、本记录。未修改生成物、其他源码、外部独立断言或历史数据。

## 主协调者最终验收：阶段 C2（2026-11-08）

- 最终构建 release `601662b5c404f9dbfd90ae50`：491 个 JS 分片、30 个业务目录、22 个 HTML 分片、11 个 CSS 分片，17 项核心和 296 项公共离线资源。`npm run build`、完整 `npm run check` 通过，含 66 项 Python；`stage-c2-final-verification.json` 记录全部 16 组检查与构建前后运行资源哈希一致。
- 20 项独立场景断言全部通过：records 9、restore 4、version-materialization 4、retry 3，覆盖合法长正文、前缀与真实版本身份、多开场分支、便携历史 ID 冲突、同一确认手动 MVU 物化、原失败定义/来源基线及有效恢复。另复跑 C1 独立 core/restore/dispatch 共 21 项均通过。
- 整组实际 Chrome 通过 12 步、7 次合成模型请求、18 张截图，`pageErrors=[]`：真实包/事件/条件/MVU 编辑、会话绑定、预演、开场、多事件顺序、保存失败与实际重试、源编辑、选回历史版本、分支、删除、刷新及实际导出再导入。证据 `stage-c2-browser-verified/report.json`。
- 独立 UI 通过 5 组、11 张截图：真实复制/排序/绑定/本机授权与任意角色编辑；预演内容可读且实际 `StorageService.saveAll` 0 次、模型请求 0；空会话明确开场、重复开始不重复；启停/删除保留历史事实；真实配额失败后放弃及刷新不改原角色。证据 `stage-c2-independent-ui/report.json`，包含系统深色切换截图。
- 独立保存 ACK 生命周期通过 3 组、3 次合成模型请求：用户场景保存确认前正文/变量/进度均不可见且原模型零请求，确认后才进入原请求；助手场景确认前二阶段不开始，确认后合法二阶段保留；取消真实待保存开场后刷新无未确认剧情或变量。证据 `stage-c2-independent-lifecycle/report.json`。
- 实际隔离 Python HTTP/SQLite 的 v1/v2 各两客户端同步通过，共 35 次请求：定义、会话绑定、历史剧情和变量往返；本机许可不外传、刷新后正确保留；同 ID/revision 换内容使旧许可失效但不擦掉历史事实；启动恢复不重放、不调用模型。证据 `stage-c2-independent-sync/report.json`。
- 同一最终资源上的 A 整组 Chrome（9 次合成请求、24 截图）、B 整组（18 步、50 次合成 Embedding、4 次合成聊天、24 截图）、C1 整组（12 步、11 次合成请求、19 截图）通过，pageerror 均为空。证据分别为 `stage-a-with-stage-c2-browser/`、`stage-b-with-stage-c2-browser/`、`stage-c1-with-stage-c2-browser/`。
- 已目视检查最终 390px 系统深色事件编辑/深色预演及 1280px 浅色剧情进度；完整脚本检查浅/暗/系统主题和横向溢出。真实 iPhone、模型/Embedding 供应商、生产双设备/CORS 和新部署未验收；未推送或发布。下一阶段为 14 内容模块，再进入 05 工具与 15 插件。

## 阶段 C2 实施与返工历史（原编号 12，最终验收见上）

- 范围：新增 `scenarios/` 业务模块（包定义、运行时、管理界面），复用 11 的声明式条件、`dispatchAutomationEvent`、因果链与取消 epoch；接入真实用户/助手保存生命周期、会话消息回放、分支/版本失效、设置初始化、本机授权过滤、备份恢复绑定映射、导入导出、i18n、设置入口与响应式样式。未修改后端、检索、工具、私有图片或部署。
- 数据：`settings.scenePackages` 保存包/事件定义；`settings.scenePackageGrants` 与 `settings.sceneRecentRuns` 为本机字段，不进入便携快照。一次事件把剧情正文、完整 MVU 手动快照和 `sceneEvent` 来源/一次性记录写入同一条旁白消息的同一可靠候选；失败不推进任何一项。进度从消息记录纯回放，来源消息、事件时的消息前缀、选中用户/助手版本、正文校验和与变量快照任一失效即不计入；`replayMvuMessage` 同步忽略失效场景变量，并在前序状态链变化时只重放本事件声明的变量变化。场景记录版本为 2；首轮未发布的 v1 记录按无效历史处理，不冒充新事实。
- 首轮独立审查（2026-11-08）从真实 C1 harness 加载实际场景模型/运行时，最初 7 项、扩为 9 项外部 records 时除“首 ACK 取消后不再执行”外全部复现失败；失败证据 `stage-c2-initial-independent-records.log`、`stage-c2-inflight-independent-records.log`、`stage-c2-initial-final-independent-records.log` 与 `independent-scene-records-report.json` 保留。返工修复：合法 4,000 字正文的指纹上限与最大合法内容一致；历史记录保存有界消息前缀摘要/条数、选中版本和影响 MVU 的原始手动状态，追加历史不失效、编辑前缀/版本切换/删除源失效；稳定事件 ID 纳入本机授权；空新会话可通过可校验会话初始来源显式开场；显式开场与自动入口共用步数上限、忙碌/队列和批次取消 epoch；离开时长在发送覆盖 `conv.updated` 前捕获真实活动基线；共享“任意”角色条件同时匹配 user/assistant；生成来源只按已 ACK 场景增量重绑定；两事件 MVU 状态链不复引入已失效前序快照。
- 本轮执行器实际运行的 Node 检查：返工后当前外部 `independent-scene-records.mjs` 9/9 通过（在系统临时目录复制运行，未改外部原件与断言）；`node scripts/test-tavern-stage-c2-runtime.mjs` 通过（在原有覆盖上新增上限长正文、前缀/选中版本归属、追加历史不失效、事件 ID 重新授权、空会话显式开场、显式 cap/取消/双击、真实发送活动基线、Any 角色、生成来源按 ACK 重绑定、真实 MVU 失效状态链）；`node scripts/test-tavern-stage-c1-runtime.mjs`、`node scripts/test-mvu-parser.mjs`、`node scripts/test-mvu-runtime.mjs`、`node scripts/test-mvu-integration.mjs`、`node scripts/test-message-reliability-runtime.mjs`、`node scripts/test-storage-timeouts-runtime.mjs`、`node scripts/test-backup-restore-runtime.mjs`（含场景包恢复断言）、`node scripts/test-settings-runtime.mjs`、`node scripts/test-chat-operations-runtime.mjs`、`node scripts/test-prompt-controls-runtime.mjs` 均通过；`node scripts/test-app-contracts.mjs`、`node scripts/check-app-contracts.mjs` 通过。
- 环境限制：当前沙箱禁止 `spawnSync` 启动子 Node 进程（复现为 `EPERM`），因此 `node scripts/test-source-structure.mjs` 未通过；失败发生在测试夹具 `spawnSync(build-app.js)`，早于读取本次源码。`node scripts/test-local-first-runtime.mjs` 因仓库内 `index.html` 仍是 C1 构建的旧 release，未包含本轮 491 分片 pin，不能代表源码失败。两项均需协调者先执行构建、在可启动子进程的环境重跑，不能记为通过。
- 未运行/未验收：`npm run build` 与 `npm run check`（会重写生成物，按本轮范围由协调者执行）、实际 Chrome（`test-tavern-stage-c2-browser.mjs` 已准备，含助手保存后场景不丢合法二阶段）、真实供应商、iPhone 真机、Sites/ECS 部署、真实双设备云同步。浏览器脚本使用合成模型并在 390/1280px 浅暗/系统主题截取管理、编辑和进度界面；实际结果由协调者独立记录。

### C2 第三轮返工（2026-11-08，协调者实际浏览器与历史链仍未通过）

- 协调者已通过的基线（不得回退）：实际构建 release `02a5e69dc08b58a5906dd0c4` 与完整检查通过；外部 `independent-scene-records.mjs` 9/9；独立真实界面 5 流程、9 张截图、预演实际 `saveAll` 0 次；实际 Python HTTP/SQLite v1/v2 双客户端 35 次请求通过。
- 真实失败 1（历史链）：协调者新增只读外部 `independent-scene-restore.mjs`（实际源 `52-scene-runtime.js` + 真实 backup restore fixture）四项中三项通过；失败项为“分支重新锚定保留多个开场与后续历史”：原会话有两条合法空会话开场、再一条用户消息和一条已保存场景，进度 3；分支 ID 与 `created` 变化后调用真实 `reanchorSceneOpeningRecords`，进度变为 1。首条开场记录的完整性被更新，第二开场及后续记录保留旧前缀摘要因此失效。原链 3 条有效的正对照已明确。
- 真实失败 2（实际浏览器）：`scripts/test-tavern-stage-c2-browser.mjs` 证据 `stage-c2-browser-review-3/report.json`、`failed-state.png`；7 步、6 次合成模型请求，前面的真实管理 CRUD/开场/两事件顺序/助手保存后场景与合法二阶段/实际配额失败与管理器重试均通过；在“选旧剧情版本恢复进度”等待（脚本第 339 行）超时，原 8 条进度只剩 6 条。原因：原正常用户消息没有 `selectedUserVersionId`，场景记录按空字段计算来源；实际剧情编辑保存旧版本后，历史界面选回原版本经 `commitResponseVersion`→`restoreResponseUserVersion` 把同一原正文补为确定性 `user-...` 版本 ID，既有来源与依赖该前缀的场景摘要随之误判失效。正文、`sceneEvent`、旧版本 MVU 快照与版本 ID 均已恢复，缺少的是来源身份等价。
- 本轮修复：`getSceneSourceStamp` 与历史前缀摘要改用有效版本身份——用户消息取 `getUserMessageVersionState(...).current.id`（未物化时已是确定性 ID），助手取 `selectedResponseVersionId` 或 `base:<消息ID>`；选中回复摘要只在正文/手动状态与当前消息不同时计入，使未物化的原始版本与之后补齐的同一版本等价，真正换版本仍按版本 ID 与手动 MVU 状态失效。`captureResponseVersion` 支持首选 ID，`prepareResponseVersions` 捕获未物化原始回复时使用 `base:<消息ID>`，其他新版本仍用新 ID。`reanchorSceneOpeningRecords` 先按“允许改写开场来源”的校验确定原本有效记录，再按消息顺序重写这些记录的前缀摘要与校验和；已因正文、版本、删除或前缀编辑失效的记录保持失效，不会被重新签名。普通恢复改 ID、保留 `created`，新分支仍使用实际创建时间。文案把触发选择改为“开场/Opening/開場”（自动与显式开始由既有说明解释），事件消息角色的“任意”在条件摘要与预演中显示“任意”而非空白。
- 本轮执行器实际运行：外部 `independent-scene-records.mjs` 9/9 通过、`independent-scene-restore.mjs` 4/4 通过（均复制到系统临时目录运行，未改外部原件与断言）；`node scripts/test-tavern-stage-c2-runtime.mjs` 通过，新增真实版本接口回归（剧情编辑→选回原版本恢复进度与 MVU、补齐同一用户/助手版本等价、换成其他用户/回复版本失效、重新锚定不复活失效记录、双开场合法链保持）；`node scripts/test-tavern-stage-c1-runtime.mjs`、`test-tavern-stage-a-runtime.mjs`、`test-tavern-stage-b-runtime.mjs`、`test-mvu-parser.mjs`、`test-mvu-runtime.mjs`、`test-mvu-integration.mjs`、`test-message-reliability-runtime.mjs`、`test-backup-restore-runtime.mjs`、`test-user-images-versions-runtime.mjs`、`test-chat-operations-runtime.mjs`、`test-stream-drafts-runtime.mjs`、`test-streaming-transfer-runtime.mjs`、`test-app-contracts.mjs`、`check-app-contracts.mjs` 均通过。`test-app-contracts.mjs` 只在系统临时目录构建合成夹具，未改写仓库 `assets/js/app.js`；本轮未执行构建。
- 未运行/未验收：未运行 `npm run build`、完整 `npm run check`、`check:release`，未启动 Chrome/Playwright，也未新增实际截图；协调者需重新构建后复跑整个 `test-tavern-stage-c2-browser.mjs`、保存 ACK/版本分支/真实 v1/v2 双端与 390/1280 浅暗/系统主题视觉验收。真实供应商、iPhone 真机、生产部署未验收；状态待协调者，本记录不标记通过或已发布。
- 实际修改文件：`src/app/scenarios/52-scene-runtime.js`、`src/app/scenarios/68-scene-ui.js`、`src/app/conversation/32-response-versions.js`、`src/app/core/12-i18n-en.js`、`src/app/core/12-i18n-zh-cn.js`、`src/app/core/12-i18n-zh-tw.js`、`scripts/test-tavern-stage-c2-runtime.mjs`、`docs/spec.md`、`docs/tavern-feature-plan-20261107.md`、本记录与 `AGENTS.md`。未修改其他路径，未覆盖协调者对浏览器夹具的两处修正与失败快照。

### C2 第四轮定向返工（2026-11-08，协调者 review4 通过后新增便携版本簿兼容性失败）

- 协调者已通过的基线（不得回退）：实际构建 release `79fbac6ba2098b0abda8fcf0`；外部 `independent-scene-records.mjs` 9/9、`independent-scene-restore.mjs` 4/4；整组实际 C2 Chrome 12 步、7 次合成模型请求、18 张截图、`pageErrors=[]`，证据 `stage-c2-browser-review-4/report.json`。第三轮的版本恢复、多开场分支、保存故障重试与二阶段保护保持。
- 真实失败（协调者新增外部 `independent-scene-version-materialization.mjs`，3 项中前 2 项通过）：第 3 项使用合法可移植历史 `reply.id='reply-source'`、正文 `Original response`、`responseVersions=[{id:'base:reply-source', message:{content:'Older saved response'}}]` 且没有 `selectedResponseVersionId`。旧实现按“未物化原始回复沿用 `base:<消息ID>`”又插入当前回复，`prepared.versions` 出现两个不同正文同一 ID（长度 2、唯一 ID 数 1）。这是真实备份格式允许的缺省选中状态，不是非法输入绕过。
- 本轮修复：`prepareResponseVersions` 在当前选中版本缺失时，先复用历史中正文、二阶段消息与手动状态都一致的有效原版本，不再插入同 ID 副本；`base:<消息ID>` 已被其他正文或手动状态占用时，旧版本完整保留且不改名，当前回复改用循环确认未占用的新 ID，并在版本上标记它物化的是未物化来源。`sceneResponseVersionIdentity` 只把这种物化原版本映射回 `base:<消息ID>` 身份，其他同正文或不同正文版本仍按版本 ID/手动 MVU 状态失效；准备读取仍是纯函数，已失效记录不会因此重新签名复活。测试夹具补上真实 bundle 已提供的 `mvuOwn` 依赖。
- 本轮执行器实际运行：`node scripts/test-tavern-stage-c2-runtime.mjs` 通过，新增无 selected ID 版本簿回归（同正文复用且来源身份不变、不同正文改用唯一新 ID 且旧版本保留、物化原版本身份等价、手动状态不满足时不复用、另一同正文版本仍使来源变化）；外部新 `independent-scene-version-materialization.mjs` 3/3 通过（复制到系统临时目录运行，未改外部原件与断言）；外部 `independent-scene-records.mjs` 9/9、`independent-scene-restore.mjs` 4/4 通过；`node scripts/test-user-images-versions-runtime.mjs`、`test-message-reliability-runtime.mjs`、`test-backup-restore-runtime.mjs`、`test-streaming-transfer-runtime.mjs`、`test-app-contracts.mjs`、`check-app-contracts.mjs` 与 `node --check`（两个源码分片与 C2 运行脚本）通过。
- 未运行/未验收：未运行 `npm run build`、完整 `npm run check`、`check:release` 或 Chrome/Playwright，未修改生成物；最终构建、完整检查、实际浏览器复跑与发布判断由协调者完成。真实供应商、iPhone 真机、生产部署未验收，本批仍未发布（线上第 19 版）。
- 实际修改文件（本轮）：`src/app/conversation/32-response-versions.js`、`src/app/scenarios/52-scene-runtime.js`、`scripts/test-tavern-stage-c2-runtime.mjs`、`docs/spec.md`、本记录。未修改外部独立断言或其他路径。

### C2 第五轮定向返工（2026-11-08，失败重试必须保留原内容与来源前缀）

- 协调者已通过的基线（不得回退）：实际构建 release `79fbac6ba2098b0abda8fcf0`；外部 `independent-scene-records.mjs` 9/9、`independent-scene-restore.mjs` 4/4；整组实际 C2 Chrome 12 步、7 次合成模型请求、18 张截图、`pageErrors=[]`；独立 UI 5 流程、真实保存 ACK 生命周期 3 项与真实 v1/v2 双客户端 35 次请求。第三/四轮的版本恢复、多开场分支、保存故障、二阶段保护与便携版本簿修复保持。
- 真实失败（协调者只读外部 `independent-scene-retry.mjs`，真实 C2 runtime harness + 实际候选保存失败正对照）：`stage-c2-independent-retry-initial.log` 中 1 项通过、2 项失败。通过项为“原定义/来源不变时显式重试一次成功，随后失败清除、不能重复”。失败 1：原事件保存失败后，同包/事件 ID 换正文并递增 revision 且用户已为新内容显式授权，旧失败的“重试”仍直接执行新正文（未按原失败内容基线拒绝）。失败 2：原事件保存失败后编辑其早先历史，直连来源消息与文本不变，旧实现只比较直连来源修订，执行时按新的前缀重新生成记录，旧失败被重新解释。
- 本轮修复（仅 `src/app/scenarios/52-scene-runtime.js`）：`sceneFailureRecord` 现在保存当次有界的包/事件修订、`sceneEventFingerprint` 可执行内容指纹、来源类型/消息/修订、执行时的来源前缀条数与摘要（含开场来源）及原活动基线。`retrySceneFailure` 在入队前与排队任务真正执行前都调用同一核对：包/事件存在且启用、包与事件 revision 相等、事件内容指纹相等（不能只信 revision）、包仍绑定当前会话、本机授权仍覆盖该内容、直连来源仍存在且来源修订相等、当前来源前缀条数与摘要等于失败基线。核对通过后把定义深拷贝为冻结快照再执行，排队期间的原地修改不会被当成原候选；`persistSceneMessage` 的提交校验再按失败前缀基线与定义/来源复核一次，失败时候选不落盘。来源之后的普通消息追加不改变来源前缀，重试仍允许；定义换正文、前缀编辑、来源版本切换、解绑/撤权、停止与目标变化拒绝。重试仍走同一条 `persistConversationMessageMutation` 候选提交正文、完整 MVU 快照与进度，不复活已超时/取消的候选；失败信息仍是仅本机的瞬时数据，不进入便携授权、同步或持久队列。
- 本轮执行器实际运行：`node scripts/test-tavern-stage-c2-runtime.mjs` 通过，新增 8 项重试基线回归（同内容/同历史重试成功且失败清除、换正文并递增 revision 拒绝、同 revision 换正文拒绝、早先前缀编辑拒绝、来源后追加不误判、真实用户版本切换拒绝、入队后前缀变化拒绝、候选保存窗口内前缀变化按 `stale-scene-source` 拒绝且零落盘）；外部 `independent-scene-retry.mjs` 3/3 通过（复制到系统临时目录运行，未改外部原件与断言）；外部 `independent-scene-records.mjs` 9/9、`independent-scene-restore.mjs` 4/4 通过；外部 `independent-scene-version-materialization.mjs` 前 3 项通过，协调者于本轮基线后新增的第 4 项“物化同一便携当前回复并确认手动 MVU 不使依赖剧情失效”仍失败（0 !== 1）。诊断显示：物化前后 `sceneResponseVersionIdentity` 与 `sceneSelectedResponseDigest` 已等价，差异仅为原始 `mvuManualVersionId`（`base:<消息ID>` → 新版本 ID）；本轮未改该来源身份语义，故不记通过，待协调者决定是否单独处理。
- 未运行/未验收：未运行 `npm run build`、完整 `npm run check`、`check:release` 或 Chrome/Playwright，未修改生成物；最终构建、完整检查、实际浏览器复跑与发布判断由协调者完成。真实供应商、iPhone 真机、生产部署未验收，本批仍未发布（线上第 19 版）。
- 实际修改文件（本轮）：`src/app/scenarios/52-scene-runtime.js`、`scripts/test-tavern-stage-c2-runtime.mjs`、`docs/spec.md`、本记录。未修改外部独立断言、生成物或其他路径。

### C2 第六轮定向返工（2026-11-08，同一确认手动 MVU 版本物化不得使来源失效）

- 协调者已通过的基线（不得回退）：实际构建 release `79fbac6ba2098b0abda8fcf0`；外部 `independent-scene-records.mjs` 9/9、`independent-scene-restore.mjs` 4/4；整组实际 C2 Chrome 12 步、7 次合成模型请求、18 张截图、`pageErrors=[]`；独立 UI 5 流程、真实保存 ACK 生命周期 3 项与真实 v1/v2 双客户端 35 次请求。第三至五轮的版本恢复、多开场分支、保存故障重试与二阶段保护保持。
- 真实失败（协调者外部 `independent-scene-version-materialization.mjs` 第 4 项，证据 `stage-c2-independent-versions-review5.log`、`stage-c2-independent-versions-manual-initial.log`）：回复 `id='manual-source'`、正文 `Current reply` 带已确认 `mvuManualData.stat_data.hp=9` 与 `mvuManualVersionId='base:manual-source'`，没有选中 ID，历史已有同 ID 但正文 `Older reply` 的旧版本。合法场景记录 progress=1；`prepareResponseVersions` 为当前回复生成新唯一 ID 并标记 `baseIdentity=true`，真实 `commitResponseVersion` 物化同一正文与手动数据后 hp9 仍在，但 progress 变为 0。诊断：`sceneResponseVersionIdentity` 与 `sceneSelectedResponseDigest` 已等价，差异仅在来源标记与历史前缀摘要里的原始 `mvuManualVersionId` 从 `base:<消息ID>` 变成新版本 ID。
- 本轮修复（仅 `src/app/scenarios/52-scene-runtime.js`）：`getSceneSourceStamp` 与 `sceneMessageDigestFields` 共用 `sceneEffectiveManualVersionId`，只在真实 `getMvuMessageVersionId` 相等、选中版本存在且修订一致、`mvuResponseVersionMatches` 通过且手动数据校验有效时，把该绑定规范化为 `sceneResponseVersionIdentity`（未物化 base 与物化后的 `baseIdentity` 版本因此等价）；其余情况保留原始 `mvuManualVersionId`。真正换版本、手动变量内容变化、未确认或错误的 manual 绑定、仅带 `baseIdentity` 标记的伪造版本仍使来源失效，版本字段不被整体删除或忽略。前缀摘要随消息字段同步规范化，既有来源编辑/版本/分支/内容许可/重试基线与生成来源保护未改动。
- 本轮执行器实际运行：`node scripts/test-tavern-stage-c2-runtime.mjs` 通过，新增真实版本函数回归（同一确认 manual 物化后来源标记与 progress 保持、换成同正文其他版本失效、手动内容变化失效、未确认 manual 版本绑定失效、仅 `baseIdentity` 标记不产生伪等价）；修复前用临时副本验证同一新断言在第 1 个正对照即失败（旧运行时来源标记不同）。外部 `independent-scene-version-materialization.mjs` 4/4 通过、`independent-scene-retry.mjs` 3/3、`independent-scene-records.mjs` 9/9、`independent-scene-restore.mjs` 4/4 均通过（复制到系统临时目录运行，未改外部原件与断言）。`npm run check:mvu` 与 `node scripts/test-user-images-versions-runtime.mjs` 通过。
- 未运行/未验收：未运行 `npm run build`、完整 `npm run check`、`check:release` 或 Chrome/Playwright，未修改生成物；最终构建、完整检查、实际浏览器复跑与发布判断由协调者完成。真实供应商、iPhone 真机、生产部署未验收，本批仍未发布（线上第 19 版）。
- 实际修改文件（本轮）：`src/app/scenarios/52-scene-runtime.js`、`scripts/test-tavern-stage-c2-runtime.mjs`、`docs/spec.md`、本记录。未修改外部独立断言、生成物或其他路径。

## 主协调者最终验收：阶段 C1（2026-11-08）

- 最终源码构建 release `540d2713b30630848f152253`：488 个 JS 分片、29 个业务目录、22 个 HTML 分片、11 个 CSS 分片、17 项核心和 296 项公共离线资源。`npm run build`、完整 `npm run check` 退出 0，包含 66 项 Python 与全部既有运行回归；最终日志 `stage-c1-build-final.log`、`stage-c1-check-final.log`。
- 21 项协调者独立运行断言全部通过：`independent-automation-core.mjs` 16 项、`independent-automation-restore.mjs` 2 项、`independent-automation-dispatch.mjs` 3 项。覆盖真实 composer 清空、规则内容与草稿所有权、定时取消、内容绑定授权、非法输入/比较符、世界书负向条件、MVU 数组保留/超时撤权、实际发送因果链、隔离坏规则清理，以及旧请求不释放新锁、不派发旧错误回调。
- 整组实际 Chrome 通过 12 步、11 次合成模型请求、19 张截图，`pageErrors=[]`：实际规则创建/编辑、可读零写回试算、六事件真实生命周期、预览零执行、规则正文自动发送、主/二阶段结算、迟到输入/停止/撤权、真实 MVU 保存和失败、流式去重与刷新。结果 `stage-c1-browser-verified/report.json`。
- 独立 UI 浏览器通过 5 组操作：复制/顺序/会话绑定/本机授权/启停、试算、真实文件下载和预览取消/再导入、删除取消/确认、非法名称与真实存储失败后放弃/刷新。试算实际 `StorageService.saveAll` 调用为 0、模型请求为 0，拟执行正文实际可见；无 pageerror。结果 `stage-c1-independent-ui/report.json`，另有手机深色试算、桌面浅色管理截图。
- 独立生命周期浏览器通过 5 组、2 次合成请求：持有真实用户/助手持久化 ACK 时零“已保存”事件，释放后一次；失败零请求；真实新建/导航、SSE token 与重绘去重、启动恢复不重放。结果 `stage-c1-independent-lifecycle/report.json`。
- 真实隔离 Python HTTP/SQLite 的 v1 与 v2 各两客户端同步通过，共 35 次请求：定义和稳定绑定往返、本机许可不外传、本机许可刷新后保留、相同外部 ID/revision 改变动作后旧许可失效。未使用生产数据/凭据。结果 `stage-c1-independent-sync/report.json`。
- 同一最终构建上的阶段 A 整组 Chrome（9 次合成请求、24 张截图）和阶段 B 整组 Chrome（18 步、50 次合成 Embedding、4 次合成聊天、24 张截图）均通过，pageerror 均为空。结果 `stage-a-with-stage-c1-browser/`、`stage-b-with-stage-c1-browser/`。
- 已目视检查 390px 深色规则编辑与最终试算、1280px 浅色管理页面；浅/暗/系统主题和横向溢出由整组脚本复核。模拟视口不等于 iPhone 真机；真实模型供应商、生产双设备、CORS 和新部署未验收。
- 三轮执行器报告均 completed/exit 0，最终无越界、`runtime_cleanup=removed`；协调者独立审查实际差异，40 份修改均在原 44 路径加 3 份指定生成物范围内。协调者只修正浏览器合法数据、真实忙碌等待、被持有的第二请求等待及预期保存失败提示确认等测试夹具，未替代 DeepSeek 编写产品功能。用户私有角色卡未进入副本或提交，原件 SHA256 保持。
- 初轮 8 项故障及后续追加边界均已复现后修复：试算缺动作正文的失败报告和原截图保留在 `stage-c1-independent-ui-initial-dry-failure/`；早期浏览器夹具失败日志保留，不冒充产品失败或最终通过。所有证据根目录为 `/path/to/local-release-evidence`。
- 最终 SHA256：`assets/js/app.js` = `aed953b48a1a8ad09bae1c9a62c04db0321c2f0df8179bb39653b6a99383fdb1`；`assets/css/app.css` = `db98a4de280042b8969109ac4740d4d820cead5beb0740036de38d6d360b01a8`；`index.html` = `62908002ef4221b9cd5616e981033fe4cca88f2bd2d720a828f586534dd49c08`。

以下 A/B 最终验收与各阶段实施过程保留原始状态，当前 C1 结论以上方最终验收为准。

## 主协调者最终验收：阶段 A

- 最终源码重建 release `70d987338036f8da229e5f4d`：477 个 JS 分片、22 个 HTML 分片、11 个 CSS 分片。`npm run build` 与完整 `npm run check` 退出 0，含新增阶段 A 运行回归、既有存储/提示词/备份/同步回归及 66 项 Python 测试。
- `scripts/test-tavern-stage-a-browser.mjs` 在最终构建的实际 Chrome 156 隔离环境通过：连接档案 CRUD/凭据写入失败、快捷回复及刷新、群聊策略/停止/错误、分支图、预设差异等 9 组步骤；9 次合成模型请求，`pageErrors=[]`。390/1280px 浅色/深色/系统主题共 24 张截图；手机预设差异、桌面群聊配置及档案/按钮/分支代表截图已视觉检查，无横向溢出。此处移动视口不等于 iPhone 真机。
- 七份协调者独立缺陷脚本在最终源码重跑通过：profile-metadata、profile-redirect、profile-persistence、group-guards、auto-stop、restore-bindings、profile-thinking。恢复引用、原始预设元数据、端点密钥隔离、saveApiKey=false、思考参数显式 null 与当前回复结算均有独立证据。
- 另有既有消息可靠保存、局部渲染及独立长会话分支导航的实际浏览器回归通过，详见外部证据目录；这些组早于最终三行思考参数修正，不冒充完整发布门禁。
- 范围复核无未授权差异；生成文件由协调者构建。初轮未列入 AllowedFiles 的一行自动轮次接入已审查并在后续任务明确授权，原报告失败仍保留。全部后续执行器报告无越界，`runtime_cleanup=removed`。用户私有角色卡 `cards/qiong.json` 未进入副本/提交，原件 SHA256 未变。
- 证据根目录：`/path/to/local-release-evidence`；最终日志 `stage-a-build-verified.log`、`stage-a-check-verified.log`、`stage-a-verified-browser.log`，浏览器结果与截图 `stage-a-verified-browser/report.json`。协调者另修正测试实际可点击行、导入成功提示确认和截图矩阵，未自行替代 DeepSeek 编写产品实现。
- 最终产物 SHA256：`assets/js/app.js` = `6f4488ad8182aecfb673947eaa0147047eb2290155554444a3f33af395edfd43`；`assets/css/app.css` = `0bc58c1c18f76c490aaf81c78b6298a1144807c87dc572c86e253186284df8b5`；`index.html` = `47f3e12720a053617127ff66fea83465d220ae885487ee6ccc308eea00849d44`。
- 未验收：真实供应商及其 CORS、iPhone 真机、生产双设备、完整 `check:release`、Sites/ECS 部署。没有推送或发布。后续阶段不得据此标记通过。

## 主协调者最终验收：阶段 B（2026-11-08）

- 最终构建 release `50ab2f5f99bd298a2a2f9474`：484 个 JS 分片、22 个 HTML 分片、11 个 CSS 分片。`npm run build` 与完整 `npm run check` 均退出 0，包括 66 项 Python；固定中文 120,000 字样本 154 块、1536 维序列化 2,886,934 bytes，本轮分块约 0.78ms、本地相似度约 1.47ms。此量测只代表本机固定样本。
- 整组 `test-tavern-stage-b-browser.mjs` 在 Chrome 156 通过 18 步：真实界面设置草稿/非法输入/完成，TXT/Markdown 导入/绑定/预览/重命名/原文下载再上传，索引与实际发送来源，引用不执行宏及普通宏保留，源修订/模型变化，配额与存储失败，取消/停止/迟到格式化，刷新与备份导入等。50 次合成 Embedding、4 次合成聊天，`pageErrors=[]`；390/1280px 浅暗/系统主题 24 张截图。新增检索区、资料预览、列表与来源界面代表截图已视觉检查；来源界面末段使用固定合成诊断样本做可视检查，实际来源已由先前真实发送载荷断言证明。
- 三份独立运行脚本通过共 13 项：`independent-retrieval-core.mjs` 5/5、`independent-retrieval-ownership.mjs` 5/5、`independent-document-restore.mjs` 3/3。严格向量、预取消零请求、迟到连接关闭、事务 abort/close、解绑与服务变化、真实计数、并发失败重试及恢复冲突映射均有独立证据。七份 A 独立缺陷脚本也在最终源码重跑通过。
- 五组独立实际浏览器均通过：设置未完成/放弃不改已提交值，实际保存读回后刷新；重命名取消/保存失败保持原件，成功后修订不变，原文下载字节和重新导入一致，实际替换更新修订且不改副本，删除可取消或确认；资料和记忆的 setvar/getvar 保持字面文本且宿主变量不变；真实保存队列中 A 成功、B 冲突后重试不删除 A、失败 B 草稿可导出、刷新 A 仍在；实际隔离 Python HTTP/SQLite 下 v1/v2 各两客户端完成 A→B、B 刷新、B 修订→A，共 36 次真实本地请求。生产双设备未测试。
- 在最终 B 构建上，阶段 A 整组浏览器与既有消息可靠保存浏览器回归也通过，日志 `stage-a-with-stage-b-browser.log`、`stage-b-message-regression-browser.log`；均使用合成模型。
- 证据根目录 `/path/to/local-release-evidence`：最终日志 `stage-b-build-final.log`、`stage-b-check-final.log`、`stage-b-browser-verified.log`，主报告 `stage-b-browser-verified/report.json`。独立浏览器报告位于 `stage-b-independent-settings/`、`stage-b-independent-document-export/`、`stage-b-independent-text/`、`stage-b-independent-concurrency/`、`stage-b-independent-sync/`。
- 执行器三轮均 completed/exit0/scope[]/`runtime_cleanup=removed`；协调者另核实际差异在白名单并集和自身构建/验证范围内。首轮报告曾列出 canonical helper 临时修改，最终该文件没有差异，返工明确禁止临时越界。协调者只修验证脚本的真实选择器、作用域参数和重命名后的期望值；产品修复均由 DeepSeek 实施。未改用户私有角色卡、凭据、聊天或部署。
- 最终产物 SHA256：`assets/js/app.js`=`017424f4c742348014f70265cb48850437fcb494370eaccd66e96dfe98269144`；`assets/css/app.css`=`0bc58c1c18f76c490aaf81c78b6298a1144807c87dc572c86e253186284df8b5`；`index.html`=`a7bc6886f2bce7dec7aabfffb5f905f15d1126b462ba9e9dc9ff37f12b045448`。
- 未验收：真实 Embedding/聊天供应商、中文召回质量、真实 CORS、iPhone 真机、生产双设备、完整发布门禁和 Sites/ECS 部署。需配置可用 Embedding 服务，不能把 DeepSeek 聊天连接视为 Embedding。普通设置仍沿用既有全局保存机制，未新增通用设置保存失败回滚；失败草稿 JSON 仅保留原始记录，不宣称为独立恢复格式。本批未推送或发布。

## 阶段 C1 实施记录（原编号 11，待协调者验收）

- 实施范围：新增 `src/app/automation/32-automation-rules.js`、`32-automation-conditions.js`、`52-automation-runtime.js`、`68-automation-ui.js`；接入 `src/app/manifest.json`、三语 i18n、默认设置/初始化、设置扩展面板、提示词构建、`sendMessage`、生成完成/停止、新建会话、进入/删除会话、备份恢复与云同步应用、本机设置策略与备份计划/运行。新增 `scripts/test-tavern-stage-c1-runtime.mjs` 与 `scripts/test-tavern-stage-c1-browser.mjs`，并扩展 settings/prompt-controls/backup-restore/frontend events/generation 回归。
- 实际运行的检查（本工作副本）：`node scripts/test-tavern-stage-c1-runtime.mjs` 通过；`node scripts/test-settings-runtime.mjs`、`node scripts/test-prompt-controls-runtime.mjs`、`node scripts/test-backup-restore-runtime.mjs`、`node scripts/test-sync-function.mjs`、`node scripts/test-app-contracts.mjs`、`node scripts/check-app-contracts.mjs` 通过；新增/修改 JS 与测试脚本 `node --check` 通过。`node scripts/test-source-structure.mjs` 的清单完整性断言通过，但其临时夹具调用 `node` 子进程时本环境返回 `EPERM`（`spawnSync C:\\soft\\node.js\\node.exe EPERM`），因此该脚本未完整通过；这不是产品代码失败，需主协调者在可启动子进程的环境重跑。
- 未执行：按任务要求未运行 `npm run build`/`build:ui`、未启动 Chrome/Playwright、未发布、未安装依赖、未改用户数据或凭据。因此 `assets/js/app.js`、`index.html`、`assets/css/app.css` 仍是 B 构建结果，C1 的 bundle 装配、真实 Chrome UI、截图、390/1280px 浅暗/系统主题和无 pageerror 断言尚未验证。
- 未验收：真实模型供应商、真实 Embedding（本功能不涉及）、iPhone 真机、生产双设备、Sites/ECS 部署。浏览器脚本已覆盖创建/启用规则、真实发送与 ACK 动作、六事件次数、重绘/去重、保存失败、试算、导入停用、自动发送时序、MVU、队列取消与刷新，但必须由协调者在其环境实际执行后才能标记通过。
- 设计限制：规则执行需要本机授权；自动发送另需显式授权，导入/恢复/云输入不创建授权。执行记录保存在本机设置且不进入同步/普通备份；队列只在内存。恢复仅设置时，会话范围规则停用并写入 `disabled:` 占位，避免误绑本机私人会话；同时恢复会话时随 `convMap` 跟随导入副本。`before-send` 不允许持久写动作或自动发送，编辑校验与运行记录都会拒绝。

### 阶段 C1 返工第 1 轮（2026-11-08，仍待协调者验收）

- 首轮失败事实保留：首轮差异 36 份，均在 44 条允许路径内，报告为 completed/exit0/scope[]/cleanup removed；但协调者外部 `independent-automation-core.mjs` 以真实 `chat/60-composer-images.js` 覆盖后，最初 8 项仅 3 项通过、5 项失败；扩为 10 项后记录 3 项通过、7 项失败（含无规则清空、send-only 接管用户草稿、settle 与 timer 之间迟到输入被覆盖），协调者后续继续扩至 16 项，返工后 16/16 通过。`independent-automation-restore.mjs` 2 项通过。
- 本轮修复：`runAutomationBeforeSend` 无改文时不再递增 capture revision，有改文时同步 `capture.revision`，迟到输入不覆盖；自动发送只使用本规则 `set-draft`/追加/快捷回复准备文本或发送动作正文，send-only 无自身内容记录 skipped，settle/timer 双重校验草稿修订与文本；所有排队项与已排定 timer 统一为可撤销生命周期，回调内重查目标、来源消息修订、规则内容/指纹、授权、连接、忙碌与 epoch；本机 grant 绑定有界规范化可执行内容指纹，名称/排序/启停不参与，旧 revision-only 授权失效；入站规则先按原始值严格校验再规范化，非法值/未知枚举/超限文本/原型路径隔离停用，导入与备份拒绝整包；世界书 `not-contains`/`not-equals` 按任一真实匹配判断；MVU 提交与迟到回调重查授权、动作路径/值、目标与 epoch；因果链改绑当前生成主/二阶段上下文并累计整链步数，一个规则的连续 MVU 按序串行并有界；before-send/世界书片段绑定 request token、规则指纹与来源，在提示词 yield 后到实际 dispatch 前再次校验，预览零事件，保存失败/停止/改版不叠加旧片段。
- 本轮实际检查：协调者将外部 `independent-automation-core.mjs` 扩至 16 项后，最终 16/16 通过；`independent-automation-restore.mjs` 2/2 通过（外部脚本只读执行；因任务根目录不在可写沙箱，复制到临时目录运行以写入报告，未修改外部文件）。新增通过的项包括：既有 MVU 数组路径写入保持数组与其他元素、保存事件草稿动作不覆盖用户已有输入、排定发送向真实 `sendMessage` 传递生成规则链、超时 MVU 动作不能在实际提交回调中提交、原始条件类型/操作组合拒绝、以及多条隔离规则仍可单独删除。`node scripts/test-tavern-stage-c1-runtime.mjs`、`node scripts/test-settings-runtime.mjs`、`node scripts/test-prompt-controls-runtime.mjs`、`node scripts/test-backup-restore-runtime.mjs`、`node scripts/test-sync-function.mjs`、`node scripts/test-app-contracts.mjs`、`node scripts/check-app-contracts.mjs` 通过；修改的 JS 与测试脚本 `node --check` 通过。`node scripts/test-source-structure.mjs` 仍在测试夹具 `spawnSync node.exe` 时返回 EPERM，未完整通过；`node scripts/check-bundle-drift.js` 报告 `assets/css/app.css` 与 `src/ui/css` 漂移，这是首轮允许的 UI 源改动尚未重建生成物，按本轮任务不得构建。
- 仍未验证：未运行 `npm run build`/`build:ui`、未启动 Chrome/Playwright、未执行真实供应商、真机、部署或发布。浏览器脚本已改为真实自动发送规则正文并等待真实模型请求，验证真实创建/导航/保存/世界书请求事件、无规则清输入、预览零执行、二阶段、停止/撤权/迟到输入定时竞态、流式重复、MVU 保存/源变化、保存失败、跨刷新内容指纹授权与截图，但必须由协调者实际执行后才能标记通过。

### 阶段 C1 返工第 2 轮（2026-11-08，待协调者最终验收）

- 缺口来源：协调者先前构建 `9337b8d73e6dfacdb3d67592`，完整 `npm run check`（含 66 项 Python）通过；实际 Chrome C1 整组 11 步/11 次合成请求/19 张截图/`pageErrors=[]`；外部 core 16/16、restore 2/2、原 dispatch 2/2；真实 StorageService 持有 ACK 的 lifecycle 浏览器 5 流程/2 请求；真实隔离 HTTP/SQLite v1/v2 双客户端规则同步 35 请求通过。该证据对应本轮修复前源码，不能作为本轮新生成物的通过证据。
- 实际 UI 验收发现：外部 `independent-automation-ui-browser.mjs` 的 CRUD/授权/启停、无副作用试算、真实导出/导入预览取消/再次导入新 ID 停用、删除取消、非法输入与 quota 保存失败/放弃/刷新等 5 流程均通过且零模型请求/`pageErrors=[]`，但最后断言失败——试算对 `append-draft` 文本 `SOURCE_ACTION_BODY` 只显示动作名称，没有正文，用户无法审查将要执行的内容；证据为 `stage-c1-independent-ui/report.json` 与 `mobile-dry-run-dark.png`（协调者已实际目视）。
- 加强的错误回调用例发现：外部 `independent-automation-dispatch.mjs` 前两项仍通过，新增第 3 项失败——给 `streamChatWithMessages` 传旧 `generationContext` 且 `state._generationRuntime` 已是 newer 时，旧失效片段仍调用旧 `onError`，其 `state.isGenerating=false` 等副作用会结算后来的请求。
- 本轮修复（只改 7 个允许路径）：
  - `src/app/automation/68-automation-ui.js`：`openAutomationDryRun` 增加规则名/事件/绑定/状态行（停用、非法定义、未授权、范围不符、条件未命中等不会执行的原因保持可读），并为每个动作显示可审查内容：`set-draft`/`append-draft` 与 `send-message` 正文、`prompt-fragment` 角色与正文、`mvu-set` 路径与实际写入值、`quick-reply` 组/按钮引用与原始正文、`block-send` 阻止原因；正文有界截断，`white-space:pre-wrap`/`overflow-wrap:anywhere` 适配 390px，所有文本经 `escapeHtml`，不展开宏、不执行 HTML/JS。
  - `src/app/generation/50-generation-integrations.js`：失效片段在释放锁或调用 `onError` 前用 `isGenerationRuntimeOwned` 核对上下文所有权；仍拥有当前运行态的请求释放一次并报告一次错误；旧请求既不发起请求、不释放新锁、也不调用旧错误回调。prompt operation/检索/停止等既有最后所有权保护保留。
- 实际修改文件（均在允许列表内）：`src/app/automation/68-automation-ui.js`、`src/app/generation/50-generation-integrations.js`、`scripts/test-tavern-stage-c1-runtime.mjs`、`scripts/test-tavern-stage-c1-browser.mjs`、`docs/spec.md`、`docs/tavern-feature-acceptance-20261107.md`、`docs/tavern-feature-plan-20261107.md`；未修改其他源码、生成物、外部独立测试或报告。
- 本轮实际检查：`node scripts/test-tavern-stage-c1-runtime.mjs` 通过，新增“拥有当前运行态的失效片段释放并报告一次”“旧片段不释放 newer 锁/不调用旧回调/不创建 transport”断言；修改的 2 份源码与 2 份测试脚本 `node --check` 通过；`node scripts/test-sync-function.mjs`（含生成前端夹具）与 `node scripts/test-prompt-controls-runtime.mjs`（含自动化片段分发）通过。另以 VM 冒烟加载 `68-automation-ui.js`，覆盖 `append-draft`、`prompt-fragment`、`quick-reply`、`mvu-set`、`block-send`、`send-message` 的动作正文与 HTML 转义，通过。外部 `independent-automation-dispatch.mjs` 3/3、`independent-automation-core.mjs` 16/16、`independent-automation-restore.mjs` 2/2 通过（均复制到系统临时目录运行以写报告，脚本与断言未改；临时副本已删除）。
- 未运行/仍未验证：本轮未运行 `scripts/test-tavern-stage-c1-browser.mjs`（按要求只编写并语法检查），未运行 `npm run build`/`build:ui`/完整 `npm run check`，未启动 Chrome/Playwright，未重跑外部 UI 浏览器；协调者将统一构建、完整检查和实际浏览器复核。因此本轮新生成物、真实 Chrome、390/1280px 浅暗/系统主题截图和 `pageerror` 断言尚未验证。真实供应商、iPhone 真机、生产双设备与 Sites/ECS 部署仍未验收。C2/C3/D 仍待实施；不得把本记录或协调者旧构建当作全任务完成。

以下阶段 B 过程保留当时的失败、限制和待办，当前结论以上方最终验收为准。

## 阶段 B 首轮实施记录（历史）

- **范围与状态**：01 语义长期记忆与 02 文件资料库已按允许文件清单实施。只修改本轮允许路径；未加入 06/07/08、TTS、本地推理/WebLLM 或 ComfyUI；未修改用户角色卡、浏览器数据、凭据、部署配置或生成物；未安装依赖、未提交/推送/部署。
- **共享检索模块**：新增 `retrieval/20-retrieval-index-store.js`（独立 `opentavern-retrieval-index` IDB、打开/事务期限、原子来源写入、失败清理、版本变化关闭连接）、`31-retrieval-embeddings.js`（OpenAI 兼容 `/embeddings`、端点规范化、端点/模型/维度签名、实际响应索引顺序/有限数值/维度校验、批次与超时、显式测试）、`32-retrieval-sources.js`（消息/摘要/资料稳定来源、修订、分支、分块、绑定、去重与历史覆盖判断）、`41-retrieval-runtime.js`（有界可取消索引、查询缓存、相似度、预算、迟到结果 fence、预览本地化、诊断）和 `68-retrieval-ui.js`（设置、测试、索引状态、费用/批次数、来源关联、清理）。01/02 共用同一索引和 Embedding 服务，没有各建一套向量服务。
- **01 记忆**：默认关闭；当前会话始终为来源，可显式关联其他会话；只索引已保存消息和有效摘要，不索引流式草稿。来源修订直接来自消息修订/摘要来源校验，编辑、删除、回复版本切换和摘要失效会立即过滤旧片段；最近历史与摘要覆盖内容去重。发送边界只在用户启用后归并新增记忆，失败退回摘要与历史，不阻塞生成锁。实际请求诊断记录本次来源、模型、维度与请求批次数；预览只使用本地缓存查询向量，未缓存时明确显示未检索。
- **02 资料**：新增独立 `state.documents` 实体，保存 UTF-8 TXT/Markdown 原文、名称、格式、内容摘要修订和全局/角色/会话绑定；`documents/67-documents-ui.js` 提供导入、预览原文/分块、绑定/解绑、替换、导出、删除和索引状态的真实二级界面。以实际字节校验 UTF-8、空文件、不支持格式和上限；同名不覆盖；替换先生成候选，可靠保存成功后切换，失败保留原件与可重试草稿；资料文本只作安全文本展示，不执行 HTML/脚本。
- **数据链路**：`documents` 已接入 appStore/状态初始化、canonical 持久化、空保护、紧急配额备份、恢复、清空、完整导出、备份分项恢复、云同步 v1/v2 和自动上传签名。恢复冲突时资料 ID 保留副本，资料会话绑定随导入会话副本映射，角色绑定保留有效目标；失败不修改本机资料。旧快照缺少 `documents` 时按空库读取。两套后端对 `documents`/`document:` 作透明存储，`functions/sync/snapshot.js` 与 `server/opentavern_backend/sync_protocol.py` 无需白名单修改；旧客户端的兼容/回退边界已写入 [云同步](CLOUD_SYNC.md)。
- **固定上限与量测**：120,000 字/480 KB 单资料、12 份/600,000 字总量、900 字分块/100 字重叠、每来源 180 块、12 个片段、记忆与资料各 2,000 估算 Token、8 块/请求、30 秒请求/15 秒查询超时、发送边界自动索引 80 块、手动索引 600 块/80 批；每次索引后最多清理 50 条已删除/失效来源。固定中文 120,000 字样本分为 154 块；1536 维向量序列化 2,886,934 bytes，分块约 0.8 ms，本地相似度检索约 1.2–2.9 ms。界面显示真实上限，不承诺无限容量。
- **实际运行（实施环境）**：`node scripts/test-tavern-stage-b-runtime.mjs` 通过，输出上述 benchmark，并覆盖 Embedding 端点/顺序/畸形向量/维度/HTTP/超时、记忆修订与未绑定会话拒绝、替换失败与重试、配额/取消/迟到 fence、云同步 v2 文档往返和提示词标签。`node scripts/test-backup-restore-runtime.mjs` 通过，新增资料原文、修订、会话绑定副本映射、相同资料不重复、保存失败回滚和非法资料断言；`node scripts/test-sync-v2.mjs` 通过（预期快照加入空 `documents`）；`node scripts/test-prompt-controls-runtime.mjs`、`test-message-reliability-runtime.mjs`、`test-storage-timeouts-runtime.mjs`、`test-private-settings-runtime.mjs`、`test-convenience-runtime.mjs`、`test-conversation-transfer-runtime.mjs`、`test-streaming-transfer-runtime.mjs`、`test-settings-runtime.mjs`、`test-tavern-stage-a-runtime.mjs`、`test-sync-function.mjs`、`test-sync-v2-backend.mjs`、`test-app-contracts.mjs`、`check-app-contracts.mjs` 通过。`node --check` 通过本轮新增/修改的 JS、三份 i18n 和两份阶段 B 脚本。
- **未运行/限制**：未运行 `npm run build`、`build:sites`、`prepare:sites`、完整 `npm run check` 或 `check:release`；生成物仍待主协调者重建。未启动 Chrome/Playwright，`scripts/test-tavern-stage-b-browser.mjs` 已提供真实 TXT/MD 上传→绑定→索引→发送→实际来源→刷新→导出→第二隔离客户端导入、模拟 Embedding/畸形向量/模型切换/修订失效/超时取消/配额/保存失败/预览零请求及 390/1280px 主题矩阵，但未在本环境执行。`test-local-first-runtime.mjs` 因未重建的 `index.html` releaseId 与当前源码不一致提前失败；`test-source-structure.mjs` 的临时夹具在 `spawnSync` 处受当前环境 EPERM 阻塞；两者均未计为产品通过。真实 Embedding 服务、中文相关性、浏览器 CORS、iPhone 真机、生产双设备和部署未验收。
- **兼容说明**：旧客户端若不认识顶层 `documents`，读取时可继续工作但不会显示资料；若其把快照原样转发，后端会透明保留；若旧客户端主动重建快照，必须保留未知字段，否则资料可能丢失。本实现不把索引当原文，清索引不删资料，恢复/云同步后从原文重建。`character/65-character-library-actions.js` 的旧式部分快照写入未列入本轮文件；存储保存入口对缺少 `documents` 的快照只补入当前资料，避免该旧路径删除用户资料。

## 阶段 B 第 2 轮返工记录（历史）

首轮实施未被协调者独立验收通过：`independent-retrieval-core.mjs` 的向量强转、预取消请求、IDB 打开/事务围栏失败，`independent-retrieval-ownership.mjs` 的解绑/换模型跨 await 所有权、缓存查询假计费与失败草稿整库覆盖失败，以及真实 `independent-retrieval-settings-browser.mjs` 的检索设置未遵守完成/放弃均已被复现。本轮只修 01/02，未进入阶段 C/D，未启动 Chrome/CDP、未构建或手改生成物、未提交/推送/部署。

- **实际修改文件**：`src/app/retrieval/20-retrieval-index-store.js`、`31-retrieval-embeddings.js`、`41-retrieval-runtime.js`、`68-retrieval-ui.js`；`src/app/documents/32-documents.js`、`67-documents-ui.js`；`src/app/prompt/41-prompt-message-builder.js`；`src/app/generation/50-generation-integrations.js`；`src/app/settings/68-settings-draft.js`、`68-settings-save-form.js`；`src/app/core/12-i18n-zh-cn.js`、`12-i18n-zh-tw.js`、`12-i18n-en.js`；`src/ui/html/settings/summary.html`；`scripts/test-tavern-stage-b-runtime.mjs`、`test-tavern-stage-b-browser.mjs`；`docs/spec.md`、`docs/tavern-feature-plan-20261107.md`、本记录与 `AGENTS.md`。未修改白名单外文件，也未临时修改后恢复。
- **标准向量与维度**：Embedding 响应元素只接受 `typeof === 'number'` 且有限的值，拒绝 null/布尔/字符串/对象/数组；配置维度必须是严格整数，移除 `Math.floor`，小数和布尔维度被拒绝。正常运行、乱序索引、重复/缺失索引、协议与维度不匹配回归保留。
- **请求与索引围栏**：预先取消的 signal 在 fetch 前拒绝并解绑监听；查询 controller 继承父 signal 取消。IDB 打开使用尝试身份与结算围栏，超时/blocked 后迟到连接立即 close，不覆盖新尝试或清除新 pending；事务超时 abort 并 close，丢弃不确定连接，旧事件不能结算新操作。worker 返回 Promise 的拒绝在事务 complete 前立即挂载 handler，配额错误保留真实 `QuotaExceededError`，不再产生未处理拒绝。
- **来源与连接所有权**：检索后按捕获的设置、Embedding 服务签名、当前会话/角色绑定范围与来源修订复核；解绑、删资料、改内容、换模型或换连接后丢弃旧结果并返回 `cancelled`。校验延续到异步格式化/宏处理结束和实际聊天发送前；失败路径零聊天请求、释放生成锁、保留原消息。
- **资料失败草稿**：失败候选保存当时的资料库基线；并发成功修改后重试以冲突拒绝并保留草稿，不再用整库旧候选删除并发资料。资料库新增失败草稿导出入口；无并发变化时原有单次保存失败重试仍可用。
- **设置完成/放弃**：检索开关、预算、TopK 与最低分加入 `SETTINGS_FORM_KEYS` 和 `readSettingsFormIntoState`，change 事件不再即时 `persistState`。编辑不改变已提交设置，放弃不保存，完成后统一保存并在刷新后保留；索引/测试/资料 CRUD 读取已提交配置，界面提示先完成未提交的检索设置。保存失败不再被检索 UI 单独吞掉；完成后沿用全局设置保存的既有失败边界，未新增专用回滚提示。
- **诊断计数**：`prepareRetrievalForPrompt` 只统计本轮真实启动的查询/自动索引 Embedding 批次，缓存命中为 0；自动索引部分失败时保留已启动批次数，不混入上一轮手动索引，也不重复累加。
- **实际运行**：`node scripts/test-tavern-stage-b-runtime.mjs` 通过，新增有限数值/严格维度、预取消零 fetch、IDB 迟到打开关闭、事务超时 abort/close、worker 拒绝无未处理、解绑/换模型所有权、缓存零请求、失败草稿冲突、设置表单读取与非法输入断言；固定 120,000 字样本仍为 154 块。`node scripts/test-prompt-controls-runtime.mjs`、`test-settings-runtime.mjs`、`test-message-reliability-runtime.mjs`、`test-storage-timeouts-runtime.mjs`、`test-chat-operations-runtime.mjs`、`test-convenience-runtime.mjs`、`test-backup-restore-runtime.mjs`、`test-private-settings-runtime.mjs`、`test-tavern-stage-a-runtime.mjs`、`test-sync-function.mjs`、`test-sync-v2.mjs`、`test-sync-v2-backend.mjs`、`test-api-protocol-runtime.mjs`、`test-user-images-versions-runtime.mjs`、`test-app-contracts.mjs`、`check-app-contracts.mjs` 均通过；`test-app-contracts.mjs` 在系统临时目录构建合成夹具，未改写仓库 `assets/js/app.js`。`node --check` 通过本轮修改的 JS、三份 i18n 和两份阶段 B 脚本；按 manifest 拼接 484 个分片后 `new Function` 解析通过。
- **独立复现**：`independent-retrieval-core.mjs` 5/5 通过（含长文尾部覆盖），`independent-retrieval-ownership.mjs` 5/5 通过。七份阶段 A 独立脚本 `independent-auto-stop.mjs`、`independent-group-guards.mjs`、`independent-profile-metadata.mjs`、`independent-profile-persistence.mjs`、`independent-profile-redirect.mjs`、`independent-profile-thinking.mjs`、`independent-restore-bindings.mjs` 全部通过。外部脚本位于只读 artifact 根目录，运行时仅把 `report.json` 写入重定向到系统临时目录，未修改脚本内容或断言。
- **未通过/未运行**：`independent-document-restore.mjs` 前两项（新会话/新角色绑定）通过，第三项“恢复的 linked-memory conversation IDs 跟随冲突副本”仍失败，实际仍指向 `local` 而非 `restored-1`；artifact 根目录 23:33:48 的既有报告已记录同一失败，且相关逻辑不在本轮 AllowedFiles 与必修清单内，本轮未越界修改。未启动 Chrome/Playwright，新增的浏览器设置草稿、非法输入、完成/刷新、外部设置替换与“格式化后换连接零聊天请求/锁释放/原消息保留”场景尚未真实验收；未运行 `npm run build`、`build:sites`、`prepare:sites`、完整 `npm run check` 或 `check:release`，生成物仍待协调者重建。`test-source-structure.mjs` 在当前环境的临时夹具 `spawnSync` 处返回 null 而中止，未计为产品通过。真实 Embedding 服务、中文相关性、浏览器 CORS、iPhone 真机、生产双设备和部署未验收。

## 阶段 B 第 3 轮返工记录（历史）

第 2 轮执行器报告为 completed、exit 0、无范围越界、`runtime_cleanup=removed`；协调者独立重跑 core 5 项、ownership 5 项全部通过，`independent-document-restore.mjs` 前两项通过、第三项记忆来源冲突映射仍失败。首轮完整 check 与真实两客户端 v1/v2 同步 36 请求通过，但补充复核另发现检索引用执行宿主宏、资料导出不可重新导入、重命名无实际界面和检索区未入镜四个缺口。本轮只修 01/02，不进入 C/D；未启动 Chrome、未构建或手改生成物、未安装依赖、未调用其他模型、未提交/推送/部署。

- **实际修改文件**：`src/app/retrieval/41-retrieval-runtime.js`、`src/app/prompt/41-prompt-message-builder.js`、`src/app/transfer/63-backup-restore-plan.js`、`src/app/documents/32-documents.js`、`src/app/documents/67-documents-ui.js`、`src/app/core/12-i18n-zh-cn.js`、`12-i18n-zh-tw.js`、`12-i18n-en.js`、`scripts/test-tavern-stage-b-runtime.mjs`、`scripts/test-tavern-stage-b-browser.mjs`、`scripts/test-backup-restore-runtime.mjs`、`docs/spec.md`、`docs/tavern-feature-plan-20261107.md`、本记录与 `AGENTS.md`。未修改第 2 轮修复、协调者验证脚本或外部独立脚本。
- **检索原文边界**：`buildRetrievalPromptMessages` 给资料/记忆消息加 `__retrievalReference` 标记；`buildPromptMessageSteps` 对该标记跳过普通消息正则/`formatMessage`、`replacePlaceholders`、ST 宏、MVU 模板子集和 outlet 解析，并在 outlet 解析后恢复原文。来源名称、修订和片段正文均按索引原文进入实际请求与下一次预览；普通角色、预设、世界书与历史仍走原宏/模板/正则路径。实际请求诊断仍只记录来源元数据，不复制原文。
- **资料原文导出**：资料库行“导出”改为真实 UTF-8 TXT/Markdown 原文下载，MIME 与扩展随保存格式，文件名随当前名称；不再把 `opentavern-document` JSON 包装当用户导出。浏览器回归实际下载字节、重新上传生成同名第二份资料并校验正文一致；完整/分项备份仍负责结构化资料与绑定。
- **资料重命名**：资料行新增“重命名”二级表单（语义 label、输入、保存、取消），调用原 `renameDocument` 候选事务；空白或超过 180 字显示可见错误，取消/保存失败不改名称，重名沿用 `uniqueDocumentName` 副本策略，名称变化不改变正文修订或向量。导出文件名随名称更新。
- **恢复记忆来源映射**：恢复计划在 `convMap` 建立后重映射新会话的 `memorySourceConversationIds`：属于本次导入的来源指向冲突副本，重复去除并遵守 4 个来源上限；本机已存在但未导入的目标保持原引用，未知目标丢弃。预览/失败不改原备份或当前状态；不重写其他 A 分支/按钮引用修复，也未清理只定义未调用的旧导入函数。
- **实际运行**：`node scripts/test-tavern-stage-b-runtime.mjs` 通过，固定 120,000 字样本仍为 154 块，新增检索引用边界（宏/模板/outlet 不执行、普通历史仍格式化）、重命名校验/修订稳定/重名策略、资料导出数据与标签断言；`node scripts/test-backup-restore-runtime.mjs` 通过，新增记忆来源冲突副本、去重、自引用/未知目标、本机未导入目标与 4 项上限断言。`node scripts/test-prompt-controls-runtime.mjs`、`test-settings-runtime.mjs`、`test-message-reliability-runtime.mjs`、`test-storage-timeouts-runtime.mjs`、`test-chat-operations-runtime.mjs`、`test-convenience-runtime.mjs`、`test-private-settings-runtime.mjs`、`test-tavern-stage-a-runtime.mjs`、`test-sync-function.mjs`、`test-sync-v2.mjs`、`test-sync-v2-backend.mjs`、`test-api-protocol-runtime.mjs`、`test-user-images-versions-runtime.mjs`、`test-app-contracts.mjs`、`check-app-contracts.mjs` 均通过。`node --check` 通过本轮修改的 JS、三份 i18n 与三份脚本。
- **未通过/未运行**：外部 `independent-document-restore.mjs` 在当前沙箱运行到写 `report.json` 时因 artifact 根目录只读返回 EPERM，未修改脚本绕过；等价第 3 项断言已由本仓库运行回归覆盖。`test-source-structure.mjs` 的临时夹具 `spawnSync` 在当前沙箱返回 EPERM，未计为产品通过；其 manifest 覆盖断言在失败前已通过。未启动 Chrome/Playwright，新增的浏览器宏边界、真实下载/重传、重命名与检索区滚动截图待主协调者执行。未运行 `npm run build`、`build:sites`、`prepare:sites`、完整 `npm run check` 或 `check:release`，生成物仍待协调者重建。真实 Embedding 服务、中文相关性、浏览器 CORS、iPhone 真机、生产双设备和部署未验收。

## 实施者过程记录（历史）

以下保留每轮当时的失败、环境限制与待办；其“未运行/待验收”由上方协调者实际结果更新，不作为当前状态。

日期：2026-11-07。状态：03 连接档案、04 快捷回复、09 群聊策略、10 分支图、13 预设差异已实施代码与运行/浏览器脚本；06/07/08 已取消，其余阶段仍待开发。首轮交付经主协调者独立审查判定未通过（R1–R6 与浏览器夹具失败），第 2 轮返工已完成并通过 5 份独立复现脚本及阶段 A 运行回归。第 3 轮主协调者已重建生成物（release `1f961e3525ab774456035b87`），运行回归和两份真实 Chrome 自动停止复现（桌面/移动 artifact）通过。第 4 轮已修复发送辅助夹具，最新夹具 run `2026-11-07T05-17-01-454Z-36136` 为 completed、无范围越界、cleanup removed，`node scripts/test-sync-function.mjs` 完整通过；本执行环境中 `npm run check` 在 bundle 漂移检查前因 `spawnSync` EPERM 中止，其余可独立运行检查除同样受 EPERM 影响的 source-structure 与受临时目录权限影响的 Python 用例外通过；整组浏览器尚未执行。第 5 轮修复恢复备份导入 ID 冲突时快捷回复会话目标、分支父引用与档案预设引用未随副本映射的缺陷，独立复现与运行回归通过。第 6 轮复核 03 档案预设引用映射（既有实现已满足），补充仅恢复预设与保存失败保护回归；修复 09 自动轮次异步失败在已打开二级 HTML 对话框时被 top layer 遮挡的问题，并更新浏览器失败用例，但本轮未执行 Chrome。第 7 轮修复 03 档案思考参数捕获：主档案 `thinking` 与摘要档案 `summaryThinking` 的对象和显式 `null` 在迁移、保存、导出/导入与云同步往返中保留，切换按用途投影且互不覆盖（R11）。产品仍待协调者完整验收。未运行真实浏览器复跑、真实供应商、手机真机、部署或发布；本记录不把这些项目标记为通过。

## 执行范围

- 独立工作副本：`/path/to/local-release-evidence`，基线 `de87e91`。
- 未修改用户角色卡、浏览器数据、后端合同、数据库或部署配置；未安装依赖、未提交/推送。
- 未加入原调研 06/07/08，也未加入 TTS、WebLLM 或 ComfyUI。
- 按约定未运行 `npm run build` / `build:sites` / `prepare:sites`，未手改 `index.html`、`assets/js/app.js`、`assets/css/app.css`、`assets/offline/`、`.sites-public/` 或 `dist/`。首轮结束后由主协调者执行过一次 `npm run build`（477 个分片）；返工只修改 `src/app/`、`src/ui/` 源文件与脚本，生成物仍由主协调者统一重建。
- 首轮报告 `/path/to/local-release-evidence` 状态为 `status=failed`，其中 `scope_violations=[src/app/conversation/32-chat-operations.js]`：首轮在未列入名单的该文件增加了取消群聊自动轮次的一行接入。该行经主协调者逐行审查，并在返工任务中明确授权该文件；本条保留首轮范围问题，不视为无越界。首轮报告未被删除或改写。
- 本轮返工只在本轮允许文件内修改；`docs/SOURCE_STRUCTURE.md` 已在允许范围内同步业务目录数与装配项数。

## 返工记录（第 2 轮，独立审查 R1–R6）

主协调者独立复现脚本位于 `/path/to/local-release-evidence`（artifact 根目录，不在源码内），首轮结束时全部失败。返工后实际运行 5 份脚本，全部通过。

**R1 便携设置过滤误删原始预设元数据**

- 问题：`getCloudSyncPortableSettings` 对全部设置递归过滤，把 `presetLibrary[].extensions.token/headers/privateKey` 等未执行的原始元数据一并删除。
- 修复：恢复既有顶层本机字段策略；只对 `connectionProfiles` 做白名单规范化（`id/name/purpose/protocol/endpoint/model/description/parameters`），参数只保留已知采样键，`thinking`/`summaryThinking` 内再按密钥后缀剔除。预设、角色与其它旧业务数据保持原样；顶层结构保留名在赋值边界用 own-property 方式处理。
- 回归：`test-tavern-stage-a-runtime.mjs` 新增出站与入站云同步的原始预设元数据往返断言，并保留连接档案嵌套密钥剔除断言；`test-private-settings-runtime.mjs` 通过。

**R2 旧密钥迁移错误绑定远端替换的档案**

- 问题：`migrateLegacyConnectionProfileCredentials` 只看“当前选中档案 + 旧 key 存在”，会把本机旧 key 绑定到远端下载后端点已被替换的同用途档案。
- 修复：迁移只在档案协议/端点与旧 main、旧独立摘要端点完全配对时绑定；`summarizeUseMainAPI !== false` 时不迁移摘要密钥；主/摘要分别核对，继承语义保持不变。云/备份恢复后的启动不再把旧密钥绑定到未重新授权的新端点。
- 回归：运行回归新增远端替换主档案、远端替换摘要档案、独立摘要配对、主连接继承四组迁移断言，并直接调用迁移入口而非只读 `getCredential`。

**R3 群聊策略显式非法枚举被静默归一**

- 问题：`validateGroupSpeakerStrategy` 先归一化未知 mode 再校验，显式非法值静默变成 `round-robin`。
- 修复：校验原始显式值；缺省/空值仍兼容为 `round-robin`，非法字符串、数字、对象一律抛出 `group_strategy_mode_invalid`。
- 回归：运行回归覆盖四种合法模式、缺省兼容、非法字符串/类型/对象。

**R4 取消自动轮次丢弃当前完成回调**

- 问题：`cancelGroupAutoRounds` 把 run 置空后，`startGroupAutoTurn` 的 `onComplete/onError` 以 `groupAutoRoundState === run` 为前置条件直接返回，导致当前仍在进行的请求完成被丢弃、`isGenerating` 不释放、可保存的回复未保存。
- 修复：run 对象新增 `turnActive` 记录当前请求所有权，与“是否允许未来轮次”分离。取消未来轮次后当前请求仍走 `handlePrimaryAssistantComplete` 正常结算与保存，但不继续下一步；错误路径同样释放锁并提示。界面“停止自动轮次”只取消未来轮次，普通停止按钮（`stopGeneration`）中止当前请求，中断完成仍被结算。切会话/删除会话的确认被取消时不再提前取消自动轮次。
- 回归：运行回归覆盖取消后成功结算、取消后错误释放、普通停止中止并结算中断完成、迟到重复完成不清除新请求锁；切会话/删除确认取消不提前取消轮次。隔离浏览器脚本新增慢速合成模型场景，通过真实对话框按钮覆盖停止自动、主停止、切会话确认取消、正常完成与错误。

**R5 档案事务 `transformSnapshot` 绕过 `saveApiKey=false`**

- 问题：`commitConnectionProfileSettingsKeys` 的 `transformSnapshot` 在 `getSafeSettingsForPersist` 之后重新拷入 `apiKey/summarizeApiKey`，使仅内存使用的密钥进入 canonical 与 pending 快照。
- 修复：`transformSnapshot` 与 `commitPendingSnapshot` 共用同一合并函数，合并后立即应用持久化策略（`saveApiKey=false` 清空两项密钥、连接档案按白名单脱敏）。`onPersistSuccess` 仍把密钥写回内存运行态，不改变当前会话可用性。
- 回归：运行回归装载真实 `persistState`、持久化记录与 `StorageService` 捕获器，在事务进行中制造 pending 快照，断言 canonical 与 pending 均不含合成密钥、内存仍持有、刷新读取的持久快照无密钥。

**R6 本机凭据写入失败被吞掉**

- 问题：`persistConnectionProfileCredentialStore` 以 `catch (_) {}` 吞掉全部 `localStorage` 错误，`saveApiKey=true` 时配额/写入失败仍显示“已保存”，刷新后丢失。
- 修复：写入后回读校验；失败抛出 `conn_profile_credential_save_failed`，`setConnectionProfileCredential` 回滚内存凭据，编辑器保留打开并通过 `.feature-error` 显示可重试错误，不保存候选档案。`saveApiKey=false` 仍仅内存使用，并尽力清除设备存储，不静默落盘。启动时迁移/策略写失败只记录警告，不阻断启动。
- 回归：运行回归使用合成 `localStorage` 覆盖抛错、静默丢弃、成功写入后新上下文回读、`saveApiKey=false` 四种路径；隔离浏览器脚本新增编辑器内的凭据写入失败场景。

## 第 3 轮验收夹具修复（R7）

主协调者重建 `1f961e3525ab774456035b87` 后，5 份独立复现脚本和阶段 A 运行回归通过；真实 Chrome 自动停止复现 `auto-stop-rework-desktop/report.json`、`auto-stop-rework-mobile/report.json` 在 1280 与 390 均通过，当前回复保存且没有第二次请求。完整 `npm run check` 与整组浏览器仍各有一处夹具问题，本轮只修夹具，不改产品代码。

**R7a 群聊核心夹具漏装策略依赖**

- 问题：`scripts/tests/frontend/conversation.mjs` 的 `assertFrontendGroupChatCoreHelpers` 只装载成员、发言人和消息辅助分片；新增的 `32-group-chat-speakers.js` 委托 `getRoundRobinGroupSpeaker`，该函数位于 `32-group-chat-strategies.js`，导致第 378 行 `getNextGroupSpeaker` 返回 `null`。
- 修复：按真实 manifest 顺序在消息辅助分片之后补装 `conversation/32-group-chat-strategies.js`；保留原轮流、身份和 `@` 断言，不改产品回退，不 mock `__next` 返回值。
- 结果：`assertFrontendGroupChatCoreHelpers` 单测通过。随后完整 `node scripts/test-sync-function.mjs` 在 `scripts/tests/frontend/events.mjs:223` 暴露另一处夹具缺口：发送辅助夹具没有提供 `findGroupMemberByName`（产品函数由 `32-group-chat-strategies.js` 提供，浏览器 bundle 中可用），该文件不在本轮允许修改范围，未越界修改，也未把完整检查记为通过。

**R7b 浏览器确认框与移动入口夹具**

- 问题：真实页面切换会话时由 `loadConversation` 调用 `showGlassConfirm`，确认框是 `#appDialogModal`（取消按钮 `#appDialogCancelBtn`）而非 `#featureConfirmDialog`；旧脚本等待 `#featureConfirmDialog`，在 30 秒后超时，且慢速合成模型已先完成，无法稳定验证“取消切换仍保留自动运行”。
- 修复：按真实入口等待 `#appDialogModal` 可见，点击 `#appDialogCancelBtn`，等待其隐藏，再断言当前会话与自动运行仍保留；慢速模型改为测试侧可控放行（Node 侧 gate），在确认框交互期间保持请求未完成，之后按场景放行。普通停止、停止自动轮次和失败模型场景保留；失败模型改为断言真实玻璃提醒框的错误文本并关闭，不再依赖被产品覆盖的原生 `alert`。
- 修复：390 截图阶段先通过真实 `#hamburgerBtn` 展开侧栏，再点击 `#quickReplyEntry` 与 `#sidebarSettingsBtn`；不使用 force click，不移除 `hidden`，不把折叠侧栏的屏外按钮当产品问题。输出目录继续支持 `OPENTAVERN_TEST_OUTPUT`/`OPENTAVERN_OUTPUT` 并默认使用独立临时目录。
- 结果：`node --check scripts/test-tavern-stage-a-browser.mjs` 通过；本轮未启动 Chrome/Playwright，修复后的真实浏览器复跑仍待主协调者执行。

**R7c 发送辅助夹具缺真实群聊策略依赖**

- 问题：`scripts/tests/frontend/events.mjs` 的 `assertFrontendSendMessageHelpers` 只装载 `70-send-message-helpers.js`，并自行 mock `isGroupChat`、`parseGroupMention`、`getNextGroupSpeaker`。真实 `prepareGroupSpeakerForUserMessage` 还会调用 `findGroupMemberByName` 与 `getGroupSpeakerForUserMessage`（位于 `32-group-chat-strategies.js`），旧夹具未提供；旧的空成员群聊也不符合真实 `isGroupChat` 要求的至少两名成员。
- 修复：按真实 manifest 顺序补装 `32-group-chat-members.js`、`32-group-chat-speakers.js`、`32-group-chat-message-helpers.js`、`32-group-chat-strategies.js`、`32-group-mention-pill.js`、`32-group-mention-ui.js`，再装载发送辅助分片。群聊夹具使用有效成员 Clicked、Plana、Next（明确 `order` 0/1/2）并放入上一次 assistant 发言 Plana，真实轮流策略因此返回 Next；不 stub 新策略返回值。
- 断言：保留用户消息追加、新会话标题、Clicked 优先、typed `@Plana`、无提及时 Next、单聊不变、重置输入等行为；mock 调用痕迹 `events.includes('next'/'parse'/'clear')` 改为等价可观测状态（`_nextGroupSpeaker` 与 `pendingGroupMention`）。真实策略没有 mock 调用事件，故以解析出的下一位发言者作为等价断言。
- 结果：`node --check scripts/tests/frontend/events.mjs`、单独运行 `assertFrontendSendMessageHelpers`、完整 `node scripts/test-sync-function.mjs` 均通过；未修改产品代码或生成物。

## 第 5 轮恢复引用修复（R8）

- 问题：主协调者新增的独立复现 `/path/to/local-release-evidence` 仅复用 `test-backup-restore-runtime.mjs` 初始化 harness 并执行真实 `buildBackupRestorePlan`，未改产品或用户数据。本机已有 `id=local` 会话，备份同时包含同 ID 的导入父会话、指向它的子分支，以及 `scope=conversation/targetId=local` 的快捷回复；恢复把父会话新建为 `restored-1`，但按钮目标与子分支父引用仍为 `local`，误指本机原会话，影响 04 会话绑定和 10 分支图的备份恢复。同一独立复现还覆盖本机已有 `legacy-preset` 预设时，导入连接档案 `parameters.presetId` 未随预设副本改绑，影响 03 档案的预设引用。
- 修复：`src/app/transfer/63-backup-restore-plan.js` 复用已有 `convMap`，在会话复制映射完成后做一次最小后处理：普通设置与会话同时恢复时，导入 `quickReplyGroups` 中 `scope === 'conversation'` 且目标属于本次导入的 `targetId` 改为恢复副本 ID；导入会话的 `branchOf.conversationId` 在父会话同属本次导入时改为恢复副本 ID。预设复制映射完成后，普通设置与预设同时恢复时，导入连接档案 `parameters.presetId` 中属于本次导入的引用改为恢复预设副本 ID。全局/角色范围、未导入目标、仅设置、仅会话或未选预设均不改写；`userMessageId`、未知元数据、传入备份、本机原对象及其他冲突策略保持不变；未新增任意深层字段清洗。
- 回归：`scripts/test-backup-restore-runtime.mjs` 保留 64 组合、可靠保存/回滚/并发/特殊 ID 等全部原断言，新增冲突副本的按钮目标、分支父与档案预设引用映射、无冲突导入、仅设置、仅会话、未导入父/目标/预设、源对象与本机数据不变、真实 commit、保存失败不改本机等行为断言。
- 结果：独立复现由失败转为通过（`parentId=restored-1`，按钮目标与分支父均为 `restored-1`，源对象不变；档案预设引用指向 `restored-2` 预设副本）；运行回归见“测试与结果”。本次未运行构建、浏览器、真实供应商、手机真机、部署或发布。

## 第 6 轮验收修正（R9–R10）

**R9 连接档案关联预设冲突映射**

- 复核：主协调者扩充独立复现 `/path/to/local-release-evidence`，在同一引用恢复测试中追加“本机已有 `legacy-preset`，导入预设同 ID 冲突，`activePresetId` 映射为 `restored-2` 时，导入档案 `connectionProfiles[0].parameters.presetId` 是否同步映射”。既有 `buildBackupRestorePlan` 已在预设复制映射完成后复用 `presetMap` 改写 `settingsPatch.connectionProfiles[].parameters.presetId`，独立复现通过，本轮不重复改产品代码。
- 回归：`scripts/test-backup-restore-runtime.mjs` 保留原冲突/无冲突/仅设置/未导入引用断言，新增“仅恢复预设不改连接档案”和“同一映射计划保存失败时本机状态不变”断言；预览与保存均不改传入备份。
- 结果：独立复现输出档案预设引用与 `activePresetId` 指向同一恢复副本；运行回归通过。未改 `63-backup-restore-plan.js` 本轮既有映射逻辑。

**R10 自动轮次异步失败被 HTML dialog 遮挡**

- 问题：真实 Chrome 审查在 09 失败模型场景点击 `#appDialogOkBtn` 超时。群聊配置由 `openFeatureDialog` 的 `dialog.showModal()` 放入 top layer；自动轮次异步失败仍调用 `alert`，实际落到普通 `#appDialogModal`，z-index 无法越过原生 modal，错误和确定按钮被群聊配置窗口拦截。
- 修复：`src/app/conversation/32-group-chat-strategies.js` 新增最小错误呈现函数。失败时若存在打开的 `dialog.feature-dialog[open]`，把“自动轮次已停止：生成失败。”与实际错误写入该窗口既有 `.feature-error`（`role="alert"`）；没有二级对话框时才沿用原 `alert`/玻璃提示。未改全局 alert、UI 默认、其他窗口草稿或通知框架。
- 行为保持：仍以 `run.turnActive` 保护当前旧请求所有权；失败路径释放 `state.isGenerating`，`cancelGroupAutoRounds` 停止后续轮次，不调用助手完成保存路径，不产生新助手消息。
- 回归：`scripts/test-tavern-stage-a-runtime.mjs` 新增“打开二级对话框时错误写入 `.feature-error` 且不弹玻璃框”的纯运行断言；原有“无对话框时提示一次”断言保留。`scripts/test-tavern-stage-a-browser.mjs` 失败用例改为在群聊配置窗口内等待实际错误，断言错误可见、`#appDialogModal` 不可见、请求只发一次、生成锁释放、自动轮次为空且助手消息数不增；随后通过真实取消按钮关闭配置窗口，再在无二级窗口时验证玻璃提示可点击关闭，之后继续分支图、预设差异和移动/浅暗/系统矩阵。未 force 点击、未删除断言。
- 结果：运行回归通过；浏览器脚本通过 `node --check`，本轮未启动 Chrome/Playwright。真实浏览器复跑、完整检查与构建仍待主协调者执行。

## 第 7 轮验收修正（R11）

**R11 连接档案思考参数对象与显式 null 丢失**

- 问题：主协调者新增的独立复现 `/path/to/local-release-evidence`（外部脚本未修改）在真实 `ensureConnectionProfiles`、`getCloudSyncPortableSettings` 与 `buildConnectionProfileProjection` 上输出 `mainNullPreserved=false`、`summaryObjectPreserved=false`、`mainNullPortable=false`。`src/app/connections/31-connection-profiles.js` 的 `normalizeConnectionProfileParameters` 只特判 `thinking` 对象，既不保留显式 `thinking: null`，也未把 `summaryThinking` 作为对象处理；默认设置的主/摘要思考均为 `null`，而 `41-prompt-controls.js` 的 `applyExplicitReasoningParameters` 支持对象。结果是主档案“关闭思考”的显式 null 在迁移/保存/导出时被丢弃，切回档案可能保留前一档案的 thinking 对象；独立摘要的 `summaryThinking` 对象同样丢失，影响 03 档案完整捕获与切换。
- 修复：`normalizeConnectionProfileParameters` 把 `thinking` 与 `summaryThinking` 同等处理：保留受支持的普通对象并独立深复制，同时保留显式 `null`；未提供的键仍不进入结果，保持“未指定”与“显式 null”的区别。主/摘要键仍由各自用途的已知参数键列表限定，不混用，也不新增参数或 UI。投影沿用既有 `!== undefined` 判断：显式 `null` 投影为清除，对象投影为独立副本。
- 回归：`scripts/test-tavern-stage-a-runtime.mjs` 新增 `testConnectionProfileReasoningCapture`，覆盖真实旧设置迁移（主显式 null、摘要对象，主/摘要互不吸收对方键）→ 云同步可移植与导出/导入往返 → 保存新档案（对象深复制不受编辑器草稿别名影响，摘要显式 null 经再次归一化保留）→ 投影语义（未记录字段不投影、显式 null 投影为清除、对象独立、主/摘要互不覆盖）→ 真实 `applyConnectionProfileSelection` 切换与持久快照（主 null 清除前一对象，摘要对象或 null 恢复且不影响主配置）。原有迁移配对、凭据存储、事务快照与恢复映射断言保留。
- 结果：独立复现由失败转为通过，输出 `{"mainNullPreserved":true,"summaryObjectPreserved":true,"mainNullPortable":true}`；阶段 A 运行回归通过。本轮未运行浏览器、构建、真实供应商、手机真机、部署或发布；这些项目仍待主协调者验收。

## 03 连接档案

**已实施**

- 新增 `src/app/connections/31-connection-profiles.js`、`connections/68-connection-profiles-ui.js`，在 `src/ui/html/settings/model.html` 增加主回复、摘要、Embedding 档案选择入口。
- `settings.connectionProfiles` 只存可移植描述；`activeConnectionProfileIds` 分别记录三种用途。迁移从当前实际主/摘要配置生成等值默认档案，不主动投影或改变现有服务、模型、流式/提示词配置。
- 主/摘要投影只覆盖各自字段，切换主档案不改变摘要独立选择。主档案 `thinking` 与摘要档案 `summaryThinking` 保留受支持对象或显式 `null`，未记录字段不投影、显式 `null` 切换时清除上一档案值。Embedding 本阶段只保存描述与选择，未提供“建立索引”按钮，也不会发起请求。
- 档案密钥在 `saveApiKey=true` 时写入独立本机存储 `opentavern_connection_profile_credentials`，记录协议与端点指纹；端点/协议变化后不再匹配旧密钥。写入后回读校验，配额或写入失败会回滚内存凭据并在编辑器报可重试错误，不显示已保存。`saveApiKey=false` 时只在内存使用，并尽力清除该存储；普通持久化与档案事务快照都会遵守该策略，刷新后不留密钥。
- 档案增删改、复制、导入、导出和选择走候选 + `persistState(true, {throwOnError})`；失败保留旧状态和可重试草稿。生成中、恢复/清空/云同步中、设置草稿冲突均拒绝切换。删除当前档案必须选择替代档案。
- 连接档案的嵌套凭据脱敏覆盖普通持久化、云同步出入站与备份恢复计划：档案只保留白名单描述，`thinking` 等对象内的密钥键再剔除。既有顶层本机字段策略不变；预设、角色等原始导入元数据不再被递归删除。
- 备份恢复同时选择普通设置与预设库时，导入档案的 `parameters.presetId` 中属于本次导入的预设引用随预设冲突副本映射；未导入引用、仅设置与仅预设选择保持原语义，保存失败不改本机状态。
- 旧配置密钥迁移只在档案协议/端点与旧主连接或旧独立摘要端点配对时绑定；远端替换的新端点不会继承旧密钥，`summarizeUseMainAPI` 为真时不迁移摘要密钥。
- 主连接模型测试增加档案草稿代次 fence；档案编辑器的模型发现结果在草稿变化或关闭后丢弃。

**限制**

- 真实供应商的端点/模型发现、浏览器 CORS、真实密钥与真实刷新后凭据读取未由本次运行测试证明；隔离浏览器脚本已覆盖合成模型与刷新路径，但尚未执行。
- Embedding 远程调用、索引与检索属于后续阶段；本阶段没有对应运行时。
- 旧普通设置中的 `apiKey`/`summarizeApiKey` 与档案凭据的同步仅通过迁移和档案编辑器保存；没有新增密钥轮换或外部密钥库。

## 04 快捷回复

**已实施**

- 新增 `src/app/quick-replies/32-quick-replies.js`、`quick-replies/67-quick-replies-ui.js`，在聊天输入区增加按钮条，并保留二阶段模型选项原状。
- 按钮组支持新建、复制、重命名/编辑、删除、上移/下移、启停；按钮支持名称、正文、插入/直接发送、启停和排序。
- 绑定范围为全局、角色、会话；按组 ID 去重，会话可用 `conv.quickReplyDisabledGroupIds` 停用继承组。
- 默认插入；非空草稿追加，直接发送出现选择“追加/替换”，不静默覆盖。直接发送复用真实 `sendMessage`，生成中、保存中、恢复/云同步中拒绝；双击由同步 guard 防重。
- 扩展文本只调用现有宏替换；未知宏保留，不执行 JavaScript、shell 或新命令语言。
- 导入的按钮一律重置为插入；导出/云同步不含密钥。快捷回复保存在普通设置，随备份/恢复/云同步。恢复同时选择普通设置与会话时，导入的会话范围按钮组目标随冲突会话副本映射；全局/角色范围、未导入目标及仅设置/仅会话选择不改写。

**限制**

- 真实中文输入法组合态、手机 Chrome 真机点击区域和真实供应商发送未由本次运行测试证明。
- 直接发送复用普通发送，因此仍受现有 API 配置、附件数量和保存错误保护约束；没有新增队列或离线重放。

## 09 群聊策略

**已实施**

- 新增 `src/app/conversation/32-group-chat-strategies.js`、`conversation/67-group-chat-strategies-ui.js`，并接入 `getNextGroupSpeaker`、发送准备、生成完成、停止、切会话、删除会话及成员/策略变更入口。
- 无策略的旧群聊继续走原轮流逻辑。手动、自然、概率策略使用本地规则；自然策略按近期提及和最久未发言选择，概率按非负权重选择，随机源可注入固定值用于测试。
- `@` 优先，静音成员不参与；所有可用成员权重为 0、全静音、手动未选择或无可用成员时给出原因并停止。
- 策略保存校验显式 mode；缺省 mode 仍按轮流兼容，非法字符串/类型/对象被拒绝而不是归一。
- 自动轮次由用户启动，固定 1–10 步、1–30 秒间隔；一次成功保存的助手回复计一步。失败、空回复、保存失败、切会话、修改成员/策略和页面恢复终止；不持久化自动运行状态，刷新后不会自动继续。
- 自动轮次的“停止”只取消未来轮次：当前已发出的请求仍按 `handlePrimaryAssistantComplete` 正常结算并保存，之后不再排下一轮；普通停止按钮中止当前请求，中断完成仍会释放状态。取消/失败都释放生成锁；迟到或重复的完成回调不会清除新请求的锁。
- 自动轮次异步失败时，若已有打开的二级 HTML 对话框，实际错误写入该窗口现有 `.feature-error`，不另开被原生 top layer 遮挡的玻璃提示；没有二级窗口时才使用原玻璃提示。失败仍停止后续轮次且不保存助手回复。
- 自动轮次调用真实 `streamChat` / `handlePrimaryAssistantComplete` / `completeGenerationTurn`，复用二阶段、摘要、停止和可靠保存，不调用裁判模型。

**限制**

- 自动轮次与二阶段/摘要的实际组合只在合成运行时夹具中验证；真实供应商、长时运行、手机真机和页面恢复后的真实浏览器检查未由本次运行测试证明。
- 手动模式必须显式选择下一位发言者；未选择时发送被阻止，不静默改为其他成员。

## 10 分支图

**已实施**

- 新增 `src/app/conversation/32-conversation-branches.js`、`conversation/67-conversation-branches-ui.js`，在聊天工具增加只读分支入口。
- 复用 `branchOf` 与稳定消息 ID，展示父链、同源/嵌套分支、分叉处摘要和当前高亮；回复版本不作为独立节点。恢复同时导入父子会话时，子分支 `branchOf.conversationId` 随父会话副本映射，`userMessageId` 保持；父会话未导入时保持原引用。
- 父会话缺失、分叉消息删除、孤立分支和循环引用均说明并停止展开。浏览不写消息、不发模型请求。
- “打开会话”沿用普通入页定位；“查看分叉处”复用 `jumpToConversationMessage` 扩大历史窗口并定位目标，随后不被普通底部对齐覆盖。

**限制**

- 手机真机折叠/长树滚动未由本次运行测试证明；隔离浏览器脚本覆盖 390/1280 视图，但尚未执行。
- 没有新增合并、删除剧情、批量改历史或第二套来源关系。

## 13 预设差异

**已实施**

- 新增 `src/app/presets/62-preset-diff.js`、`presets/62-preset-diff-ui.js`，在预设库增加“比较预设”，SillyTavern 单预设导入改为先打开候选差异再保存。
- 比较提示词稳定 ID、顺序、启停、角色、位置/深度、采样参数、正则和保留元数据；缺失与显式空值区分，对象键顺序排序后比较，真实提示词顺序单列。
- 无稳定 ID 的旧格式按新增/删除处理，不按同名匹配。长文本按行及词级差异渲染，全部通过 `textContent`/转义写入，不把恶意 HTML 当 DOM。
- 比较只读；导入候选的保存继续调用现有 `addLibraryPreset` 可靠事务，不增加自动合并/应用链路。

**限制**

- 超大预设的性能和手机真机可读性未由本次运行测试证明；浏览器脚本包含合成大文本与 390/1280 截图，但尚未执行。
- 比较的是预设/导入候选，不是历史实际模型请求。

## 测试与结果

第 2 轮返工已实际运行并通过：

- `node scripts/test-tavern-stage-a-runtime.mjs`：在原有用例上新增五份独立复现对应的回归——原始预设元数据出站/入站往返不变、旧密钥迁移配对（主/摘要/远端替换/继承）、真实 `persistState` + `StorageService` 下 canonical 与 pending 快照遵守 `saveApiKey=false`、凭据存储抛错/静默丢失/回读/仅内存四路径、群聊显式非法 mode、自动轮次取消后成功/错误/主停止/迟到回调结算、切会话与删除确认取消不提前取消轮次。
- 5 份主协调者独立复现脚本（artifact 根目录）：`independent-profile-metadata.mjs`、`independent-profile-redirect.mjs`、`independent-profile-persistence.mjs`、`independent-group-guards.mjs`、`independent-auto-stop.mjs`，全部通过。它们由主协调者在退出后再次运行确认。
- `node scripts/test-private-settings-runtime.mjs`、`test-settings-runtime.mjs`、`test-chat-operations-runtime.mjs`、`test-preset-transactions-runtime.mjs`、`test-convenience-runtime.mjs`、`test-backup-restore-runtime.mjs`、`test-conversation-transfer-runtime.mjs`、`test-message-reliability-runtime.mjs`、`test-storage-timeouts-runtime.mjs`、`test-local-render-runtime.mjs`、`test-app-contracts.mjs`、`check-app-contracts.mjs`。
- `node --check` 通过本轮修改的 `src/app/` 分片、i18n 与浏览器脚本。

`node scripts/test-source-structure.mjs`：本轮重跑，清单覆盖与目录断言通过，随后在临时夹具 `spawnSync(process.execPath, ...)` 处返回 `status=null`（当前执行环境无法派生子 Node 进程），未进入产品断言。没有把该环境失败计为产品通过，仍需主协调者在正常环境确认。

第 3 轮（验收夹具修复）实际运行：

- `node --check scripts/tests/frontend/conversation.mjs`、`node --check scripts/test-tavern-stage-a-browser.mjs` 通过。
- 单独运行 `assertFrontendGroupChatCoreHelpers` 通过（补装 `32-group-chat-strategies.js` 后，原轮流、身份和 `@` 断言全部保留）。
- `node scripts/test-sync-function.mjs`：修复前在 `scripts/tests/frontend/conversation.mjs:378` 因 `__next` 返回 `null` 失败；补装策略依赖后越过该断言，但在 `scripts/tests/frontend/events.mjs:223` 因该夹具未提供 `findGroupMemberByName` 失败。完整检查仍未通过，未计为通过。

第 4 轮（发送辅助夹具修复）实际运行：

- `node --check scripts/tests/frontend/events.mjs`、`node --check scripts/test-tavern-stage-a-browser.mjs` 通过。
- 单独运行 `assertFrontendSendMessageHelpers` 通过；使用真实成员、轮流策略与提及依赖，不使用固定返回桩。
- `node scripts/test-sync-function.mjs` 完整通过，输出 `frontend and sync function tests passed`。
- `npm run check`：在 `scripts/check-bundle-drift.js` 调用的 `spawnSync` 处以 EPERM 中止，输出 `Bundle rebuild failed, original bundle restored.`；最小 `spawnSync(process.execPath, ...)` 复现同为 EPERM，属当前执行环境限制，未进入产品断言。该脚本只将原 bundle 字节写回，未产生内容改动；本轮未手工改生成物。
- 跳过上述 EPERM 阻塞项后逐条运行完整检查的其余 JS 命令：`test-card-catalog`、`test-card-runtime`、`test-prompt-controls-runtime`、`test-chat-operations-runtime`、`test-settings-runtime`、`test-convenience-runtime`、`test-backup-restore-runtime`、`test-interface-onboarding-runtime`、`test-conversation-transfer-runtime`、`test-private-settings-runtime`、`test-mvu-parser`、`test-mvu-runtime`、`test-mvu-integration`、`test-card-execution-runtime`、`test-card-broker`、`test-message-reliability-runtime`、`test-storage-timeouts-runtime`、`test-tavern-stage-a-runtime`、`test-sync-v2`、`test-sync-v2-backend`、`test-local-first-runtime`、`test-api-protocol-runtime`、`test-user-images-versions-runtime`、`test-preset-transactions-runtime`、`test-stream-drafts-runtime`、`test-streaming-transfer-runtime`、`test-worldbook-bindings-runtime`、`test-app-contracts`、`check-app-contracts` 均通过。
- `node scripts/test-source-structure.mjs`：与第 2 轮相同，在临时夹具 `spawnSync(process.execPath, ...)` 处因 `status=null`（EPERM）失败，未进入产品断言。
- `python -B -m unittest server.test_opentavern_sync_server server.test_opentavern_sync_v2`：运行 66 项，53 项通过、13 项 error；全部 error 为当前 Windows 临时目录的 `PermissionError` / `unable to open database file`（临时目录清理与创建权限），不是断言失败，也不计为 Python 套件通过。

第 5 轮（恢复引用修复）实际运行：

- `node scripts/test-backup-restore-runtime.mjs`：通过，保留 64 组合、依赖重映射、非法输入、凭据、可靠确认、并发聊天、迟到失败/清空、特殊 ID 与同步排除等原断言，并新增冲突副本按钮目标/分支父/档案预设引用映射、无冲突、仅设置、仅会话、未导入父/目标/预设、源对象与本机数据不变、真实 commit 和保存失败回滚。
- `/path/to/local-release-evidence`：通过，输出 `parentId=restored-1`，按钮目标与分支父均为 `restored-1`，源备份不变，档案预设引用指向恢复预设副本；未修改该外部独立测试文件。
- `node scripts/test-tavern-stage-a-runtime.mjs`、`node scripts/test-convenience-runtime.mjs`、`node scripts/test-user-images-versions-runtime.mjs`、`node scripts/test-conversation-transfer-runtime.mjs`、`node scripts/test-chat-operations-runtime.mjs`、`node scripts/test-private-settings-runtime.mjs`、`node scripts/test-message-reliability-runtime.mjs`、`node scripts/test-preset-transactions-runtime.mjs`：均通过。
- `node --check src/app/transfer/63-backup-restore-plan.js`、`node --check scripts/test-backup-restore-runtime.mjs`：通过。
- 未运行 `npm run build`、完整 `npm run check`、浏览器、真实供应商、手机真机、部署或发布；本轮环境限制与第 4 轮相同，未把未运行项计为通过。

第 6 轮（R9–R10）实际运行：

- `node --check src/app/conversation/32-group-chat-strategies.js`、`node --check src/app/conversation/67-group-chat-strategies-ui.js`、`node --check src/app/transfer/63-backup-restore-plan.js`、`node --check scripts/test-backup-restore-runtime.mjs`、`node --check scripts/test-tavern-stage-a-runtime.mjs`、`node --check scripts/test-tavern-stage-a-browser.mjs`：全部通过。
- `node scripts/test-backup-restore-runtime.mjs`：通过，保留 64 组合及第 5 轮全部恢复映射断言，新增仅恢复预设不改连接档案、保存失败不改本机档案预设引用。
- `node scripts/test-tavern-stage-a-runtime.mjs`：通过，新增打开二级对话框时实际错误写入 `.feature-error` 且不弹玻璃框；原无对话框提示、取消/停止/迟到回调所有权断言保留。
- 六份协调者独立复现脚本 `independent-profile-metadata.mjs`、`independent-profile-redirect.mjs`、`independent-profile-persistence.mjs`、`independent-group-guards.mjs`、`independent-auto-stop.mjs`、`independent-restore-bindings.mjs`：全部通过；其中 restore-bindings 同时输出快捷回复目标/分支父为 `restored-1`、档案预设引用随恢复预设副本，源备份不变。
- `node scripts/test-sync-function.mjs`、`node scripts/test-app-contracts.mjs`、`node scripts/check-app-contracts.mjs`、`node scripts/test-private-settings-runtime.mjs`、`node scripts/test-convenience-runtime.mjs`、`node scripts/test-conversation-transfer-runtime.mjs`、`node scripts/test-chat-operations-runtime.mjs`、`node scripts/test-message-reliability-runtime.mjs`、`node scripts/test-preset-transactions-runtime.mjs`：均通过。`test-app-contracts.mjs` 在系统临时目录构建合成夹具，未改写仓库 `assets/js/app.js`。
- 未运行 `scripts/test-tavern-stage-a-browser.mjs`（未启动 Chrome/Playwright）、`npm run build`、完整 `npm run check`、真实供应商、手机真机、部署或发布；未把浏览器或完整检查计为通过。

第 7 轮（R11）实际运行：

- `node --check src/app/connections/31-connection-profiles.js`、`node --check scripts/test-tavern-stage-a-runtime.mjs`：通过。
- `node scripts/test-tavern-stage-a-runtime.mjs`：通过，新增思考参数捕获/可移植/导出导入/保存/投影/切换隔离断言；原有迁移配对、凭据存储失败、事务快照、恢复引用、快捷回复、群聊策略及分支/预设差异断言保留。
- `/path/to/local-release-evidence`：通过，输出 `{"mainNullPreserved":true,"summaryObjectPreserved":true,"mainNullPortable":true}`；显式 null 投影清除前一配置，摘要对象独立保留。
- 原六份独立复现 `independent-profile-metadata.mjs`、`independent-profile-redirect.mjs`、`independent-profile-persistence.mjs`、`independent-group-guards.mjs`、`independent-auto-stop.mjs`、`independent-restore-bindings.mjs`：全部通过。
- `node scripts/test-private-settings-runtime.mjs`、`node scripts/test-api-protocol-runtime.mjs`、`node scripts/test-preset-transactions-runtime.mjs`、`node scripts/test-settings-runtime.mjs`、`node scripts/test-backup-restore-runtime.mjs`、`node scripts/test-sync-function.mjs`、`node scripts/test-app-contracts.mjs`、`node scripts/check-app-contracts.mjs`：均通过。`test-app-contracts.mjs` 在系统临时目录构建合成夹具，未改写仓库 `assets/js/app.js`。
- 未运行 `scripts/test-tavern-stage-a-browser.mjs`（未启动 Chrome/Playwright）、`npm run build`、完整 `npm run check`、真实供应商、手机真机、部署或发布；该浏览器脚本保留主协调者上一轮补充的成功提示真实确定/隐藏等待，本轮未修改也未执行，整组浏览器仍待主协调者验收。

未运行：

- `node scripts/test-tavern-stage-a-browser.mjs`：主协调者最近一次真实运行已越过 03 管理/凭据失败、04 快捷回复与刷新、09 正常轮次/停止/普通 abort/切会话确认，随后在失败模型场景点击 `#appDialogOkBtn` 时因群聊配置原生 dialog 拦截而超时。第 6 轮已把失败用例改为在配置窗口内断言实际错误、无遮挡玻璃框、单次请求、锁释放且无助手新消息，并通过真实取消关闭窗口后验证玻璃提示路径；本轮未启动 Chrome/Playwright，整组真实浏览器复跑仍待主协调者执行。
- `npm run build`、`npm run check:release`、Sites/ECS 部署、真实供应商、手机 Chrome 真机未运行。`npm run check` 已尝试，但在 bundle 漂移检查前因 EPERM 中止（见第 4 轮）；本轮未重复构建，也没有把完整检查、Python 套件或浏览器计为通过。

## 第 7 轮交接待办（历史，最终结论见顶部）

1. `1f961e3525ab774456035b87` 已由主协调者重建；如再修改源码，再统一重建 `assets/js/app.js`、`index.html`、`assets/css/app.css` 并确认 bundle 漂移检查。
2. 第 4 轮已在允许范围内修复 `scripts/tests/frontend/events.mjs` 的发送辅助夹具，`node scripts/test-sync-function.mjs` 通过；第 5 轮修复恢复引用产品逻辑并扩展 `test-backup-restore-runtime.mjs`；第 6 轮补充档案预设引用失败保护与自动轮次对话框内错误呈现；第 7 轮修复 03 档案 `thinking`/`summaryThinking` 的对象与显式 `null` 捕获。仍需在正常环境重跑完整 `npm run check`：本执行环境的 `check-bundle-drift.js` 与 `test-source-structure.mjs` 在 `spawnSync` 处 EPERM，Python 套件受临时目录权限阻塞（66 项中 13 项 error）。
3. 按正常隔离入口启动静态服务，复跑 `node scripts/test-tavern-stage-a-browser.mjs`（支持 `OPENTAVERN_TEST_URL`、`OPENTAVERN_TEST_OUTPUT` 或 `OPENTAVERN_OUTPUT`、`OPENTAVERN_PLAYWRIGHT_MODULE`），重点确认失败模型场景不再等待被遮挡的 `#appDialogOkBtn`，配置窗口内错误可见、无待确认玻璃框、请求一次且无助手新消息；检查输出目录中的 `report.json`、截图、`pageerror` 和横向溢出；如采用发布门禁，再接入对应浏览器组。
4. 独立复核档案密钥未进入导出/备份/云载荷；真实供应商、手机真机、Sites/ECS 分别记录，不以合成结果代替。
5. 七份独立复现脚本（含 restore-bindings 的档案预设引用扩大场景与 profile-thinking 的思考参数捕获场景）本轮已通过；五份既有脚本与两份真实 Chrome 自动停止复现已由主协调者确认通过，可按需再次运行。
6. 决定是否提交、推送和发布。本记录不包含这些动作。

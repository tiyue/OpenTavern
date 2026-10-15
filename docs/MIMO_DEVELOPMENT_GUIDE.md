# MiMo 开发指导与验收任务书

编写日期：2026-10-13。审查基线：`c951506a75e80d434bbf623e5978093956443ef2`（第 12 版修复后的本地源码）。状态：**用户指定协调者接手 MiMo 后续工作；T01–T10 已完成最终同产物检查并发布第 13 版，T11 基础真实模型验收与发布交接完成，未实测项单独记录。实际结果见 [验收记录](MIMO_ACCEPTANCE_RECORD.md)。**

本轮目标是修复已复现的五类内容与状态错误，补上交叉回归，再逐批优化模块边界。先完成正确性修复，不在同一批次重写存储、同步、UI 或全部构建体系。后续源码若已偏离审查基线，协调者须核对差异、重新复现，再发出收窄后的任务。

完整交付包括 [T01–T11 全量任务包](tasks/README.md) 与 [逐文件执行清单](tasks/mimo-task-plan.json)：每项都有完整任务书，不再仅提供 T01 或后续路线概述。每项通过独立验收才进入下一项，不能把已准备任务书或执行器正常结束算作修复完成。

## 1. 分工与修改边界

本次用户最终要求（2026-10-14）：代码由 GPT 直接编写、修改和审查；DeepSeek 仅可用于应用验收请求。以下 MiMo 分工与入口保留为原任务计划和历史实施依据，不代表本次继续派发。实际结果以验收记录为准。

- 主协调者负责准备任务与独立副本、审查实际差异、独立验收、合并、提交和发布。MiMo 负责指定任务的代码和回归实施，不能递归启动模型、执行器或其他代理，不能提交、推送或发布。
- 使用全局入口 `<worker-root>\worker.ps1`，显式指定 `-Provider mimo`。按当前入口配置使用 `mimo-v2.6-pro` 和 MiMo Responses API；密钥由进程或 Windows 用户环境变量 `MIMO_API_KEY` 读取，不写入任务、源码、日志或命令参数。任务及相关源码会发送给 MiMo 服务端。
- 每次写入任务使用协调者准备的独立工作副本，提供 `Mode=workspace-write` 和逐文件 `AllowedFiles`。**不得修改无关部分，不得覆盖主工作区已有修改。** 发现必须增加文件时先报告调用关系和必要性，由协调者收窄或重发任务；不能自行扩大范围。
- T01–T10 顺序执行，每个任务验收后再以已验收源码准备下一副本；T11 由协调者总验收和处理发布交接。多个任务共享提示词、生成与渲染文件，禁止同时修改这些文件。
- 仅修改 `src/app/` 业务源码及该任务列明的测试、规格。`assets/js/app.js`、`index.html`、`assets/css/app.css` 是构建产物，不能手改；`dist/`、`.sites-public/` 由协调者构建生成。本批不修改后端、同步协议、依赖或 UI 样式。
- 保留消息 ID/修订、回复版本、备份兼容、可靠保存、逐卡许可和隔离协议。保留正则真正执行的 500ms 终止保护、10s 装载期限、准备握手及旧页面直发任务兼容，不通过放宽保护或吞错解决问题。
- TTS 已取消；不得重新开发。保持 HTTP/本机/HTTPS 支持，不新增强制 HTTPS。L3 独立联网服务未部署，本批不部署该服务。

项目规范见 [AGENTS.md](../AGENTS.md)，当前行为见 [功能规格](spec.md)，结构边界见 [SOURCE_STRUCTURE.md](SOURCE_STRUCTURE.md)。有多种可行处理时，先写明行为差异和取舍；优先最小补丁。**不得顺手修改无关代码、注释、格式或死代码。**

## 2. 审查事实与实施顺序

2026-10-13 只读审查中，`npm run check` 通过（含 66 项 Python 测试），但真实源码 VM 和隔离 Chrome 仍复现以下问题。模拟请求没有使用用户聊天数据或真实模型凭据；这些反例不能被直接等同于所有线上报错的原因。

| 顺序 | 优先级 | 已复现问题 | 完成标准 |
| --- | --- | --- | --- |
| T01 | P1 | 停止提示词构建后，旧宏变量仍覆盖后来的值 | 停止后零模型请求、零迟到变量覆盖；旧操作不能结束新操作 |
| T02 | P1 | SSE 错误帧和 `finish_reason` 被当作普通完成；JSON 路径丢失结束原因 | 正常、截断、错误可区分；失败或截断重生成保留原完整回复 |
| T03 | P1 | 正文中的 XML 代码示例被识别为选项；未闭合示例截掉后续正文 | 示例保留为代码，正文保存和显示完整；真正二阶段选项仍可用 |
| T04 | P1 | 同一历史消息同步/异步正则使用不同 MVU 状态 | 完成后的两条路径使用相同来源消息与快照；API 不泄露内部元数据 |
| T05 | P2 | 含脚本的卡片静态预览显示 dream 控制标签 | 静态正文与普通预览一致，可执行源码及授权摘要保持不变 |

原始审查材料位于本机 `<local-evidence>/opentavern-review-20261013`，包含审查报告、复现脚本/JSON、检查日志与截图。该目录是补充证据；下面的反例和验收要求足以在其他独立副本重新复现，不依赖复制此目录。

## 3. 第一批：五个独立修复任务

每个任务遵循“读当前调用链 → 新增能在修复前失败的反例 → 记录实际失败 → 最小修复 → 运行相关回归 → 协调者独立验收”。测试必须调用真实源码，不能以伪造一个正确结果的 stub 替代被修函数。

### T01：停止提示词构建与宏变量提交

可直接执行的完整任务见 [MIMO_T01_PROMPT_CANCEL.md](tasks/MIMO_T01_PROMPT_CANCEL.md)。

复现：系统提示词为 `{{setvar::auditStopped::from_cancelled_build}}`，输入正则让构建等待 Worker。调用 `streamChat` 后立即 `stopGeneration`，把会话变量 `auditStopped` 设为 `user_change_after_stop`，再释放旧构建。当前旧构建回报中断，却把变量重新写成 `from_cancelled_build`。

修改候选范围（T01 的实际 AllowedFiles 就是以下清单）：

- `src/app/generation/50-generation-integrations.js`
- `src/app/generation/52-generation-message-lifecycle.js`
- `src/app/prompt/41-prompt-message-builder.js`
- `src/app/prompt/40-sillytavern-macro-runtime.js`
- `scripts/test-prompt-controls-runtime.mjs`
- `scripts/test-prompt-controls-browser.mjs`
- `docs/spec.md`

取消身份必须传入构建并在异步恢复、下一步推进及变量提交前核验。宏在本次候选环境中计算，仅仍有效的操作可提交。保留普通有效宏行为和只读预览；解决已有变量快照覆盖问题时须明确冲突策略，不得简单用整个旧 `vars` 对象覆盖当前变量。切换会话不得写到新会话，原会话仍有效时遵循现有目标绑定规则，不一律取消。

### T02：统一流式与 JSON 完成信息

完整实施任务：[MIMO_T02_RESPONSE_COMPLETION.md](tasks/MIMO_T02_RESPONSE_COMPLETION.md)。最终 AllowedFiles 以任务书和执行清单为准。

源码入口：`streamChatCompletionResponse` / `readChatCompletionResponse` 所在的 `src/app/generation/50-generation-response-stream.js`。当前 SSE 的宽泛 `catch` 还可能吞掉业务回调异常。

最小反例：

```text
data: {"choices":[{"delta":{"content":"未完成正文"}}]}

data: {"error":{"message":"upstream_overloaded"}}

data: [DONE]
```

另一个反例把错误帧换成 `{"choices":[{"finish_reason":"length"}]}`；JSON 反例为 `{"choices":[{"message":{"content":"未闭合正文"},"finish_reason":"length"}]}`。当前 SSE 会把前两种结果当作 `interrupted:false`，JSON 不提供完成原因。

候选范围，协调者发任务时按实际调用关系收窄：

- `src/app/generation/50-generation-response-stream.js`
- `src/app/generation/50-generation-integrations.js`
- `src/app/generation/50-generation-stream-state.js`
- `src/app/generation/52-generation-runtime.js`
- `src/app/generation/52-generation-second-stage-runtime.js`
- `src/app/chat/67-message-regeneration-runtime.js`
- `scripts/tests/frontend/generation.mjs`
- `scripts/test-message-reliability-runtime.mjs`
- `scripts/test-message-reliability-browser.mjs`
- `docs/spec.md`

要求：显式处理错误帧；SSE/JSON 都保留结束原因；每次请求只结算一次。`length` / `content_filter` 不能伪装为完整回复，未知结束原因不得静默改为 `stop`。JSON 解析错误与业务回调异常分开处理。复用现有失败和未完成版本保护，保留可用部分正文的既有行为；截断重生成不能自动选中替换旧完整版本，无效二阶段不能写入或进入格式纠正成功分支。

验收覆盖：正常 `stop` / `[DONE]`、正常 EOF、用户停止、空闲超时、分块 JSON、可跳过的畸形帧、错误帧后 DONE/EOF、只有错误帧、`length`、`content_filter`、JSON 对应情况、回调异常、二阶段失败保留及重生成旧版本保护。不能为修复新增无限重试或自动提高 Token 预算。

### T03：区分控制选项与 XML 代码示例

完整实施任务：[MIMO_T03_OPTIONS_CODE_BOUNDARIES.md](tasks/MIMO_T03_OPTIONS_CODE_BOUNDARIES.md)。最终 AllowedFiles 以任务书和执行清单为准。

现有 `stripSecondStageOptionBlocks` 直接删除任意 `<options>`，未闭合时删除直至文末；主回复保存前也调用该隔离函数。`renderOptionsXml` 在正文中搜索到选项后可能仅返回按钮。

最小反例（外层是消息内容，内部是模型展示的代码）：

````text
正文开头
```xml
<options><option><title>这是示例</title><description>不能把示例变成选项</description></option></options>
```
正文结尾
````

当前显示会转为选项按钮并丢失前后正文；开启二阶段，再删除示例内最外层 `</options>`，当前隔离结果只剩 `正文开头` 与代码围栏开头，后文被截掉。

候选范围：

- `src/app/prompt/41-second-stage-content-isolation.js`
- `src/app/prompt/41-prompt-history-messages.js`
- `src/app/generation/52-generation-runtime.js`
- `src/app/chat/61-message-content-render.js`
- `src/app/chat/61-message-options-render.js`
- `scripts/tests/frontend/prompt.mjs`
- `scripts/test-generation-format-browser.mjs`
- `scripts/test-static-message-browser.mjs`
- `docs/spec.md`

要求：以消息阶段和代码边界判断用途。主回复中的 fenced/inline code、转义 XML 和普通说明不得被删除或转成按钮；无法确认的未闭合块保留文本与后续正文。主回复保存、历史上下文、流式和最终显示都需验证。

不能简单“忽略所有围栏里的 XML”：**真正默认二阶段输出仍需兼容整体被代码围栏包裹、前后说明文字，以及缺失最外层闭合但存在完整选项的输出**。保留标准化、真实选项点击、自定义二阶段状态栏、最多一次格式纠正、旧选项成功保存后才替换的行为。不要发明选项或强制引入新的输出协议。

验收同时断言消息原文、显示正文和实际请求载荷，不能只检查页面没有抛错。

### T04：历史消息的 MVU 与正则上下文一致

完整实施任务：[MIMO_T04_MVU_REGEX_CONTEXT.md](tasks/MIMO_T04_MVU_REGEX_CONTEXT.md)。最终 AllowedFiles 以任务书和执行清单为准。

同步 `40-character-regex-runtime.js` 的替换上下文带有 `message` / `mvuData`，异步 `40-regex-worker-runtime.js` 的对应上下文缺少它们，会回退到最新状态。提示词构建还需要检查历史映射过程中是否丢失来源消息身份。

最小样本：三条 assistant 消息依次为：

```text
<initvar>{"stat_data":{"name":"earlier"}}</initvar>初始化
```

```text
AAA
```

```text
<UpdateVariable><JSONPatch>[{"op":"replace","path":"/stat_data/name","value":"latest"}]</JSONPatch></UpdateVariable>后续更新
```

对中间历史消息应用规则：查找 `AAA`，替换 `<%= stat_data.name %>`，上下文指向该消息。当前异步得到 `latest`，同步缓存完成后得到 `earlier`。同步首次因 Worker 缓存未完成返回原文是既有行为，**验收比较完成后的结果，不能把首次原文返回误报为本次缺陷**。

候选范围：

- `src/app/prompt/40-regex-worker-runtime.js`
- `src/app/prompt/40-character-regex-runtime.js`
- `src/app/prompt/40-character-prompt-helpers.js`
- `src/app/prompt/41-prompt-message-builder.js`
- `src/app/prompt/41-prompt-history-messages.js`
- `scripts/test-regex-queue-runtime.mjs`
- `scripts/test-prompt-controls-runtime.mjs`
- `scripts/test-prompt-controls-browser.mjs`
- `docs/spec.md`

要求：两条路径明确传递相同的来源消息、MVU 快照、阶段、深度、原文和宏环境；当前模板与历史消息的快照用途须明确。内部保留来源身份/修订直到格式化完成，发供应商前转换成现行 `role/content` 载荷。不能把内部 ID、快照或权限对象发送给模型，也不能让不同消息共享错误缓存。

验收覆盖：历史/最新快照、多条更新、编辑与版本切换、预览不写变量、冷缓存最终刷新、两条路径及实际模拟 API 载荷。继续通过队列优先级、去重、失败不缓存、超时释放和后续任务恢复测试。

### T05：卡片静态预览与普通显示一致

完整实施任务：[MIMO_T05_CARD_STATIC_PREVIEW.md](tasks/MIMO_T05_CARD_STATIC_PREVIEW.md)。最终 AllowedFiles 以任务书和执行清单为准。

`61-message-content-render.js` 的卡片分支在 dream 包装处理前返回；`61-card-runtime-frame.js` 直接对未经该显示处理的内容调用静态渲染。

最小样本：

```html
<dream_plot>
<dream_body>
<script>window.auditMalicious=1</script>
正常叙事正文。
</dream_body>
</dream_plot>
```

当前保存后的卡片静态预览显示 dream 标签，流式普通预览不显示。审查样本脚本未执行，此处已确认的是显示路径不一致，不能描述成已证实脚本隔离失效。

候选范围：

- `src/app/chat/61-message-content-render.js`
- `src/app/card-runtime/61-card-runtime-frame.js`
- `scripts/test-generation-format-browser.mjs`
- `scripts/test-static-message-browser.mjs`
- `scripts/test-card-execution-runtime.mjs`
- `docs/spec.md`

要求：保留原始卡片可执行源码和授权摘要输入，单独处理静态显示内容。不能先删原文里的包装再做 MVU/卡片解析，不能修改脚本字符串、代码示例或未知标签。普通与卡片静态预览正文一致，权限入口保留；恶意脚本/事件不执行、无禁止的外链加载，既有卡片授权与隔离回归通过。

## 4. 验证与交付

### 每个任务的执行器交付

MiMo 只能运行不会改动范围外文件的检查。第一批源码 VM 测试直接读取分片，可在独立副本运行。构建和浏览器验收由协调者执行，因为构建会改动 AllowedFiles 外的产物。不能为了跑构建而放宽为整个仓库可写。

提交给协调者的结果须包含：修改文件及原因、修复前失败证据、修复后命令/退出码/断言、仍未执行的检查、兼容性与回退说明。未运行的检查写“未执行”，失败写具体原因，不能用 `completed` 宣称已验收或已发布。

### 协调者独立验收

1. 查看运行目录 `report.json`、`last-message.md` 与实际 `git diff`。检查范围与用户修改；`runtime_cleanup` 应为 `removed` 或 `absent`，`failed` 要明确处理。执行器正常结束只证明进程结束，不证明修复正确。
2. 在独立副本先运行 `npm run build`，再按任务运行相关源码/可靠保存/正则/MVU/卡片回归；第一批收尾运行 `npm run check`。构建结果仅由构建命令生成，记录源码与产物 SHA。
3. 运行涉及路径的真实隔离浏览器测试。使用模拟模型端点、独立浏览器上下文；不触碰用户存储或生产同步，不把模拟验收写成真实供应商通过。
4. 第一批收尾覆盖以下浏览器交叉测试，并人工查看 390px / 1280px 浅暗主题截图；按任务检查与系统主题相关的现有行为。若缺少浏览器环境，记录未验收并补齐后才能计为完成。

```powershell
node scripts/test-prompt-controls-browser.mjs
node scripts/test-message-reliability-browser.mjs
node scripts/test-generation-format-browser.mjs
node scripts/test-static-message-browser.mjs
node scripts/test-regex-queue-browser.mjs
```

本机已有 Chrome 和 Playwright；使用现有依赖，不自动安装或升级。隔离页面准备：

```powershell
npm run build
npm run prepare:sites
$env:OPENTAVERN_PLAYWRIGHT_MODULE = '<user-profile>\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright\index.mjs'
$env:OPENTAVERN_TEST_URL = 'http://127.0.0.1:8765/.sites-public/opentavern.html'
```

先确认模块路径在当前机器存在；本地静态服务可在独立终端用 `python -B -m http.server 8765 --bind 127.0.0.1` 启动，工作目录必须是被验收副本。占用端口时识别已有服务，不终止不属于本次任务的进程。日志/截图可用 `OPENTAVERN_TEST_OUTPUT` 指向 D 盘本次验收目录；结束后清理本次服务并恢复临时环境变量。

真实供应商验收另行记录，在本机设置中填写凭据，在独立验收会话完成发送、二阶段、重生成、停止和刷新确认。原用户只提供了“预设正则格式化”名称，未提供完整预设/规则；在获得去敏样本前，不宣称其全部规则已验证，也不猜测或重写用户规则。

### 首批总验收矩阵

| 场景 | 必须断言 |
| --- | --- |
| 停止、迟到结果、再开始 | 零旧请求、零旧变量覆盖；新任务状态不被旧任务清除；当前有效宏仍工作 |
| SSE/JSON 完成、截断、错误 | 完成原因一致；只结算一次；旧完整版本与旧选项保留；失败不算可靠提交 |
| 默认/自定义二阶段与 XML 示例 | 默认实际请求、一次格式纠正及保存规则保留；示例与前后正文完整；无伪造选项 |
| 历史/最新 MVU、同步/异步 | 同来源同快照结果一致；编辑/版本失效正确；实际 API 无内部元数据 |
| 普通/流式/卡片静态正文 | 正文一致；原始源码和授权摘要输入未改；脚本/事件/禁止外链仍隔离 |
| 保存失败、旧数据与同步 | 现有可靠保存、消息版本、私有设置过滤、备份与同步回归继续通过 |

合并前再检查主工作区差异，仅合入验收通过的文件，不能用整个副本覆盖主目录。每个任务独立提交；存在其他活跃同项目 Codex Session 时遵循项目规范暂不提交。失败回退到上一个已验收批次，保留失败材料，不发布失败产物。

## 5. 第二、三批：完整优化任务

以下任务已写成完整文件，包含实际文件上限、实施步骤、行为对照与验收要求；前置批次通过后按顺序进行，不并入第一批补丁。

### 第二批：明确生成与显示上下文

在 T01–T05 通过后，按独立任务统一主回复、二阶段及格式纠正的操作身份和设置快照；来源变化/取消/迟到结果复用判定入口。格式化职责按“原文与消息身份 → 正则/MVU 快照 → 内容分段 → 文本/代码/选项/卡片静态显示”整理，可执行卡片源码保持独立。

复用现有 `src/app/generation/50-request-diagnostics.js`，记录阶段、结束原因、实际 Token 预算与规则名；不得记录凭据。二阶段最多 1024 Token 并继承推理参数是待验证风险，不能仅凭审查推测改变预算、增加配置项或重试。先拿到实际供应商结束原因和去敏样本，再发最小适配任务。

验收：同一操作中修改设置只影响后续操作；二阶段/纠正不意外换模型或端点；同输入同快照在各处理路径保持正文语义；不重做存储与同步。

### 第三批：业务模块与发布检查

当前 481 个分片仍拼接到同一个 IIFE，目录拆分尚未消除共享全局。优先按生成传输/流程、格式化、渲染建立显式业务接口，沿用现有构建工具，每次只迁移一个完整业务单元并确认行为一致，不能机械增加碎片。

已发现 `escapeHtml` 与 `registerImportedCharacter` 分别有重复定义，后定义覆盖前定义。具体位置在 `src/app/library/60-public-card-text-ui.js` / `src/app/chat/61-message-text-format.js`、`src/app/transfer/63-conversation-import-merge.js` / `src/app/character/66-character-import-conversation.js`。这是结构风险，尚不能据此认定常规导入流程已损坏。先补可观察行为测试，再按调用者语义处理；不能删除无关回退或死代码。

增加重复顶层符号和依赖检查，逐步减少清单顺序依赖。发布门禁应核对源码 SHA、被测产物 SHA 与打包产物，浏览器检查缺失不能视为通过；复用同一次构建产物或证明重建字节一致。更新 VM 测试装载方式时保留旧数据/入口兼容。

完整任务索引：

| 编号 | 实施任务 | 主要完成标准 |
| --- | --- | --- |
| T06 | [操作上下文与诊断](tasks/MIMO_T06_OPERATION_CONTEXT_DIAGNOSTICS.md) | 主/二阶段/纠正共享操作和设置快照，诊断对应实际请求 |
| T07 | [消息显示业务模块](tasks/MIMO_T07_MESSAGE_DISPLAY_MODULE.md) | 原始源与静态派生内容分开，显示路径实际使用统一接口 |
| T08 | [生成传输业务模块](tasks/MIMO_T08_GENERATION_TRANSPORT_MODULE.md) | 显式依赖、内部闭包、传输与可靠提交职责分开 |
| T09 | [重复符号与依赖检查](tasks/MIMO_T09_SYMBOL_DEPENDENCY_CHECK.md) | 移除已确认隐式覆盖，非法契约在构建前失败 |
| T10 | [浏览器与产物发布检查](tasks/MIMO_T10_RELEASE_GATE.md) | 必测失败不放行，被测资产与打包资产可核对 |
| T11 | [全量验收与发布交接](tasks/MIMO_T11_FINAL_ACCEPTANCE_RELEASE.md) | 协调者汇总证据、真实样本/供应商状态与实际发布结果 |

每项 AllowedFiles 已列入任务书与 JSON 清单；不授权整目录写入或一次性全仓重构。T07/T08 使用现有构建体系，通过业务闭包和显式依赖建立边界，不强制全项目 ESM 或更换工具。

## 6. 全量任务调用与接收

统一调用示例见 [全量任务包](tasks/README.md#任意-mimo-任务的统一调用)，通过 [mimo-task-plan.json](tasks/mimo-task-plan.json) 选择 T01–T10 中当前满足前置条件的任务，以真实 PowerShell 数组传入本项 AllowedFiles。每次使用独立副本，逐项独立验收；不能把全部任务串成无需审查的自动循环。T11 由协调者执行。

首次准备任务书时尚未启动 MiMo，授权后的实际执行状态见验收记录。入口保持 `-Provider mimo`、`-Mode workspace-write`，运行记录位于 `<local-evidence>/runs`；核查本次 `report.json`、`last-message.md`、实际 diff 和 `runtime_cleanup`。范围检测发生在执行结束后，不能替代独立审查。

全部计划项均须有完成证据，不能只交付一个任务就报告全量优化完成。未执行的真实预设、供应商或发布条目如实记录；只有部署成功才更新 [SITES.md](SITES.md) 的实际发布结果。

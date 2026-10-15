# MiMo 开发验收进度

日期：2026-10-13。任务总入口：[T01–T11](tasks/README.md)。**T01–T10 已完成最终同产物检查并发布第 13 版；T11 基础真实模型验收与发布交接完成，未实测项单独记录。**

| 任务 | 当前状态 | 证据 |
| --- | --- | --- |
| T01 停止构建与宏提交 | 已独立验收并合入 | 下文 T01 |
| T02 响应完成原因 | 已独立验收并合入 | 下文 T02 |
| T03 XML 代码边界 | 已独立验收并合入 | 下文 T03 |
| T04 MVU/正则快照 | 已独立验收并合入 | 下文 T04 |
| T05 卡片静态预览 | 已独立验收并合入 | 下文 T05 |
| T06 操作/设置/诊断 | 已独立验收并合入 | 下文 T06 |
| T07 显示模块 | 已独立验收并合入 | 下文 T07 |
| T08 传输模块 | 已独立验收并合入 | 下文 T08 |
| T09 符号/依赖检查 | 已独立验收并发布 | 下文 T09/T10 |
| T10 发布检查入口 | 已完成并通过最终门禁 | 下文 T09/T10、T11 |
| T11 总验收/发布交接 | 已发布并完成基础真实模型验收 | 下文 T11 与限制 |

## T01 验收

基线：`dfe70d978e7cf2e5a195ae65542824a4a86a314a`。执行副本及审查材料位于本机 `<local-evidence>/opentavern-mimo-20261013-071152`。后续任务从本次独立提交接续，不能把任务书准备当作代码完成。

- 修复前：真实源码回归确认停止后 `auditStopped` 被改为 `from_cancelled_build`，应保留 `user_change_after_stop`；基线 Chrome 也复现了同一变量覆盖。修复后独立 Chrome 复现值为 `user_change_after_stop`，中断回调一次、无模型请求。
- 实现：四个生成/提示词文件保护操作身份、来源修订和异步恢复，宏候选按基线差异提交，冲突整批放弃；正常同步宏和只读预览保留。
- 独立检查：`npm run build`、`npm run prepare:sites`、`check:prompt-controls`、`check:message-reliability`、完整 `npm run check` 均退出 0，完整检查含 66 项 Python 测试。
- 浏览器：`test-prompt-controls-browser.mjs` 退出 0，实际模拟请求 3 次，覆盖构建取消、A/B 迟到及请求发出后停止；`test-message-reliability-browser.mjs` 退出 0，覆盖失败保留、回复版本/刷新、自动总结和迟到保存。390/1280px 浅暗截图已生成，移动预设库浅/暗截图已视觉检查。
- 合并：仅复制 T01 七项允许文件，主工作区重新运行构建，JS bundle 与验收副本在换行归一后内容一致；没有手改产物、修改 UI 源码或覆盖用户数据。最终发布仍须按 T10 核对实际被测与打包字节，不以此换行对照代替发布哈希。

### 返工与报告差异

1. 首次 MiMo 运行 `2026-10-12T23-12-04-982Z-40620` 正常结束，但报告标为 failed：协调者在运行期间创建了 `node_modules` 依赖联接，被范围比较计入越界；不是 MiMo 修改依赖。原报告保留，后续在启动前准备环境。`runtime_cleanup: removed`。
2. 独立 Chrome 发现测试用例把请求发出当成回调完成，断言 `0 !== 1`。返工 `2026-10-12T23-36-32-670Z-26804` 改用 terminal 等待、补旧构建迟到失败，范围内 3 文件、无越界、清理 removed。执行器 Chrome 受 EPERM 限制，未冒称通过；完整 diff 的既有 UI 换行/尾随空格来自协调者构建，仅范围内 diff 检查通过。
3. 协调者继续发现请求停止夹具初始化自引用导致 TypeError。返工 `2026-10-12T23-47-27-392Z-36968` 仅修一个测试文件，无越界、清理 removed；随后协调者真实 Chrome 全部通过。

对应材料：`T01-check.log`、`T01-browser-review.json`、`T01-final-browser/`、`T01-reliability-browser/`；三个运行的 `report.json` / `last-message.md` 在全局 `work/runs` 目录。只有最后独立通过的代码被接收，未将前两次测试失败算作浏览器通过。

## T02 验收

基线为 T01 提交 `062b9ac`，执行副本 `T02/` 位于本次 D 盘协调目录。主工作区只合入九个实际修改的允许文件，并由构建生成 bundle，没有合入独立副本的 UI 换行变化。

- 原缺陷：供应商错误帧在 DONE 前被忽略，SSE/JSON 没有保留截断原因；独立基线脚本完整字节复现。旧代码完整 `[DONE]` 能正常结束，早期 UTF-8 截尾夹具造成的中断不是生产缺陷。
- 行为：统一 `{interrupted, finishReason, completionReason}`，错误不报普通成功；`length`、`content_filter`、未知原因保留为未完成；重生成不替换旧有效回复，截断二阶段不纠正或保存错误格式。普通生成供应商错误沿用错误分支，不存错误前部分正文，原用户消息保留。
- 边界：SSE/JSON 显式绑定请求 controller，旧请求不清新请求状态；读取器 AbortError 独立于 signal 标记；DONE 立即终止；完成回调异常只拒绝返回 Promise，不调用第二终止回调。EOF/fetch 中止转接、非法协议处理的状态清理和下一请求恢复通过；终止错误之后不再处理后续文字。
- 独立检查：构建、Sites 公共页面准备、完整 `npm run check`（66 项 Python）、外部 `T02-extra-after.mjs` 观察器均通过所需断言。观察器故意测试的完成回调异常可观察且没有 unhandled rejection；`body:null` 的直接 parser 启动异常由实际接线处理，其清理在真实接线单测通过，不把直接调用的抛错误判为接线失败。
- 浏览器：`test-message-reliability-browser.mjs` 全流程通过，涵盖 JSON/SSE length/content_filter、供应商错误、版本/刷新、正常发送/自动总结及迟到保存；T01 的 `test-prompt-controls-browser.mjs` 同时通过（3 次模拟请求）。390/1280px 浅暗截图已生成，移动暗色总结管理器已视觉检查。

### T02 返工

初次运行 `2026-10-12T23-54-03-705Z-15856` 范围无越界，但独立审查发现新候选的 controller、读取器中断、DONE 分块和终止回调问题。接续运行 `2026-10-13T00-15-53-724Z-13248` 修正四项；`2026-10-13T00-33-43-277Z-26036` 修正遗漏的 Promise 转接与协议异常清理；`2026-10-13T00-54-23-268Z-36948` 修正错误之后仍读后续文字。实际 Chrome 又发现测试场景未复位，`2026-10-13T01-04-42-100Z-42404` 仅修测试文件，随后整套浏览器通过。所有这些执行均无范围越界、`runtime_cleanup: removed`；执行器 Chrome 不可用的检查由协调者独立完成。

材料：`T02-check.log`、`T02-extra-review-before.json`、`T02-extra-after.json`、`T02-final-browser/`、`T02-prompt-browser/`。失败与第一次候选未被算作完成，原报告保留；协调者最终验收不依赖执行器的 completed 标记。

## T03 验收

基线 `e24038b`。执行副本 `T03/`，范围内八个源码/测试/spec 文件合入；主工作区构建生成 JS bundle，未复制副本的 index.html 换行变化。

- 原缺陷：fenced XML 示例在保存/历史隔离时截尾，显示端以按钮覆盖前后正文；源码和实际模拟 API 载荷复现。现在代码边界外且具有完整有效 option 的控制块才被隔离，未知未闭合块、代码与字面标签保留。普通混合正文与真实选项同时显示，默认二阶段宽容规范化和自定义状态栏保留。
- 审查返工：首次候选遗漏跨代码边界的结束标签和没有 option 的字面容器，独立 VM 给出实际错误并补失败回归；后续字面标签转义又引入真实二阶段含反引号时重复 XML，实际 Chrome DOM 确认后用显式阶段用途修复。最早简化 STATIC 桩的疑点当时未在真实 DOM 重现，未将它算作原缺陷；只接受后续真实复现证据。
- 执行记录：`2026-10-13T01-12-04-078Z-32372` 初次实施、`2026-10-13T04-42-09-914Z-26408` 边界返工、`2026-10-13T04-54-39-445Z-34904` 阶段兼容返工、`2026-10-13T05-03-45-910Z-38888` 仅修浏览器 evaluate 单参数调用；四次均范围无越界、清理 removed。执行器不能启动 Chrome，由协调者完成实测。
- 独立检查：build、prepare:sites、完整 `npm run check` 退出 0（66 项 Python）；边界外部观察器结果与保留原文预期一致。generation-format 浏览器退出 0（5 次模拟请求、Worker 灾难规则隔离恢复），static-message 浏览器退出 0（含长文、攻击输入、流式一致性和原文不回写）；专用二阶段 DOM 探针 buttons=1、containsXml=false。
- 视觉：390/1280px 浅暗截图生成，移动浅色静态消息及桌面暗色生成界面已检查。证据位于 `T03-check.log`、`T03-boundary-before.json`/`after.json`、`T03-stage-browser-after-boundary.json`/`final.json`、`T03-final-browser-generation/`、`T03-final-browser-static/`。
## T04 验收

基线 `455ab7b`；MiMo 运行 `2026-10-13T05-08-06-366Z-11592`，八个实际变更文件、范围无越界、清理 removed。独立检查后复制这八项文件，主工作区构建 bundle，未合入独立副本 UI 换行变化。

- 修复前独立 Chrome：真实 MVU 中旧消息为 earlier、最新状态 latest；同步冷缓存 AAA、暖缓存 earlier，异步格式化/历史构建/实际模拟请求却为 latest。冷缓存本身是既有行为，不计为错误；执行器最初的同步位置断言失败没有被当作最终缺陷证据。
- 实现：历史来源消息/ID/修订仅在不可枚举内部属性保留，同步/异步/显示共享替换上下文，显式历史 MVU 优先；最终发送重新形成 role/content。缓存加入来源、快照、阶段/深度/设置键，保留 500ms 执行、10s 装载及取消/优先级/去重保护。
- 独立验收：构建、公共页面准备、完整 npm run check（66 项 Python）退出 0；prompt-controls 实际浏览器通过（3 次模拟请求，停止/旧构建保护），regex-queue 浏览器通过（真实积压 302 项，提示词优先和后续恢复）。
- 独立 Chrome 观察器确认异步/暖缓存/构建/实际请求都为 earlier，当前 Author's Note 注入仍为 latest，供应商消息严格 role/content。使用真实 commitResponseVersion 保存入口切换上游版本后为 versioned，恢复旧版本后为 earlier；无 pageerror。首次外部版本夹具假定可选 conv.mvu 必定存在导致 JSON.parse 失败，修正夹具后实际保存与回放通过，未修改产品代码绕过失败。
- 视觉：预设库 360/390/768/1280px 浅暗及正则队列移动浅暗截图生成，移动暗色预设库、移动浅色队列已检查。材料：T04-check.log、T04-browser-before.json、T04-browser-final.json、T04-prompt-browser/、T04-regex-browser/。
## T05 验收与第一批交叉回归

基线 `109f008`；MiMo 运行 `2026-10-13T05-35-30-207Z-33780`，七个实际变更文件，范围无越界、清理 removed。主工作区复制允许文件并生成 bundle，未覆盖用户数据或副本 UI 换行。

- 原缺陷由真实 Chrome 先复现：流式正文没有 dream 标签，保存后的真实卡片静态区显示标签；原始 source/original/message 未改变、脚本未执行、没有外链。这是显示不一致，未被描述成已确认的隔离失效。
- 实现：普通正文与卡片静态派生区复用显示函数；卡片 entry/授权输入仍先接收既有原始文本，再生成静态 HTML。运行/详情/撤销和 sandbox 保留，未清理可执行源或改摘要材料。
- 实际 Chrome 观察器：静态正文与流式正文完全相同，unsafeNodes=0、malicious=0、external=[]、errors=[]；entry.source、entry.original、msg.content 逐字节不变，运行入口存在。运行时 106 项和 broker 55 项回归通过。
- 独立 build:sites、完整 check（66 项 Python）通过，296 份公共卡资源构建检查通过。被测公共页面与 dist 的 app.js、regex-worker.js、app.css、tailwind.css 实际字节哈希一致，见 T05-artifact-hashes.json；最终全量发布仍需 T10 对最终源码重新检验。
- 第一批 T01–T05 六套浏览器交叉测试均退出 0：generation-format（5 次模拟请求）、static-message、prompt-controls（3 次请求、停止/迟到保护）、message-reliability（失败/版本刷新/自动总结/迟到保存）、regex-queue（302 项真实积压、优先请求/恢复）、card-runtime（非安全 HTTP 摘要、许可/MVU ACK、撤销、L2 循环闭包、L3 本机双来源请求及导航清理限制）。未部署远端 L3。
- 390/1280px 浅暗截图生成，卡片浏览器还验证跟随系统；移动暗色静态消息和移动授权弹窗已视觉检查。材料：T05-build-sites.log、T05-check.log、T05-browser-before.json/after.json、T05-static-browser/、T05-generation-browser/、T05-card-browser/、T05-prompt-browser/、T05-regex-browser/、T05-reliability-browser/。
## T06 验收

基线 `1561a56`。仅合入 T06 允许清单中的实际源码、测试和文档差异，由主工作区重新生成 bundle；独立副本的 UI 换行变化没有合入。

- 修复前真实 Chrome 复现：主阶段请求途中修改设置，二阶段改用新端点/模型、自定义提示词和 32 token 预算；重生成也复现同一问题。修复后主生成与重生成的三次请求均使用同次旧设置，预算 4096/1024/1024、纠正一次；下一次操作才使用新设置，预算 32/32、自定义不纠正。诊断中的 operation、实际预算、纠正标记和真实 stop 原因与请求一致。
- 主生成、重生成、续写、候选二阶段共享运行时上下文，保留真实可靠保存及版本提交入口。旧 A 迟到完成/失败不得保存失效候选或清新 B 的 controller、timer、气泡和生成状态；前缀副本的宏/MVU/群聊状态不写回原会话。上下文仅运行时或不可枚举属性，不进入持久化/API。
- 独立 `build`、`prepare:sites`、完整 `npm run check` 退出 0，含 66 项 Python 测试。真实 generation-format、prompt-controls、message-reliability 浏览器均通过；额外 Chrome 检查设置冻结、重生成、停止部分回复/下一发送、编辑来源后不保存失效回复及发送恢复。390/1280px 浅暗截图生成，移动浅色聊天截图已视觉检查。
- 独立协议/诊断观察器通过：独立 parser 不依赖诊断模块，回调异常可观察且不重复结算，旧请求不清新请求，供应商 stop 保留为 stop；已知 key 和非法 ruleName 对象不进入错误诊断。
- MiMo 初次整项运行只完成部分代码，未接受；诊断候选发现独立 parser、结束原因和字段过滤问题后返工。B1 初次执行因新测试错误由协调者明确结束，报告 failed/cleanup removed，并非额度停止；后续修正 callback、等待真实终止和小预算断言。B1 兼容返工保留独立旧入口，B2 完成重生成接线及严格规范 URL 夹具。最终 B2 运行 `2026-10-13T07-45-13-176Z-11404` 范围无越界、cleanup removed，所有候选仍由协调者独立审查。

材料位于本次 D 盘协调目录：`T06-final-check.log`、`T06-final-settings.json`、`T06-b2-regeneration.json`、`T06-b2-target-edit.json`、`T06-final-stop.json`、`T06-final-protocol.log`、`T06-final-diagnostic.log`，以及 `T06-final-generation-browser/`、`T06-final-prompt-browser/`、`T06-final-reliability-browser/`。最终发布仍需对全部任务重新执行发布门禁。

## T07 验收

基线 `08cce8a`。新增显式依赖闭包 `createMessageDisplayModel` 与 `prepareMessageDisplay`，普通气泡、流式、最终和卡片静态入口实际使用同一准备结果；manifest 增至 482 项。格式化、MVU 模板仅执行一次，可执行源维持既有 format→MVU→去 MVU 控制块的输入边界，dream/选项清理仅用于静态显示。未迁移的正则、MVU、静态净化等依赖已在结构文档列明。

- 首次运行 `2026-10-13T08-23-21-299Z-11472` 只返回部分实施与计划性收尾，未接受。独立完整检查通过，但真实 Chrome 发现动画开启时完整流式丢失选项按钮（0 对最终 1），且卡片授权源错误增加 MVU 控制块。
- 返工 `2026-10-13T10-26-55-295Z-5276` 补失败回归、阶段传递、单次调用计数、静态/源码边界、浏览器和文档。独立 Chrome 复核动画流式/最终都有 1 个选项且文本相同，entry.source/original 与拆分前字节一致、消息原文完整。额外静态卡片观察器和历史 MVU/版本保存回放结果与基线一致。
- 独立 build、prepare、完整 check 退出 0（66 项 Python）；generation-format、static-message、card-runtime 真实浏览器通过，包含逐字符收敛、代码边界/恶意输入、110 项运行时和 55 项 broker 源码回归，以及非安全 HTTP 许可/MVU/循环模块/双来源网络与系统主题。生成模拟请求 5 次，5000 段静态长文约 97ms；未部署远端 L3。
- 最后运行 `2026-10-13T10-46-21-424Z-11104` 仅删除迁移产生且没有调用的旧转义 helper，保留新闭包实现及所有仍使用的依赖；语法和 frontend 冒烟通过。三个运行均无范围越界、清理 removed。主工作区仅复制允许源码/测试/文档，重新构建，不复制副本 UI 换行。
- 390/1280px 浅暗和卡片系统主题截图已生成；最终全部任务仍要在同一产物重跑发布门禁。证据：`T07-final-check.log`、`T07-extra-before.json`/`candidate.json`/`final.json`、`T07-final-mvu.json`、`T07-generation-browser.log`、`T07-static-browser.log`、`T07-card-browser.log`。

## T08 验收

执行基线 `08cce8a`，MiMo 运行 `2026-10-13T10-23-13-064Z-32372`。T07/T08 独立实施后由协调者三方合并，保留两套真实 VM 装载和 manifest 登记，组合源码共 483 项；仅结构文档的计数冲突由协调者按实际清单解决，未覆盖另一任务源码。

- `createGenerationTransport` 闭包封装 HTTP/SSE/JSON 与单次终止，显式接收 fetch、时钟、状态控制、设置和协议 helpers。旧入口保持适配，传输不操作 DOM、保存、回复版本或活动会话。状态/端点后处理/诊断与保存仍由既有业务层提供，未宣称全仓完成 ESM 或全部去全局。
- MiMo 源码回归通过，结构检查的子进程 EPERM 由协调者独立复核：副本和最终组合源码完整 check 均通过（66 项 Python），两模块构建及清单/漂移检查通过。
- 独立协议观察器对照：完成回调同步/异步异常、EOF/DONE、读取器/fetch 中止、旧请求与新 controller、非法 usage/协议失败后不继续输出、错误回调单次及 unhandled=[] 均保留。非法直接 SSE 空 body 改为受控错误并清理自己的状态；实际请求接线同样一次错误、无成功回调、不残留 controller/生成状态。
- 组合源码真实 generation-format、message-reliability、prompt-controls 浏览器通过；正常发送→二阶段→一次纠正保持旧模型/预算 4096/1024/1024，下一操作为新设置 32/32；重生成三请求快照、停止部分回复及下次发送恢复通过。没有新增参数、供应商、UI 或保存协议。
- 首次并行 prompt/stop 浏览器遇到静态服务短暂拒绝连接；服务仍存活，顺序重跑后通过。原环境失败日志保留，没有把失败算作生产代码缺陷或成功验收。

证据：`T08-check.log`、`T08-integrated-check.log`、`T08-protocol-review.json`、`T08-integrated-settings.json`、`T08-integrated-regeneration.json`、`T08-integrated-stop.json` 和对应浏览器日志/390/1280px 浅暗截图。运行范围无越界、清理 removed；最终全部任务还需同一产物发布门禁及真实供应商验收。

## T09 / T10 接手验收

用户指定 MiMo 额度不足后由协调者直接接手。T09 运行 `2026-10-13T11-18-15-502Z-30132` 的范围检查通过且清理 removed；T10-A 运行 `2026-10-13T11-29-58-782Z-39332` 提交实际工具代码，T10-B 运行 `2026-10-13T11-44-19-060Z-4600` 仅返回计划，未写实施文件，不能计为完成。协调者补齐六组浏览器证据、系统主题、D 盘输出、命令入口及缓存版本。

- T09 消除两组重名 helper，统一五类 HTML 字符转义。恢复原结构测试的真实 build/UI/drift CLI 子进程，未保留执行器为绕过 EPERM 而复制的检查实现。AST 检查精确核对调用接收者和 factory 链，增加实际源码通过、错误接收者与缺注入依赖负例。模块缺失/顺序/返回接口/重复登记及失败构建字节保护通过。
- 完整 bundle 实际 Chrome 对照：同名角色完整元数据在改动前后均保留；单引号从未转义改为 `&#39;`，无 pageerror。有效角色名 `constructor` 被既有注册迁移跳过是范围外旧行为，未伪称本次修复。真实库搜索、角色 PNG 导出/解析、会话导入与设置/恢复竞态浏览器通过；原始数据与私有设置保护回归保留。
- T10 14 项工具夹具及真实 Windows npm 启动通过。完整本地门禁实际通过 build:sites、完整 check（含 66 项 Python）、check:sites 和六组真实 Chrome；390/1280px 浅暗/系统主题及队列恢复、二阶段纠正、保存失败保护、静态安全和双来源 HTTP 卡片运行通过，预览与部署资产字节一致，子服务清理 removed。各组证据后来改为独立目录，专用最终副本仍须再跑门禁。
- 证据根目录 `<local-evidence>/opentavern-mimo-20261013-071152`：`T09-import-before.json`/`after.json`、`T09-chat-browser.log`、`T09-convenience-browser.log`、`T10-root-gate/release-2026-10-13T12-02-49-681Z-31112/release-report.json`；移动暗色生成和桌面浅色搜索截图已人工查看。

发布前阶段观察（后续结果见 T11）：当时尚未发布新版本，本地检查未把真实供应商记为成功。实际应用只读确认当前预设 `SillyTavern Preset`（32/84 启用、29 条 regex_scripts），已启用预设正则格式化；导出时浏览器控制连接中断，未获得完整去敏样本或进行真实生成。

## T11 最终同产物检查与发布

最终源码实现提交 `c262b4c`，Sites 工具仅提交构建生成的 HTML 换行规范化为 `330e0d4f0b529607a1aa43fa6edcfcc6c7083129`。最终门禁 `<local-evidence>/opentavern-mimo-20261013-071152/final-release-gate/release-2026-10-13T12-13-02-715Z-6176/release-report.json` 全部通过；打包后完整源码/资产映射仍与门禁完全一致，保存准确推送提交和归档后部署第 13 版，版本 `<site-version-id>`、部署 `<site-deployment-id>`，状态 succeeded。

线上公开访问保持，根页与正式 `/opentavern` 返回 200，应用、正则 Worker、两套 CSS 字节与被测产物一致。HTML 仅多出 Cloudflare 边缘脚本，严格移除此已识别脚本后应用 HTML 字节一致；原始响应不同未冒称一致。相关映射在证据根目录 `online-verification.json`。390px 系统浅色静态消息与 1280px 系统暗色卡片截图已人工查看。

真实验收使用现有 DeepSeek `deepseek-flash` 与当前预设正则，在新建会话中仅发送角色开场与新写验收消息。正文与 4 个二阶段选项生成成功，未暴露 dream 包装；重生成保留版本 3/3，二阶段同步重建。真实中止后输入恢复，旧回复保留，下一次发送正常完成；刷新后 8 条消息、8 个选项和版本 3/3 保留，消息 ID 完全一致。最近实际请求诊断确认两阶段同一 operation=4、模型 `deepseek-flash`，实际预算 8192/1024，均为 finishReason/completionReason=`stop`、interrupted=false、corrected=false。未读取密钥、未修改连接参数、未把旧生产历史发给模型。

准备时“卡片库→新建角色”实际打开当前会话编辑，协调者误改已有会话角色。角色资料先通过原角色库恢复；复核发现成员保存为 17 条历史助手消息记录了测试角色标签，随后通过当前页开发调试在原 `saveConversationMembers` 候选中仅纠正这些误写标签，并由原可靠保存入口落盘。31 条消息序列化数据完全未变，ID 一致，刷新后错误标签为 0，显示文本 SHA-256 前后一致（`c42ba2ab386b126a3c4d70e94921b9050619144055ed7292b305029413118c28`）。没有发送或删除原历史消息，没有读取密钥或直接写存储后端；断点、调试器及临时内存快照已清理。测试卡和独立测试会话保留，未永久删除用户数据。该原有新建入口问题未在本轮无关模块中追加改动。

## 验收限制与执行边界

2026-10-14 用户明确：代码只由 GPT 编写、修改与审查；DeepSeek 仅允许用于应用验收请求。后续未再启动 MiMo/DeepSeek 编码执行器。

T01–T10 优化代码、最终发布门禁、第 13 版部署和线上资源核对完成。当前实际预设的基础真实模型流程已通过；真实自定义二阶段、强制触发一次格式纠正、所有 29 条规则的完整穷举、真实手机/生产双设备尚未实测。这些分支已有隔离源码与浏览器回归，不将模拟称为真实供应商通过。实际预设完整导出和恢复前文件下载未得到浏览器事件，相关失败未计为成功。

TTS 不开发，不强制 HTTPS，远端 L3 未部署。Sites 已推送被测源码，GitHub origin/fork 未推送。本页发布后的文档提交仅补充验收记录，与部署源码 SHA 单独区分。

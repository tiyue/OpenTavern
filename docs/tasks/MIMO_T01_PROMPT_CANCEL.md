# MiMo T01：停止提示词构建后禁止迟到宏变量提交

状态：2026-10-13 已完成独立本地验收，证据与返工见 [验收记录](../MIMO_ACCEPTANCE_RECORD.md)。审查基线：`c951506a75e80d434bbf623e5978093956443ef2`。本任务未发布，其他任务不能据此算作完成。

你是 MiMo 代码执行器，负责本任务的最小实现与回归。先读取当前工作副本 `AGENTS.md`、[开发指导](../MIMO_DEVELOPMENT_GUIDE.md) 和 `docs/spec.md`。协调者负责最终验收、合并、提交和发布；不得递归启动其他模型、执行器或代理，不得提交、推送或发布。

## 目标、边界与成功标准

修复提示词异步构建在停止后仍写回旧宏变量的问题。停止后不发出模型请求，旧构建不能覆盖停止后的变量，也不能结束新操作的生成状态。正常有效的提示词宏和只读预览行为保留。

**仅允许修改以下文件，禁止修改无关部分：**

1. `src/app/generation/50-generation-integrations.js`
2. `src/app/generation/52-generation-message-lifecycle.js`
3. `src/app/prompt/41-prompt-message-builder.js`
4. `src/app/prompt/40-sillytavern-macro-runtime.js`
5. `scripts/test-prompt-controls-runtime.mjs`
6. `scripts/test-prompt-controls-browser.mjs`
7. `docs/spec.md`

清单是上限，不要求全部修改。需要增加文件时报告具体依赖，由协调者重新组织任务。保留用户已有修改，不触碰存储、同步、UI、MVU、卡片权限、依赖和 manifest。不得手改或重建 `assets/js/app.js`、`index.html`、`assets/css/app.css`、`dist/`、`.sites-public/`；构建和浏览器验收由协调者完成。**再次强调：不顺手改旁边的代码、注释、格式或无关死代码。**

## 已复现调用链与反例

`streamChat` 记录 `activePromptBuildSequence`，然后等待 `buildMessagesForAPIAsync`；`stopGeneration` 在还没有 AbortController 时仅把 `isGenerating` 置为 false。异步构建继续执行，在尾部无条件调用 `persistSillyTavernMacroEnv`，后者用整个 `env.vars` 替换 `conv.stLocalVars`。入口在构建结束后才检查是否停止，所以能阻止 API，却不能阻止旧变量提交。

使用隔离会话，启用如下系统提示词：

```text
{{setvar::auditStopped::from_cancelled_build}}
```

输入消息为 `UNIQUE_CANCEL_INPUT`，启用适用于提示词输入的简单正则将该文本替换成 `converted`，让实际异步构建等待 Worker。调用 `streamChat` 后确认 pending sequence，立即调用 `stopGeneration`；再设置：

```javascript
conv.stLocalVars.auditStopped = 'user_change_after_stop';
```

等待旧构建结束。当前结果回报 `interrupted:true`、没有发 API，但最终变量变成 `from_cancelled_build`。这确认内存覆盖，不能未经测试直接声称已发生磁盘数据丢失。

## 实施步骤

1. 核对当前四个源码文件、实际调用者及现有测试装载方式；先简述假设、冲突处理取舍和修改文件。基线变化时先重新复现，不能机械套补丁。
2. 在现有 runtime 测试加入可确定暂停/恢复的异步构建用例。使用真实 `streamChat`、构建器与宏提交源码，可控制格式化/Worker 延迟和模拟 fetch；不能 stub 掉被验证的构建提交逻辑。修复前运行并记录失败，断言最终变量值而不是只检查中断标记。
3. 最小修复：把本次构建的取消/操作身份带入异步流程，在 await 恢复、下一次推进、宏提交和发请求前校验。不要仅依赖全局布尔 `isGenerating`，新操作可能把它重新设为 true。宏先在候选环境计算，仅仍有效的操作提交。
4. 已存在的宏变量在构建期间被合法外部操作修改时，不得被旧快照覆盖。说明并测试冲突处理策略，保证不会留下半提交的变量变更；正常未冲突 `setvar`/`incvar` 仍只提交本次有效结果。
5. 目标会话删除或被恢复操作替换后，旧构建不请求、不写变量、不复活旧会话；切换活动会话不能写到新会话。原会话仍有效时保持既有绑定行为，不把切换操作一律当成停止。来源变化判定使用现有身份/修订规则，避免新增持久化字段或全仓重构。
6. 旧构建的完成、失败、finally 不得清除新操作 pending sequence / 生成状态，不得触发会保存或结束新操作的旧完成回调。当前取消的回调语义与请求已发出后的中断行为保持兼容；每个实际结算分支只执行一次。
7. 在已有浏览器脚本补充真实隔离页面复现，调用真实构建/停止路径，模拟模型端点，断言变量、请求数量和新操作状态。测试探针只在测试路由注入，不在生产源码导出全局测试接口。
8. 更新 `docs/spec.md` 对应生成/宏行为与验收说明；标注本批尚未发布。仅更新有本任务证据支持的条目，不把计划或未执行检查写成完成。

实现用能解决问题的最少代码，不新增功能、配置项、依赖、无限重试或第二套保存入口。已发出的 Worker 可按既有队列规则完成，但其迟到结果不能推进失效构建或提交状态；不修改正则 500ms / 10s 保护或握手。

## 必须覆盖的回归

| 用例 | 预期 |
| --- | --- |
| 暂停构建 → 停止 → 修改变量 → 释放旧构建 | 模型请求数 0；保留 `user_change_after_stop`；旧候选无提交 |
| A 暂停 → 停止 → B 开始 → A 成功或失败迟到 | A 不请求/提交；B 的状态、pending sequence 和变量不被 A 覆盖；B 能正常结束 |
| 世界书多项格式化期间停止 | 不继续推进失效构建或提交变量；零模型请求 |
| 未停止，但构建期间合法变量变更 | 保留外部更新，不以旧变量对象覆盖；按已说明策略处理冲突 |
| 删除/恢复替换目标会话 | 无迟到提交、无模型请求、无旧会话复活 |
| 切换活动会话 | 结果和宏始终绑定原合法目标，不污染新会话 |
| 正常有效 setvar/incvar、无宏、同步构建 | 正常载荷与宏语义保留，无重复提交 |
| 只读预览 | 原会话和变量不改变，构建结果仍可预览 |
| 构建失败、请求已发出后停止 | 原有错误提示和中断保护继续有效，状态可恢复 |

停止是操作状态，不要求把它当作用户输入校验；本任务不添加无关输入校验。对新增的有效性判断补对应失效状态测试。

## 执行器可运行的检查

```powershell
npm run check:prompt-controls
npm run check:message-reliability
git diff --check
git diff --stat
```

第一条覆盖本任务直接读取源码的测试，第二条验证既有版本/失败保存保护未被破坏。执行器不运行会产生范围外文件的构建。未构建的完整 `npm run check` 可能因 bundle 漂移拒绝，不能以跳过漂移检查代替验收；交给协调者构建后完整验证。

协调者须在独立副本构建、准备隔离页面，并运行 `node scripts/test-prompt-controls-browser.mjs`、相关可靠保存浏览器测试和第一批完整矩阵；至少完成一次真实浏览器冒烟。浏览器依赖或服务未就绪则记录未执行，不能声明通过。

## 交付格式

在最终报告按以下顺序写明：

1. 问题、最终行为和修改文件，每项改动对应本任务哪一条要求。
2. 修复前复现命令、实际失败断言和结果。
3. 修复后检查命令、退出码、通过的断言；未执行/失败的检查及具体原因。
4. 冲突处理、取消与新旧操作回调的取舍，仍存在的限制。
5. 声明没有修改范围外文件、没有提交/推送/发布；如有越界必须如实列出。

由全局入口生成 `report.json` 与 `last-message.md`，不要自行修改入口报告。最终协调者检查实际 diff、独立复验并核对 `runtime_cleanup`，再决定接收或组织返工。

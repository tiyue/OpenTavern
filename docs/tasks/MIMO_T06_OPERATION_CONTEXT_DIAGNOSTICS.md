# MiMo T06：生成操作、设置快照与阶段诊断

状态：待执行。审查基线：`c951506a75e80d434bbf623e5978093956443ef2`；实际实施以所有前置任务已验收提交为基线。前置：T05。**任务文档不代表已实施、验收或发布。**

先读 [总指南](../MIMO_DEVELOPMENT_GUIDE.md)、[全量任务索引](README.md)、工作副本 `AGENTS.md` 与 `docs/spec.md`。MiMo 仅实施指定源码/测试；协调者独立构建、验收和版本管理。不得递归启动模型/执行器、提交、推送或发布。

## AllowedFiles

**仅以下相对路径可写，禁止修改无关部分。清单为上限，不要求全部修改。**

- `src/app/generation/50-generation-integrations.js`
- `src/app/generation/50-generation-stream-state.js`
- `src/app/generation/50-generation-response-stream.js`
- `src/app/generation/50-request-diagnostics.js`
- `src/app/generation/52-generation-message-lifecycle.js`
- `src/app/generation/52-generation-runtime.js`
- `src/app/generation/52-generation-second-stage-runtime.js`
- `src/app/chat/67-message-regeneration-runtime.js`
- `src/app/prompt/41-prompt-message-builder.js`
- `src/app/prompt/41-second-stage-prompt-builder.js`
- `src/app/prompt/41-prompt-second-stage-context.js`
- `src/app/prompt/41-prompt-controls.js`
- `scripts/tests/frontend/generation.mjs`
- `scripts/test-message-reliability-runtime.mjs`
- `scripts/test-prompt-controls-runtime.mjs`
- `scripts/test-generation-format-browser.mjs`
- `docs/spec.md`
- `docs/SOURCE_STRUCTURE.md`

不得覆盖用户修改，不顺手改无关代码/注释/格式。发现必要范围外依赖先报告，由协调者重新组织任务。构建产物不得手改；MiMo 不运行会写范围外产物的构建。

## 目标与现状

前置：T01–T05 已由协调者验收。不是重新实现取消、完成原因或格式解析，而是让主回复、二阶段、格式纠正和重生成使用同一次操作的身份与设置快照。

当前主构建已有 _requestSettings，二阶段读取 live state.settings；流空闲计时也读取全局设置。现有 captureRequestDiagnostic 可复用，不能新建持久化诊断系统。

## 实施步骤

1. 核对前五项最终实现，列出操作创建、阶段派生、来源验证、停止、结算及可靠保存调用表，明确字段和生命周期后实施。
2. 一次操作只捕获一次 API/模型/预设/推理与采样设置。主阶段后创建二阶段和纠正时复用此快照，仅使用现有二阶段温度/topP/预算规则作显式覆盖。
3. 操作身份包含现有序号、目标会话及来源 ID/修订/取消状态；复用现有验证，不复制一套并行状态机。存储和同步格式不变，运行对象不持久化。
4. 定时器、AbortController、迟到回调与最终状态清理绑定所属操作；A 的完成/失败不能清掉 B 的状态。阶段间来源变化按现有失败保护，不请求或提交无效候选。
5. 修改设置仅影响下一操作。切换活动会话保持原合法目标绑定，流式内容不串到新会话；不把“切换”统一变成“取消”。
6. 复用现有诊断数组及现有展示入口，关联实际阶段、结束原因、实际 max_tokens、是否纠正和实际失败规则名（仅在已有错误提供时）。不能推测规则名，也不能保存 API key、请求头或运行权限对象；保持最近十项内存记录，不同步到云。
7. 先用模拟请求确认跨阶段冻结，再根据实际供应商诊断评估风险。保持现有最多 1024 的二阶段预算及一次纠正；无真实证据不更改参数、重试或新增设置。
8. 更新规格/结构和交叉测试；若需要新增用户可见诊断字段，使用现有查看提示词入口，避免新面板和 UI 改版。

## 验收断言

| 操作 | 预期 |
| --- | --- |
| 主请求期间改 endpoint/model/预设，再生成二阶段/纠正 | 同一次操作所有 payload 使用旧快照；下一操作使用新值 |
| 改流空闲超时设置 | 当前操作按捕获值计时，下一操作用新值 |
| 编辑来源/替换会话/停止后纠正迟到 | 旧正文/选项保护，无额外失效请求或提交 |
| A 结束时 B 已开始 | B controller/timer/生成状态保持 |
| SSE/JSON 错误与截断 | 诊断关联正确请求与实际预算，不冒充正常完成 |
| 私有设置/运行数据过滤 | 凭据与运行对象不进入诊断导出、备份和云同步 |

协调者运行 prompt-controls、message-reliability、generation-format 浏览器测试；记录模拟结果与真实供应商结果的区别。

## 执行器检查与报告

```powershell
node scripts/test-sync-function.mjs
npm run check:message-reliability
npm run check:prompt-controls
npm run check:private-settings
git diff --stat
```

至少完成一次源码级冒烟，协调者再构建并做真实浏览器验收。修 bug 先记录真实失败再修复；重构对照迁移前后行为。交付须列明修改原因、命令/退出码/断言、未执行与失败原因、兼容风险和回退。全局入口报告由协调者核查实际 diff 与 `runtime_cleanup`，未执行不得写通过。

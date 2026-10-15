# MiMo T02：SSE 与 JSON 完成原因及失败保护

状态：2026-10-13 已完成独立本地验收，证据与返工见 [验收记录](../MIMO_ACCEPTANCE_RECORD.md)。审查基线：`c951506a75e80d434bbf623e5978093956443ef2`；实施基线为 T01 提交 `062b9ac`。本任务尚未发布，其他任务不能据此计为完成。

先读 [总指南](../MIMO_DEVELOPMENT_GUIDE.md)、[全量任务索引](README.md)、工作副本 `AGENTS.md` 与 `docs/spec.md`。MiMo 仅实施指定源码/测试；协调者独立构建、验收和版本管理。不得递归启动模型/执行器、提交、推送或发布。

## AllowedFiles

**仅以下相对路径可写，禁止修改无关部分。清单为上限，不要求全部修改。**

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

不得覆盖用户修改，不顺手改无关代码/注释/格式。发现必要范围外依赖先报告，由协调者重新组织任务。构建产物不得手改；MiMo 不运行会写范围外产物的构建。

## 问题与反例

当前 `50-generation-response-stream.js` 只把 `finish_reason` 当作结束标记；SSE 的宽泛 catch 吞掉错误/回调异常，JSON 不传完成元数据。主回复、重生成与二阶段因此不能可靠区分截断和完成。

使用真实解析器输入：

```text
data: {"choices":[{"delta":{"content":"未完成正文"}}]}

data: {"error":{"message":"upstream_overloaded"}}

data: [DONE]
```

当前会正常完成并报告 `interrupted:false`。另将错误帧换成 `{"choices":[{"finish_reason":"length"}]}`，再测非流式 `{"choices":[{"message":{"content":"未闭合正文"},"finish_reason":"length"}]}`。在修复前记录实际失败，不能只修改桩回调使测试通过。

## 实施要求

1. 先补真实解析器回归，覆盖帧被任意字节拆分、错误后 DONE/EOF 和 JSON 对应情况。
2. 显式识别供应商错误帧，保留可理解的错误原因；SSE/JSON 返回一致的完成信息。保留 `finish_reason`，不得把未知值伪造为 `stop`。
3. `length` / `content_filter` 属于非完整完成。接入既有未完成版本与失败保护：失败/截断重生成不能自动替换原完整回复；二阶段失败保留旧选项，不能把截断当作格式失败触发成功纠正。
4. 普通生成已有可用部分正文时，沿用当前部分回复保留契约；不得擅自删除正文或改变保存协议。供应商错误可走既有错误分支，明确写出最终部分正文策略。
5. 解析 JSON 的 catch 仅处理解析失败，不吞业务回调异常。完成、错误、停止和超时每次只结算一次；旧请求结束不清除 T01 中的新操作状态。
6. 保留 usage/思考/时长统计、正常 stop/DONE/EOF 兼容和空闲超时行为。只跳过既有可容忍的畸形帧，不用“跳过所有异常”掩盖错误。
7. 更新规格和真实浏览器模拟响应用例，不增加重试、供应商配置或 Token 预算。

## 验收断言

| 场景 | 预期 |
| --- | --- |
| error → DONE / EOF；只有 error | 错误一次，保留原因；不能回报普通成功 |
| SSE/JSON length、content_filter | 相同非完整完成语义；不选择失败重生成候选 |
| 正常 stop / DONE / EOF | 兼容现行正常完成，不漏正文/思考/usage |
| abort、空闲超时、回调异常 | 明确结算一次；下一操作状态不被旧操作清理 |
| 二阶段无效、截断、网络/保存失败 | 旧选项保留，失败不计为提交，默认纠正最多一次 |

协调者构建后运行可靠保存与 generation-format 浏览器回归，检查实际模型请求数量和版本选择，不以 callback stub 代替真实解析链。

## 执行器检查与报告

```powershell
node scripts/test-sync-function.mjs
npm run check:message-reliability
git diff --stat
```

至少完成一次源码级冒烟，协调者再构建并做真实浏览器验收。修 bug 先记录真实失败再修复；重构对照迁移前后行为。交付须列明修改原因、命令/退出码/断言、未执行与失败原因、兼容风险和回退。全局入口报告由协调者核查实际 diff 与 `runtime_cleanup`，未执行不得写通过。

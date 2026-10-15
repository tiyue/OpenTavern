# MiMo T08：生成传输与流程业务模块解耦

状态：待执行。审查基线：`c951506a75e80d434bbf623e5978093956443ef2`；实际实施以所有前置任务已验收提交为基线。前置：T07。**任务文档不代表已实施、验收或发布。**

先读 [总指南](../MIMO_DEVELOPMENT_GUIDE.md)、[全量任务索引](README.md)、工作副本 `AGENTS.md` 与 `docs/spec.md`。MiMo 仅实施指定源码/测试；协调者独立构建、验收和版本管理。不得递归启动模型/执行器、提交、推送或发布。

## AllowedFiles

**仅以下相对路径可写，禁止修改无关部分。清单为上限，不要求全部修改。**

- `src/app/generation/50-generation-transport-module.js`（本任务计划新增）
- `src/app/generation/50-generation-api-request.js`
- `src/app/generation/50-generation-response-stream.js`
- `src/app/generation/50-generation-stream-state.js`
- `src/app/generation/50-generation-integrations.js`
- `src/app/generation/50-generation-usage.js`
- `src/app/generation/50-generation-cot-utils.js`
- `src/app/generation/50-request-diagnostics.js`
- `src/app/generation/52-generation-runtime.js`
- `src/app/generation/52-generation-second-stage-runtime.js`
- `src/app/chat/67-message-regeneration-runtime.js`
- `src/app/manifest.json`
- `scripts/tests/frontend/generation.mjs`
- `scripts/test-message-reliability-runtime.mjs`
- `scripts/test-prompt-controls-runtime.mjs`（仅装载新增传输模块）
- `scripts/test-interface-onboarding-runtime.mjs`（仅装载新增传输模块）
- `scripts/test-message-reliability-browser.mjs`
- `scripts/test-generation-format-browser.mjs`
- `docs/spec.md`
- `docs/SOURCE_STRUCTURE.md`

不得覆盖用户修改，不顺手改无关代码/注释/格式。发现必要范围外依赖先报告，由协调者重新组织任务。构建产物不得手改；MiMo 不运行会写范围外产物的构建。新增路径已明确列出，创建时须遵循 manifest/入口要求，不能增加清单外文件。

## 目标与边界

前置：T07 通过。将传输/协议解析与业务流程分离，减少依赖清单顺序和全局状态的隐式调用。继续使用现有构建体系，不同时迁移所有入口、设置、存储和渲染。

允许新增一个完整生成传输业务模块：闭包持有内部 parser/结算逻辑，显式依赖 fetch、时钟和操作上下文；通过事件/回调向既有主阶段/二阶段/重生成流程报告增量、完成、错误。旧入口可保留薄适配层，不能只把原全局函数塞进对象而仍隐式读所有全局变量。

## 实施步骤

1. 先列迁移前调用图、输入设置/操作身份与输出事件契约，保存 T01/T02/T06 的基线结果。
2. 传输层不操作 DOM、会话保存或选中版本；业务层复用原可靠提交入口，不建第二套保存。
3. 依赖注入使用实际最小边界，不能造通用服务容器。调用时传入状态与设置快照，而非在模块初始化时捕获当时 active conversation。
4. 内部 HTTP/SSE/JSON/停止/超时结算归属对应操作。每个请求只结算一次，usage/思考/结束原因/错误元数据保持。
5. 登记模块 manifest、更新直接读取源码的 VM 测试装载与兼容入口。尽可能保留现有入口名称，不通过全仓换名扩大任务。
6. 保持主回复/二阶段/纠正/重生成的 payload 和回调语义；不得新增供应商或请求参数，不更改既有错误/版本保护。
7. 更新结构文档与规格，明确哪些 helper 已封闭、哪些接口仍作为兼容适配。

## 验收

- 同一模拟 HTTP/SSE/JSON 输入迁移前后实际请求载荷、增量、usage、完成原因和错误一致。
- T01 取消/变量、新旧操作状态；T02 错误/截断；T06 设置快照和来源失效矩阵继续通过。
- 传输模块独立测试不需要 DOM、StorageService 或真实用户会话；业务保存测试仍调用真实原入口。
- 默认/自定义二阶段、一次纠正、空/截断/网络/保存失败均保留正确旧结果。
- 构建/清单/漂移检查通过，手机/桌面浏览器冒烟无 pageerror。
- 静态依赖清单能解释每个模块边界；未迁移的全局依赖如实列出，不宣称全仓已模块化。

协调者运行完整 check 和相关浏览器交叉测试，通过后独立提交。

## 执行器检查与报告

```powershell
node scripts/test-sync-function.mjs
npm run check:message-reliability
npm run check:prompt-controls
git diff --stat
```

至少完成一次源码级冒烟，协调者再构建并做真实浏览器验收。修 bug 先记录真实失败再修复；重构对照迁移前后行为。交付须列明修改原因、命令/退出码/断言、未执行与失败原因、兼容风险和回退。全局入口报告由协调者核查实际 diff 与 `runtime_cleanup`，未执行不得写通过。

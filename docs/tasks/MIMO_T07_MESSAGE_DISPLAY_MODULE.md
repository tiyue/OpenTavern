# MiMo T07：消息格式化与静态显示业务接口

状态：待执行。审查基线：`c951506a75e80d434bbf623e5978093956443ef2`；实际实施以所有前置任务已验收提交为基线。前置：T06。**任务文档不代表已实施、验收或发布。**

先读 [总指南](../MIMO_DEVELOPMENT_GUIDE.md)、[全量任务索引](README.md)、工作副本 `AGENTS.md` 与 `docs/spec.md`。MiMo 仅实施指定源码/测试；协调者独立构建、验收和版本管理。不得递归启动模型/执行器、提交、推送或发布。

## AllowedFiles

**仅以下相对路径可写，禁止修改无关部分。清单为上限，不要求全部修改。**

- `src/app/chat/61-message-display-model.js`（本任务计划新增）
- `src/app/chat/61-message-content-render.js`
- `src/app/chat/61-message-options-render.js`
- `src/app/chat/61-static-message-render.js`
- `src/app/chat/61-message-text-format.js`
- `src/app/card-runtime/61-card-runtime-frame.js`
- `src/app/generation/52-generation-stream-animation.js`
- `src/app/generation/52-generation-message-lifecycle.js`
- `src/app/prompt/40-character-regex-runtime.js`
- `src/app/prompt/40-regex-worker-runtime.js`
- `src/app/manifest.json`
- `scripts/tests/frontend/chat.mjs`
- `scripts/tests/frontend/prompt.mjs`
- `scripts/tests/frontend/generation.mjs`
- `scripts/test-static-message-browser.mjs`
- `scripts/test-generation-format-browser.mjs`
- `scripts/test-card-execution-runtime.mjs`
- `docs/spec.md`
- `docs/SOURCE_STRUCTURE.md`

不得覆盖用户修改，不顺手改无关代码/注释/格式。发现必要范围外依赖先报告，由协调者重新组织任务。构建产物不得手改；MiMo 不运行会写范围外产物的构建。新增路径已明确列出，创建时须遵循 manifest/入口要求，不能增加清单外文件。

## 目标与边界

前置：T06 通过。以完整“消息显示准备”业务单元建立接口，统一普通、流式、最终与卡片静态显示路径。不是把文件挪进新目录，也不迁移全部 MVU/Worker/存储。

允许新增 61-message-display-model.js 一个业务模块，内部闭包隐藏分段与显示处理，显式注入所需格式化/MVU/静态清理依赖，对外提供显示准备结果。现有 IIFE 拼装可继续使用，通过闭包与依赖参数形成业务边界；本任务不强制全项目改 ESM 或更换构建工具。

## 实施步骤

1. 对 T03–T05 已验收行为建立输入/输出基线：原始文本与消息身份、历史快照、阶段 → 普通正文/代码/选项/卡片静态显示；明确可执行卡片输入不属于显示清理结果。
2. 写出最小接口契约再实施：输入不得修改；结果区分原始可执行源与静态显示派生内容；副作用只在现有渲染/权限层，显示准备不保存、不联网、不启动卡片脚本。
3. 复用现有正则/MVU/控制块与代码边界实现；避免流式与最终各做一套扫描，避免重复正则替换或重复模板执行。
4. 若引入分段结果，兼容未闭合流式片段，在完整输入下与最终结果一致。默认二阶段解析规则仍区别于主回复代码示例。
5. 调用者仅使用显式接口，保持原有入口适配供现行调用和测试使用；内部 helper 不继续作为任意全局可变入口。新增模块登记 manifest，并说明加载点和依赖，不任意改其他分片顺序。
6. 原始消息、卡片可执行源码及授权摘要保持字节一致，未知标签与代码示例保留；静态 HTML 安全/链接限制不降低。
7. 更新测试装载列表、结构文档和规格。只清理本模块迁移产生的重复实现，发现无关死代码仅报告。

## 行为等价验收

| 对照 | 断言 |
| --- | --- |
| 迁移前/后同一已验收样本 | 完整正文语义、选项、状态栏和安全结果一致 |
| 流式多种分块/最终 | 完整后相同，不重复执行正则/MVU；例外需逐项说明 |
| 同步暖缓存/异步、历史/当前 | T04 快照一致，不改变冷缓存刷新契约 |
| 普通/卡片静态 | T05 标签处理一致，原卡片输入和许可不变 |
| 恶意输入、代码、未知标签 | 静态无脚本/事件/禁止外链，无数据截尾 |
| 手机/桌面浅暗/跟随系统 | 无版式改动、可读性与交互保持，真实截图检查 |

协调者构建后运行结构、完整 check 和涉及消息/正则/卡片的浏览器回归。不能以“模块文件已新增”作为完成标准，必须证明现有主调用链实际使用接口。

## 执行器检查与报告

```powershell
node scripts/test-sync-function.mjs
npm run check:prompt-controls
npm run check:card-execution
git diff --stat
```

至少完成一次源码级冒烟，协调者再构建并做真实浏览器验收。修 bug 先记录真实失败再修复；重构对照迁移前后行为。交付须列明修改原因、命令/退出码/断言、未执行与失败原因、兼容风险和回退。全局入口报告由协调者核查实际 diff 与 `runtime_cleanup`，未执行不得写通过。

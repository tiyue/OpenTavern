# MiMo T04：历史消息 MVU 与同步异步正则上下文

状态：待执行。审查基线：`c951506a75e80d434bbf623e5978093956443ef2`；实际实施以所有前置任务已验收提交为基线。前置：T03。**任务文档不代表已实施、验收或发布。**

先读 [总指南](../MIMO_DEVELOPMENT_GUIDE.md)、[全量任务索引](README.md)、工作副本 `AGENTS.md` 与 `docs/spec.md`。MiMo 仅实施指定源码/测试；协调者独立构建、验收和版本管理。不得递归启动模型/执行器、提交、推送或发布。

## AllowedFiles

**仅以下相对路径可写，禁止修改无关部分。清单为上限，不要求全部修改。**

- `src/app/prompt/40-regex-worker-runtime.js`
- `src/app/prompt/40-character-regex-runtime.js`
- `src/app/prompt/40-character-prompt-helpers.js`
- `src/app/prompt/41-prompt-message-builder.js`
- `src/app/prompt/41-prompt-history-messages.js`
- `scripts/test-regex-queue-runtime.mjs`
- `scripts/test-prompt-controls-runtime.mjs`
- `scripts/test-prompt-controls-browser.mjs`
- `docs/spec.md`

不得覆盖用户修改，不顺手改无关代码/注释/格式。发现必要范围外依赖先报告，由协调者重新组织任务。构建产物不得手改；MiMo 不运行会写范围外产物的构建。

## 问题与反例

同步替换传入 `message` / `mvuData`，异步路径缺少它们，会取最新状态。历史构建转换成 role/content 时也需保留内部来源身份直至格式化结束。

三条 assistant 消息依次为：

```text
<initvar>{"stat_data":{"name":"earlier"}}</initvar>初始化
```

```text
AAA
```

```text
<UpdateVariable><JSONPatch>[{"op":"replace","path":"/stat_data/name","value":"latest"}]</JSONPatch></UpdateVariable>后续更新
```

对中间历史消息使用查找 `AAA`、替换 `<%= stat_data.name %>`。当前同步缓存完成后得到 earlier，异步得到 latest。同步首次冷缓存返回原文是既有行为，不能当作这次错误；测试须等待完成。

## 实施要求

1. 用真实 MVU 回放与两条正则路径补反例，记录修复前差异。
2. 同步/异步共用一致的替换上下文规则，显式传递来源消息、历史快照、阶段、深度、原文、设置和宏候选环境。
3. 历史 API 消息内部保留来源 ID/修订直到格式化完成；发供应商前仅转换为现行 role/content，不泄露内部 ID、快照、权限或运行对象。
4. 当前模板和历史消息各自使用明确快照；不让当前宏环境的最新 mvuData 静默盖掉显式历史快照。
5. 缓存键与失效逻辑覆盖消息/修订/快照/设置差异，不共享错误结果。保留冷缓存异步刷新、提示词优先、任务去重、失败不缓存和 T01 取消保护。
6. 不改 MVU 持久化格式、纯回放或 Worker 的 500ms 执行/10s 装载/旧客户端握手。更新规格与模拟 API 浏览器载荷断言。

## 验收断言

| 场景 | 预期 |
| --- | --- |
| 同一中间历史消息，两路径完成后 | 都为 earlier；最新消息仍取 latest |
| 多次 MVU 更新、编辑、回复版本切换 | 取各自有效快照，旧缓存失效 |
| 预览、取消后迟到 | 不提交宏，不修改真实历史/MVU |
| 冷缓存 → 刷新、重复渲染 | 最终一致，无重复 Worker 任务 |
| 实际模拟 API | 正文使用正确历史值，无内部元数据 |
| 灾难规则、积压和后续任务 | 隔离保护、队列释放与优先级继续通过 |

协调者运行 prompt-controls 和 regex-queue 浏览器测试并独立检查实际 payload；不能只证明直接 helper 输入正确。

## 执行器检查与报告

```powershell
node scripts/test-regex-queue-runtime.mjs
npm run check:prompt-controls
npm run check:mvu
git diff --stat
```

至少完成一次源码级冒烟，协调者再构建并做真实浏览器验收。修 bug 先记录真实失败再修复；重构对照迁移前后行为。交付须列明修改原因、命令/退出码/断言、未执行与失败原因、兼容风险和回退。全局入口报告由协调者核查实际 diff 与 `runtime_cleanup`，未执行不得写通过。

# MiMo T05：卡片静态预览与原始源码分离

状态：待执行。审查基线：`c951506a75e80d434bbf623e5978093956443ef2`；实际实施以所有前置任务已验收提交为基线。前置：T04。**任务文档不代表已实施、验收或发布。**

先读 [总指南](../MIMO_DEVELOPMENT_GUIDE.md)、[全量任务索引](README.md)、工作副本 `AGENTS.md` 与 `docs/spec.md`。MiMo 仅实施指定源码/测试；协调者独立构建、验收和版本管理。不得递归启动模型/执行器、提交、推送或发布。

## AllowedFiles

**仅以下相对路径可写，禁止修改无关部分。清单为上限，不要求全部修改。**

- `src/app/chat/61-message-content-render.js`
- `src/app/card-runtime/61-card-runtime-frame.js`
- `scripts/tests/frontend/prompt.mjs`
- `scripts/test-generation-format-browser.mjs`
- `scripts/test-static-message-browser.mjs`
- `scripts/test-card-execution-runtime.mjs`
- `docs/spec.md`

不得覆盖用户修改，不顺手改无关代码/注释/格式。发现必要范围外依赖先报告，由协调者重新组织任务。构建产物不得手改；MiMo 不运行会写范围外产物的构建。

## 问题与反例

卡片渲染提前返回，静态预览直接渲染未经过 dream 显示处理的内容。同一消息流式普通预览没有标签，保存后的卡片静态预览显示标签。已复现样本脚本未执行，不能把显示问题描述成已确认隔离失效。

```html
<dream_plot>
<dream_body>
<script>window.auditMalicious=1</script>
正常叙事正文。
</dream_body>
</dream_plot>
```

以真实主消息 ID 和会话触发卡片分支，再以流式上下文触发普通预览；修复前比较正文和标签，记录差异。

## 实施要求

1. 静态显示派生文本复用普通消息的控制包装规则，仅去掉代码外已知 dream 标记，保留正文、状态栏及选项。
2. 可执行卡片输入及授权摘要必须保持原始源码字节不变；不能先清理原文再解析 MVU 或卡片，不修改脚本字符串、代码示例和未知标签。
3. 保留逐卡审核/授权按钮、权限失效和 sandbox 行为；测试真正的卡片入口，不用返回普通 HTML 的桩绕开它。
4. 明确断言静态 DOM 无可执行脚本/事件、无禁止外链，恶意全局变量未设置；预览和最终正文一致。
5. 检查开/关卡片权限、流式到保存、编辑后授权摘要失效、无脚本普通消息、自定义状态栏；更新规格。

## 验收断言

| 场景 | 预期 |
| --- | --- |
| 上述内容普通/卡片静态显示 | 正文一致，非代码 dream 标签不显示 |
| 原始消息、卡片源、授权摘要输入 | 原始字节未改变 |
| fenced/inline code、脚本字符串内标签 | 字面内容保留，不误删 |
| 未授权/已授权/修改源码后 | 既有权限入口及失效规则保留 |
| 恶意 script/event/外链 | 预览不执行、不加载禁止资源，测试捕获真实 DOM/网络 |

协调者运行 generation-format、static-message 浏览器测试及完整卡片执行回归。第一批 T01–T05 收尾必须完成总指南交叉矩阵和完整 check。

## 执行器检查与报告

```powershell
node scripts/test-sync-function.mjs
npm run check:card-execution
git diff --stat
```

至少完成一次源码级冒烟，协调者再构建并做真实浏览器验收。修 bug 先记录真实失败再修复；重构对照迁移前后行为。交付须列明修改原因、命令/退出码/断言、未执行与失败原因、兼容风险和回退。全局入口报告由协调者核查实际 diff 与 `runtime_cleanup`，未执行不得写通过。

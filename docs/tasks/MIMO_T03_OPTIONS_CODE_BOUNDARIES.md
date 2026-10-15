# MiMo T03：XML 选项控制块与代码示例隔离

状态：待执行。审查基线：`c951506a75e80d434bbf623e5978093956443ef2`；实际实施以所有前置任务已验收提交为基线。前置：T02。**任务文档不代表已实施、验收或发布。**

先读 [总指南](../MIMO_DEVELOPMENT_GUIDE.md)、[全量任务索引](README.md)、工作副本 `AGENTS.md` 与 `docs/spec.md`。MiMo 仅实施指定源码/测试；协调者独立构建、验收和版本管理。不得递归启动模型/执行器、提交、推送或发布。

## AllowedFiles

**仅以下相对路径可写，禁止修改无关部分。清单为上限，不要求全部修改。**

- `src/app/prompt/41-second-stage-content-isolation.js`
- `src/app/prompt/41-prompt-history-messages.js`
- `src/app/generation/52-generation-runtime.js`
- `src/app/chat/61-message-content-render.js`
- `src/app/chat/61-message-options-render.js`
- `scripts/tests/frontend/prompt.mjs`
- `scripts/tests/frontend/chat.mjs`
- `scripts/test-generation-format-browser.mjs`
- `scripts/test-static-message-browser.mjs`
- `docs/spec.md`

不得覆盖用户修改，不顺手改无关代码/注释/格式。发现必要范围外依赖先报告，由协调者重新组织任务。构建产物不得手改；MiMo 不运行会写范围外产物的构建。

## 问题与反例

主回复保存前调用 `isolatePrimaryStageContent`；当前隔离函数从任意 `<options>` 删除到闭合或文末。渲染也把正文中的 XML 示例识别为按钮，丢掉前后正文。

````text
正文开头
```xml
<options><option><title>这是示例</title><description>不能把示例变成选项</description></option></options>
```
正文结尾
````

再开启二阶段，删除示例内最外层 `</options>`。当前保存前隔离会截掉后文。先补实际保存、历史请求和显示断言并记录失败。

## 实施要求

1. 按消息阶段、内容用途和代码边界识别控制块。fenced/inline code、转义 XML 与说明中的字面标签保留；不确定的未闭合块不得截尾。
2. 主回复与真正第二阶段处理分别遵循已有契约。不得笼统忽略围栏：默认第二阶段整体被围栏包裹、有前后说明、缺最外层闭合但有完整 option 时仍可标准化。
3. 普通正文的段落、代码示例、状态栏和真实选择项不会互相覆盖。真实第二阶段选项继续可点击；无完整选项按失败保护。
4. 保留自定义第二阶段非选项格式、默认最多一次格式纠正及可靠保存后才替换旧选项的规则；不得本地杜撰选项。
5. 主回复存储、历史上下文、流式和最终显示均测试。不把显示清理后的派生文本写回原始代码示例。
6. 兼容变长反引号、波浪围栏、跨行 inline code、多个块、未闭合围栏、大小写及带属性标签。复用现有代码边界规则，不引入另一套不一致扫描器。
7. 更新实际请求载荷和浏览器断言；沿用静态 HTML 安全清理，不允许脚本/外链执行。

## 验收断言

| 输入 | 预期 |
| --- | --- |
| 上述完整/未闭合示例 | 示例仍为代码，前后正文保存/显示/请求均完整 |
| 行内代码、转义标签、未闭合围栏 | 不变成控制按钮，不删除尾部 |
| 真正默认二阶段围栏/说明/缺外闭合 | 有完整选项则规范化，选项点击仍工作 |
| 无完整选项、失败纠正、保存失败 | 不存错误正文，不删除旧选项，不重复结算 |
| 自定义二阶段状态栏、普通 dream 包装 | 保持现行支持范围和正文 |

协调者运行 generation-format、static-message 和相关可靠保存浏览器测试，查看手机/桌面浅暗截图。

## 执行器检查与报告

```powershell
node scripts/test-sync-function.mjs
npm run check:message-reliability
git diff --stat
```

至少完成一次源码级冒烟，协调者再构建并做真实浏览器验收。修 bug 先记录真实失败再修复；重构对照迁移前后行为。交付须列明修改原因、命令/退出码/断言、未执行与失败原因、兼容风险和回退。全局入口报告由协调者核查实际 diff 与 `runtime_cleanup`，未执行不得写通过。

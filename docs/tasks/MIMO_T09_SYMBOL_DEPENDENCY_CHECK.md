# MiMo T09：重复符号处理与模块契约检查

状态：待执行。审查基线：`c951506a75e80d434bbf623e5978093956443ef2`；实际实施以所有前置任务已验收提交为基线。前置：T08。**任务文档不代表已实施、验收或发布。**

先读 [总指南](../MIMO_DEVELOPMENT_GUIDE.md)、[全量任务索引](README.md)、工作副本 `AGENTS.md` 与 `docs/spec.md`。MiMo 仅实施指定源码/测试；协调者独立构建、验收和版本管理。不得递归启动模型/执行器、提交、推送或发布。

## AllowedFiles

**仅以下相对路径可写，禁止修改无关部分。清单为上限，不要求全部修改。**

- `src/app/library/60-public-card-text-ui.js`
- `src/app/chat/61-message-text-format.js`
- `src/app/transfer/63-conversation-import-merge.js`
- `src/app/character/66-character-import-conversation.js`
- `scripts/check-app-contracts.mjs`（本任务计划新增）
- `scripts/test-app-contracts.mjs`（本任务计划新增）
- `scripts/tests/frontend/library.mjs`
- `scripts/tests/frontend/chat.mjs`
- `scripts/tests/frontend/transfer.mjs`
- `scripts/tests/frontend/conversation.mjs`
- `scripts/test-source-structure.mjs`
- `scripts/build-app.js`
- `package.json`
- `docs/spec.md`
- `docs/SOURCE_STRUCTURE.md`

不得覆盖用户修改，不顺手改无关代码/注释/格式。发现必要范围外依赖先报告，由协调者重新组织任务。构建产物不得手改；MiMo 不运行会写范围外产物的构建。新增路径已明确列出，创建时须遵循 manifest/入口要求，不能增加清单外文件。

## 已确认结构风险

同一个 IIFE 中有两个 escapeHtml、两个 registerImportedCharacter。后定义覆盖前定义，但两套实现语义不同。不能仅凭重复名认定常规导入损坏，也不能删除无关未执行回退。

目标：移除这两组隐式覆盖，并将类似重复符号/已声明模块依赖问题变成明确检查失败。前置：T08 已验收，读取其最终闭包边界。

## 实施步骤

1. 按实际 manifest 装载的 bundle 标定现行用户可见行为，分别测试转义字符、库搜索，以及同 ID 的角色/会话导入、元数据保留、空输入。
2. 明确两个导入调用者的职责并分别具名；不得凭函数名自动选一个实现或改变真实现行导入策略。若预期行为与实际覆盖不一致，报告差异，先用既有 spec 定界再修复。
3. escapeHtml 统一适用契约，或明确局部 helper 与调用范围；安全字符不能漏转义。保持现行非相关显示行为，只改本次消除覆盖所需调用。
4. 新检查使用现有 TypeScript 编译器 API 或仓库已有语法解析器识别同一词法作用域的函数/变量声明；不靠搜索文本统计声明。模块局部同名、字符串、注释与嵌套闭包不能误报。
5. 检查 manifest 和已显式声明的 T07/T08 模块接口依赖：缺项、重复注册、缺导出或不满足的装配顺序必须失败并定位文件/符号；检查不执行用户卡片脚本。
6. 不声称静态检查能证明所有动态全局调用。明确检测范围，先扫描真实源码，再处理清单中的已确认冲突；其他无关问题报告，不能白名单整个目录掩盖。
7. 将检查接入现有构建/完整 check 的合理入口；失败前不得部分覆盖产物。更新测试夹具，保持现有清单缺文件与漂移拒绝行为。
8. 不新增依赖，不升级依赖/锁文件；更新结构/spec 中的检查命令与检测范围。

## 新检查必须测试的非法输入

| 夹具 | 预期 |
| --- | --- |
| 同一作用域跨文件重复函数/变量 | 非零，报告两个位置 |
| 嵌套/独立模块局部同名，注释/字符串 | 通过，无误报 |
| 模块依赖缺失/装配顺序错误/导出缺失 | 非零，明确依赖位置 |
| 合法旧 IIFE 与合法模块 | 通过，不执行源码 |
| 失败构建 | 原产物字节保留，不留下部分文件 |
| 导入和转义实际调用 | 字符安全、原数据与既有导入契约保留 |

协调者构建并运行结构/完整 check 与库搜索、JSON/PNG/会话往返浏览器冒烟。若出现范围外真正缺陷，单列报告，不随本任务扩大清理。

## 执行器检查与报告

```powershell
node scripts/test-app-contracts.mjs
node scripts/check-app-contracts.mjs
node scripts/test-sync-function.mjs
npm run check:transfer
git diff --stat
```

至少完成一次源码级冒烟，协调者再构建并做真实浏览器验收。修 bug 先记录真实失败再修复；重构对照迁移前后行为。交付须列明修改原因、命令/退出码/断言、未执行与失败原因、兼容风险和回退。全局入口报告由协调者核查实际 diff 与 `runtime_cleanup`，未执行不得写通过。

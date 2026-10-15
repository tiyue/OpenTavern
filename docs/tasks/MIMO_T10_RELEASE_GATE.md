# MiMo T10：可重复的浏览器交叉验收与产物检查入口

状态：待执行。审查基线：`c951506a75e80d434bbf623e5978093956443ef2`；实际实施以所有前置任务已验收提交为基线。前置：T09。**任务文档不代表已实施、验收或发布。**

先读 [总指南](../MIMO_DEVELOPMENT_GUIDE.md)、[全量任务索引](README.md)、工作副本 `AGENTS.md` 与 `docs/spec.md`。MiMo 仅实施指定源码/测试；协调者独立构建、验收和版本管理。不得递归启动模型/执行器、提交、推送或发布。

## AllowedFiles

**仅以下相对路径可写，禁止修改无关部分。清单为上限，不要求全部修改。**

- `scripts/check-release.mjs`（本任务计划新增）
- `scripts/test-release-gate.mjs`（本任务计划新增）
- `scripts/test-generation-format-browser.mjs`
- `scripts/test-static-message-browser.mjs`
- `scripts/test-regex-queue-browser.mjs`
- `scripts/test-prompt-controls-browser.mjs`
- `scripts/test-message-reliability-browser.mjs`
- `scripts/test-card-runtime-browser.mjs`
- `scripts/test-sites-build.mjs`
- `src/ui/html/99-document-end.html`（仅更新本次发布的 app.js 版本参数）
- `package.json`
- `docs/spec.md`
- `docs/SOURCE_STRUCTURE.md`
- `docs/SITES.md`

不得覆盖用户修改，不顺手改无关代码/注释/格式。发现必要范围外依赖先报告，由协调者重新组织任务。构建产物不得手改；MiMo 不运行会写范围外产物的构建。新增路径已明确列出，创建时须遵循 manifest/入口要求，不能增加清单外文件。

## 目标

前置：T09 已验收。建立明确 release 检查入口，把源码检查、浏览器交叉矩阵和被测产物核对串联起来，结果可复查。此任务开发检查工具，不调用部署 API，不发布、不上传用户数据。

## 实施步骤

1. 复用现有 build/check/browser 脚本，不复制测试框架；新增 scripts/check-release.mjs 编排和 scripts/test-release-gate.mjs 负向测试，package.json 增加 check:release。
2. 建立清楚执行顺序：记录基线 SHA/受控工作树 → build:sites → 现有 check/check:sites → 在生成的 .sites-public 页面跑协议/交叉浏览器测试 → 核对 dist 静态资产与被测页面资产字节一致 → 输出报告。
3. 现有完整 check 包含漂移检查，内部可能重建产物；不能假称严格“只构建一次”。在前后记录核心 bundle/Worker/HTML/CSS 和打包引用资产哈希，重建也必须证明字节一致。源码或被测资产发生漂移则拒绝通过。
4. 用现有环境变量选择已安装 Playwright/Chrome。环境缺失、脚本非零、服务启动失败或必测脚本缺失均失败，不允许自动跳过当成功，不安装依赖、不联网到真实供应商。
5. 若编排本地服务，使用当前项目现有端口并核对归属；冲突要失败或明确使用可配置隔离端口，不能杀其他进程。Windows 后台服务保持隐藏，结束仅清理本次子进程，日志与截图写 D 盘本次运行目录。
6. 必测浏览器矩阵包含 T01–T05、T06 跨阶段设置快照、T07/T08 迁移行为；F19 如需双来源服务，按现有脚本配置本机独立来源并执行，不把“未部署远端 L3”写成已部署。
7. 报告列出源码 SHA、哈希映射、执行命令/退出码/断言、截图路径和未执行项。只含必要验收数据，无凭据、生产聊天/同步数据。
8. 真实供应商验收是独立条目，模拟检查不得标为真实通过。允许报告其未执行，但整体报告明确真实验证限制；不得伪造用户预设样本。
9. 更新 docs/SITES.md 的流程，不更改既有发布历史或写新的成功部署。更新 spec/结构索引命令；按已有发布规格更新 99-document-end.html 的脚本版本参数，由构建生成 index.html，不引入新的模板替换机制。

## 工具负向测试

用临时夹具/子进程替身验证编排，不在测试中调用 MiMo 或实际部署：

- 任一必测失败、浏览器依赖缺失、截图/关键报告缺失时非零，不进入可发布状态。
- 源码/产物哈希漂移或 dist 与被测资产不一致时失败，保留原材料。
- 服务端口冲突不杀现存进程，退出清理本次进程。
- 报告不包含密钥/请求头，真实供应商未执行不能标为通过。
- 全部必测成功时生成可复核报告；编排失败不会发布或覆盖原版本。

执行器不运行会写范围外产物的 check:release/build。协调者完成实际 build 和至少一次完整 check:release，再审阅 390/1280px 浅暗及系统主题截图。

## 执行器检查与报告

```powershell
node scripts/test-release-gate.mjs
git diff --check
git diff --stat
```

至少完成一次源码级冒烟，协调者再构建并做真实浏览器验收。修 bug 先记录真实失败再修复；重构对照迁移前后行为。交付须列明修改原因、命令/退出码/断言、未执行与失败原因、兼容风险和回退。全局入口报告由协调者核查实际 diff 与 `runtime_cleanup`，未执行不得写通过。

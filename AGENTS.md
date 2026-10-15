# OpenTavern 文档索引

## 功能规格

- [应用功能规格](docs/spec.md)：包含设置弹窗的信息架构、交互与验收要求，以及公开源码脱敏规则。

## 专题文档

- [本地优先与代理故障可靠性开发任务书](docs/DEEPSEEK_LOCAL_FIRST_RELIABILITY_PLAN.md)：R0–R7 实施、返工与验收；资源快照/离线更新、296 项公共资料、私有媒体可靠保存与局部渲染已随第 16 版发布，证据见 [SITES](docs/SITES.md)。
- [MiMo 开发指导与验收任务书](docs/MIMO_DEVELOPMENT_GUIDE.md)：全量开发指南；[T01–T11 完整任务包](docs/tasks/README.md) 与 [逐文件执行清单](docs/tasks/mimo-task-plan.json) 覆盖修复、业务模块和发布门禁；T01–T10 已完成并发布第 13 版，实际进度、返工、真实基础验收与限制见 [MiMo 验收记录](docs/MIMO_ACCEPTANCE_RECORD.md)。
- [源码结构与拆分边界](docs/SOURCE_STRUCTURE.md)：24 个 JS 业务目录、487 项源码装配、离线构建、两套同步后端及测试边界。
- [云同步](docs/CLOUD_SYNC.md)：云同步协议、配置与运维说明。
- [Sites 部署与数据迁移](docs/SITES.md)：Sites 构建、私有发布、外置服务和旧数据迁移说明。
- [F18/F19 主站源码仿写方案](docs/F18-F19-主站源码仿写方案.md)：当前主站函数依据、声明式 MVU、运行层级、可靠保存接入、文件清单与验收矩阵；支持 HTTP/本机/HTTPS；F18 与 F19 主应用 L0–L3 已随第 10 版发布，支持/验收见 spec，L3 独立服务未部署。
- [角色卡运行时专项设计](docs/card-runtime-security.md)：F19 的隔离、逐卡授权、消息契约、可选不同来源 broker 与验收门槛；不强制 HTTPS；主应用已发布，L3 远端服务未部署。
- [主站与分站功能对比](docs/主站分站功能对比.md)：主站功能审计、分站缺失项、主动裁剪项与分阶段补齐建议。
- [主站功能对齐开发方案](docs/主站功能对齐开发方案.md)：F01–F24 分阶段开发、文件边界、数据兼容、测试验收与风险回退方案；M1–M3/F17/M5 与 F18/F19 主应用已发布，L3 独立服务未部署，支持范围见现行规格。
- [独立卡片联网运行服务](card-runtime/README.md)：L3 HTTP/HTTPS 独立来源服务的配置、启动与运行限制。

## 工程结构

### 前端源码分片（src/app）

- 前端源码放在 `src/app/` 的业务目录中，如 `storage/`、`sync/`、`conversation/`、`mvu/`、`card-runtime/`；文件保留数字前缀，完整目录表见源码结构文档。
- [src/app/manifest.json](src/app/manifest.json) 是装配清单，**数组顺序即代码执行顺序**；后面的分片可能调用前面刚定义的函数，不要随意调整顺序。
- 新增分片文件必须登记进 manifest.json，否则不会被打包；清单中缺失的文件会在构建时直接报错。
- 日常修改应发生在 `src/app/` 分片中。

### 构建产物（不得手改）

- `assets/js/app.js` 是 [scripts/build-app.js](scripts/build-app.js) 按 manifest 顺序拼接生成的 bundle，是浏览器实际加载的脚本。
- 正则隔离程序的唯一源码是 `assets/js/regex-worker.js`；构建时把它内嵌到正则运行时占位，浏览器优先使用本地 Blob Worker，并保留同源脚本兼容分支。不得手改 bundle 内的副本。
- **禁止直接编辑 `assets/js/app.js`**；任何改动都应修改 `src/app/` 分片后重新构建。
- 页面与样式源码位于 `src/ui/html/`、`src/ui/css/`，顺序由 `src/ui/manifest.json` 决定；`index.html` 和 `assets/css/app.css` 同样是构建产物，**禁止手改**，使用 `npm run build` 重建。

### 后端与测试

- Cloudflare 同步入口仍为 `functions/api/sync.js`，业务模块在 `functions/sync/`，使用显式 ES module 导入/导出。
- Python 启动入口仍为 `server/opentavern_sync_server.py`，业务模块在 `server/opentavern_backend/`；部署时必须连同包目录复制。
- 综合测试入口仍为 `scripts/test-sync-function.mjs`，公共夹具与业务测试在 `scripts/tests/`；新分片或路径迁移需同步测试装载列表。

## 验证命令

- `npm run check:local-first`：本地运行资源、确定性版本清单、离线缓存与更新、消息局部渲染、私有图片和公共卡可靠导入；已纳入完整检查。`test-local-first-browser.mjs` 与 `test-local-render-browser.mjs` 纳入九组发布门禁。

修改代码后按需运行：

- `npm run build`：重新生成 `assets/js/app.js`（修改了 `src/app/` 分片或 manifest 后必须运行）。
- `npm run build:ui`：按页面/样式清单重建 `index.html` 与 `assets/css/app.css`；已包含在 `build` 与 `build:sites` 中。
- `npm run check:structure`：源码清单完整、模板精确装配、漂移拒绝及缺失片段不会部分写入；已纳入完整检查。
- `npm run check:app-contracts`：AST 顶层符号、显示/传输模块接口与装配顺序检查；已纳入 app 构建和完整检查。
- `npm run check:release-tool`：发布门禁负向夹具和真实 Windows npm 启动冒烟。
- `npm run check:release`：同一源码的 Sites 构建、完整检查、七组浏览器与部署资源哈希核对；真实供应商和实际发布单独记录。
- `npm run build:sites`：生成 Sites Worker、打包实际引用的公共角色卡并执行部署产物检查。
- `npm run check`：完整检查面——语法检查（build 脚本、`assets/js/` 脚本、`functions/api/`）、同步相关脚本测试与 Python 服务端单元测试。
- `npm run check:sites`：检查已有 `dist/` 是否满足 Sites 部署结构及公共角色卡资源完整性。
- `npm run check:message-reliability`：消息身份、摘要来源、回复版本与可靠保存故障回归（已纳入完整检查）。
- `npm run check:prompt-controls`：M2 预设迁移/排序/往返、Note/Depth、正则隔离、只读预览、请求参数及停止保护（已纳入完整检查）。
- `npm run check:chat-operations`：M3 收藏/搜索、成员与历史身份、开场及 JSON/PNG 往返（已纳入完整检查）；续写故障保护在 `check:message-reliability` 中。
- `npm run check:convenience`：M5 代写竞态、设置草稿、persona 操作、六类分项恢复、非法输入及真实保存队列故障（已纳入完整检查）。
- `npm run check:private-settings`：设置双向过滤、本机凭据/端点配对、运行时命名排除、结构保留名及原始元数据保留（已纳入完整检查）。
- `node scripts/test-prompt-controls-browser.mjs`：M2 隔离浏览器请求/诊断与移动浅暗界面冒烟；使用已有 Playwright 和本地服务，离线验收入口为 `/.sites-public/opentavern.html`（先运行 `npm run prepare:sites`）。
- `node scripts/test-static-message-browser.mjs`：F17 Markdown/静态 HTML、恶意输入、禁止外链加载、流式一致性及移动浅暗视觉冒烟；使用同一隔离浏览器入口。
- `node scripts/test-regex-worker-browser.mjs`：首次正则前完全断网、单实例复用、真实灾难正则终止后断网重建、任务关联、同源兼容及移动/桌面浅暗/系统主题；已纳入发布门禁，沿用已有 Playwright 和隔离入口。
- `node scripts/test-convenience-browser.mjs`：M5 实际文件恢复、设置完成/放弃、代写取消、模型列表迟到、存储失败和完成确认竞态；检查移动/桌面浅暗及桃信主题截图，使用同一隔离浏览器入口。
- `node scripts/test-message-reliability-browser.mjs`：可选的隔离浏览器冒烟；需现有 Playwright/Chrome 与本地静态服务，可用 `OPENTAVERN_PLAYWRIGHT_MODULE` 指定现有模块路径，不自动安装依赖。
- `npm run check:mvu`：声明式解析、纯回放、人工覆盖/版本与可靠保存生命周期故障回归。
- `npm run check:card-execution`：逐卡许可、桥接数据/输入/MVU 能力和独立 broker 约束。
- `node scripts/test-card-runtime-browser.mjs`：真实非安全 HTTP 摘要、审核入口、iframe隔离、MVU保存、模块循环闭包与L3双来源请求；需现有Chrome/Playwright，先启动8765应用静态服务与8766独立运行服务。
- `npm run check:server`：仅运行 Python 同步服务端单元测试。

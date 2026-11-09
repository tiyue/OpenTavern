# OpenTavern

本地优先的 AI 角色聊天应用，支持单聊与群聊、角色卡、世界书、提示词预设、摘要记忆和备份同步。聊天推理通过用户配置的 OpenAI 兼容 API 或原生 Anthropic Messages API 完成。

## 使用入口与当前状态

- 使用应用：[OpenTavern](https://www.yubanyuban.com/opentavern)；[ECS 备用入口](http://39.105.48.52:8888/)（2026-10-23 已同步第 17 版，部署及数据边界见 [ECS 记录](docs/ECS.md)）。
- 仓库最新发布记录为 **Sites 第 17 版（2026-10-22）**，新增原生 Anthropic、用户图片与版本、流式恢复、JSONL/分段备份及世界书/预设可靠保存；完整证据与限制见 [发布记录](docs/SITES.md)。
- 2026-10-22 的工程整理及本轮主站功能对齐已随第 17 版上线。[对齐记录](docs/upstream-alignment-20261022.md) 列出来源与验收；当前能力以 [功能规格](docs/spec.md) 为准，历史任务书不代表当前待办。

## 主要能力

| 功能 | 范围 |
| --- | --- |
| 聊天 | 文本/图片消息、流式恢复、停止、重生成、用户与回复版本、分支、群聊与 @、收藏和搜索 |
| 角色与提示词 | JSON/PNG 角色卡、全局与角色额外世界书、显示排序、可靠预设库、宏和隔离正则 |
| 记忆与状态 | 自动/手动摘要、摘要来源校验、独立摘要 API、MVU 剧情变量 |
| 本地数据 | OPFS/IndexedDB、可靠保存、分段备份、JSON/JSONL 导入、分项恢复、私有图片本地副本 |
| 离线与更新 | 核心和公共资源准备、完整性校验、后台检查和手动切换版本 |
| 同步与扩展 | Cloudflare D1 或 Python 后端同步；经逐项授权的隔离角色卡运行 |

角色卡、世界书和预设支持 SillyTavern 相关格式；具体兼容接口与执行权限见 [功能规格](docs/spec.md) 和 [角色卡运行时设计](docs/card-runtime-security.md)。远端 L3 卡片联网服务未部署，TTS 不在当前功能范围。

## 开始使用

1. 打开应用，在“设置 → 连接”配置 API 地址、密钥和模型；摘要可配置独立连接。
2. 从公共角色库选择角色，或导入自己的角色卡，然后新建聊天。
3. 在“设置 → 界面与数据”导出备份，并查看“本地资源与离线更新”的准备状态。

数据默认保存在当前浏览器来源下；启用云同步后，数据还会发送到配置的同步后端。更换域名、端口、浏览器或设备不会自动搬迁本地数据，操作前先备份；迁移步骤见 [部署与数据迁移](docs/SITES.md)。

首次访问需要联网完成资源准备。核心与所需公共资料完整后，HTTPS 或本机来源支持断网重开并操作本地数据；普通远程 HTTP 不保证离线导航。模型推理、云同步以及尚未准备的远程图片仍需要网络，离线不等于离线生成回复。

## 本地开发

需要 Node.js **22.13.0 或更高版本**；以下静态预览命令还需要 Python。开发应使用完整仓库及配套资源，不能只下载 `index.html`。

```sh
npm ci
npm run build
python -B -m http.server 8765 --bind 127.0.0.1
```

打开 <http://127.0.0.1:8765/>。静态预览可使用聊天和浏览器本地数据，同源云同步需另行配置后端。

| 命令 | 用途 |
| --- | --- |
| `npm run build` | 从源码生成聊天 JS、HTML/CSS、本地依赖和离线版本资源 |
| `npm run check` | 完整代码、协议、存储和可靠性检查；Python 测试也需要 Python |
| `npm run build:sites` | 生成并检查 Sites 部署包，不执行发布 |
| `npm run start:sites` | 使用已有 `dist/` 启动本地 Worker，默认端口 3000 |
| `npm run check:upstream` | 主站新增能力的六组协议、图片/版本、预设、恢复、传输与世界书专项回归 |
| `npm run check:release` | 同产物构建、完整检查和十组浏览器发布门禁；需已有 Chrome/Playwright，配置见 [发布说明](docs/SITES.md) |

## 从哪里改代码

| 路径 | 职责 |
| --- | --- |
| `src/app/` | 24 个业务目录、467 个 JS 分片；`manifest.json` 决定执行顺序 |
| `src/ui/` | HTML 和 CSS 源码；`src/offline/` 保存 Service Worker 源码 |
| `assets/` | 生成的应用脚本/样式、辅助脚本和固定第三方资源；`cards/` 保存原始角色卡与素材 |
| `app/`、`worker/`、`sites/` | Sites/Vinext 回退页、请求路由和样式构建支持；主要聊天业务不在 React 页面中 |
| `functions/`、`db/`、`drizzle/` | Cloudflare/D1 同步后端及数据库迁移 |
| `server/` | 可独立部署的 Python 同步与图片网关 |
| `card-runtime/` | 需要不同来源部署的可选卡片联网服务 |
| `scripts/`、`docs/` | 构建测试、规格、开发方案、验收和发布记录 |

`index.html`、`assets/js/app.js` 和 `assets/css/app.css` 是生成文件，修改对应 `src/` 源码后运行构建，禁止手改产物。前端分片仍共享部分作用域，目录分类不代表已全部转换成独立模块。

`node_modules/` 是开发依赖，`.sites-public/` 和 `dist/` 是可重建的资源副本；它们不属于业务源码。`android/` 是尚未纳入当前 npm 构建流程的可选平台工作区，保留现有内容。`.wrangler/` 可能含本地数据库，不能作为普通缓存批量删除。详细边界见 [源码结构](docs/SOURCE_STRUCTURE.md)。

## 文档与贡献

- [功能规格](docs/spec.md)：当前能力、兼容范围和验收要求。
- [源码结构](docs/SOURCE_STRUCTURE.md)：源码入口、装配顺序、生成物与可选平台。
- [部署与发布记录](docs/SITES.md)：Sites 构建、迁移和历次上线证据；[ECS 备份部署](docs/ECS.md) 记录第二入口、版本同步、数据保留和回退。
- [云同步](docs/CLOUD_SYNC.md)、[Python 服务](server/README.md)、[卡片运行服务](card-runtime/README.md)：按需部署和配置。
- [中文贡献指南](CONTRIBUTING.zh-CN.md) / [Contributing](CONTRIBUTING.md)：提交前先阅读 [项目规范](AGENTS.md)，保持修改聚焦。

## English overview

OpenTavern is a local-first AI character chat app with character cards, lorebooks, group chat, prompt presets, summaries, backups, optional cloud sync and isolated card execution. Generation uses a user-configured OpenAI-compatible API or native Anthropic Messages API.

The same application release is also deployed to an [ECS backup](http://39.105.48.52:8888/). Browser-local data and cloud databases remain separate across the two origins; see the [ECS deployment record](docs/ECS.md).

Use the complete repository and accompanying assets for local development. Run `npm ci`, `npm run build`, then serve the repository over localhost. Core chat sources live in `src/app/` and `src/ui/`; root `app/` provides the Sites/Vinext fallback rather than the main chat UI.

Offline reopening requires completed resource preparation and HTTPS or localhost. Model requests and synchronization still need a reachable service. The latest recorded deployment is Sites version 17 (2026-10-22), including the upstream feature alignment and source cleanup. See the [specification](docs/spec.md), [source map](docs/SOURCE_STRUCTURE.md), and [release records](docs/SITES.md) for supported behavior and limits.

## 许可说明/License

本项目（包括源代码和附带的 SillyTavern 角色卡 JSON 文件）均采用 **GNU Affero General Public License v3.0 (AGPL-3.0)** 许可。如需商业用途（闭源使用、商业产品集成、SaaS 服务等），请联系作者获取商业许可。

角色卡 JSON 文件作为项目的一部分，受 AGPL v3 许可保护。任何人使用、修改或分发这些角色卡时，应遵守 AGPL v3 条款。角色卡中的原创内容（人格设定、场景、对话等）仅授权在 AGPL v3 框架下使用。

This entire project, including the source code and the included SillyTavern character card JSON files, is licensed under **GNU Affero General Public License v3.0 (AGPL-3.0)**.For commercial use (including closed-source distribution, commercial product integration, or SaaS deployment), please contact the author to obtain a commercial license.

The character cards are part of this licensed work. Any use, modification, or distribution of the project or its components must follow the AGPL-3.0 terms.

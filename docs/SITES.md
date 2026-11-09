# ChatGPT Sites 部署与数据迁移

## 当前范围

Sites 原样承载现有 OpenTavern 前端。聊天、角色卡、世界书、设置和浏览器存储继续使用现有实现；同源 `/api/sync` 使用 Sites 原生 D1，图片生成服务仍保持外置。

当前 `.openai/hosting.json` 将逻辑绑定 `DB` 交给 Sites 管理，不启用 R2。四张同步表由 `db/schema.ts` 和 `drizzle/` 迁移定义；Worker 仍执行幂等建表，以兼容既有 Cloudflare Pages 部署。

## 发布前检查

使用已有 Playwright/Chrome，不安装依赖。设置 `OPENTAVERN_PLAYWRIGHT_MODULE` 与 D 盘证据目录后执行 `npm run check:release`。门禁构建 Sites、执行完整检查，启动自己拥有的 8765/8766，运行原九组及主站功能对齐，共十组浏览器；端口占用时失败，结束仅清理本次子进程。记录根离线快照、完整预览与 dist 资源树，不只检查入口脚本。

离线部署必须打包 `offline-manifest.json`、`opentavern-sw.js`、本版 `assets/offline/<releaseId>/…`、固定 vendor 与 296 个公共文件。普通入口与 Sites 的 `index.html`/`opentavern.html` 使用相同固定字节，基址按当前路径计算。Worker 为清单、SW 和入口声明重校验，为固定资源声明不可变与 `no-transform`；Sites 静态层可能覆盖这些响应头并改写 HTML，因此不以该响应头作为离线正确性的前提。核心外壳通过同字节 `index.html.txt` 下载，严格要求 `text/plain`，核对原 HTML 的大小与 SHA-256 后才以 `text/html` 存入原缓存键；不剥离注入脚本，不放宽校验。同步路由、公开访问和 D1 绑定保持原样。

上线后旧页面仍运行旧版，后台核心就绪后用户可在“设置 → 界面与数据 → 本地资源与离线更新”切换。不要要求清除全部浏览器数据来升级。首次必须联网完成准备；完整缓存后支持安全上下文/本机来源断网重开，普通远程 HTTP 保留联机及已加载本地操作，不能保证离线导航。图片的跨域读取失败、未准备公共文件、模型不可达与云同步失败分别报告。

每组报告与截图独立保存，覆盖 390/1280px 浅暗及跟随系统主题。报告记录受控源码 SHA/哈希、完整预览与 dist 树哈希、命令退出码和部署资源字节对照；检查期间源码或产物漂移即拒绝。`npm run check:release-tool` 的负向夹具不替代实际发布门禁。真实供应商和实际预设验收由协调者另记，工具不会调用供应商，也不会部署。

在专用发布副本中，通过 Sites 源码准备工具核对远端祖先，再对同一源码构建/验收/打包；向 Sites 保存推送的准确提交与归档，部署返回的准确版本 ID。正式域纯文本外壳、应用 bundle、正则 Worker 和样式须与被测产物字节一致；联机 HTML 若被平台注入，单独记录差异，不能宣称原始响应完全相同。保持现有公开访问、绑定、HTTP 支持与用户数据；不将远端 L3 计为已部署。

## 最新发布记录

2026-11-09 13:05:47（北京时间）发布第 20 版，原生部署 succeeded；ECS 于 12:54:14 完成切换、12:59:18 完成公网浏览器验收，随后才发布 Sites，见 [ECS](ECS.md)。本版上线保留的 12 项酒馆扩展功能，范围与未运行项见 [开发验收记录](tavern-feature-acceptance-20261107.md)。

- 已验收入口：[原生 Sites 应用](https://opentavern-ai-chat.longyu9708.chatgpt.site/opentavern)、[自定义域 OpenTavern](https://www.yubanyuban.com/opentavern)。本次两个域都返回 200，并分别完成资源字节核对和浏览器验收；第 19 版的自定义域 403 为历史观察。本轮未改变域名、DNS、WAF 或访问策略。
- 功能源码 `4650fc0f39928e31d58a1632afbe348312df1b47`；准确推送/打包源码 `9c506acdbbf14e0b030ff688be5c3c0cfc45d433`；版本 `[site-id]~[version-id]`；部署 `[deployment-id]`。原项目、公开访问、DB/D1、R2 未启用及环境版本 0 保持。GitHub 经脱敏的功能快照 `24b69619f5c203f2a27b27a722959b2da81b120b` 已正常推送，发布记录另行提交。
- releaseId `afa8c8d0d9d836d61cf092ba`；bundle 3,194,708 bytes、SHA-256 `ffc53ada1a79dbab0ae2d2216fadd6887ec2b3ce67325d8f887e19a92a889518`；CSS 86,791 bytes、`3bba621e04d08f07c6a2a5672ad95a2d69cd0f21581774793abd797f65b89c80`。归档逐项核对核心资源与真实项目绑定，未包含私人角色卡。
- 原 33 组功能验证保持；本轮重新运行构建、完整检查（66 项 Python）、十组浏览器发布门禁，源码/产物稳定、完整预览/dist 一致、自有服务清理通过。源码准备工具提交后再对 1091 项受控文件核对与门禁工作树字节一致；不能用门禁执行时尚未提交的旧 HEAD 代替准确推送提交。
- 原生域和自定义域各 23 项清单/SW/运行/固定版本/公共卡资源摘要一致，固定 `index.html.txt` 为 text/plain 且与原始外壳摘要一致。两个域的联机 `/opentavern` HTML 都有平台注入，各 165,954 bytes；如实记录与原始外壳不同，不放宽资源校验。
- 两个域分别运行 D2 整组隔离 Chrome，各 24 流程、5 次合成模型请求、9 张截图、0 pageError。插件实际 Worker、导入/授权/更新/失败保护/回退/停止/卸载、受控网络以及关闭插件后的聊天、模型工具、总结和刷新恢复通过；390/1280px 浅暗/系统代表截图已查看。未使用用户浏览器数据，未调用真实计费模型；Embedding 中文质量和 iPhone 真机仍未验收。
- 证据：`/path/to/local-release-evidence` 下 `sites-native-release.json`、`archive-verification.json`、`source-provenance-verification.json`、`sites-native-public-http.json`、`sites-public-http.json`、`sites-browser/report.json` 与 `custom-sites-browser/report.json`。数据库绑定和访问策略保持；回退选择已保存的第 19 版部署，不自动回写旧 D1 或浏览器数据。

## 第 19 版历史发布记录

2026-11-06 23:49:54（北京时间）发布第 19 版，原生部署 succeeded；ECS 已于 2026-11-06 23:46:42 先完成发布，见 [ECS](ECS.md)。进入聊天时，消息区域显示并完成侧栏布局后对齐最新消息；普通重绘、加载更早及历史阅读继续保留锚点。生产改动仅两个 JS 分片共 10 行，其他为测试、规格与脚本生成物。

- 本次已验收入口：[原生 Sites 应用](https://opentavern-ai-chat.longyu9708.chatgpt.site/opentavern)；原自定义正式域 [OpenTavern](https://www.yubanyuban.com/opentavern) 在本机 Chrome/curl 及 ECS curl 均收到 Cloudflare 403，不能宣称自定义域名验收成功；相关响应和浏览器超时诊断保留。未修改域名、DNS、WAF 或访问策略。
- 准确推送/打包源码 `c114ab2e010af8304261d57eb3e5376244f1dc2f`；版本 `[site-id]~[version-id]`；部署 `[deployment-id]`。项目、公开访问、DB/D1、R2 未启用及环境版本 0 保持。未推送 GitHub。
- releaseId `fc677344d1452b9817ba3da2`；bundle 2,128,432 bytes、SHA-256 `1dd33db53effba2f6a3b2f2dd2d063d836ab5cb60156de608f7331b53bc85a9a`；CSS 82,541 bytes、`eb4933d6a0a3a15a86450a6d34db9366645aecacf1bd7f3c3128e91d2fb25a52`。原生域 23 项清单/SW/运行/固定版本资源与公共卡逐字节一致，固定外壳严格 text/plain；联机 HTML 的平台注入差异单独记录，不声称与原始外壳一致。未在公网重下载全部 296 公共文件，本地完整离线门禁已覆盖。
- 同源码完整发布门禁一次通过，含 66 项 Python 和十组 Chrome；新增长会话进入回归已纳入既有局部渲染组。原生域独立 Chrome 的 18 项进入、会话切换、真实持久化刷新恢复通过，390/1280px 浅暗/系统最新消息均可见、底部间距为 0；普通重绘保留旧位置，代表截图已视觉检查。未调用计费供应商，未操作真实 iPhone。
- 归档 398 个普通文件、142,846,524 bytes 全部与被测 dist 相同；本机 gzip 131,838,806 bytes，SHA-256 `b3e141baeeabe04d0dc84b7362f64beed6b26a21123489b053bc43f08143444f`；Sites 接收 tar 143,206,400 bytes，`sha256:1a917781a48c635a2e62e4e462547b980eb97240f9241559ff9a66c4b4684b6e`。两种容器分别记录。
- 证据目录 `/path/to/local-release-evidence`：`before-entry.json`、`independent-before.log` 保留原版失败；`independent-after/`、`local-browser/`、完整 gate/、`archive-parity.json`、`sites-publication.json`、`sites-native-public-http.json`、`sites-native-browser/` 保留验收。首轮 DeepSeek completed、runtime_cleanup=removed；协调者发现测试夹具写死会话 ID，返工只改浏览器脚本；返工 Chrome 沙箱启动受限后协调者停止环境重试，报告 failed/exit=1、无越界、cleanup=removed，同一浏览器测试已由协调者在正常环境通过，未省略验收。

### 第 18 版历史记录

2026-10-31 21:11:55（北京时间）发布第 18 版，原生部署 `succeeded`；ECS 已于 21:04:49 先完成发布，见 [ECS 记录](ECS.md)。本版加入 IndexedDB 打开/事务及可选恢复读取的有界等待、迟到连接隔离、不确定写入只读确认，让发送/摘要保存故障能够结算并恢复操作，保留原数据结构、同步协议及界面。

- 正式入口：[OpenTavern](https://www.yubanyuban.com/opentavern)；原生地址：[Sites](https://opentavern-ai-chat.longyu9708.chatgpt.site)。功能提交 `ec2cec501ce9007eab2c270ac1c51b7642fb3de2`；准确推送/打包源码 `7208bf6ee98454da3fd5d3b6160be335376f1645`，含本轮测试夹具及重建入口。版本 `[site-id]~[version-id]`；部署 `[deployment-id]`。现有公开访问、项目、域名、DB/D1 与环境版本 0 保持，R2 未启用。
- 发布副本 `/path/to/local-release-evidence` 未包含私有未跟踪角色卡。最终 `check:release` 通过构建、完整检查（含 66 项 Python）、十组 Chrome、源码/产物稳定及预览/dist 一致，自有服务清理 `removed`；报告 `gate-final/release-2026-10-31T12-57-51-021Z-5200/release-report.json`。保留首轮本机卡片服务连接瞬断、第二轮正则队列夹具积压提前清空的原报告；前者原样隔离复跑通过，后者由 DeepSeek 仅修测试探针，在真实保存期间保持显示背压，原优先级和 payload 断言保留。协调者另以错误优先级负向变体确认原断言会失败，再完整重跑门禁通过；未修改生产正则调度器。
- `releaseId=8834ee5fc1732c00d00b5647`；bundle 2,127,791 bytes、SHA-256 `a3fa3ff61fb70521c829f4fdd3d2530123cc6db20a79d60059280e5299192957`；CSS 82,541 bytes、SHA-256 `eb4933d6a0a3a15a86450a6d34db9366645aecacf1bd7f3c3128e91d2fb25a52`。干净发布副本与主工作目录换行方式造成构建摘要不同，协调者确认规范化后的 JS/CSS 相同；实际两端均使用该被测发布副本，未混用另一构建资源。
- 正式域名 23 项清单/SW/运行/固定版本资源及公共卡与产物大小及 SHA-256 一致，含严格 `text/plain` 的固定外壳（152,491 bytes，`2a16793f59761df840f2d51056863c789454f35de30a9ccb0b33e68d37b9b7ee`）。`/opentavern` 返回 200，联机 HTML 153,605 bytes，平台注入与原始外壳差异单独记录，不宣称相同。Python HTTP 客户端首轮被边缘返回 403，改用本机 curl 公网读取后全部通过，未改变站点访问配置。未在公网重下载全部 296 公共文件，本地完整离线门禁已覆盖。
- 正式域隔离 Chrome 通过正常保存/刷新、发送和摘要存储超时失败后恢复重试，共 4 次模拟请求；390/1280px 浅暗/系统主题、无页面异常或横向溢出通过，代表截图已视觉检查。模型端点为测试拦截，未调用计费供应商、未访问用户浏览器资料或生产同步数据；iPhone 真机和用户原故障环境仍待验证，不能把 Chrome 手机视口等同 WebKit 真机。
- 归档 398 普通文件、142,845,246 bytes 全部与被测 dist 一致（`archive-parity.json`）。本机 gzip 为 131,838,395 bytes、SHA-256 `9e92095524943b7c481ba30feea0c15aec2de6a5507c6da6ffdd55c1e9372928`；Sites 接收的原生 tar 为 143,196,160 bytes、SHA-256 `8442b46bec5e2200730c93f78cd6fec5508706e339349f0a0d13e3ada79fa768`。容器不同，摘要分别记录。
- 本机证据统一位于 `/path/to/local-release-evidence`：`sites-publication.json`、`sites-public-http.json`、`sites-browser.log`、`sites-browser/`、完整门禁及负向测试日志。DeepSeek 夹具任务运行 `2026-10-31T12-49-12-076Z-31632` 无范围越界、`runtime_cleanup=removed`，实际差异由协调者独立审查。发布记录另行本地提交，不改变已保存版本的源码 SHA；仅推送 Sites 源库，没有推送 GitHub origin/fork。

手机恢复观察：2026-10-31 用户 iPhone 真机回报：第 18 版先显示 `IndexedDB save timed out`；复制未发送文字后，关闭所有 OpenTavern 标签页并从多任务界面彻底退出 Chrome，再打开原 ECS HTTP 网址，发送恢复正常。随后同一会话总结成功，刷新后新消息与总结均仍存在。此为用户操作和结果回报，协调者未直接采集手机控制台或 IndexedDB 日志；支持“重启后已恢复且保存留存”的结论，不足以确认具体 WebKit 缺陷、配额不足或永久消除复发。本轮未清除网站数据、未追加应用代码或重新发布。

### 第 17 版历史记录

2026-10-22 23:46:21（北京时间）发布第 17 版，Sites 原生部署 `succeeded`。本轮主站功能对齐及工程整理已经上线，保持现有公开访问、原域名、DB/D1 和同步数据协议。

- 正式入口：[OpenTavern](https://www.yubanyuban.com/opentavern)；原生地址：[Sites](https://opentavern-ai-chat.longyu9708.chatgpt.site)。发布源码 `95fe4f66318ed423202c77d06ed2d68596a34f52`；版本 `[site-id]~[version-id]`；部署 `[deployment-id]`。发布后的文档单独本地提交，不覆盖被测源码 SHA。
- 范围：原生 Anthropic、用户图片、用户/回复关联版本与分支、流式草稿恢复、SillyTavern JSONL、分段 JSON 备份、全局/角色额外世界书与显示排序、预设可靠提交、每预设连续 System 合并和显式失败重试。[本轮对齐记录](upstream-alignment-20261022.md) 列出主站依据、兼容与限制。新增 8 个分片，当前 24 个业务目录共 467 项；整理只删除无执行语句的旧注释分片。
- 同版 `check:release` 通过 Sites 构建、完整 `check`（含 66 项 Python 测试）、`check:sites` 与十组 Chrome；390/1280px 浅暗及系统主题、源码/资源树不漂移、预览/dist 一致均通过，自有 8765/8766 清理 `removed`。验收发现并修复发送时设置快照与可靠保存后消息对象身份回归，保留原断言后完整重跑通过。
- 门禁根目录 `/path/to/local-release-evidence`；主报告 `release-report.json`。工具仍记录供应商 `not-run` 和待独立验收，协调者完成源码/界面审查及实际发布后另记 `coordinator-release-decision.json`，不改写工具原始结论。依用户要求，本轮只由 GPT 编程、审查与验收，未调用 DeepSeek/MiMo 执行器或真实模型推理；原生协议由合成端点验证，真实 CORS、权限和模型图片/思考能力仍取决于供应商。
- 正式 `/opentavern` 返回 200；35 项运行/固定版本资源、清单和 SW 与被测产物一致，见 `online/online-verification.json`。清单为 17 核心、296 公共文件；本次未重新下载正式站全部 296 文件逐项核对，本地完整离线浏览器门禁已通过。正式隔离 Chrome 从角色库侧栏进入设置，检查默认 OpenAI、Anthropic 选项、图片输入、放弃草稿和无横向溢出，无 pageerror；1280px 浅色和 390px 暗色截图已视觉检查，结果 `online/published-browser.json`。首轮脚本选中隐藏聊天按钮的超时诊断单独保留，实际入口复跑通过。
- releaseId `36f9ceac4966107061269e5c`；应用 bundle 2,122,964 bytes、SHA-256 `57e932db9bfd2a689cb182a2a23217b5141c6aeec9830eaf151fdb3a9a855d9b`；CSS 82,912 bytes、SHA-256 `0a2d6d4f7034177b0650c7e472f5edb553b42f749910b8d43f7811215a44e7f1`；纯文本外壳 `assets/offline/36f9ceac4966107061269e5c/index.html.txt` 152,491 bytes、SHA-256 `0de54ca914494d4472ed7e1029992cbd9b83751b0dedfc70bec322a24c456edf`，严格 `text/plain`、原始字节一致。联机 HTML 为 153,429 bytes，多平台注入的 938 bytes，单独记录不相等，不剥离脚本凑摘要。
- 原生 tar 归档：596 文件、179,537,920 bytes、SHA-256 `245481037cada3432b9c79ecb13889aa69db260cccbab111df33fc371709c55b`；本机 gzip 容器 140,397,518 bytes、SHA-256 `3819c13440d6b60e16d4dbafb40dea754cc7318e45a7d14497900b501be7fcdf`。不同容器不宣称同摘要，全部 596 个普通文件与被测 dist 一致，见 `archive-parity.json`。独立发布副本未包含用户未跟踪的 `cards/qiong.json`，该文件原哈希未变。
- 源码已推送 Sites，GitHub origin/fork 未推送。没有修改用户数据、系统网络或数据库结构；TTS、本地模型、Android 桥和远端 L3 不在本轮范围。手机视口检查不替代手机真机验收，合成请求不替代真实供应商验收。

- 2026-10-23 00:29（北京时间）已同步同一第 17 版到 [ECS 备用入口](http://39.105.48.52:8888/)；前端 542 文件、配套 Python 后端、实际旧版运行时测试、公网与浏览器验收及回退见 [ECS 记录](ECS.md)。后续功能版本按双端分别发布和验收，两端数据不自动复制。

### 第 16 版历史记录

2026-10-15 22:45（北京时间）发布第 16 版，原生部署 succeeded。R0–R7 已实现，通过同版完整门禁、真实供应商与正式站点断网验收；保持公开访问、DB/D1、原域名及用户数据协议。

- 正式入口：[OpenTavern](https://www.yubanyuban.com/opentavern)；原生地址：[Sites](https://opentavern-ai-chat.longyu9708.chatgpt.site)。发布源码 `8d948e4b75ad217c93bf17f08ccd126747691018`；版本 `[site-id]~[version-id]`；部署 `[deployment-id]`。发布后的文档单独本地提交，不覆盖被测源码 SHA。
- 范围：本地运行依赖、17 核心快照、296 公共文件、后台增量/续传/校验、安全显式更新、私有图片本地副本及可靠保存、稳定 ID 局部渲染。更新不强刷草稿或生成中的页面；多标签页拒绝切换，清理可重下资源不清用户数据。
- 同版 `check:release` 通过 Sites 构建、完整检查（含 Python 回归）、check:sites、九组真实 Chrome；源码及整个资源树不漂移，预览/dist 字节一致，自有 8765/8766 清理 removed。报告：`/path/to/local-release-evidence`。工具自身保留供应商 not-run，独立协调决策为 `coordinator-release-decision-v16.json`。
- 正式隔离 Chrome 154.0.8037.98：17 核心及清单/SW 与被测产物字节一致。完整准备后完全断网，296/296 文件逐项读取并核对 SHA-256（133,429,794 bytes）；从未点击的十六夜野宫卡离线导入成功。合成历史在断网刷新、新开页面、关闭并重启浏览器后仍可读；无 pageerror，无外部运行依赖请求。正式结果 `online/online-verification.json`，390/1280px 截图已视觉检查；完整门禁另覆盖浅暗/系统主题。
- 正式首次离线正则约 7ms、复用成功，灾难规则约 506ms 终止，随后约 5ms 离线重建；500ms 保护未放宽，零独立 Worker 运行下载。相同 bundle 的真实 DeepSeek `deepseek-flash` 使用本机既有凭据、合成输入经实际提示/传输，一次 POST、约 846ms 返回 OK/stop、52 tokens、生成状态释放；未发送原生产历史，结果 `real-provider-acceptance.json`。
- releaseId `fd7bfb26208f884977056a60`；应用 bundle 2,055,432 bytes，SHA-256 `bfccba330cdc810c24209058136b84ed7ab2c2e3391d0bc8d0ff9658d0c00088`；纯文本外壳 150,932 bytes，SHA-256 `521338371a0f80a433a513a66b40722578ff249de37690aa88d2b8fd0ec32917`。线上 `index.html.txt` 严格 text/plain、原始字节完全一致。联机 `/opentavern` 仍多平台注入的 938 bytes（151,870 对 150,932），如实记录不相等，不剥离脚本凑摘要，不将其作为离线外壳。
- 第 15 版虽原生部署成功，但正式 HTML 被静态层改写，核心校验正确拒绝，未计作离线成功；修复纯文本传输后重跑全门禁再发布第 16 版。新增错误 MIME、缺失/损坏、同长错摘要与旧版保留回归，原始诊断 `v15-production-html-failure.json`。
- 原生归档：534 文件、167,731,200 bytes、SHA-256 `825642c686d4c5ec8c7ce4a68e927f3524de9d99b28add1478a08cf62545aaed`。本机 gzip 容器 137,608,537 bytes、SHA-256 `3e9303644d3bda7336958fe6615163245011bb010b5246a526ac3f2b9105e324`；不同容器不宣称同摘要，全部 534 个普通文件与被测 dist 逐字节相同，见 `archive-parity-v16.json`。
- 证据根 `/path/to/local-release-evidence`。普通非安全 HTTP 的角色卡读取、正则和摘要回退通过，不强制 HTTPS；该来源不保证离线导航。首访必须联网准备，清浏览器缓存后需重下；跨域图片受读取许可约束，模型仍需供应商可达。iPhone 真机及整机代理崩溃现场未实测，不新增 TTS、不部署远端 L3、不改系统网络。
- 已合回主目录并推送 Sites 源码；GitHub origin/fork 未推送。自有 8877/8878/8879 已核验 PID/命令后停止，所有执行器报告无越界且 runtime_cleanup=removed。

### 第 14 版历史记录

2026-10-15 17:46（北京时间）发布第 14 版，原生部署 succeeded。保持公开访问、原域名、DB/D1 与用户数据协议，不强制 HTTPS，不新增远端 L3 或 TTS。

- 正式入口：[OpenTavern](https://www.yubanyuban.com/opentavern)；原生返回地址：[Sites](https://opentavern-ai-chat.longyu9708.chatgpt.site)。源码 `49a762e35f288d3931eff5dd2f4940e5229211ca`；版本 `[site-id]~[version-id]`；部署 `[deployment-id]`。
- 范围：正则程序由唯一源码构建内嵌，正常 Worker 复用，错误/超时后重建；响应编号与协议校验、空闲异常清理、旧页面协议兼容。真正超时仍终止，10s/500ms 保护未放宽。全站离线导航、完整公共库缓存和 R6 局部渲染没有计为完成。
- 同一源码 `check:release` 通过 Sites 构建、完整 check（含 Python 回归）、check:sites 和七组真实 Chrome；390/1280px 浅暗/系统、源码及完整资源树不漂移、预览/dist 字节一致。首轮门禁准确阻止了过时的“必须下载 Worker”测试；改为真实 900ms 就绪握手和内嵌构造后完整重跑通过。报告：`/path/to/local-release-evidence`，门禁自有 8765/8766 清理 removed。
- 独立真实请求使用本机既有凭据和 `deepseek-flash`，合成输入经正则处理后直接请求，约 551ms 返回 OK、stop、状态释放；无生产聊天发送。报告 `real-deepseek-after.json`，53 tokens；门禁工具仍如实记录其自身未调用供应商，协调者决策另存 `coordinator-release-decision.json`。
- 上线检查：正式 `/opentavern` 返回 200，实际主程序 SHA-256 `6b5371488437e8b42aef6cdf44c5a3c18e8f58c53de199966bcbe3862558e6db`（1,913,427 bytes）；独立兼容 Worker `ca9e84eafd6fd9ffd30754316a6ff74e34b9568bfec02ff96c88f2239d8d5cc5`（1,858 bytes）；应用 CSS `80aee7bcc1b7a05b69a1225cafcbea44aa1e192f2ad872c1a6e57da25f20fcb2`，Tailwind CSS `ccc41c2a1bd9f8fc95d234684b950c4f21dd1b63a29b09af1965b96d12e046b7`，四项均与被测产物一致。HTML 原始响应带一个明确的 Cloudflare 注入脚本，仅移除该脚本后与 147,756 bytes 的预览核心完全一致，不宣称原始响应字节相等。
- 线上实际脚本首次正则前完全断网：首次约 25ms、复用成功、灾难规则约 506ms 终止、随后约 5ms 离线重建，全程零独立 Worker HTTP 请求。`online-verification.json`、`published-html-parity.json` 和 `published-v14.png` 在同一证据目录，截图已检查。iPhone 真机及用户历史网络现场未实测。
- 工具保存归档记录：375 文件、139,130,880 bytes、SHA-256 `4876687d45b5b83b2e324b4ff67b2b47c4425db7e56e92a7373fe67c9590a3c9`。本机 helper 生成 gzip 容器为 130,709,098 bytes、SHA-256 `e3ffeb6edfe4be95221aaf595683244eaa8a89c06ccf8fc635096b564fce8bd0`；不将不同归档容器摘要宣称相同，已核对本机包四项关键文件与 dist 相同，线上文件亦相同。本次 Windows helper 使用临时 PATH 选择现有 Git Bash，并设置本进程 `TAR_OPTIONS=--force-local` 处理盘符，无系统配置或应用改动。
- 已推送 Sites 源码，未推送 GitHub origin/fork。发布后的文档记录单独本地提交，不覆盖被测发布 SHA。

### 第 13 版历史记录

2026-10-13 发布第 13 版，原生部署 succeeded，保持公开访问、原域名、D1 绑定和用户数据协议。

- 正式入口：[OpenTavern](https://www.yubanyuban.com/opentavern)。源码 `330e0d4f0b529607a1aa43fa6edcfcc6c7083129`；版本 `[site-id]~[version-id]`；部署 `[deployment-id]`。
- 范围：T01–T10 的五类正确性修复、操作设置快照、显示/传输闭包接口、重复符号与模块契约检查，以及可重复发布门禁。TTS 不开发，不强制 HTTPS，远端 L3 未部署。
- 被测基线 `c262b4c29ba7a2bd0df76ab087db495d0b6894ed`；Sites 工具仅把构建生成的 HTML 换行规范化提交为上述发布 SHA。打包后再次比较完整受控源码与资产映射，和最终门禁完全一致。没有手改构建产物。
- 最终 `check:release` 实际通过 Sites 构建、完整 check（含 66 项 Python 与发布工具负向夹具）、check:sites 和六组真实 Chrome。各组独立 390/1280px 浅暗/系统截图和观察证据完整，源码/完整资产树不漂移，预览和部署字节一致，8765/8766 子服务清理 removed。报告：`/path/to/local-release-evidence`。
- 线上核对：根页与 `/opentavern` 返回 200。应用脚本 1,906,014 bytes，SHA-256 `ca3b98bac789a1b9183a3aa25822a887bdd347151085db020a86074936b929d6`；正则 Worker 1,580 bytes，SHA-256 `7c81e253ac126d6ba877015afe2225648d73eb60f01597d9f8a67c6e2ad0a4d3`；应用和 Tailwind CSS 均与被测产物字节一致。线上 HTML 多出 Cloudflare 边缘注入脚本，移除仅该明确脚本后应用 HTML 字节一致，不宣称原始响应完全相同。
- 归档 375 个文件、139,120,640 bytes，Sites 保存 SHA-256 `1a04f6f6f475b66d9efc4974694e8d9b3647285ae51197a8644a0cb286da1fdb`。已推送 Sites 源码，未推送 GitHub origin/fork。
- 真实供应商使用现有 DeepSeek `deepseek-flash`、当前 `SillyTavern Preset`（32/84 启用、29 正则）及既有两阶段配置，在新会话中生成正文和 4 个选项；主回复/二阶段重生成、停止恢复和刷新保存通过（8 条消息、8 个选项、版本 3/3、ID 一致）。实际请求预算 8192/1024，模型和 operation 一致，结束原因均为 stop。完整结果及未实测项见 [验收记录](MIMO_ACCEPTANCE_RECORD.md)。未读取密钥，未向模型发送原生产会话历史；生产双设备实测未完成。

### 第 12 版历史记录

2026-10-10 19:04（北京时间）发布第 12 版，保持现有公开访问、域名及绑定配置：

- 正式入口：[OpenTavern](https://www.yubanyuban.com/opentavern)；原生部署返回地址：[Sites 地址](https://opentavern-ai-chat.longyu9708.chatgpt.site)。
- 源码：`ae5b969236f0bd3adc1ee5b37ad4268c16c2f206`，已推送 Sites 源码仓库；未推送 GitHub 的 origin/fork。
- 版本：`[site-id]~[version-id]`；部署：`[deployment-id]`；状态 succeeded。
- 范围：默认二阶段在正文后追加 user 选项指令，有文本但格式无效时最多追加一次 API 纠正，不保存无效文本；空响应、中断、网络/保存失败和自定义提示词不重试。显示层去除 dream 控制包装，保留正文、状态栏、代码示例和原始消息，MVU 与卡片脚本输入保持原有处理。Worker 装载通过 prepare/ready 握手与 500ms 执行计时分离，装载有 10 秒期限，真实超时显示规则名称并终止；旧客户端直发任务首条仍是 result。保留既有队列优先级与可靠提交。
- 验证：最终 `npm run check`（含 66 项 Python 测试）、`npm run build:sites` 和 296 个公共资源检查通过。真实 Chrome 延迟 Worker 下载 900ms 时普通规则成功，灾难正则约 556ms 终止且界面保持响应、后续队列恢复；旧客户端、二阶段纠正/自定义、原文与代码保留、状态栏展开、静态安全、逐字流式一致和 390/1280px 浅暗截图通过。既有积压测试在 302 个任务下发送请求，发出时仍有 271 个待处理任务，300 条显示替换及重复渲染检查通过。卡片脚本/代码围栏与跨行代码独立对照通过。
- 线上核对：正式域根页与 `/opentavern` 均返回 200，无 pageerror；应用脚本 1,849,754 bytes，SHA-256 `ba85d4ea036aa55b64caea9c755e208efa8678b4b485bca1ac6fdacd3ff11854`；Worker 1,580 bytes，SHA-256 `7c81e253ac126d6ba877015afe2225648d73eb60f01597d9f8a67c6e2ad0a4d3`。两者均与本次构建字节一致。未使用真实模型凭据、未操作生产聊天或同步数据；L3 独立服务未部署，TTS 不开发。
- 归档：381 个文件，139,161,600 bytes，SHA-256 `c5c9111725e4f00d8eaf9340d758686f465e5517fa7afaa09fea92c2f42e87ae`（Sites 保存结果）。源码、构建及归档对应同一提交；发布记录文档单独提交。
- 实施验收：DeepSeek 独立副本三轮报告均无范围越界、`runtime_cleanup: removed`。协调者独立复现三个问题及审查发现的回归，修复测试中状态栏应先展开的验收步骤后运行最终检查与浏览器验收；第二轮执行器遇到的临时目录子进程 EPERM 在主目录完整检查中未再出现。

### 第 11 版历史记录

2026-10-10 03:54（北京时间）发布第 11 版，保持现有公开访问、域名及绑定配置：

- 正式域：[OpenTavern](https://www.yubanyuban.com)；原生部署返回地址：[Sites 地址](https://opentavern-ai-chat.longyu9708.chatgpt.site)。
- 源码：`47c574fb3e0d4329b60c574bf98e609348e73dd5`，已推送 Sites 源码仓库；未推送 GitHub 的 origin/fork。
- 版本：`[site-id]~[version-id]`；部署：`[deployment-id]`；状态 succeeded。
- 范围：提示词正则优先、进行中任务独立去重、失败不缓存、按消息保存显示链及宏/MVU 失效；取消过时显示任务、保护流式气泡、微任务启动 Worker，并在批次清空后合并刷新，消除重复整表重绘导致的 500ms 假超时。500ms 隔离终止保护仍保留。包含此前已提交的源码拆分；L3 独立服务未部署，TTS 不开发。
- 验证：最终 `npm run check`、Sites 构建及 296 个公共角色资源检查通过，含 66 项 Python 测试。隔离 Chrome 在 302 个任务积压下实际点击发送，模型模拟请求发出时仍有 270 个任务未完成；payload 替换正确，300 条显示逐条完成、重复渲染不再执行 Worker，编辑、关闭规则、流式气泡及 390px 浅暗视觉检查通过。最终本地 Worker 根页、index、Tailwind、DOMPurify、bundle 及角色 JSON 返回 200，bundle 字节一致。正式域真实 Chrome 页面与 bundle 返回 200，线上 bundle 字节一致，SHA-256 `0ab7a408114aa5f0daa09676b21194a1c47e1f896fed4ae1d80f3965bcc70dbe`。未使用真实模型凭据或操作线上同步数据。
- 归档：381 个文件，139,161,600 bytes，SHA-256 `6b9bc5d1231a0f68e4263d8b5cf50c0af4890279b5ae9826de5cadbd94fc1d08`（Sites 保存结果）。源码、构建产物与归档对应同一提交；发布后的记录文档单独提交。
- 实施验收：DeepSeek 独立副本的五轮报告均无范围越界，`runtime_cleanup` 均为 `removed`；协调者复现失败并审查返工，最终独立运行上述检查。

### 第 10 版历史记录

2026-10-03 01:55（北京时间）发布第 10 版，保持现有公开访问和绑定配置：

- 入口：[OpenTavern](https://opentavern-ai-chat.longyu9708.chatgpt.site)，来自 succeeded 部署结果。
- 源码：`dc128512f17d38564f291a5bbbbc34afdb4a6e70`，已推送 Sites 源码仓库；未推送 GitHub 的 origin/fork。
- 版本：`[site-id]~[version-id]`；部署：`[deployment-id]`；状态 succeeded。
- 范围：新增 F18 声明式 MVU、可靠保存与版本回放，F19 主应用 L0–L3 运行接口、审核和逐项许可。支持 HTTP/本机/HTTPS，TTS 不开发。L3 独立服务源码已交付，但未部署远端服务；主应用发布不会使该服务自动上线。
- 验证：复用同一源码此前通过的完整检查和 Sites 构建；发布时再次通过 bundle 漂移、296 个公共角色资源检查、执行层 94 项及 broker 55 项测试。归档结构通过，本地 Worker 的根/入口页、Tailwind、DOMPurify、app/六份固定依赖原始字节及角色卡 JSON 冒烟通过。没有调用真实模型或操作线上同步数据；上线状态由原生部署成功结果确认，未新增公网浏览器/真实设备验收。
- 归档：375 个文件，139,048,960 bytes，SHA-256 `e6d163ef345a208e914f425ea8cbf63364af756db6e6ab9b4075a483ce2b6450`（以 Sites 保存结果为准）。源码、已有构建产物与归档对应同一提交。

### 第 9 版历史记录

2026-10-02 18:35（北京时间）发布第 9 版，保持现有公开访问和绑定配置：

- 入口：[OpenTavern](https://opentavern-ai-chat.longyu9708.chatgpt.site)。该地址来自 succeeded 部署结果；未另行验证自定义域 `/opentavern` 路由。
- 源码：`8f6a329a873320ecd55008b38677e489e8f47cb1`，已推送 Sites 源码仓库；未推送 GitHub 的 origin/fork。
- 版本：`[site-id]~[version-id]`；部署：`[deployment-id]`；状态 succeeded。
- 范围：M1–M3、F17、M5 和 M6 设置输入/输出边界修复。F18/F19 执行功能未实现，TTS 不开发。
- 验证：完整检查通过（含 66 项 Python 测试）、Sites 构建/296 个公共角色资源检查、归档结构验证通过；源码与归档来自同一提交。未调用真实模型或执行线上同步数据操作。
- 归档：362 个文件，138,434,560 bytes，SHA-256 `74f57967f3f826d5d8b325eeedd726c4e398a36d21dfbcc9ca99205d789519d5`（以 Sites 保存结果为准）。

Windows 打包使用已有 Git Bash；当系统 bash 指向不可用 WSL 时，在本次进程 PATH 中优先 Git 的 bin，设置 `TAR_OPTIONS=--force-local` 避免 GNU tar 将 Windows 盘符解析成远端主机。只调整发布进程环境，不修改系统设置或插件脚本；检查/构建输入未变时不重复运行。

## 构建与本地验证

```text
npm install
npm run build:sites
npm run start:sites
```

`build:sites` 依次完成：

1. 从 `src/app/manifest.json` 重建 `assets/js/app.js`；
2. 生成临时 `.sites-public/`；
3. 只复制公共目录实际引用的角色卡资源；
4. 本地编译 Tailwind 并复制 DOMPurify；
5. 打包 `assets/images/opentavern-og.png` 社交预览图；
6. 生成包含 `/api/sync` 路由和 D1 `DB` 绑定的 Sites Worker；
7. 把 Drizzle D1 迁移复制到部署产物；
8. 执行 `scripts/test-sites-build.mjs`。

`start:sites` 使用 Worker 本地运行时启动已有 `dist/`。不要用 `vinext start` 验证部署包，因为该命令不会提供 Sites/Workers 的 `ASSETS` 绑定。

发布包必须包含：

```text
dist/server/index.js
dist/client/
dist/.openai/hosting.json
dist/.openai/drizzle/
```

`.sites-public/`、`.next/`、`.wrangler/` 和 `dist/` 都是生成内容，不得手改或提交。

## 旧数据迁移

浏览器存储按来源隔离。`file:///`、旧域名、Sites Preview 和 Sites 正式地址各自拥有独立的 IndexedDB、OPFS 与 localStorage。发布不会删除旧来源的数据，但新来源会显示为新安装。

推荐顺序：

1. 在数据最完整的旧版本点击“全部导出”，保存 `opentavern-full-export` v3 文件；不要把尚未确认的新 D1 当作恢复源。
2. 保留旧版本，不清理浏览器数据。
3. 打开 Sites 私有版本，使用“导入”选择 v3 文件。
4. 核对会话数量、当前会话、角色、世界书和常用设置。
5. 重新填写 API Key、图片网关地址与令牌、云同步令牌；同步地址保留同源 `/api/sync`。
6. 点击“立即上传”把已核对的数据写入新 D1，再从另一浏览器或设备“立即下载”验证。
7. 验证模型连接、串流回复、角色卡导入和云同步后再使用正式地址。

v3 备份不会携带本机凭据或服务地址。导入到已有数据的浏览器时采用合并策略，不覆盖原有角色和世界书；重复会话会获得新 ID。

首次启用 Sites D1 时数据库为空。部署和数据库迁移都不会删除旧域名、`file:///` 或其他来源的 IndexedDB/OPFS/localStorage，也不会自动复制旧 Cloudflare D1；必须按上述顺序导入后主动上传。

## 同源 D1 同步

Sites Worker 提供：

```text
/api/sync
```

该接口兼容 v1 完整快照和 v2 增量分块协议，并接受 `Authorization: Bearer` 或 `X-OpenTavern-Token`。浏览器继续本地优先；D1 只是额外备份和跨设备恢复层。同步令牌只在浏览器本地保存，D1 使用令牌 SHA-256 摘要作为记录键。

## 外置服务

Sites 暂不提供以下同源接口：

```text
/api/image/generate
/api/image/assets/*
```

图片生成设置应填写现有 Python 网关的完整 HTTPS 地址。该服务必须允许 Sites 来源、请求方法和自定义认证请求头。

主模型和总结模型仍可直接使用 OpenAI-compatible 地址。供应商必须允许浏览器跨域请求和 `Authorization` 请求头；串流还必须允许浏览器读取响应流。

## 发布原则

- 首次发布使用私有访问。
- 不在仓库、`.openai/hosting.json` 或前端源码中提交 API Key、同步令牌和图片网关令牌。
- 每次 D1 schema 变化都必须重新运行 `npm run db:generate`，检查迁移 SQL，并随 Sites 版本发布；不得手写生产数据库状态。
- Sites Secret 只适合应用所有者统一持有的服务端凭据，不适合所有访客共享的用户自带模型 Key。
- Preview 验证通过后，正式地址仍需重新执行一次数据迁移，因为两者不是同一浏览器来源。
- 项目及随包角色卡声明为 AGPL-3.0；网络部署时须保留许可和对应源码提供方式。

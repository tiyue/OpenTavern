# OpenTavern App Source

## 给第一次阅读代码的人

这里是 OpenTavern 浏览器端的可维护源码。项目把一个完整应用拆成 434 个较小的 `.js`
文件，文件名前面的数字表示大致执行顺序。浏览器不会逐个加载这些文件；构建脚本会读取
`manifest.json`，按清单顺序把它们合并成 `assets/js/app.js`。

建议按下面路线阅读，而不是从第一个文件一直读到最后一个：

1. `72-app-startup-runtime.js`：先看应用怎样启动。
2. `70-events-init.js`：看用户发送一条消息时发生什么。
3. `41-prompt-message-builder.js`：看聊天数据怎样变成模型提示词。
4. `50-generation-integrations.js`：看提示词怎样发送给远程 API 或本地模型。
5. `52-generation-second-stage-runtime.js`：看正文之后的二段选项怎样独立生成。
6. `61-chat-message-renderer.js`：看保存的消息怎样显示成聊天气泡。
7. `35-state-persistence.js`：最后看数据怎样保存到浏览器并触发云同步。

常见词语可以先这样理解：

- `state`（状态）：应用当前记住的全部数据，例如设置、角色、会话和“是否正在生成”。
- `DOM`：JavaScript 眼中的网页元素。代码通过 `id` 找到按钮、输入框或消息区域并修改它们。
- 渲染（render）：把内存里的数据转换为用户实际看到的 HTML。
- 持久化（persist）：把内存数据写入浏览器存储，使刷新或关闭页面后仍能恢复。
- 回调（callback）：先交给另一个函数、等某件事发生后再执行的函数，例如收到模型文本时更新气泡。
- `Promise` / `async` / `await`：表示操作需要等待，例如读取硬盘、请求网络或初始化本地模型。
- bundle：构建后供浏览器加载的合并脚本，也就是 `assets/js/app.js`。
- IIFE：最外层立即执行函数，用来把项目变量包在私有范围里，避免污染其他网页脚本。

每个源码分片开头都有“新手导读”，其中会说明文件职责、执行位置、主要函数和修改风险。
复杂入口函数还包含参数、返回值和分步骤数据流。修改源码后运行 `npm run build`，再运行
`npm run check`；不要直接修改自动生成的 `assets/js/app.js`。

This directory contains the maintainable source chunks for `assets/js/app.js`.

The browser still loads `assets/js/app.js`. Edit these source chunks, then rebuild:

```bash
node scripts/build-app.js
```

The current split keeps the original IIFE runtime scope intact, so it is a low-risk
refactor step. Later phases can convert individual chunks into real ES modules after
their shared state dependencies are narrowed.

Chunk order is defined in `manifest.json`.

Current split map:

- `10-*` and `11-webllm-*`: base prompts plus WebLLM local backend, engine loading, confirmation dialog, and initialization progress UI.
- `12-*` and `13-*`: translation dictionaries, `t()` lookup helper, animated theme background, and theme application.
- `20-*` and `21-*`: storage backends, `StorageService`, backup reminders, usage/status UI, and WebLLM cache tools.
- `22-cloud-sync-*`: cloud snapshot building, browser-side encryption, HTTP transport, upload/download operations, and scheduler hooks.
- `23-storage-*` and `24-storage-compat.js`: legacy IndexedDB reads, recovery scanning/restoring, compatibility APIs, safe settings, IDs, and defaults.
- `30-*` to `35-*`: app state, API presets/compatibility/testing, conversation/group-chat models, lifecycle, initialization, and persistence i18n.
- `40-*` to `44-*`: character card import, prompt/world-info construction, World Book model/format/registry/UI, matching, budget, output, and timed effects.
- `50-*` to `54-*`: remote generation, ComfyUI settings/workflow/client/integration, generation runtime pieces, and summarization prompt/API/service/runtime.
- `57-*` to `60-*`: shared UI state, summary manager, new-chat workflows, public-card data/import/UI, and library grid/rendering helpers.
- `61-*` to `67-*`: chat shell/content/message rendering, SillyTavern presets, conversation transfer/list, character panel/editor/export, mobile UI, dialog workflows, and message actions.
- `68-*` to `72-*`: settings modal sections, save/apply behavior, event binding groups, and final app initialization.

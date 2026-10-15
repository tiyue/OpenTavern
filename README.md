# OpenTavern

**A lightweight, powerful, single-file AI character chat app**  
with full SillyTavern compatibility, advanced memory, and **Group Chat support**.

> Open one HTML file and enjoy professional role-playing with multiple characters. No backend, no installation required.

---

## 🚀 Quick Access (Live Demo)

**Recommended (Faster & More Stable in China):**
- **Cloudflare Pages**: [https://opentavern.pages.dev](https://opentavern.pages.dev)

**Backup:**
- **GitHub Pages**: [https://hajimides.github.io/OpenTavern](https://hajimides.github.io/OpenTavern)

---

## 简体中文

**OpenTavern** 是一个轻量、强大、单文件 AI 角色扮演聊天应用，完全兼容 SillyTavern，支持高级记忆系统和群聊功能。

> 直接打开一个 HTML 文件即可享受专业的多角色扮演。无需后端，无需安装。

### 核心特性（含最新更新）

- **零配置**：单个 HTML 文件，双击即可运行。首次加载后可离线使用。
- **完整 SillyTavern 兼容**：支持导入/导出 `chara_card_v3` 角色卡，完整实现 World Info（世界书）。
- **高级记忆系统**：自动 + 手动总结，支持历史记录、编辑、删除、自定义范围。
- **独立总结 API**：可为长期记忆压缩使用完全不同的（更便宜/无限制）模型。
- **OPFS 存储**：使用 Origin Private File System，默认容量大、性能好。
- **群聊与 @ 提及**：支持多角色同时对话，通过 @ 精确控制本轮由谁回复。
- **三语言支持**：简体中文 / 繁體中文 / English，界面即时切换。
- **隐私优先**：所有数据仅保存在你的浏览器中。

### 快速开始（简体中文）

1. 下载最新的 `index.html`
2. 用现代浏览器打开（推荐 Chrome / Edge）
3. 点击右上角或侧边栏的 **⚙️ 设置**
4. 配置 API Endpoint 和 Key（支持一键预设 DeepSeek）
5. （可选）导入 SillyTavern 角色卡
6. 开始聊天！

### 常见问题（新增）

更多完整说明请参考下方英文部分或直接查看应用内的设置界面。

---

## English (Original + Updates)

## ✨ Key Features & Major Updates

OpenTavern continues to evolve with cutting-edge browser storage technology. The latest version introduces **OPFS (Origin Private File System)** as the default storage backend — delivering significantly higher capacity, better performance, and long-term reliability compared to IndexedDB or localStorage.

### Core Strengths
- **Zero Setup** — Single HTML file. Double-click to run. Works offline after first load.
- **Full SillyTavern Compatibility** — Import/export `chara_card_v3` character cards. Complete World Info (Lorebook) implementation.
- **Advanced Memory System** — Automatic + manual summarization with history, edit, delete, and custom range support.
- **Separate Summarization API** — Use a different (cheaper / uncensored) model for long-term memory compression.
- **Modern Glassmorphism UI** — Beautiful dark theme with animated WebGL background, smooth animations, and mobile-first design.
- **OPFS Storage** — Origin Private File System for massive capacity (often hundreds of MB to GB), superior performance, and future-proofing. Real-time usage statistics included.
- **Full Transparency** — View the exact prompt sent to the API at any time.
- **Three Languages** — 简体中文 / 繁體中文 / English (full UI translation with instant switching).
- **Privacy First** — Everything stays in your browser. Nothing is sent except to your chosen API provider.

---

## 📸 Screenshots

| Main Chat Interface                  | Character Card & Sidebar                  |
|--------------------------------------|-------------------------------------------|
| ![Main Chat](screenshots/main-chat.png) | ![Character Card](screenshots/character-card.png) |

| World Book Editor                    | Settings Panel                            |
|--------------------------------------|-------------------------------------------|
| ![World Book](screenshots/world-book.png) | ![Settings](screenshots/settings.png)     |

| Mobile View                          | Summary Manager                           |
|--------------------------------------|-------------------------------------------|
| ![Mobile](screenshots/mobile.png)    | ![Summary Manager](screenshots/summary-manager.png) |

> **Note**: Place your screenshots in a `screenshots/` folder for the images above to display correctly on GitHub.

---

## 🚀 Quick Start

1. Download the latest `index.html` (or `OpenTavern.html`)
2. Open it in any modern browser (Chrome / Edge / Firefox / Safari recommended)
3. Click the **⚙️ Settings** button (top right or sidebar)
4. Configure your **API Endpoint** and **API Key** (one-click preset for DeepSeek available)
5. (Optional) Import a SillyTavern character card
6. Start chatting!

**Recommended first-time setup**:
- Use **DeepSeek** (fast, cheap, excellent Chinese/English performance)
- Set **Context Length** to 20–30
- Enable **Auto Summarize** with threshold ~12–18

---

## 👥 Group Chat & @ Mention Guide

### How to Start a Group Chat
1. Click **New Chat**
2. In the character picker, **long-press or use multi-select** to choose multiple characters
3. Start chatting

### Using @ Mention (Recommended)
- Click the **@** button to the left of the input box
- Select a character from the popup panel (beautiful glassmorphism design with blur)
- Or manually type `@角色名` in the input

The selected character will be the one who replies this turn, and their full character card will be injected into the prompt.

### No @ Behavior
If you send a message without @ anyone, the **last character who spoke** will automatically reply (great for natural back-and-forth).

### Tips
- Only the mentioned character's detailed information is sent (efficient context usage)
- You can still have rich multi-character scenes by @ switching between them
- Works great on mobile

---

## 📋 Main Features (Detailed)

### 1. Character Cards
- Import any `chara_card_v3` JSON from SillyTavern
- Built-in full editor (name, description, personality, scenario, first message, example dialogues, system prompt, post-history instructions, creator notes, tags)
- One-click export back to SillyTavern format
- Automatic first message injection when starting a new chat
- **New Character Picker** when creating fresh conversations

### 2. World Book / World Info (Lorebook)
Complete SillyTavern implementation with modern UI:
- Searchable entry list
- Rich editor: Memo, Primary Keys (supports regex `/pattern/i`), Secondary Keys, Selective Logic (AND ANY / AND ALL / NOT ANY / NOT ALL)
- Strategy: Constant (always active) or Keyword-triggered
- Probability, Insertion Order, Group scoring, Timed effects (Sticky / Cooldown / Delay)
- **Token Budget Control** — Limit total tokens injected per generation (prevents context overflow)
- Full mobile-optimized editor with advanced filters

### 3. Intelligent Summarization System
- **Auto Summarize**: Automatically compresses old messages when threshold is reached (configurable, with safety warnings)
- **Summary Manager** (dedicated modal):
  - Two modes: **Recent Messages** or **Custom Range** (start–end turn)
  - Live preview before generating
  - Summary History list with edit / delete
  - Max word limit per summary
- **Separate Summarization API**: Configure a completely different endpoint/model/key for summarization (ideal for NSFW content or cost optimization)
- Summaries are injected as system messages and can be manually managed

### 4. Chat Experience
- Real-time streaming responses
- Stop generation button
- Message actions: Copy, Regenerate (AI messages), Delete
- Visual token/context usage bar with color warnings
- Full prompt viewer modal (see exactly what is sent to the API)
- Dialogue highlighting for Chinese quotes 「」 “”
- Responsive input area with auto-resize

### 5. Data Management & Storage (Major Upgrade)
- Export single conversation or **all conversations** (JSON)
- Import previously exported chats
- **OPFS (Origin Private File System)** — Default backend offering:
  - Much higher capacity (often 100MB–several GB)
  - Better performance than IndexedDB
  - Private to the origin (more secure)
- Real-time storage usage display in Settings (used MB / quota with progress bar)
- Automatic migration handling
- Backup reminder system

### 6. Settings & Customization
- API: Endpoint, Key (with optional localStorage save + security warning), Model
- Generation params: Temperature, Top P, Max Tokens, Context Length
- User name (replaces `{{user}}`)
- Custom global system prompt (overrides character prompt)
- World Info token budget + enable toggle
- Summarization threshold, max words, separate API settings
- Language switcher (affects entire UI instantly)
- Storage backend status and usage statistics (now prominently shows **OPFS**)
- Low Power Mode (reduces visual effects to lower phone heat)

### 7. Group Chat with @ Mention (New)
- Create conversations with **multiple characters** at once.
- Use the **@ button** (left of input) to open a beautiful character selection panel.
- Explicitly @ a character (e.g. `@普拉娜` or via panel) to make them reply this turn.
- If you don't @ anyone, the **last replying character** will automatically continue the conversation.
- Full Switch-mode prompt injection — only the mentioned character's complete card is sent.
- Clean, mobile-friendly UI with backdrop blur.

This provides precise control in multi-character scenes while keeping prompts efficient.

### 9. Mobile Experience
- Hamburger sidebar
- Fully optimized modals
- Touch-friendly design
- Excellent @ mention panel on phones

---

## ⚙️ API Configuration

OpenTavern uses the standard **OpenAI-compatible** chat completions API (`/v1/chat/completions`).

### Popular Supported Providers
- **DeepSeek** (recommended — one-click preset, including `deepseek-v4-flash`)
- OpenAI (GPT-4o, GPT-4o-mini, o1, etc.)
- SiliconFlow, Together.ai, Fireworks, Groq
- Local servers: Ollama, LM Studio, llama.cpp (with OpenAI compatibility layer)
- Any provider that follows the OpenAI chat format

**Pro Tip**: In Settings you can configure a **completely separate Summarization API**. This is extremely useful when:
- You want to use a cheaper model for memory compression
- Your main model refuses NSFW content
- You want to keep long-term memory while using a different provider

---

## 🛠️ Technical Stack

- **Frontend**: Pure Vanilla JavaScript + Tailwind CSS (CDN) + extensive custom CSS
- **Graphics**: Custom WebGL shader for animated background + vignette overlay
- **Storage**: **OPFS (Origin Private File System)** — primary backend (recommended for long-term use) + localStorage fallback
- **i18n**: Built-in translation system with instant language switching (简体中文 / 繁體中文 / English)
- **Streaming**: Fetch + ReadableStream for real-time token streaming
- **No external dependencies** — everything is self-contained in one HTML file

---

## 许可说明/License

本项目（包括源代码和附带的 SillyTavern 角色卡 JSON 文件）均采用 **GNU Affero General Public License v3.0 (AGPL-3.0)** 许可。如需商业用途（闭源使用、商业产品集成、SaaS 服务等），请联系作者获取商业许可。

角色卡 JSON 文件作为项目的一部分，受 AGPL v3 许可保护。任何人使用、修改或分发这些角色卡时，应遵守 AGPL v3 条款。角色卡中的原创内容（人格设定、场景、对话等）仅授权在 AGPL v3 框架下使用。

This entire project, including the source code and the included SillyTavern character card JSON files, is licensed under **GNU Affero General Public License v3.0 (AGPL-3.0)**.For commercial use (including closed-source distribution, commercial product integration, or SaaS deployment), please contact the author to obtain a commercial license.

The character cards are part of this licensed work. Any use, modification, or distribution of the project or its components must follow the AGPL-3.0 terms.

---

## ❓ FAQ

**Q: Do I really need nothing installed?**  
A: Correct. Just open the HTML file in a modern browser.

**Q: How much data can I store now?**  
A: With **OPFS**, capacity is significantly higher than before — often hundreds of MB to several GB depending on your browser and device. The app shows real-time usage with a progress bar.

**Q: Why OPFS instead of IndexedDB?**  
A: OPFS offers better performance, larger practical limits, and is designed specifically for private, high-capacity file storage in the browser. It is now the recommended long-term backend.

**Q: Can I use it completely offline?**  
A: Yes — after the first load and API configuration, all chats, characters, and World Books work offline.

**Q: Is NSFW content supported?**  
A: Yes. Use a permissive model and consider the separate summarization API to avoid refusals on long contexts.

**Q: What happens if I update the HTML file?**  
A: Your data remains safe in browser storage (OPFS). Just replace the file.

**Q: Why is there a separate summarization API?**  
A: Long conversations can become expensive or hit content filters. A dedicated summarization model (often cheaper or uncensored) keeps memory efficient without affecting your main chat model.

**Q: How do I report bugs or request features?**  
A: Open an issue on the GitHub repository.

---

## 🔄 Version History Highlights

- **Latest**: Removed browser local inference (WebLLM); chat generation always uses the remote API (OpenAI compatible). Settings reorganized into tabbed panels (Model / Prompts / Summary / Interface & Data / Extensions).
- Previous: Added **Browser Local Inference (WebLLM)** with strict lazy-loading and confirmation dialogs (later removed). Also improved low-power mode and other refinements.
- Older: Switched primary storage to **OPFS** for superior capacity and performance. Added New Chat Character Picker modal. Refined summary manager, mobile layouts, and World Book editor. Default summarization model updated to `deepseek-v4-flash`.
- Oldest: IndexedDB storage, Summary Manager with history & custom range, separate summarization API, World Info token budget, full prompt viewer, major mobile UI fixes.

---

## 🤝 Contributing

Contributions are very welcome!

High-value areas:
- Additional language translations
- More World Info features (timed effects, character filters, etc.)
- UI/UX improvements and accessibility
- Performance optimizations for very long chats
- Better error handling and user guidance
- Documentation improvements

Please open issues or submit pull requests on GitHub.

---

## 💬 Feedback & Support

- GitHub Issues: Report bugs, suggest features, ask questions
- The project is actively maintained

---

**OpenTavern** — Powerful character chat, made simple.  
Remote API inference (OpenAI compatible) + OPFS storage.

---

*Last updated: 2026-06*

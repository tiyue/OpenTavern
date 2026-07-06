# OpenTavern App Source

This directory contains the maintainable source chunks for `assets/js/app.js`.

The browser still loads `assets/js/app.js`. Edit these source chunks, then rebuild:

```bash
node scripts/build-app.js
```

The current split keeps the original IIFE runtime scope intact, so it is a low-risk
refactor step. Later phases can convert individual chunks into real ES modules after
their shared state dependencies are narrowed.

Chunk order is defined in `manifest.json`.

- `10-prompts-webllm-i18n.js`: base prompt constants used by default settings and prompt construction.
- `11-webllm-local-backend.js`: WebLLM lazy-loading flow, WebGPU checks, and shared glass alert/confirm dialogs.
- `12-i18n.js`: UI translation dictionaries and the `t()` lookup helper.
- `13-webgl-theme.js`: animated WebGL background plus performance mode and UI theme application.
- `20-storage.js`: OPFS, IndexedDB, and localStorage persistence backends plus the StorageService facade.
- `21-storage-status-ui.js`: backup reminders, storage usage/status UI, WebLLM cache helpers, and storage pressure warnings.
- `22-cloud-sync.js`: cloud snapshot upload, download, sync, and optional browser-side encryption.
- `23-storage-recovery.js`: manual storage backend scanning and restore helpers.
- `24-storage-compat.js`: synchronous compatibility API, safe-settings helpers, ID generation, and default two-stage prompt.
- `40-character-prompt-worldbook.js`: character card import, embedded character-book extraction, PNG metadata extraction, and placeholder helpers.
- `41-prompt-builder.js`: main and second-stage API message construction, prompt formatting, and World Info insertion helpers.
- `42-worldbook.js`: World Book data model, normalization, global book helpers, and character registry migration.
- `43-worldbook-editor-ui.js`: World Book modal/editor rendering, import/export controls, badges, and budget warning UI.
- `44-worldbook-activation.js`: World Info keyword matching, activation, token budget application, and timed effects.
- `50-generation-integrations.js`: remote OpenAI-compatible streaming API client.
- `51-comfyui-integration.js`: ComfyUI workflow import, connection test, prompt mapping, and image attachment generation.
- `52-generation-runtime.js`: local WebLLM streaming, stop handling, assistant message finalization, and two-stage turn completion.
- `53-summarization-service.js`: summary API calls, automatic summarization, summary history edit/delete helpers.
- `57-ui-state.js`: shared UI state used across library, chat, dialog, and event chunks.
- `58-summary-manager-ui.js`: summary manager list rendering, custom range preview, and summary generation controls.
- `59-new-chat-workflow.js`: archive/new conversation flow, character picker, and quick new chat modal.
- `60-public-card-library.js`: bundled public card metadata, legacy public-card list/detail UI, and import helper.
- `60-library-ui-render.js`: homepage library tabs, card grids, chat top bar/token/input state, and conversation loading.
- `61-message-content-render.js`: escaped chat content, dialogue/status formatting, attachments, CoT blocks, and option XML rendering.
- `61-chat-message-renderer.js`: windowed chat message list rendering and older-history loading.
- `62-sillytavern-preset-ui.js`: SillyTavern preset defaults, normalization, settings rendering, and import/export helpers.
- `63-conversation-transfer.js`: conversation/full-backup export, import, and shared JSON download helper.
- `64-conversation-list-ui.js`: sidebar conversation list rendering and chat/library filtering behavior.
- `65-character-panel-ui.js`: character card panel rendering, editing, deletion, and character card export.
- `65-mobile-announcement-ui.js`: mobile sidebar controls and first-run announcement modal helpers.
- `66-dialog-workflow-events.js`: character import modal, prompt preview, and summary manager event wiring.
- `67-message-actions-ui.js`: chat message delete, regenerate, copy, and inline edit actions.
- `68-settings-modal.js`: settings modal hydration, save/apply logic, storage recovery controls, and Cloud Sync controls.

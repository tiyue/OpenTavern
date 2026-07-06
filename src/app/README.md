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

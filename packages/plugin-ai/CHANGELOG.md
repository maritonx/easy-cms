# @easy-cms/plugin-ai

## 1.34.0

### Patch Changes

- Updated dependencies [a0a323f]
  - @easy-cms/core@1.34.0

## 1.33.0

### Minor Changes

- 69417d3: Real logos on the Integrations page. An integration's `icon` can be its logo: SVG `paths` (e.g. from simple-icons) with a brand `color`, which the admin swaps for the text color where it wouldn't show (a black logo in dark mode); only path data and `#rrggbb` colors are accepted. Telegram, Anthropic, Gemini and OpenAI now show theirs (simple-icons and Iconify's `logos`, both CC0, bundled at build time).
- 6098969: AI providers (#357). The new `@easy-cms/plugin-ai` adds Anthropic (Claude), OpenAI (GPT), Google Gemini and OpenAI-compatible servers (Ollama, OpenRouter) to the AI category of Settings → Integrations: accept the provider's policy, paste the key (or set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`), find a model, and Test. Projects with the plugin get a new internal `ai-usage` table: run `easy-cms migrate:create`.
  
  Core:
  
  - `cms.ai.generate({ feature, system?, prompt, images?, json?, maxTokens? }, { user })` asks the feature's connection (or the main one), with images from the media library and JSON answers; busy providers are retried once, and a refused key marks the connection (`integration.failed`).
  - `aiFeatures` in the config: the AI features box on the Integrations page turns each off or picks its connection, and sets the main connection.
  - A daily limit per user (default 100, `limits` in the plugin, changed by admins), and per role in Settings → Roles (0: no AI). Usage this month shows on each connection's card and by user and feature; prompts are never stored.
  - Integrations can ask for `consent` before the first connection; who accepted is audit-logged. `test` gets the connection's `name`.
  
  Admin: the Integrations page is now one compact list by category, with a search, a status on each row (connected, needs attention, off, not connected, set in code) and the plugins you can install at the end; each integration opens in a drawer with its accounts (`?open=<id>`), and AI settings are a row of their own.

### Patch Changes

- Updated dependencies [69417d3]
- Updated dependencies [6098969]
  - @easy-cms/core@1.33.0

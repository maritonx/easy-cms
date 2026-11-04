# @easy-cms/plugin-ai

AI for Easy CMS: connect Anthropic (Claude), OpenAI (GPT), Google Gemini or an OpenAI-compatible server (Ollama, OpenRouter) on the Integrations page, for the admin's AI features. Keys stay on the server; each user has a daily limit, and usage shows per connection, user and feature. Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt and Next.js.

## Install

```bash
npm install @easy-cms/plugin-ai
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

```ts
import { aiPlugin } from '@easy-cms/plugin-ai'

export default defineConfig({
  // …
  plugins: [aiPlugin({ limits: { perUserPerDay: 100 } })],
})
```

Then create a migration (`easy-cms migrate:create ai`), and in the admin go to **Settings → Integrations → AI**: accept the provider's policy, paste the API key (or set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `GEMINI_API_KEY`), and choose a model.

On the server, features ask `cms.ai.generate({ feature, prompt })`.

## Links

[AI](https://easycms.dev/docs/ai) · [Documentation](https://easycms.dev/docs) ([ภาษาไทย](https://easycms.dev/th/docs)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License

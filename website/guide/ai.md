# AI

::: info What you'll learn
Connect Claude, GPT, Gemini or a server of your own for the admin's AI features, and keep their
cost and privacy in hand.

**Before this page:** [Integrations](./integrations).
:::

`@easy-cms/plugin-ai` adds AI providers to the **AI** category of **Settings → Integrations**:
Anthropic (Claude), OpenAI (GPT), Google Gemini, and any OpenAI-compatible server (Ollama,
OpenRouter). Easy CMS calls them over HTTP, from the server: keys never reach the browser.

```bash [pm]
npm install @easy-cms/plugin-ai
```

```ts
import { aiPlugin } from '@easy-cms/plugin-ai'

export default defineConfig({
  // …
  plugins: [aiPlugin()],
})
```

The plugin adds an `ai-usage` collection (usage, kept out of the admin): create a migration for it
(`easy-cms migrate:create ai`, see [Migrations](./deployment)).

## Connecting a provider

1. **Settings → Integrations → AI**, then **Connect an account** on a provider.
2. Read and accept what the provider is sent (once per provider; who accepted goes to the
   [audit log](./audit-log)).
3. Paste the **API key**, press **Find Model** to choose a model (empty: a sensible default), and
   **Save**. Connecting asks the model for one word: the card shows the model and its tokens.

| Provider | Key in the environment (wins) | Default model |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-5-5` |
| OpenAI | `OPENAI_API_KEY` | `gpt-5-mini` |
| Google Gemini | `GEMINI_API_KEY` | `gemini-flash-latest` |
| OpenAI-compatible | — (a **Base URL** up to `/v1`, a key if it needs one) | — |

With a key in the environment, the provider has an "Environment" connection on its default model.
Each connection's card shows this month's requests and tokens.

## Features

Features that use AI are listed in the **AI features** box at the top of the AI category. Each can
be turned off, or use another connection than the **main connection** (the first one connected,
until an admin chooses). Plugins add theirs to `aiFeatures` in the config:

```ts
aiFeatures: [{ id: 'summary', label: 'Summaries', description: 'Writes the excerpt of a post', default: true }]
```

## Alt text

With a provider connected, the **Alternative text** of an image in the media library has a
**Write with AI** button: the model looks at the image and writes one sentence of at most 125
characters, in the language being edited (else the default one). It goes into the field for you to
check, marked "Written by AI", with **Undo** beside it; nothing is saved until you save. In an
upload field, an image without alt text says **No alt text**: it opens the file to add one.

The button shows to users who may change the file, while the **Alt text** feature is on. Each press is
one request toward the user's daily limit.

## SEO

With the [SEO plugin](./seo), the search result preview has **Write title and description with AI**:
one request writes both from the document's title and text (the top-level text, textarea and rich
text fields, about 6,000 characters; `aiSource` changes it), within the plugin's good lengths, in the
language being edited. They go into the meta fields for review, with **Undo**; replacing values you
have asks first. The **Generate** buttons keep working from your code's generators.

## Limits

Each user makes at most **100 requests a day** (in `timeZone`); the 101st is refused. Admins change
the number in the AI features box, and a role can have its own in **Settings → Roles** (0: the role
can't use AI). In code:

```ts
aiPlugin({ limits: { perUserPerDay: 50, roles: { editor: 20 } } })
```

The box shows this month's requests and tokens by user and by feature. Prompts and answers are not
stored: only who asked, which feature and connection, the tokens and when, for 90 days.

## In your code

`cms.ai` is `null` without the plugin. On the server:

```ts
const result = await cms.ai?.generate(
  {
    feature: 'summary', // one of aiFeatures, turned on
    system: 'You write short, plain excerpts.',
    prompt: `Summarize in one sentence:\n\n${post.text}`,
    images: [{ media: post.cover }], // or { data: base64, mediaType }
    json: { type: 'object', properties: { excerpt: { type: 'string' } } }, // the answer's shape
    maxTokens: 300, // default 1024
  },
  { user, about: { collection: 'posts', id: post.id } }, // counts toward the user's limit
)
result.json // { excerpt: '…' }; result.text, result.usage, result.connection
```

A provider that is busy (429, 5xx) is asked once more; a request takes at most 60 seconds. A key it
refuses (401, 403) marks the connection, which shows on the dashboard and sends
[`integration.failed`](./webhooks#when-something-fails), e.g. to a [notification](./notifications).
There is no REST endpoint for prompts: each feature has its own, with its prompt on the server.

## Options

| Option | Default | |
|---|---|---|
| `providers` | all four | `'anthropic'`, `'openai'`, `'gemini'`, `'openai-compatible'` |
| `limits.perUserPerDay` | `100` | Requests a user makes a day. |
| `limits.roles` | — | Per role, e.g. `{ editor: 20 }`. |

## Next steps

- [Integrations](./integrations): connections, secrets and consent.
- [Roles](./roles): a role's AI limit.

# MCP

::: info What you'll learn
How to let AI assistants such as Claude, Cursor or VS Code read and write your content through
the Model Context Protocol, with an API key that limits what they can do.

**Before this page:** [API keys](./api-keys) and [Plugins](./plugins).
:::

`@easy-cms/plugin-mcp` turns your CMS into an MCP server. An assistant connected to it can
search posts, draft new ones, fix typos across pages or upload images, and only in the
collections and actions its API key allows. Everything it writes goes through the same
validation, hooks and access rules as the admin.

## Set it up

```bash [pm]
npm install @easy-cms/plugin-mcp
```

```ts
import { mcpPlugin } from '@easy-cms/plugin-mcp'

export default defineConfig({
  // …
  apiKeys: true,
  plugins: [mcpPlugin()],
})
```

The server is at `<routes.api>/mcp`, e.g. `https://example.com/api/cms/mcp`. It uses Streamable
HTTP without sessions, so it works on serverless hosts too.

Then create an [API key](./api-keys) for the assistant under **Settings → API keys**, ticking
only what it needs. For a writing assistant, for example: posts read, create and update, but not
publish or delete.

## Connect an assistant

Replace the URL and key with yours.

::: code-group

```bash [Claude Code]
claude mcp add --transport http easy-cms https://example.com/api/cms/mcp \
  --header "Authorization: Bearer ecms_…"
```

```json [Cursor: .cursor/mcp.json]
{
  "mcpServers": {
    "easy-cms": {
      "url": "https://example.com/api/cms/mcp",
      "headers": { "Authorization": "Bearer ecms_…" }
    }
  }
}
```

```json [VS Code: .vscode/mcp.json]
{
  "servers": {
    "easy-cms": {
      "type": "http",
      "url": "https://example.com/api/cms/mcp",
      "headers": { "Authorization": "Bearer ${input:easy-cms-key}" }
    }
  },
  "inputs": [{ "id": "easy-cms-key", "type": "promptString", "description": "Easy CMS API key", "password": true }]
}
```

```json [Claude Desktop: claude_desktop_config.json]
{
  "mcpServers": {
    "easy-cms": {
      "command": "npx",
      "args": ["mcp-remote", "https://example.com/api/cms/mcp", "--header", "Authorization: Bearer ${EASY_CMS_KEY}"],
      "env": { "EASY_CMS_KEY": "ecms_…" }
    }
  }
}
```

:::

Assistants and their settings change often; check your client's documentation for how it adds a
remote MCP server with a header.

## The tools

Tools are made for each collection and global, only for what the key allows:

| Tool | Needs | |
|---|---|---|
| `find_<collection>` | read | List with `where`, `sort`, `limit` (≤ 100), `page`, `locale`. Includes drafts. |
| `get_<collection>` | read | One document by id, relationships populated. |
| `create_<collection>` | create | Create; the input schema comes from your fields. |
| `update_<collection>` | update | Change the given fields. |
| `delete_<collection>` | delete | Delete. |
| `publish_<collection>`, `unpublish_<collection>` | publish | Collections with drafts. |
| `schedule_<collection>` | publish | Publish or unpublish later (collections with `schedule`). |
| `upload_media` | create on Media | A file as base64, with alt text. |
| `get_global_<slug>`, `update_global_<slug>`, `publish_global_<slug>` | read, update, publish | Globals. |

- **Drafts stay drafts.** In collections with drafts, `create_` and `update_` always save a
  draft, whatever the assistant sends; only `publish_` puts it live. With `versions` as well,
  the published page stays as it is until then. (Without versions, updating a published document
  as a draft takes it offline until it is published again, as in the admin.)
- **Rich text** accepts plain text (blank lines start new paragraphs) or Tiptap JSON.
- **Relationships and uploads** take ids; the assistant finds them with `find_` or
  `upload_media`.
- **Localized fields** are read and written in `locale` (the default locale when left out).
- Users and API keys are never offered, whatever the key says.
- Errors come back as messages the assistant can act on, e.g.
  `Invalid data: title: is required`.

## Options

| Option | Default | |
|---|---|---|
| `path` | `/mcp` | Where under `routes.api` the server is. |
| `name` | `easy-cms` | The server's name in the assistant. |
| `instructions` | — | Extra guidance for the assistant, e.g. your house style. Added to the built-in notes. |
| `collections` | all | Collections to offer at all (the key still decides). |
| `globals` | all | Globals to offer at all. |

```ts
mcpPlugin({
  name: 'acme-blog',
  instructions: 'Write in British English. Posts need an excerpt of one sentence.',
  collections: ['posts', 'categories', 'media'],
})
```

## Safety

- Give each assistant its own key, with the fewest actions and an expiry. Leave out publish and
  delete unless you want the assistant to do that on its own.
- Read what the assistant drafted in the admin before publishing; history keeps every version.
- The server never fetches URLs the assistant sends: uploads come as file contents.
- Revoke the key under **Settings → API keys** to cut an assistant off at once.

## Next steps

- [API keys](./api-keys): permissions, expiry and revoking.
- [Access control](./access-control): rules that apply to assistants too.

# @easy-cms/plugin-mcp

An MCP server for Easy CMS: AI assistants such as Claude, Cursor or VS Code read and draft your content with an API key, only where the key allows. Collections with drafts are always saved as drafts; publishing is a separate tool. Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt and Next.js.

## Install

```bash
npm install @easy-cms/plugin-mcp
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

```ts
import { mcpPlugin } from '@easy-cms/plugin-mcp'

export default defineConfig({
  // …
  apiKeys: true,
  plugins: [mcpPlugin()],
})
```

```bash
claude mcp add --transport http easy-cms https://example.com/api/cms/mcp \
  --header "Authorization: Bearer ecms_…"
```

## Links

[MCP](https://maritonx.github.io/easy-cms/guide/mcp) · [Documentation](https://maritonx.github.io/easy-cms/) ([ภาษาไทย](https://maritonx.github.io/easy-cms/th/)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License

# @easy-cms/plugin-mcp

An MCP server for [Easy CMS](https://maritonx.github.io/easy-cms/): AI assistants such as Claude,
Cursor or VS Code read and write your content with an API key, only where the key allows.
Collections with drafts are always saved as drafts; publishing is a separate tool.

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

See [MCP](https://maritonx.github.io/easy-cms/guide/mcp).

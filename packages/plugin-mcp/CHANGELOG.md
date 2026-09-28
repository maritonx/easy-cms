# @easy-cms/plugin-mcp

## 0.16.0

### Minor Changes

- e6e4abb: New: `@easy-cms/plugin-mcp`, an MCP server (Streamable HTTP, stateless) at `<api>/mcp` for AI assistants such as Claude, Cursor and VS Code. Assistants connect with an API key and get tools for exactly what it allows: find, get, create, update, delete, publish, schedule and upload for each collection, and read, update and publish for globals. Collections with drafts are always saved as drafts; only the publish tool puts them live. Rich text accepts plain text, and uploads come as base64.

### Patch Changes

- @easy-cms/core@0.16.0

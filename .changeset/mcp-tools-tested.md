---
"@easy-cms/plugin-mcp": patch
---

In a collection or global with drafts but without versions, `update_*` now tells the assistant that changing a published document takes it off the site until it is published again (it said the live version stays, which is only true with `versions`). Every tool is now tested through the MCP SDK client, along with clients on protocol versions back to 2024-11-05; `@modelcontextprotocol/sdk` 1.32.1 or later is required.

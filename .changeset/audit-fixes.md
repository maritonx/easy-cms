---
'@easy-cms/plugin-mcp': patch
---

Needs `@modelcontextprotocol/sdk` 1.31.0 or newer, which fixes an advisory where the OAuth client could send credentials to an authorization server chosen by the MCP server (GHSA-6qxp-vccf-f47h). The Next.js starter template now asks for Next.js 16.3.8 or newer.

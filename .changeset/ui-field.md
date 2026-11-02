---
'@easy-cms/core': minor
'@easy-cms/admin': minor
'@easy-cms/plugin-mcp': minor
---

A `ui` field (#325): a component in the edit form that stores nothing, such as a calculator, a
preview or a button. `{ name: 'readingTime', type: 'ui', admin: { component: 'acme-reading-time' } }`
has no column and is left out of the API, validation, MCP and the generated types; it is placed
like any field (in `admin.layout`, groups, array rows, blocks and the side panel, with
`admin.condition`) and its component gets the edit page's state. Without a `label` the component
shows alone. Value options on it are refused, and a group or array needs a stored field beside it.
The standalone example shows a post's reading time with one.

---
"@easy-cms/core": minor
"@easy-cms/drizzle": minor
"@easy-cms/admin": minor
"@easy-cms/plugin-graphql": patch
"@easy-cms/plugin-mcp": patch
"@easy-cms/plugin-multi-tenant": patch
---

Relationships to several collections: `{ name: 'link', type: 'relationship', to: ['posts', 'pages'] }` stores `{ relationTo, value }` (a list with `hasMany`), populates each value from its own collection with its access, and types it as a union told apart by `relationTo`. Filter with `'link.pages': { in: [3] }`, `link.relationTo` or `link.value`. In the admin, the picker switches collections beside the search, chips and columns show "Page · About", and the filter panel offers each collection. `filterOptions` gets `relationTo`. A relationship that gets more collections keeps its links: the migration assigns them to the first collection in `to` (#327).

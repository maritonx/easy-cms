---
"@easy-cms/core": minor
"@easy-cms/drizzle": minor
"@easy-cms/admin": minor
---

Blocks field: `{ type: 'blocks', blocks: [{ slug, fields }] }` holds rows of different kinds (`{ id, blockType, ...fields }`), validated, populated and typed as a union, with an admin editor to add, reorder and remove blocks. Inferred types now treat arrays, blocks, groups and hasMany fields as always present.

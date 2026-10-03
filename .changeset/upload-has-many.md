---
"@easy-cms/core": minor
"@easy-cms/drizzle": minor
"@easy-cms/admin": minor
"@easy-cms/plugin-mcp": minor
---

Image galleries: upload fields with several files.

- **`upload` with `hasMany: true`** keeps several files in the order editors arrange them, e.g. a gallery on a post. In the admin editors drop several files at once, pick several from the media library, drag them into order (or use the arrow buttons) and remove them. Reads return the media documents in order; it can be `localized`, and queries like `where: { gallery: { in: [id] } }` work. Needs a migration for the new field.
- **`mimeTypes`** on upload fields, e.g. `['image/*']`: the media picker offers only those files, and saving refuses others ("must be an image").
- **`minRows` / `maxRows`** on upload and relationship fields with `hasMany`.
- An empty list now counts as fewer than `minRows` (arrays and blocks too); drafts may still be incomplete.

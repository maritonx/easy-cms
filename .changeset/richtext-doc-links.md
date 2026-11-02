---
'@easy-cms/core': minor
'@easy-cms/admin': minor
'@easy-cms/richtext': patch
---

Rich text links to documents, kept by id (#326). The editor's link button links to a web address
or to a document of a collection with a `preview` URL; the link mark stores
`doc: { relationTo, value }` and no URL. Reads at `depth` 1 or more fill in `href` with the
document's URL as it is now, so links follow a document whose slug or path changes, and a deleted
or unreadable document leaves plain text. Saving checks the document exists and its collection
has a `preview`.

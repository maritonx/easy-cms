---
"@easy-cms/core": minor
"@easy-cms/plugin-ecommerce": minor
---

Access checks (#98):

- Updating or deleting a document the user may not read answers `404`, as for an id that doesn't exist; one they may read but not change still answers `403`.
- Preview links from the admin read with the access of whoever made them (`createPreviewToken(target, { user })`); they stop working when that user is deactivated.
- `<api>/admin/ui/media-usage` counts only documents the user may read (`cms.mediaUsage(ids, access)`).
- Shop: `POST <api>/shop/confirm` is only for whoever paid: the customer, or the guest with the cart's secret (the client sends it); others get `404`.

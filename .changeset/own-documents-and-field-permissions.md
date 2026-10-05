---
"@easy-cms/core": minor
"@easy-cms/admin": minor
---

Roles (`auth.rbac`): own documents only, field permissions, and who gets a deleted user's documents.

- **Own documents only:** next to a ticked Read, Update, Delete or Publish, Settings → Roles can limit it to the role's own documents, e.g. writers read every post but change, publish and delete only theirs.
- **Who owns a document:** with roles on, every collection but Users gets **`createdBy`**, set when a document is created (requests can't set it; trusted Local API calls can, for imports). Or name an owner field with **`admin.ownerField`**, e.g. `'author'`: filled with the creator when empty, and read-only for roles limited to their own documents. Lists get a **Mine** filter. Documents from before get `createdBy` from their first version's author, where there is history.
- **Field permissions:** per role, each top-level field can be **Can edit**, **Read only** or **Hidden**; others follow the row. Required fields stay editable for roles that create documents.
- **Hidden fields can't be used to filter or sort** (403), for role rules and for `access.read` in the code, which before only hid the value. The admin schema leaves out fields the user can't read.
- **Deleting a user** in the admin asks who gets the documents they own. REST: `DELETE <api>/users/:id?transferTo=<id>` (or `none`); Local API: `cms.delete('users', id, { transferTo })`. New admin endpoint: `GET <api>/admin/owned/:userId`.
- Projects with `auth.rbac` get a `created_by` column in every collection: create a migration (`easy-cms migrate:create owners`).

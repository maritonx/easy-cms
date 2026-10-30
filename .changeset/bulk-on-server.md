---
'@easy-cms/core': minor
---

Bulk actions run on the server (#280). `POST <api>/:collection/bulk` with `{ action, ids }` (at
most 100) publishes, unpublishes, deletes or moves (media, with `folder`) each document now, with
the user's access, going on past those it may not change; it answers `{ done, skipped, failed }`.
With `{ action, where }` it does the same to every match, at most 10,000, as a background
operation in steps of 100: the process that started it, `GET <api>/:collection/bulk/:id` (which
answers how far it got) and the jobs all move it on, so it finishes on serverless hosts too.
`POST <api>/:collection/bulk/:id/cancel` stops it after the current step. Each document goes
through the same path as a single edit: access, hooks, versions, webhooks and the audit log.
`cms.runJobs()` also answers `bulk: { steps }`.

Operations are kept in the new internal `bulk-operations` table: run `easy-cms migrate:create`
after upgrading and deploy the migration.

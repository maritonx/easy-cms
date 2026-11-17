---
'@easy-cms/core': minor
'@easy-cms/drizzle': minor
---

`cms.transaction(async (tx) => …)` runs several writes as one: every read and write inside joins the transaction, it commits when the function resolves and rolls back when it throws. Access rules, validation and hooks apply as usual; `before*` hooks run inside, while `after*` hooks, webhooks, `cms.on()` listeners, `cms.emit()` events and realtime events wait for the commit and are dropped on a rollback (#439, ADR-0072).

`` cms.sql`select … ${value}` `` runs raw SQL with each value as a bound parameter, in the transaction when inside one. It goes around access rules, hooks, validation and versions.

---
"@easy-cms/admin": minor
"@easy-cms/core": minor
---

Live updates in the admin for collections with `realtime: true` (ADR-0071). Lists change rows on screen in place, grey out rows deleted elsewhere, and count new or moved documents as "N changes — Show" instead of moving rows under the cursor; a "Live" dot shows the stream's state. The edit page and the drawer load another save by themselves when nothing is unsaved, and otherwise say "This document was saved elsewhere" with "Load new version (discard mine)" or "Keep mine", asking before a save overwrites it; a deleted or no longer readable document turns saving off and keeps what was typed. Each browser tab uses one stream for all of it. `createClient().subscribe()` takes `{ lastEventId }` to start after an event, and its handle tells `lastEventId`, to change subscriptions without missing events; the admin schema says which collections are `realtime`.

---
'@easy-cms/admin': minor
---

Bulk actions in the admin run on the server (#280). Publishing, unpublishing, moving or deleting the
selected documents is one request instead of one per document, and goes on past documents the
user may not change (the message says how many were skipped). With the whole page selected,
**Select all N matching** takes every document the list's filters match, up to 10,000: the work
runs in the background with its progress in the corner of every admin page, **Cancel**, and a
summary of what was skipped and why. Deleting more than 100 documents asks for their number to be
typed first. A list's total is counted again after a change.

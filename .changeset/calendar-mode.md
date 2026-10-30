---
'@easy-cms/core': minor
'@easy-cms/admin': minor
---

A Calendar mode for collection lists (#272). `admin.calendar: { start, end?, color? }` names a
collection's date fields (and a select or relationship field to colour by); its list then gets a
**List | Calendar** switch with month, week, day and agenda views in the admin's time zone, using
the list's filters and search. Click a document to open it, or a day or time slot to create one
starting then. The calendar (FullCalendar) loads only when it is opened. Dragging, "Move to…" and
the site-wide Content calendar follow.

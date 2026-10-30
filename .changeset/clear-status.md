---
'@easy-cms/core': minor
'@easy-cms/admin': minor
---

Statuses say what is pending (#303). Wherever the admin shows a status (the edit page, lists, the
calendar's day card, the dashboard), a draft waiting to go live reads **Scheduled · date**, and a
published document can add **Unpublished changes**, **Publishes · date** or **Unpublishes · date**.
On the edit page the date opens the schedule dialog; a list's status menu has **Scheduled**.
`GET /admin/ui/scheduled` and `cms.upcomingSchedules()` take `collection` and `docs`.

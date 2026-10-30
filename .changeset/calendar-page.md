---
'@easy-cms/core': minor
'@easy-cms/admin': minor
---

A **Calendar** page in the admin menu, right after Content (#272): every collection with
`admin.calendar`, each in its own colour, and what is scheduled to publish or unpublish, across the
site. Sources can be hidden (remembered per browser). It shows when a collection has
`admin.calendar` or `schedule`; with `auth.rbac`, roles are given it as `calendar`.
`GET /admin/ui/scheduled` and `cms.upcomingSchedules()` take `from` and `to`.

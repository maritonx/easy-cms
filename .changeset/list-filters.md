---
'@easy-cms/core': minor
'@easy-cms/admin': minor
---

Filter a list by several conditions (#88). **Filter** opens a panel of conditions that all must
match: text that contains a word, numbers in a range, whole days in `timeZone` (before, after, on,
between, with Today / Last 7 / Last 30 days), select options and related documents (any of), and
empty fields. The conditions show as chips above the list and live in the URL as the REST API reads
a `where`, so a link shows the same list; older `?status=` and `?f_<field>=` links still work. A
field's `admin.filter: false` leaves it out of the panel. A list no longer shows an older, slower
response over a newer one.

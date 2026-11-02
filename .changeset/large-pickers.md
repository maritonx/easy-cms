---
'@easy-cms/admin': minor
---

Picking from large collections (#282). A relationship field shows 10 results at a time with **Show
more** for the next 10, and with nothing typed the documents picked recently in that collection
come first (kept in the browser; not for fields with `filterOptions`). The media library's search
looks in file names and alt text, and **Images**, **Video** and **Documents** narrow it to one kind
of file (`?type=`).

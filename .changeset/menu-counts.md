---
"@easy-cms/core": patch
"@easy-cms/admin": patch
---

The admin's menu numbers hold up on large collections (#283): they are counted when the admin opens, after you create or delete, and every minute, instead of on every page change; the server keeps them 30 seconds per user (`/admin/ui/counts?fresh` counts again), stops counting at 10,000 and the menu reads "10k+". ⌘K offers "See all in <collection>" after a collection's results, opening its list searched for the same words.

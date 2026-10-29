---
"@easy-cms/core": patch
---

A job without `every` no longer runs twice when two instances run jobs at the same moment and one reads its row after the other has claimed it.

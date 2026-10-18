---
"@easy-cms/plugin-graphql": minor
---

Required fields inside groups and array rows are now non-null in create inputs, as at the top level, so generated types match what the server accepts. Where a group or row has required fields, its create input is a new type named `…CreateInput` (e.g. `PostLinksRowCreateInput`); update and global inputs keep their names and stay optional, since drafts may leave required fields empty.

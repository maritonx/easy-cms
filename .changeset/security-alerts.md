---
'@easy-cms/core': patch
'@easy-cms/plugin-notify': patch
---

Fixes from GitHub code scanning:

- Telegram notifications escape `"` too, so a link stays inside its `href`.
- Uploaded file names with a long run of separators, and paths with many `/` in `routes.api` or `admin.path`, are trimmed by loop instead of regular expressions that could be slow on such input.

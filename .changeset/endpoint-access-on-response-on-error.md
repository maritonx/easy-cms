---
'@easy-cms/core': minor
---

Endpoints take `access`: who may call them, answered with `401` or `403` before the handler runs. The config takes `onResponse`, run on each API response to add headers, log or replace it, and `onError`, run when an API request fails to report the error or send a different response; both may be lists, so plugins add theirs (#440, ADR-0072).

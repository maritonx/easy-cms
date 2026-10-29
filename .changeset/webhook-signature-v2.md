---
"@easy-cms/core": minor
---

Webhooks with a `secret` are signed against replays (#166): each attempt sends `x-easy-cms-timestamp` (its own time, Unix seconds) and `x-easy-cms-signature-v2: v1=<hex HMAC-SHA256 of "<delivery>.<timestamp>.<body>">`. `verifyWebhook(body, headers, secret)` checks it in constant time, refuses timestamps more than 5 minutes from now, accepts several secrets while one is replaced, and returns the payload. `x-easy-cms-signature` (the body alone) is still sent until 2.0, but is deprecated: a captured request replays with it. Retries keep the body and `x-easy-cms-delivery`; their timestamp and signature are new.

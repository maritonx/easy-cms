---
"@easy-cms/core": minor
"create-easy-cms": minor
---

`rateLimit` limits requests to the API per client and minute (#168): 300 from each IP of visitors who are not signed in, 1,200 per signed-in user and per API key by default (`{ window, anonymous, users, apiKeys }`; `false` lifts one). Over the limit the API answers `429` with `Retry-After`. Counts are kept in memory and added to the new `rate-limits` table every few seconds, so instances share them without a write per request; no IP is stored, only an HMAC of it. Health checks and `jobs/run` aren't counted. Off by default, and needs a migration when turned on; new projects have it on. The Security guide explains it.

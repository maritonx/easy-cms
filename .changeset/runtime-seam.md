---
"@easy-cms/core": minor
---

Passwords are hashed with scrypt N=2^15, r=8, p=3 (32 MB) instead of N=2^17, r=8, p=1 (128 MB): as strong by OWASP's measure, and small enough for a Cloudflare Worker. Older hashes still verify and are replaced at the next sign-in. Core imports Node's modules only in one place now, the first step to running on Bun, Deno and Cloudflare Workers (ADR-0067).

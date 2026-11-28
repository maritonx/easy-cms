---
'@easy-cms/admin': patch
---

Studio mode (ADR-0074, outside semver): the framing page may post `{ type: 'easy-cms:theme', mode: 'light' | 'dark' | 'system' }` to set the admin's theme without keeping it, and the dashboard leaves out the setup notices only a deployment needs (no email, no server URL).

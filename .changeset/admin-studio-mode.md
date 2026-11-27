---
'@easy-cms/admin': minor
---

Studio mode (ADR-0074, outside semver): `renderShell(shell, { studio: { origin } })` runs the admin framed by a page at that origin, which may post `{ type: 'easy-cms:reload' }` to load the session and schema again and show the open page afresh without reloading. The built app is exported as `@easy-cms/admin/app/*`, and `renderShell` without Node's modules as `@easy-cms/admin/shell`.

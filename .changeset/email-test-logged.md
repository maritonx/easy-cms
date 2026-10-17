---
"@easy-cms/core": patch
"@easy-cms/admin": patch
---

Settings → Email no longer says a test email was sent when the adapter only prints it to the server log. With `consoleEmail()` (or any adapter whose `describe()` says `delivery: log`), the test answers `{ ok: true, logged: true }`, and the admin shows "Not sent" with how to set up a real adapter, plus a warning above the settings. A live site that missed its `SMTP_HOST` used to look as if mail went out.

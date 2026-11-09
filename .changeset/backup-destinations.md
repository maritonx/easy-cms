---
"@easy-cms/core": minor
"@easy-cms/admin": minor
"@easy-cms/db-sqlite": minor
"@easy-cms/plugin-social": patch
---

Backups set up in the admin, and sent to destinations (#395). Settings → Backups now changes when backups run, how many to keep and where they go (what the config sets wins): this server, and destinations that plugins add through Integrations (`backups` on an integration: `put`, `get`, `delete`), each with its own number to keep. A destination that fails is tried again after 1, 5 and 30 minutes, then `backup.failed`; downloads come from any place that has the file; the page warns while backups leave the server unencrypted. OAuth integrations take their app's keys (client id and secret) in the admin, with the redirect URI to copy; environment variables still win, and the Facebook Page channel uses it. Turso and other remote libSQL databases are backed up by copying them into a local SQLite file.

Needs a migration: a new `admin-settings` table and a `copies` column on `database-backups` (see Upgrading → 1.41).

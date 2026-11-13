---
"@easy-cms/core": minor
"@easy-cms/admin": minor
"easy-cms": patch
---

Who may sign in, set in the admin (#409, ADR-0068). In Settings → Single sign-on, admins choose who uses a password (everyone, only admins, or break-glass accounts chosen from admins with a password) and which email domains sign themselves up with a provider, and as what role, over `auth.password` and `auth.providerSignUp`, which stay the default. Changes apply at once on every server within 30 seconds, end the password sessions of accounts that lose their password, and are in the audit log (`sign-in.rules`); the admin is told how many accounts and sessions a change affects before saving.

Saving is refused when afterwards no admin, or the admin saving, could sign in; the last admin on the break-glass list can't be deleted, deactivated or demoted. Sign-up refuses domains anyone can get an address at (gmail.com, outlook.com…), `admin`, and roles that can change other accounts; the same in `auth.providerSignUp` is warned about at start and on that page. `auth.locked` keeps the config's rules, and `easy-cms reset-sign-in` forgets the admin's. No migration.

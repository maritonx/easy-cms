---
"@easy-cms/core": minor
"@easy-cms/admin": minor
---

Single sign-on for everyone (#163): `auth.password: { breakGlass: ['emergency@example.com'] }` turns password sign-in off for every account, admins included, except the listed break-glass accounts. Other passwords are refused at sign-in and by the API, and can't be set; the admin hides the field and folds the login page's password form away. When `auth.password` changes, the next start ends the sessions of accounts that may no longer use a password and records `auth.password.policy` in the audit log; each break-glass sign-in is recorded as `login.breakGlass` and shown on the dashboard for a day. The server log warns when none of the listed accounts can sign in with a password.

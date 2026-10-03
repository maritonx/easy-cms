---
"@easy-cms/core": minor
"@easy-cms/admin": minor
---

Forgotten passwords and invitations by email.

- **Forgot your password?** on the login page emails a link that sets a new password: it works once, within an hour (`auth.resetPasswordExpiration`). The answer is the same whether or not the email has an account, and requests per email and IP are limited. Setting the password signs the account out everywhere, logs in on this browser and emails a "your password was changed" notice.
- **Invitations:** admins create users without a password and they get an email to choose one (the link works for 7 days, `auth.inviteExpiration`). "Email a link to set the password" on a user's page sends an invitation or a reset link.
- Emails are in English or Thai, or your own text with `auth.emails`. Links need `email` in the config, and `serverURL` in production (a request's Host could be forged); without them the admin doesn't offer them.
- REST: `POST /users/forgot-password`, `GET` and `POST /users/reset-password`, `POST /users/:id/password-link`. Local API: `cms.auth.requestPasswordReset()`, `cms.auth.sendPasswordLink()`, `cms.auth.resetPassword()`.
- `cms.create('users', …)` no longer requires a `password`: a user without one can't log in until they set it from an invitation.

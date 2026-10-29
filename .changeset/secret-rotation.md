---
"@easy-cms/core": minor
"easy-cms": minor
"create-easy-cms": minor
"@easy-cms/plugin-form-builder": patch
"@easy-cms/admin": patch
---

Rotate `EASY_CMS_SECRET` without logging everyone out (#167). `previousSecrets` lists secrets used before `secret`: sessions, CSRF tokens, password and invitation links, preview tokens, links to private files, single sign-on, form tokens and audit log entries signed with them still verify, while everything new is signed with `secret`. `easy-cms audit:resign` signs the audit log entries made with an old secret with the current one, and reports entries no secret verifies. New projects read `EASY_CMS_PREVIOUS_SECRETS` (comma-separated). The Security guide has the steps.

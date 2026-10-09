---
"@easy-cms/core": minor
---

Deprecation warnings: `warnDeprecated(code, message)` (from `@easy-cms/core` and `@easy-cms/core/plugin`) logs a Node.js `DeprecationWarning` once per code and process. Old names that still work warn with codes `EASY_CMS_DEP001`–`005`: `<api>/users/<action>`, `POST` to a global, `?fallback-locale=`, `easy-cms create-admin` and `easy-cms run-scheduled`. A new docs page, "Versions and deprecations", says what the version number promises and lists them.

The admin saves globals with `PATCH` and sends `?fallbackLocale=`, and a failed sign-in no longer counts as an expired session.

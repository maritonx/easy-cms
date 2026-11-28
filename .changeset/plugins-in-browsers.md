---
'@easy-cms/core': patch
'@easy-cms/plugin-nested-docs': patch
'@easy-cms/plugin-form-builder': patch
'@easy-cms/plugin-social': patch
---

`plugin-nested-docs`, `plugin-form-builder` and `plugin-social` import no Node module, so they run in browsers too: Studio (ADR-0074) runs them for real instead of leaving them out. Random values come from Web Crypto; HMAC and reading a file from `@easy-cms/core/internal`, whose `hmac` now also does SHA-1 (X's OAuth 1.0a signature) and is exported there. With an older core they fall back to Node's modules, as before.

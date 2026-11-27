---
'@easy-cms/core': minor
'@easy-cms/drizzle': patch
---

A browser build of core, for Studio (ADR-0074): bundlers that set the `easy-cms-browser` export condition get `dist/browser/`, with no Node module. Hashes, MACs, HKDF, AES-GCM and scrypt come from @noble (the same results as `node:crypto`), request context follows one request at a time, and what needs a disk (config files, disk storage, uploads from a link) says so when used. Node, Bun, Deno and Workers keep the build they have: the condition has a name no runtime sets.

`@easy-cms/drizzle` imports no Node module: it takes them from core, or from Node itself beside an older core.

---
"@easy-cms/core": minor
"@easy-cms/next": patch
---

`@easy-cms/core/client`: read content over REST from edge runtimes (Vercel Edge, Cloudflare Workers, Deno) and browsers, typed from your config: `createClient<typeof config>({ url }).find('posts', { where })`, plus `findById`, `findGlobal` (with a preview token) and `search`. It is one file with no imports. `getEasyCMS()` from `@easy-cms/next` now says what to do when called on the edge runtime (#336).

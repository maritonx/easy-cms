# Easy CMS Studio

`studio.easycms.dev`: write an Easy CMS config on the left, use its admin on the right, in the
browser, with nothing to install. Design: [ADR-0074](../docs/adr/0074-studio.md).

## Run it

```bash
pnpm --filter @easy-cms/admin --filter easy-cms-studio... build
pnpm --dir studio preview   # http://localhost:5180
pnpm --dir studio test      # the built site in headless Chrome
```

## How it works

```
editor (index.html)                       sandbox (sandbox.html, its own origin in production)
 Monaco + types of every @easy-cms  ──►    sucrase: the config's TypeScript to CommonJS, run with
 package; each edit after 300 ms            Studio's `require` (runtime/modules.ts)
 ◄── status, errors (with the line),       createEasyCMS on memory({ name: 'studio' }): documents
     console lines                          stay while the config changes; sample documents
                                            for empty collections (runtime/seed.ts)
                                            frames the admin ──► /admin/ (Studio mode)
                                                                   │ fetch /api/cms/…
                                            Service Worker (sw.ts) ◄┘ serves the admin's shell,
                                            carries API requests to the sandbox page, which
                                            answers with the CMS, signed in with a bearer token
```

- **The CMS runs in the sandbox page, not the Service Worker:** browsers stop idle workers, and
  the in-memory database would go with them. The worker only carries requests.
- **One at a time:** the sandbox applies configs and answers requests in turn (core's request
  context in browsers follows one request at a time). A config sent while another starts
  replaces any still waiting.
- **A config that fails** (code, validation, startup) leaves the last working CMS and admin in
  place; the editor shows the error on its line.
- **What a config can import:** `@easy-cms/core`, `db-memory`, `fields`, `plugin-seo`,
  `plugin-redirects`, `plugin-multi-tenant`. Databases, storages, email and sign-in packages are
  stand-ins Studio replaces (SQLite in memory, files in memory, emails to the console, no SSO);
  plugins that don't run in a browser yet do nothing and say so in the console.
- **Share links:** the address always holds the config, deflated in its hash with the version
  (`#v=…&c=…`, `create-easy-cms/studio-link`), so it can be shared as it is; the hash never
  reaches a server. **Use in a project** gives `npm create easy-cms@latest -- --from "<link>"`,
  which writes that config into a project, and **Copy config** the code itself.
- **No environment variables:** `process.env` is empty; a config without a 32-character secret
  gets Studio's own.

## Deploying

A static site: `studio/dist/`. In production the sandbox has an origin of its own, without
cookies, so code from a shared link can't reach the editor's origin:

| Variable (at build time) | |
|---|---|
| `VITE_SANDBOX_ORIGIN` | e.g. `https://sandbox.studio.easycms.dev`: where the editor frames `sandbox.html` |
| `VITE_STUDIO_ORIGIN` | e.g. `https://studio.easycms.dev`: the only origin the sandbox takes configs from |

Both hosts serve the same `dist/`. Without them (local runs) both pages share one origin.

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

Each release deploys it (`.github/workflows/studio.yml`, called by `release.yml`): Studio is
built at the released version and copied to the server that hosts easycms.dev (Hetzner, Caddy),
into `/srv/easycms/studio/`, with its site blocks in `/srv/easycms/studio.caddy`, which the
site's Caddyfile imports. The workflow is skipped until `STUDIO_ORIGIN` is set.

| Repository variable | |
|---|---|
| `STUDIO_ORIGIN` | `https://studio.easycms.dev`: the editor |
| `SANDBOX_ORIGIN` | `https://sandbox.easycms.dev`: the only page the editor frames, framed by nothing else |
| `UMAMI_SRC`, `UMAMI_WEBSITE_ID` | Umami (optional): `studio-edit`, `studio-share`, `studio-copy-command`, `studio-copy-config`, `studio-open-link` |
| `ANALYTICS_ORIGINS` | where Umami's script loads from and sends to, comma-separated, for the editor's CSP |

Secrets: `DEPLOY_HOST`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, as in the site's repository.
DNS: `studio` and `sandbox` records pointing at the server.

The headers (CSP, framing, caching) are in `deploy/headers.ts`, the one place
`deploy/caddy.ts`, the Service Worker (for the admin's shell) and `test/deployed.test.ts` take
them from. That test runs the build on two origins (`studio.localhost`, `sandbox.localhost`)
with those headers. The sandbox is a subdomain of easycms.dev: the site's session cookies are
`__Host-` cookies, which subdomains never get, and it must never set `Domain=easycms.dev`.

Monaco is built with TypeScript and JavaScript only (`monacoTypeScriptOnly` in
`vite.config.ts`). The TypeScript worker (about 7 MB, the compiler) is most of what is left.

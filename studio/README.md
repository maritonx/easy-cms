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
- **Plugins' admin UIs** (SEO's panel, the tenant Members page, the color field) are admin
  modules that core finds as files on a server. A browser has none, so Studio gives their code
  to core (`runtime/admin-modules.ts`, `provideAdminModules` from `@easy-cms/core/internal`);
  a bundled package with an admin module of its own goes in that list too.
- **Full screen** (the button, or ⌘\ / Ctrl+\ outside the admin) hides the code so the admin
  shows at its real width; the bar stays. The frame isn't moved: moving it would load the sandbox
  again, and its in-memory documents would go.
- **Share links:** the address always holds the config, deflated in its hash with the version
  (`#v=…&c=…`, `create-easy-cms/studio-link`), so it can be shared as it is; the hash never
  reaches a server. **Use in a project** gives `npm create easy-cms@latest -- --from "<link>"`,
  which writes that config into a project, and **Copy config** the code itself.
- **Templates** (the dialog in the bar): ten configs, one per kind of system (`src/templates/`,
  one `.config.ts` each, so typecheck covers them; listed in `templates/index.ts`). Each has its
  own sample documents (`templates/samples.ts`, `@slug:n` for the n-th document of a
  collection). Picking one replaces the code (after asking, when the code isn't a template's as
  it is) and starts from an empty database with its samples. `?template=shop` opens one; the
  hash keeps the template as `t`, so a shared link gets its samples too. Collections a template
  has no samples for get generic ones.
- **Theme:** the system's, unless the theme button (System → Light → Dark) chose one, remembered
  in the browser. The sandbox passes it on to the admin (`easy-cms:theme`), and Monaco follows.
- **Type problems** Monaco finds show beside the status as a count; the config may still run
  (the status says whether it did), and clicking the count goes to the first.
- **The divider** between code and admin drags, or moves with the arrow keys (Shift for bigger
  steps, Enter or a double-click for the default width); the width is remembered.
- **Phones** get the admin and Templates (to see what each kind of system looks like), not the
  editor; editing wants a keyboard and room.
- **The first visit** shows a tip above the code until it is closed or the code is edited.
- **Sharing:** `public/favicon.svg` is easycms.dev's logo; `public/og.png` is the share card's
  image, rendered from `brand/og.html` with `node brand/render.ts` (headless Chrome, the site's
  font), with `apple-touch-icon.png`. The build adds the card's tags to the editor page with
  Studio's origin (`VITE_STUDIO_ORIGIN`) for the image's address.
- **Asking first:** replacing edited code (a template) or the admin's documents (**Reset the
  sample data**, the ↺ button: an empty database, then the samples, the code kept) goes through
  Studio's own dialog, with Cancel focused; for code it offers **Copy my code first**.
- **⌘S / Ctrl+S** copies the share link, as **Share link** does, instead of saving the page.
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
| `UMAMI_SRC`, `UMAMI_WEBSITE_ID` | Umami (optional): `studio-edit`, `studio-share`, `studio-copy-command`, `studio-copy-config`, `studio-open-link`, `studio-expand`, `studio-template` (with the template, and `from`: dialog or link), `studio-reset`; `studio-share` says `from`: button or shortcut |
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

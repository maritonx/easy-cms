# @easy-cms/nuxt

## 0.31.0

### Patch Changes

- Updated dependencies [36fc19b]
  - @easy-cms/core@0.31.0
  - @easy-cms/admin@0.31.0

## 0.30.0

### Patch Changes

- Updated dependencies [f9d5512]
  - @easy-cms/core@0.30.0
  - @easy-cms/admin@0.30.0

## 0.29.0

### Minor Changes

- 5e92063: The dashboard tells admins what needs attention, and what the system is.
  
  - **Needs attention** (admins only, shown only when something is wrong): webhook deliveries that failed in the last 7 days, emails waiting over an hour or failed, scheduled publishing over 10 minutes late (nothing calls `jobs/run`), no `email`, and no `serverURL` in production. Each links to the new Health checks guide.
  - **System** (admins only): the Easy CMS version, database, file storage, email adapter, plugins with their versions, and field types.
  - Both come from the new `GET <api>/admin/status`, for admins only. Easy CMS doesn't check for new versions.
  - **`definePlugin(plugin, { name, version })`** names a plugin for the dashboard; the official plugins name themselves. `EmailAdapter` gets an optional `name` (`smtp`, `console`). Core exports `VERSION`.
  - In development, the admin's HTML is read on each request, so a rebuilt admin shows up without a restart.

### Patch Changes

- Updated dependencies [5e92063]
  - @easy-cms/core@0.29.0
  - @easy-cms/admin@0.29.0

## 0.28.0

### Patch Changes

- Updated dependencies [479e17a]
  - @easy-cms/core@0.28.0
  - @easy-cms/admin@0.28.0

## 0.27.0

### Patch Changes

- Updated dependencies [ffa2f84]
  - @easy-cms/core@0.27.0
  - @easy-cms/admin@0.27.0

## 0.26.0

### Patch Changes

- Updated dependencies [bcf3c0c]
  - @easy-cms/core@0.26.0
  - @easy-cms/admin@0.26.0

## 0.25.0

### Patch Changes

- Updated dependencies [434599a]
  - @easy-cms/core@0.25.0
  - @easy-cms/admin@0.25.0

## 0.24.0

### Patch Changes

- Updated dependencies [230a347]
  - @easy-cms/core@0.24.0
  - @easy-cms/admin@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [0107902]
  - @easy-cms/core@0.23.0
  - @easy-cms/admin@0.23.0

## 0.22.2

### Patch Changes

- @easy-cms/admin@0.22.2
  - @easy-cms/core@0.22.2

## 0.22.1

### Patch Changes

- d742afc: Package READMEs: what each package does, how to install it with npm, pnpm, Yarn or Bun, a short example and links to its guide.
- Updated dependencies [d742afc]
  - @easy-cms/admin@0.22.1
  - @easy-cms/core@0.22.1

## 0.22.0

### Minor Changes

- 63995c6: npm, pnpm, Yarn and Bun.
  
  - `create-easy-cms --pm npm|pnpm|yarn|bun` picks the package manager; without it, the project's `packageManager` field, then its lockfile, then the one you ran it with (`pnpm create easy-cms`, `bun create easy-cms`…).
  - The next steps it prints use that package manager: `pnpm exec easy-cms migrate`, `yarn easy-cms migrate`, `bunx easy-cms migrate`, `bun run dev`.
  - With Yarn 2 or later it writes `.yarnrc.yml` with `nodeLinker: node-modules` (Plug'n'Play isn't supported).
  - When the package manager isn't installed it says how to get it, and prints the install commands.
  - Messages from core and the Nuxt module no longer assume npx.
  - The docs show every command for npm, pnpm, Yarn and Bun, and keep the one you pick.

### Patch Changes

- Updated dependencies [63995c6]
  - @easy-cms/core@0.22.0
  - @easy-cms/admin@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies [0e69436]
  - @easy-cms/core@0.21.0
  - @easy-cms/admin@0.21.0

## 0.20.1

### Patch Changes

- @easy-cms/admin@0.20.1
  - @easy-cms/core@0.20.1

## 0.20.0

### Patch Changes

- Updated dependencies [b7564cb]
  - @easy-cms/core@0.20.0
  - @easy-cms/admin@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [34d5e66]
  - @easy-cms/core@0.19.0
  - @easy-cms/admin@0.19.0

## 0.18.0

### Patch Changes

- @easy-cms/admin@0.18.0
  - @easy-cms/core@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [0507a14]
  - @easy-cms/core@0.17.0
  - @easy-cms/admin@0.17.0

## 0.16.1

### Patch Changes

- Updated dependencies [8b14b83]
  - @easy-cms/core@0.16.1
  - @easy-cms/admin@0.16.1

## 0.16.0

### Patch Changes

- @easy-cms/admin@0.16.0
  - @easy-cms/core@0.16.0

## 0.15.0

### Patch Changes

- Updated dependencies [fdb3985]
  - @easy-cms/core@0.15.0
  - @easy-cms/admin@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [6c7eb74]
  - @easy-cms/core@0.14.0
  - @easy-cms/admin@0.14.0

## 0.13.1

### Patch Changes

- @easy-cms/admin@0.13.1
  - @easy-cms/core@0.13.1

## 0.13.0

### Minor Changes

- bf9fa90: Plugins can now add REST endpoints and admin UI, and the first official plugin is here.
  
  - `endpoints: [{ path, method, handler }]` adds routes under the REST API, with the same auth, CSRF and error format.
  - Admin components: Web Components from `admin.modules` can replace a field's input (`admin.component`), sit below a field (`admin.after`) or add panels to the edit page's side column (`admin.sidebar`). The admin passes the form's state as properties and listens for `change` and `set-field` events.
  - `@easy-cms/plugin-seo`: meta title, description and share image with length meters, a search result preview and Generate buttons in the admin, and `seoMeta()` for Nuxt's `useSeoMeta` and Next.js `generateMetadata`.

### Patch Changes

- Updated dependencies [bf9fa90]
  - @easy-cms/core@0.13.0
  - @easy-cms/admin@0.13.0

## 0.12.0

### Minor Changes

- 070d710: The admin now follows its design more closely: counts in the menu, a greeting and "View site" on the dashboard (`admin.siteUrl`), breadcrumbs and row menus in lists, and an edit page with a page-wide header, a large title input with the slug beneath it, a split Publish button, a save bar pinned to the bottom, and a side panel for fields with `position: 'sidebar'`. Icons replace the text buttons in the rich-text and blocks editors. The menu lists user accounts under Settings and the media library last; `admin.menu` sets the order of collections.

### Patch Changes

- Updated dependencies [070d710]
- Updated dependencies [070d710]
- Updated dependencies [070d710]
- Updated dependencies [070d710]
  - @easy-cms/admin@0.12.0
  - @easy-cms/core@0.12.0

## 0.11.0

### Minor Changes

- a035bce: A refreshed admin look: new color tokens, the Anuphan typeface (Thai and Latin), Lucide icons, a menu that works on phones, and a light / dark / system theme switch. Brand the admin for a client with `admin.brand` (`name`, `logo`, `color`; shades are derived and text stays readable), and give collections and globals a menu `icon`.

### Patch Changes

- Updated dependencies [a035bce]
- Updated dependencies [2a5a18d]
  - @easy-cms/admin@0.11.0
  - @easy-cms/core@0.11.0

## 0.10.0

### Patch Changes

- Updated dependencies [cab02f9]
  - @easy-cms/core@0.10.0
  - @easy-cms/admin@0.10.0

## 0.9.1

### Patch Changes

- @easy-cms/admin@0.9.1
  - @easy-cms/core@0.9.1

## 0.9.0

### Patch Changes

- @easy-cms/admin@0.9.0
  - @easy-cms/core@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [e032e1c]
  - @easy-cms/core@0.8.0
  - @easy-cms/admin@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [da85424]
- Updated dependencies [da85424]
  - @easy-cms/core@0.7.0
  - @easy-cms/admin@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies [a76cf49]
- Updated dependencies [a76cf49]
- Updated dependencies [a76cf49]
- Updated dependencies [a76cf49]
  - @easy-cms/core@0.6.0
  - @easy-cms/admin@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies [df8b783]
- Updated dependencies [df8b783]
  - @easy-cms/core@0.5.0
  - @easy-cms/admin@0.5.0

## 0.4.0

### Minor Changes

- b6f8aa3: Live preview: `preview: ({ doc }) => url` on a collection or global adds a Preview pane to the admin that shows the real page and updates it as you type, without saving. The server builds the preview document like a normal read (`cms.preview`, `POST /:collection/:id/preview`); pages receive it through `useLivePreview` (auto-imported in Nuxt, `@easy-cms/next/live-preview` in Next.js) or `subscribeLivePreview` from `@easy-cms/core/live-preview`.

### Patch Changes

- Updated dependencies [b6f8aa3]
  - @easy-cms/core@0.4.0
  - @easy-cms/admin@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [8dd12a8]
  - @easy-cms/core@0.3.0
  - @easy-cms/admin@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [d626995]
  - @easy-cms/core@0.2.0
  - @easy-cms/admin@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [01f3816]
  - @easy-cms/core@0.1.1
  - @easy-cms/admin@0.1.1

## 0.1.0

### Minor Changes

- 312df64: First release of Easy CMS: an embedded, code-first headless CMS for Nuxt and Next.js with an admin UI,
  typed Local API, REST API, SQLite and Postgres adapters, uploads, drafts, hooks and access control.

### Patch Changes

- Updated dependencies [312df64]
  - @easy-cms/core@0.1.0
  - @easy-cms/admin@0.1.0

# @easy-cms/next

## 0.23.0

### Patch Changes

- Updated dependencies [0107902]
  - @easy-cms/core@0.23.0
  - @easy-cms/admin@0.23.0

## 0.22.2

### Patch Changes

- cdc34cf: The admin works on Vercel. `createAdminRouteHandlers()` looked for the admin app through `@easy-cms/next/package.json`, which Vercel doesn't deploy, so `/admin` answered 500 with "Cannot find module '@easy-cms/next/package.json'". It now uses the path `@easy-cms/admin` reports for itself, which the build traces, and falls back to the old lookup when that package was bundled.
- @easy-cms/admin@0.22.2
  - @easy-cms/core@0.22.2

## 0.22.1

### Patch Changes

- d742afc: Package READMEs: what each package does, how to install it with npm, pnpm, Yarn or Bun, a short example and links to its guide.
- Updated dependencies [d742afc]
  - @easy-cms/admin@0.22.1
  - @easy-cms/core@0.22.1

## 0.22.0

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

- 8b14b83: Next.js: one CMS instance per server again. Next.js loads the config into each server layer (route handlers, Server Components), so `getEasyCMS()` saw a "new" config whenever a request switched layers, closed the database and opened it again. Requests still running then failed or hung, most visibly with PGlite. Instances are now matched by the config's structure (`configSignature()` in core). In `next dev`, editing only a hook's code needs a restart.
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

- ff63224: `withEasyCMS()` includes admin modules (such as the SEO plugin's `admin.js`) in the server build's file tracing, so their admin components also load on Vercel and with `output: 'standalone'`.
- @easy-cms/admin@0.13.1
  - @easy-cms/core@0.13.1

## 0.13.0

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

- a76cf49: Ship `dist/live-preview.d.ts`: `@easy-cms/next/live-preview` had no type declarations in 0.4.0 and 0.5.0.
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

- 1e97977: `withEasyCMS` now accepts a config typed as `NextConfig` (as `create-next-app` writes it). Before, `next build` failed its type check with "Index signature for type 'string' is missing in type 'NextConfig'".
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

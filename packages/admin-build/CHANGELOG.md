# @easy-cms/admin-build

## 1.57.1

No changes in this release.

## 1.57.0

No changes in this release.

## 1.56.2

No changes in this release.

## 1.56.1

No changes in this release.

## 1.56.0

No changes in this release.

## 1.55.0

No changes in this release.

## 1.54.0

No changes in this release.

## 1.53.0

No changes in this release.

## 1.52.2

No changes in this release.

## 1.52.1

No changes in this release.

## 1.52.0

### Minor Changes

- c3ff9ab: `easy-cms build:admin` builds admin components written in Vue (`.vue`), React (`.tsx`, `.jsx`) or Svelte (`.svelte`) into the admin's module (#443): one ES module without imports, in `admin/dist/components.js` for `admin.modules`, with a custom element per component named after its file and the component's styles in its shadow root. Components get the admin's properties as props, plus `change`, `setField` and `navigate` (typed `AdminComponentProps` from `@easy-cms/core`). The new `@easy-cms/admin-build` package holds the build (Vite); install it with the framework's Vite plugin. `--watch` builds again as files change. A missing `admin/dist/…` module now says to run `easy-cms build:admin`. The Nuxt, Next.js and standalone examples each have one (Vue, React, Svelte).

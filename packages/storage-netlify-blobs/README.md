# @easy-cms/storage-netlify-blobs

Netlify Blobs storage for Easy CMS uploads, for sites on Netlify (whose disk doesn't keep files). Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt and Next.js.

## Install

```bash
npm install @easy-cms/storage-netlify-blobs
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

On Netlify, Blobs need no setup: the store is created on first use.

```ts
import { netlifyBlobsStorage } from '@easy-cms/storage-netlify-blobs'

export default defineConfig({
  // …
  upload: { storage: netlifyBlobsStorage() }, // files are served through /api/cms/media/file/…
})
```

Outside Netlify's runtime (a script, another host), pass `siteID` and a personal access `token`.

## Links

[Uploads](https://easycms.dev/docs/uploads) · [One-click deploy](https://easycms.dev/docs/one-click-deploy) · [Documentation](https://easycms.dev/docs) ([ภาษาไทย](https://easycms.dev/th/docs)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License

# @easy-cms/storage-vercel-blob

Vercel Blob storage for Easy CMS uploads, for sites on Vercel (whose disk doesn't keep files). Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt and Next.js.

## Install

```bash
npm install @easy-cms/storage-vercel-blob
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

Connect a Blob store to your Vercel project (Storage → Blob); it sets `BLOB_READ_WRITE_TOKEN`.

```ts
import { vercelBlobStorage } from '@easy-cms/storage-vercel-blob'

export default defineConfig({
  // …
  upload: { storage: vercelBlobStorage() }, // public files on the Blob CDN
  // backups: { storage: vercelBlobStorage({ access: 'private', prefix: 'backups/' }) },
})
```

## Links

[Uploads](https://easycms.dev/docs/uploads) · [One-click deploy](https://easycms.dev/docs/one-click-deploy) · [Documentation](https://easycms.dev/docs) ([ภาษาไทย](https://easycms.dev/th/docs)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License

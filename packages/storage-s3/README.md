# @easy-cms/storage-s3

Upload storage for Easy CMS on AWS S3, Cloudflare R2, MinIO or any S3-compatible service, for hosts without a persistent disk (Vercel, Netlify, containers). Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt and Next.js.

## Install

```bash
npm install @easy-cms/storage-s3
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

```ts
import { s3Storage } from '@easy-cms/storage-s3'

export default defineConfig({
  // …
  upload: { storage: s3Storage({ bucket: 'my-site-media', region: 'eu-central-1' }) },
})
```

Credentials default to `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`. Files are served through the
CMS API (private bucket) unless you set `publicURL`.

## Links

[Uploads & media](https://maritonx.github.io/easy-cms/guide/uploads#s3-cloudflare-r2-and-minio) · [Documentation](https://maritonx.github.io/easy-cms/) ([ภาษาไทย](https://maritonx.github.io/easy-cms/th/)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License

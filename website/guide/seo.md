# SEO

::: info What you'll learn
Add SEO fields with a search preview to the admin, and fill your pages' metadata from them.

**Before this page:** [Plugins](./plugins).
:::

<Screenshot name="seo" alt="The SEO fields with length meters and a search preview" />

`@easy-cms/plugin-seo` adds a `meta` group (title, description, share image) to the collections
and globals you choose. Editors see how long each text is, a preview of the search result, and
Generate buttons; your pages get their metadata from one function.

```bash
npm install @easy-cms/plugin-seo
```

```ts
import { seoPlugin } from '@easy-cms/plugin-seo'

export default defineConfig({
  // …
  plugins: [
    seoPlugin({
      collections: ['posts'],
      globals: ['site'],
      generateTitle: ({ doc }) => `${doc.title} | My Blog`,
      generateDescription: ({ doc }) => doc.excerpt,
      generateImage: ({ doc }) => doc.cover,
      generateURL: ({ doc }) => `https://example.com/posts/${doc.slug}`,
    }),
  ],
})
```

The group adds columns to the collections' tables: run `easy-cms migrate:create seo` (see
[Migrations](./deployment)).

## In the admin

- **Meta title** and **Meta description**, with a meter: short, good length or too long
  (50–60 and 100–150 characters by default, counting Thai letters with their marks as one).
- **Share image**, from the media library.
- **Generate** buttons for each generator you configure. They send the form as it is, unsaved,
  to your generator on the server, and fill the field.
- **Search result preview** below the group: the meta title (or the document's title), the
  address from `generateURL` and the description.

## Options

| Option | Default | |
|---|---|---|
| `collections` | `[]` | Collections that get SEO fields. |
| `globals` | `[]` | Globals that get SEO fields. |
| `position` | `'main'` | `'sidebar'` puts the group in the edit page's side column. |
| `generateTitle` | — | Suggests a meta title. |
| `generateDescription` | — | Suggests a meta description. |
| `generateImage` | — | Suggests a share image: the id of a media document. |
| `generateURL` | — | The page's address, for the preview. |
| `autoGenerate` | `false` | Fill empty meta fields with the generators when a document is saved. |
| `fields` | — | `(defaults) => fields`: change the group's fields, e.g. add a `noindex` checkbox. |
| `titleLength` | `{ min: 50, max: 60 }` | Length marked as good. |
| `descriptionLength` | `{ min: 100, max: 150 }` | Length marked as good. |
| `localized` | with `localization` | One value per [content locale](./localization). |
| `label` | `'SEO'` | Label of the group. |

Generators receive `{ doc, id, locale, collection | global, cms, user }` and may be async. Return
`null` when there is nothing to suggest.

## On your pages

`seoMeta(doc, options)` reads the meta fields, falls back to the document (`title`, then
`excerpt` or `description`) and returns the metadata for Nuxt and Next.js. Fetch the document with
`depth` 1 or more so the share image has its URL.

::: code-group

```vue [Nuxt page]
<script setup lang="ts">
import { seoMeta } from '@easy-cms/plugin-seo'

const route = useRoute()
const { data: post } = await useFetch(`/api/posts/${route.params.slug}`)
const seo = seoMeta(post.value ?? {}, { siteUrl: useRequestURL().origin, url: route.path })
useSeoMeta(seo.nuxt)
useHead({ link: seo.canonical ? [{ rel: 'canonical', href: seo.canonical }] : [] })
</script>
```

```ts [Next.js page]
import { seoMeta } from '@easy-cms/plugin-seo'

export async function generateMetadata({ params }) {
  const { slug } = await params
  const cms = await getEasyCMS(config)
  const post = (await cms.find('posts', { where: { slug: { equals: slug } }, limit: 1 })).docs[0]
  return post ? seoMeta(post, { config, url: `/posts/${slug}` }).next : {}
}
```

:::

| Option | |
|---|---|
| `siteUrl` | The site's address, to make the canonical and image URLs absolute. Default: `config.admin.siteUrl`, then `config.serverURL`. |
| `config` | Your Easy CMS config, to read those from. |
| `url` | The page's address (or `(doc) => url`), for the canonical link and `og:url`. |
| `title`, `description` | `(doc) => text`: fallbacks when the meta fields are empty. |
| `siteName` | `og:site_name`. |

It returns `title`, `description`, `canonical` and `image`, plus `nuxt` (for `useSeoMeta`) and
`next` (for `generateMetadata`) with Open Graph and Twitter card tags.

## Next steps

- [Localization](./localization): SEO fields per language.
- [Migrations & deployment](./deployment): migrate the new columns.

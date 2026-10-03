# Image galleries

::: info What you'll build
A gallery of photos on each post, in the order editors choose, shown as a grid on the page.
**Uses:** [uploads](../uploads#several-files-galleries), [arrays](../fields#array-and-group).
:::

## 1. Choose the field

There are two ways to keep several images on a document:

| | `upload` with `hasMany` | `array` with an `upload` |
|---|---|---|
| Editors | Drop or pick several files at once, drag to reorder | Add a row, then pick its image |
| Caption | The image's alt text in the media library | Its own text, for this page only |
| Use it for | Photo galleries, product images, logos | Galleries where each image needs its own caption or link |

Most galleries need the first:

```ts
{
  name: 'gallery',
  type: 'upload',
  hasMany: true,
  maxRows: 12,
  mimeTypes: ['image/*'],
  label: { en: 'Gallery', th: 'แกลเลอรี' },
}
```

When captions belong to the page, use an array:

```ts
{
  name: 'gallery',
  type: 'array',
  maxRows: 12,
  fields: [
    { name: 'image', type: 'upload', required: true, mimeTypes: ['image/*'] },
    { name: 'caption', type: 'text', localized: true },
  ],
}
```

Create a migration for the new field (`easy-cms migrate:create gallery`).

## 2. Show it

Reads populate the images (`depth` 1, the default), with the resized copies from
[image sizes](../uploads#what-happens-to-a-file):

::: code-group

```vue [Nuxt: app/pages/posts/[slug].vue]
<ul v-if="post.gallery.length" class="gallery">
  <li v-for="image in post.gallery" :key="image.id">
    <a :href="image.url">
      <img :src="image.sizes?.thumbnail?.url ?? image.url" :alt="image.alt ?? ''" loading="lazy" />
    </a>
  </li>
</ul>
```

```tsx [Next.js]
{post.gallery.length > 0 && (
  <ul className="gallery">
    {post.gallery.map((image) =>
      typeof image === 'object' ? (
        <li key={image.id}>
          <a href={image.url}>
            <img src={image.sizes?.thumbnail?.url ?? image.url} alt={image.alt ?? ''} loading="lazy" />
          </a>
        </li>
      ) : null,
    )}
  </ul>
)}
```

```css [CSS]
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
  gap: 0.5rem;
  padding: 0;
  list-style: none;
}
.gallery img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}
```

:::

With the array, each row is `{ image, caption }`: use `row.image.url` and `row.caption`.

## 3. Check it

- Drop three images into the gallery, drag the last one first, and publish: the page shows them
  in that order.
- Try a PDF: the picker doesn't offer it, and the API refuses it with "must be an image".
- The example blogs in the repository have a gallery on every post.

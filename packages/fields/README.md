# @easy-cms/fields

More field types for Easy CMS, starting with `color`: a color picker with suggested colors in the admin, a check that every value is a color, and swatches in lists. Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt and Next.js.

## Install

```bash
npm install @easy-cms/fields
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

```ts
import { color } from '@easy-cms/fields'

export default defineConfig({
  // …
  fieldTypes: [color],
  collections: [
    {
      slug: 'categories',
      fields: [
        { name: 'name', type: 'text', required: true },
        // `#rrggbb`; with `alpha: true`, `#rrggbbaa` too.
        { name: 'color', type: 'color', presets: ['#2f6f5e', '#e8a33d'] },
      ],
    },
  ],
})
```

Values are stored as text, so queries and the REST API treat them like `text` fields. Importing the package types them as `string`.

## Links

[Custom field types](https://maritonx.github.io/easy-cms/guide/field-types) · [Documentation](https://maritonx.github.io/easy-cms/) ([ภาษาไทย](https://maritonx.github.io/easy-cms/th/)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License

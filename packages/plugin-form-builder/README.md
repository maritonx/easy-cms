# @easy-cms/plugin-form-builder

Forms for Easy CMS: editors build them in the admin, submissions are validated, stored and emailed, bots are kept out (honeypot, timing, rate limits, Cloudflare Turnstile), and `<easy-form>` puts a form on any page. Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt and Next.js.

## Install

```bash
npm install @easy-cms/plugin-form-builder
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

```ts
import { formBuilderPlugin } from '@easy-cms/plugin-form-builder'

export default defineConfig({
  // …
  email: smtp(), // from @easy-cms/email-smtp, for notifications
  plugins: [formBuilderPlugin({ defaultTo: 'hello@example.com' })],
})
```

```html
<script type="module" src="/api/cms/form/element.js"></script>
<easy-form form="contact"></easy-form>
```

## Links

[Forms](https://maritonx.github.io/easy-cms/guide/forms) · [Documentation](https://maritonx.github.io/easy-cms/) ([ภาษาไทย](https://maritonx.github.io/easy-cms/th/)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License

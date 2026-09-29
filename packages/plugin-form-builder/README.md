# @easy-cms/plugin-form-builder

Forms for [Easy CMS](https://maritonx.github.io/easy-cms/): editors build them in the admin from
field blocks; visitors' submissions are validated, stored and emailed; honeypot, timing, rate
limits and Cloudflare Turnstile keep bots out; `<easy-form>` puts a form on any page.

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

See [Forms](https://maritonx.github.io/easy-cms/guide/forms).

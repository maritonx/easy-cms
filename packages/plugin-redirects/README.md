# @easy-cms/plugin-redirects

Redirects for [Easy CMS](https://maritonx.github.io/easy-cms/): a Redirects list under Settings
in the admin, and automatic redirects when a published page's address changes.

```ts
import { redirectsPlugin } from '@easy-cms/plugin-redirects'

export default defineConfig({
  // …
  plugins: [
    redirectsPlugin({
      collections: ['posts'],
      url: ({ doc }) => (doc.slug ? `/posts/${doc.slug}` : null),
    }),
  ],
})
```

```ts
import { resolveRedirect } from '@easy-cms/plugin-redirects'

// In your app's middleware
const redirect = await resolveRedirect(cms, new URL(request.url))
if (redirect) return Response.redirect(new URL(redirect.location, request.url), redirect.status)
```

See [Redirects](https://maritonx.github.io/easy-cms/guide/redirects).

# Rebuild a static site on publish

::: info What you'll build
A site generated at build time (Astro, Nuxt `generate`, Next.js export, Hugo…) that rebuilds by
itself when content is published. **Uses:** [webhooks](../webhooks).
:::

## 1. Get a deploy hook

Your host gives you a URL that starts a build when it receives a `POST`:

- **Netlify:** Site configuration → Build & deploy → Build hooks
- **Vercel:** Project Settings → Git → Deploy Hooks
- **Cloudflare Pages:** Settings → Builds → Deploy hooks

Keep it secret: put it in an environment variable, e.g. `DEPLOY_HOOK_URL`.

## 2. Call it when something goes live

```ts
webhooks: [
  {
    url: process.env.DEPLOY_HOOK_URL as string,
    // Only changes visitors can see: not every draft save.
    events: ['publish', 'unpublish', 'delete'],
    collections: ['posts', 'pages'],
  },
],
```

For collections without drafts, add `'update'` and `'create'`: every save is live there.

Easy CMS sends the request after the change is saved, and retries for about a day if the host is
down (1 minute, 5 minutes, 30 minutes, 2, 6 and 12 hours), even across restarts.

## 3. Build with the content

At build time, read published content from the API, e.g. in Astro:

```ts
const res = await fetch(`${import.meta.env.CMS_URL}/api/cms/posts?limit=100&sort=-publishedAt`)
const { docs: posts } = await res.json()
```

## Tips

- Several publishes in a row start several builds; most hosts cancel older builds or queue them.
- Scheduled publishing sends `publish` too, so a post set for 9:00 rebuilds the site at 9:00.
- Failed attempts are logged on the server (`Webhook <url> failed for publish …; will retry
  later`), and the delivery is kept until it succeeds or runs out of retries.

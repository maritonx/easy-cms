# Site members

::: info What you'll learn
How people sign in on your site, not the admin: customers, subscribers, members of a club.
Signing up with email confirmation, the site's own pages for email links, and what members may
see.

**Before this page:** [Authentication](./auth) and [Access control](./access-control).
:::

Users of the admin and members of the site share the `users` collection and its sign-in, but
not what they may do. A **member** has one of the roles in `auth.members.roles`:

- They never get into the admin: it refuses them, and so do its endpoints.
- Access that defaults to logged-in users (`isStaff`, the default of every collection)
  doesn't count them. Give them access where they need it, e.g. with `isSignedIn`.
- They see only their own account in `users`, and can't change their role.

```ts
import { isSignedIn } from '@easy-cms/core'

export default defineConfig({
  auth: {
    roles: ['admin', 'editor', 'customer'],
    members: {
      roles: ['customer'],
      signUp: { role: 'customer' },
      pages: { verifyEmail: '/account/verify', resetPassword: '/account/reset' },
    },
  },
  collections: [
    {
      slug: 'wishlists',
      access: {
        read: ({ user }) => (user ? { owner: { equals: user.id } } : false),
        create: isSignedIn,
      },
      fields: [/* … */],
    },
  ],
})
```

The [shop](./ecommerce) sets this up for customers.

## Signing up

With `signUp`, visitors create their own account with its `role`:

```ts
// The form's token, when the form is shown: proves it wasn't filled in by a bot at once.
const { token } = await fetch('/api/cms/auth/signup').then((r) => r.json())

await fetch('/api/cms/auth/signup', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, name, token, website: '' }),
})
// 202 { verify: true }: a link to confirm the email is on its way.
```

1. The new account can't sign in until the email is confirmed (`signUp.verifyEmail`, default
   `true`). The answer is the same whether or not the email has an account, so nobody learns who
   is signed up.
2. The email's link opens `pages.verifyEmail` on the site with `?token=`. The page sends it to
   `POST /api/cms/auth/verify-email` (`{ token }`), which confirms the email and signs in.
3. Without `verifyEmail`, signing up signs in at once (`201` with the session).

Spam protection is the same as the [form builder's](./forms): the token (sent too quickly or
a day later is refused), a hidden field bots fill in (`website`), sign-ups per IP, and Cloudflare
Turnstile with `signUp.turnstile: { siteKey, secretKey }`. The token's request also says
`turnstile` (the site key, or `null`).

Signing up needs [email](./email), and a site URL in production for the links: `admin.siteURL`
as a full URL, or `serverURL`.

## Email links

Members' "forgot password" links open `pages.resetPassword` on the site, which sends the token
and the new password to `POST /api/cms/auth/reset-password`. Pages can be paths (on
`admin.siteURL`, else `serverURL`) or full URLs. Without them, links open the admin's pages.

`emails.verifyEmail` changes the confirmation email's text, like `auth.emails`.

## Signing in on the site

Members sign in like admins: `POST /api/cms/auth/login` sets the session cookie (send
`x-csrf-token` from `GET /api/cms/auth/me` with writes), or returns a token for
`Authorization: Bearer`. The session's user has `member: true`. In server code,
`cms.forRequest(request)` gives the user.

With the [multi-tenant plugin](./multi-tenant), members aren't in a tenant: they use the site
of the request (its domain or header), so one account works on every tenant's site.

## Next steps

- [Shop](./ecommerce): customers, carts and orders.
- [Access control](./access-control): rules for members' own documents.

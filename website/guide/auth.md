# Users & auth

::: info What you'll learn
Who can log in to the admin, how roles work, how to create users, and how sessions and tokens
authenticate requests from browsers and other apps.

**Before this page:** [Getting started](./getting-started).
:::

The built-in `users` collection holds the people who use the admin: editors, authors,
developers. They are separate from any customers or members your site has; keep those in your
own collection or auth system.

## The users collection

| Field | |
|---|---|
| `email` | Unique; used to log in. Stored in lowercase. |
| `name` | Shown in the admin (optional). |
| `role` | One of `auth.roles`. Only admins can change it. |
| `active` | Unticking it blocks logins and ends the user's sessions. Only admins can change it. |
| `password` | Write-only: accepted on create and update, never returned. At least 8 characters. |

Add your own fields, access rules or hooks by declaring a `users` collection; they are merged
into the built-in one:

```ts
collections: [
  {
    slug: 'users',
    fields: [
      { name: 'phone', type: 'text' },
      { name: 'avatar', type: 'upload' },
    ],
  },
]
```

By default logged-in users can read users, admins create and delete them, and users can update
themselves (but not their own role or `active`).

## Roles

```ts
auth: { roles: ['admin', 'editor', 'author'] } // default: ['admin', 'editor']
```

`admin` must be one of them; admins can do everything, including managing users. The other
roles mean what your [access rules](./access-control) say, for example:

```ts
{
  slug: 'posts',
  access: {
    read: () => true,
    // Authors create; editors and admins publish anything; authors change only their own posts.
    create: ({ user }) => !!user,
    update: ({ user }) =>
      user?.role === 'author' ? { author: { equals: user.id } } : !!user,
    delete: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
  },
}
```

New users get `editor` when that role exists (otherwise the last role).

Easy CMS refuses changes that would leave no active admin (deleting, demoting or deactivating
the last one), so nobody gets locked out.

## Creating users

- **The first admin:** when there are no users, the admin shows a form to create one. From a
  terminal or in CI, run `npx easy-cms create-admin` (see [CLI](./cli#create-admin)).
- **Everyone else:** admins add users under **Settings → Users** in the admin, or in code:

```ts
await cms.create('users', { email: 'ann@example.com', password: 'at least 8 chars', role: 'editor' })
```

Passwords are hashed with scrypt and never returned.

## Sessions

Logging in creates a session:

1. `POST /api/cms/users/login` with `{ email, password }` sets an HttpOnly session cookie (valid
   for 7 days, `auth.tokenExpiration` in seconds) and returns a CSRF token.
2. Browsers send the cookie on their own. Writes must also send the CSRF token in the
   `x-csrf-token` header (see [REST API](./rest-api#authentication)).
3. `POST /api/cms/users/logout` ends it.

Logging out, changing the password or deactivating a user ends all of their sessions.

### Tokens for other apps

Scripts and apps on other origins can send the session token instead of a cookie:

```bash
curl -s -X POST https://example.com/api/cms/users/login \
  -H 'content-type: application/json' \
  -d '{"email":"bot@example.com","password":"…"}' -c cookies.txt
# Use the ecms-session value from cookies.txt:
curl https://example.com/api/cms/posts?draft=true -H "Authorization: Bearer $TOKEN"
```

Requests with `Authorization: Bearer` need no CSRF token. Give such users their own account and
the smallest role that works.

### Login limits

After `auth.maxLoginAttempts` failures (5) within `auth.lockWindow` seconds (15 minutes) for an
email (and IP, when the adapter knows it), login answers `429`. The lock lifts by itself.

## The user in your pages

```ts
const user = await useEasyCMSUser(event) // Nuxt, in a server route
const user = await getEasyCMSUser(config) // Next.js, in a server component or route
```

Both return the logged-in admin user or `null`. Pass it to the Local API to apply that user's
access, for example to show editors drafts:

```ts
const { docs } = await cms.find('posts', { user, overrideAccess: false, draft: user !== null })
```

## Settings

| Option | Default | |
|---|---|---|
| `auth.roles` | `['admin', 'editor']` | Roles a user can have. Must include `admin`. |
| `auth.tokenExpiration` | 7 days | Session lifetime in seconds. |
| `auth.maxLoginAttempts` | `5` | Failed logins allowed within `lockWindow`. |
| `auth.lockWindow` | 15 minutes | In seconds. |
| `auth.trustedOrigins` | `[]` | Other origins allowed to send cookie-authenticated requests. |

## Next steps

- [Access control](./access-control): what each role may read and change.
- [Security](./security): what is protected, and a checklist for going live.

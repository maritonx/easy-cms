---
"@easy-cms/core": minor
"@easy-cms/admin": minor
"@easy-cms/next": minor
"@easy-cms/nuxt": minor
"easy-cms": minor
---

`admin: { enabled: false }` turns the admin UI off in every adapter (#442), for a team with an admin app of its own. Next.js's admin route answers 404 (and logs that the file can go), the Nuxt module leaves the admin out of the build, `easy-cms serve` answers 404 at the admin and at `/`, and the Workers build leaves the admin app out. The API, auth and sessions work as before; the routes only the admin UI uses (`<api>/admin/ui/*`) answer 404. Password, invitation and verification emails link to `auth.members.pages` for everyone (warned at start when they aren't set), and provider sign-in ends on the site (the `redirect` given, when a path of the site, else `admin.siteURL` or `/`). `admin: false` is refused with this way to write it.

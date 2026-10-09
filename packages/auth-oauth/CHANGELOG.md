# @easy-cms/auth-oauth

## 0.60.0

The same code as 0.49.0, released as 0.60.0 to match the [roadmap](https://github.com/maritonx/easy-cms/blob/main/docs/ROADMAP.md):
the names and shapes for 1.0. See the [upgrade guide](https://easy-cms-website.vercel.app/docs/upgrading).

## 0.49.0

### Patch Changes

- Updated dependencies [ee496b4]
  - @easy-cms/core@0.49.0

## 0.48.0

### Minor Changes

- db47c50: Security changes that may need a step when you upgrade:
  
  - **SVG is no longer included in `image/*`** (it can carry scripts). To keep allowing it, list it: `upload.mimeTypes: ['image/*', 'image/svg+xml']`. After a direct upload, the type the storage serves the file with must be the one checked (S3 reports it).
  - **Users changing their own password or email send their current password** (`currentPassword`); the account page asks for it. Admins changing other users don't. Accounts without a password can't change their own email.
  - **Single sign-on no longer signs existing staff in by email** until they link the provider from their account page, unless the provider has `linkByEmail: true` (for providers whose emails your organization controls). Site members are still matched by email. `microsoft()` no longer uses the user principal name as an email.
  - **`trustProxy` takes the last `X-Forwarded-For` address** (the one your proxy added), not the first, which the client can write. On Vercel and Netlify the client IP is found without it; Nuxt uses the connection's address otherwise. A warning is logged in production when logins have no client IP.
  - **In production, a `secret` that looks like an example or a repeated pattern is refused.** The Next.js starter no longer falls back to a fixed secret in production: without `EASY_CMS_SECRET` (and without a database URL) it uses a random one per process and says so.
  - **Multi-tenant: the people of a tenant, its admins included, no longer change shared collections and globals** (those not listed in `collections`/`globals`). List the ones they may change in `editShared`. The deliveries page is for system admins only.

### Patch Changes

- Updated dependencies [db47c50]
  - @easy-cms/core@0.48.0

## 0.47.4

### Patch Changes

- Updated dependencies [76e22e3]
  - @easy-cms/core@0.47.4

## 0.47.3

### Patch Changes

- @easy-cms/core@0.47.3

## 0.47.2

### Patch Changes

- Updated dependencies [43833ab]
  - @easy-cms/core@0.47.2

## 0.47.1

### Patch Changes

- @easy-cms/core@0.47.1

## 0.47.0

### Patch Changes

- Updated dependencies [203e359]
  - @easy-cms/core@0.47.0

## 0.46.0

### Patch Changes

- Updated dependencies [6938928]
  - @easy-cms/core@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies [56a926b]
  - @easy-cms/core@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [40bd4bc]
  - @easy-cms/core@0.44.0

## 0.43.0

### Patch Changes

- @easy-cms/core@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies [4afac22]
  - @easy-cms/core@0.42.0

## 0.41.0

### Patch Changes

- Updated dependencies [7a43c55]
  - @easy-cms/core@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [e24dbd1]
  - @easy-cms/core@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [72758f0]
  - @easy-cms/core@0.39.0

## 0.38.0

### Patch Changes

- Updated dependencies [5a71c12]
  - @easy-cms/core@0.38.0

## 0.37.2

### Patch Changes

- Updated dependencies [63f0116]
  - @easy-cms/core@0.37.2

## 0.37.1

### Patch Changes

- @easy-cms/core@0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies [cbf800c]
  - @easy-cms/core@0.37.0

## 0.36.1

### Patch Changes

- @easy-cms/core@0.36.1

## 0.36.0

### Patch Changes

- Updated dependencies [7fbd37e]
  - @easy-cms/core@0.36.0

## 0.35.0

### Minor Changes

- 892f6cf: Single sign-on for the admin: Google, Microsoft (Entra ID), GitHub or any OpenID Connect provider.
  
  - **New package `@easy-cms/auth-oauth`:** `google()`, `microsoft()`, `github()` and `oidc({ issuer, clientId, clientSecret })`, with the Authorization Code flow, PKCE, `state` and `nonce` (oauth4webapi). Client IDs and secrets come from environment variables.
  - **`auth.providers`** adds "Sign in with …" to the login page. People are matched to users by the provider's id for them, or the first time by their verified email. **`auth.allowSignUp: { domains, role }`** gives people from your domains an account on their first sign-in; nobody else gets in without one.
  - **`auth.password: false`**: only admins sign in with a password (a way in if the provider is down). Invitations then tell people to sign in with the provider.
  - **Account** lists the outside accounts you sign in with: link another, unlink one (never the last way in). Admins see a user's on their page. **Settings → Single sign-on** shows each provider's callback URL to give it.
  - New endpoints under `<api>/auth/` and `GET <api>/admin/sso`; the `auth` slug and endpoint root are reserved.
  - With providers, the internal `user-identities` table is added: create a migration (`easy-cms migrate:create sso`).

### Patch Changes

- Updated dependencies [892f6cf]
  - @easy-cms/core@0.35.0

# @easy-cms/auth-oauth

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

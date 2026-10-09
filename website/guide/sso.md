# Single sign-on

::: info What you'll learn
How people sign in to the admin with Google, Microsoft, GitHub or any OpenID Connect provider,
who gets in, and how to set up each provider.

**Before this page:** [Users & auth](./auth).
:::

<Screenshot name="login-sso" alt="The login page with a Sign in with Company SSO button above the password form" />

Install the providers package and add them to the config:

```sh [pm]
npm install @easy-cms/auth-oauth
```

```ts
import { github, google, microsoft } from '@easy-cms/auth-oauth'

export default defineConfig({
  serverURL: 'https://cms.example.com', // needed in production, for the callback URL
  auth: {
    providers: [google()], // reads GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
  },
  // …
})
```

The login page gets a **Sign in with Google** button. The provider sends people back to
`<serverURL>/api/cms/auth/<id>/callback`, e.g. `https://cms.example.com/api/cms/auth/google/callback`:
give that URL to the provider (Settings → **Single sign-on** shows it, with a copy button). Single
sign-on is for the admin; your site's visitors are not affected.

<Screenshot name="sso" alt="Settings → Single sign-on: each provider with its callback URL to copy, and who can sign in" />

Turning providers on adds the `user-identities` table: create a migration
(`npx easy-cms migrate:create sso`).

## Who gets in

- **People who already have an account** link the provider first: they sign in with their
  password and choose **Link** on their account page. After that, the provider's own id for the
  account is used, so a changed email at the provider doesn't matter. Someone who tries the
  provider before linking is told to do so.
- **Matched by email** instead, for a provider whose emails your organization controls (its own
  Google Workspace or Entra ID): `google({ linkByEmail: true })`. Only emails the provider has
  verified count. Site members (`auth.members`) are always matched by email.
- **People from your domains**, when you allow it: they get an account the first time they sign in.

  ```ts
  auth: {
    providers: [google()],
    allowSignUp: { domains: ['example.com'], role: 'editor' }, // never 'admin'
  },
  ```

- Nobody else: an unknown email lands back on the login page with a message to ask an admin.
- Deactivated users can't sign in, whatever the provider says.

To add someone, create their user in **Settings → Users** (with their work email) and invite them;
they link the provider from their account page, or sign in with it at once with `linkByEmail`.

## Passwords

By default people can sign in either way. To make everyone use the provider:

```ts
auth: { providers: [google()], password: false },
```

Then only **admins** can still use a password, as a way in when the provider is down; the login
page folds the password form away for them. Invitations tell people to sign in with the provider
instead of setting a password, and "forgot password" works only for admins.

## Linking accounts

On their **Account** page, people see the outside accounts they sign in with, can link another
provider (**Link GitHub**) and unlink one. The last way into an account can't be unlinked. Admins see
and unlink a user's accounts on the user's page. Deleting a user forgets their linked accounts.

## Setting up providers

### Google

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), create an
   **OAuth client ID** of type **Web application** (set up the consent screen first if asked; for a
   Google Workspace, choose **Internal**).
2. Add the callback URL under **Authorized redirect URIs**, e.g.
   `https://cms.example.com/api/cms/auth/google/callback` (and `http://localhost:3000/api/cms/auth/google/callback`
   for development).
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and use `google()`. For a Workspace,
   `google({ hd: 'example.com' })` opens the account chooser on your domain.

### Microsoft (Entra ID)

1. In the [Entra admin center](https://entra.microsoft.com), **App registrations** → **New
   registration**: accounts in this organizational directory only; redirect URI of type **Web**:
   `https://cms.example.com/api/cms/auth/microsoft/callback`.
2. Under **Certificates & secrets**, create a client secret.
3. Set `MICROSOFT_TENANT_ID` (the **Directory (tenant) ID**), `MICROSOFT_CLIENT_ID` (the
   **Application (client) ID**) and `MICROSOFT_CLIENT_SECRET`, and use `microsoft()`.

Entra ID doesn't mark emails as verified; your organization manages them, so they count as
verified. Only the `email` claim is used, never the user principal name.

### GitHub

1. In GitHub, **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**, with the
   callback URL `https://cms.example.com/api/cms/auth/github/callback`.
2. Generate a client secret, set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, and use `github()`.

People are matched by the primary, verified email of their GitHub account. For GitHub Enterprise
Server: `github({ server: { web: 'https://github.example.com', api: 'https://github.example.com/api/v3' } })`.

### Any OpenID Connect provider

Okta, Keycloak, Auth0, Authentik, Zitadel and others:

```ts
import { oidc } from '@easy-cms/auth-oauth'

oidc({
  id: 'okta', // in the callback URL: <api>/auth/okta/callback
  name: 'Okta', // on the button
  issuer: 'https://example.okta.com',
  clientId: process.env.OKTA_CLIENT_ID ?? '',
  clientSecret: process.env.OKTA_CLIENT_SECRET,
})
```

The provider's `/.well-known/openid-configuration` is read for its endpoints. Its ID token needs
`email` and `email_verified` (the `email` scope).

## How it is kept safe

- The Authorization Code flow with **PKCE**, a `state` and (OpenID Connect) a `nonce`, kept in a
  short-lived signed cookie; ID tokens are verified with the provider's keys
  ([oauth4webapi](https://github.com/panva/oauth4webapi)).
- After signing in, people only go back to pages of the admin.
- Linking an account needs the session and its CSRF token, and an account already linked to
  someone else can't be linked again.
- Client secrets stay in environment variables, never in the database or backups.

## Next steps

- [Roles from the admin](./roles): what each person may do once they're in.
- [Security](./security): what else is protected.

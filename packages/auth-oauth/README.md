# @easy-cms/auth-oauth

Sign in to the Easy CMS admin with Google, Microsoft (Entra ID), GitHub or any OpenID Connect provider (Okta, Keycloak, Auth0…). Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt and Next.js.

## Install

```bash
npm install @easy-cms/auth-oauth
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

```ts
import { github, google, microsoft, oidc } from '@easy-cms/auth-oauth'

export default defineConfig({
  // …
  serverURL: 'https://cms.example.com',
  auth: {
    providers: [
      google(), // GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
      // microsoft(), // MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET
      // github(), // GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
      // oidc({ id: 'okta', name: 'Okta', issuer: 'https://example.okta.com', clientId, clientSecret }),
    ],
    // allowSignUp: { domains: ['example.com'], role: 'editor' },
  },
})
```

The redirect (callback) URL to give the provider is `<serverURL>/api/cms/auth/<id>/callback`, e.g. `https://cms.example.com/api/cms/auth/google/callback`.

## Links

[Single sign-on](https://maritonx.github.io/easy-cms/guide/sso) · [Documentation](https://maritonx.github.io/easy-cms/) ([ภาษาไทย](https://maritonx.github.io/easy-cms/th/)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License

import type { AuthProvider, AuthProviderProfile, AuthProviderRequest } from '@easy-cms/core'
import * as oauth from 'oauth4webapi'

/**
 * Sign-in providers for the Easy CMS admin (`auth.providers`): any OpenID Connect provider,
 * Google, Microsoft Entra ID and GitHub. Authorization Code flow with PKCE, `state` and (OIDC)
 * `nonce`, with oauth4webapi.
 */

type Claims = Readonly<Record<string, unknown>>

export interface OidcOptions {
  /** In URLs (`<api>/auth/<id>/callback`) and stored accounts. Default `oidc`. */
  readonly id?: string
  /** On the sign-in button. Default `SSO`. */
  readonly name?: string
  readonly icon?: AuthProvider['icon']
  /** The issuer, e.g. `https://example.okta.com`: its `/.well-known/openid-configuration` is read. */
  readonly issuer: string
  readonly clientId: string
  /** Leave out for public clients (PKCE only). */
  readonly clientSecret?: string | undefined
  /** Default `['openid', 'email', 'profile']`. */
  readonly scopes?: readonly string[]
  /** Extra authorization parameters, e.g. `{ prompt: 'select_account' }`. */
  readonly params?: Readonly<Record<string, string>>
  /** Who signed in, from the ID token's claims. Default: `sub`, `email`, `email_verified`, `name`. */
  readonly profile?: (claims: Claims) => AuthProviderProfile
  /** Signs staff in by their email the first time, without linking first (see `AuthProvider`). */
  readonly linkByEmail?: boolean
}

const str = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined)

const defaultProfile = (claims: Claims): AuthProviderProfile => ({
  subject: String(claims.sub),
  email: str(claims.email) ?? null,
  emailVerified: claims.email_verified === true || claims.email_verified === 'true',
  name: str(claims.name),
})

/** Plain HTTP is allowed only for a provider on this machine (development, tests). */
function local(url: string): boolean {
  const { protocol, hostname } = new URL(url)
  return protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not set`)
  return value
}

/** Any OpenID Connect provider: Okta, Keycloak, Auth0, Authentik, Zitadel… */
export function oidc(options: OidcOptions): AuthProvider {
  const issuer = new URL(options.issuer)
  const client: oauth.Client = { client_id: options.clientId }
  const clientAuth = options.clientSecret
    ? oauth.ClientSecretPost(options.clientSecret)
    : oauth.None()
  const insecure = local(options.issuer) ? { [oauth.allowInsecureRequests]: true } : {}
  const scopes = options.scopes ?? ['openid', 'email', 'profile']
  const toProfile = options.profile ?? defaultProfile

  // The provider's endpoints, read once (again after a failure).
  let server: Promise<oauth.AuthorizationServer> | undefined
  const discover = () => {
    server ??= oauth
      .discoveryRequest(issuer, { algorithm: 'oidc', ...insecure })
      .then((response) => oauth.processDiscoveryResponse(issuer, response))
      .catch((error: unknown) => {
        server = undefined
        throw error
      })
    return server
  }

  return {
    id: options.id ?? 'oidc',
    apiVersion: 1,
    name: options.name ?? 'SSO',
    ...(options.icon ? { icon: options.icon } : {}),
    ...(options.linkByEmail ? { linkByEmail: true } : {}),
    async authorizationURL(request: AuthProviderRequest) {
      const as = await discover()
      const url = new URL(required(as.authorization_endpoint, 'authorization_endpoint'))
      url.searchParams.set('client_id', options.clientId)
      url.searchParams.set('redirect_uri', request.redirectUri)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('scope', scopes.join(' '))
      url.searchParams.set('state', request.state)
      url.searchParams.set('nonce', request.nonce)
      url.searchParams.set(
        'code_challenge',
        await oauth.calculatePKCECodeChallenge(request.codeVerifier),
      )
      url.searchParams.set('code_challenge_method', 'S256')
      for (const [key, value] of Object.entries(options.params ?? {}))
        url.searchParams.set(key, value)
      return url
    },
    async callback(request) {
      const as = await discover()
      const params = oauth.validateAuthResponse(as, client, request.url, request.state)
      const response = await oauth.authorizationCodeGrantRequest(
        as,
        client,
        clientAuth,
        params,
        request.redirectUri,
        request.codeVerifier,
        insecure,
      )
      const result = await oauth.processAuthorizationCodeResponse(as, client, response, {
        expectedNonce: request.nonce,
        requireIdToken: true,
      })
      let claims: Claims = oauth.getValidatedIdTokenClaims(result) ?? {}
      // Some providers keep the email out of the ID token: ask the userinfo endpoint.
      if (!str(claims.email) && as.userinfo_endpoint) {
        const info = await oauth.processUserInfoResponse(
          as,
          client,
          String(claims.sub),
          await oauth.userInfoRequest(as, client, result.access_token, insecure),
        )
        claims = { ...info, ...claims, email: info.email, email_verified: info.email_verified }
      }
      return toProfile(claims)
    },
    describe: () => ({ issuer: options.issuer, clientId: options.clientId }),
  }
}

export interface ClientOptions {
  /** Default: the `…_CLIENT_ID` environment variable. */
  readonly clientId?: string
  /** Default: the `…_CLIENT_SECRET` environment variable. */
  readonly clientSecret?: string
  /** Signs staff in by their email the first time, without linking first (see `AuthProvider`). */
  readonly linkByEmail?: boolean
}

/**
 * Google accounts, including Google Workspace. `hd` limits the account chooser to a Workspace
 * domain (a hint: which accounts get in is decided by `providerSignUp` and existing users).
 */
export function google(options: ClientOptions & { readonly hd?: string } = {}): AuthProvider {
  return oidc({
    id: 'google',
    name: 'Google',
    icon: 'google',
    issuer: 'https://accounts.google.com',
    clientId: required(options.clientId ?? process.env.GOOGLE_CLIENT_ID, 'GOOGLE_CLIENT_ID'),
    clientSecret: required(
      options.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET,
      'GOOGLE_CLIENT_SECRET',
    ),
    params: { prompt: 'select_account', ...(options.hd ? { hd: options.hd } : {}) },
    ...(options.linkByEmail ? { linkByEmail: true } : {}),
  })
}

/**
 * Microsoft Entra ID (work and school accounts) of one organization: `tenant` is its Directory
 * (tenant) ID. Entra ID doesn't mark emails as verified; the organization manages its own, so
 * they count as verified here.
 */
export function microsoft(
  options: ClientOptions & { readonly tenant?: string } = {},
): AuthProvider {
  const tenant = required(options.tenant ?? process.env.MICROSOFT_TENANT_ID, 'MICROSOFT_TENANT_ID')
  if (['common', 'organizations', 'consumers'].includes(tenant))
    throw new Error('microsoft(): use your Directory (tenant) ID, not "common"')
  return oidc({
    id: 'microsoft',
    name: 'Microsoft',
    icon: 'microsoft',
    issuer: `https://login.microsoftonline.com/${tenant}/v2.0`,
    clientId: required(options.clientId ?? process.env.MICROSOFT_CLIENT_ID, 'MICROSOFT_CLIENT_ID'),
    clientSecret: required(
      options.clientSecret ?? process.env.MICROSOFT_CLIENT_SECRET,
      'MICROSOFT_CLIENT_SECRET',
    ),
    params: { prompt: 'select_account' },
    ...(options.linkByEmail ? { linkByEmail: true } : {}),
    profile: (claims) => {
      // Not `preferred_username`: a sign-in name, which can look like someone else's email.
      const email = str(claims.email) ?? null
      return {
        subject: String(claims.oid ?? claims.sub),
        email: email?.includes('@') ? email : null,
        emailVerified: true,
        name: str(claims.name),
      }
    },
  })
}

interface GitHubUser {
  id: number
  login: string
  name: string | null
}
interface GitHubEmail {
  email: string
  primary: boolean
  verified: boolean
}

/**
 * GitHub accounts (an OAuth app). Matched by the account's primary verified email. `server` is
 * for GitHub Enterprise Server: its web and API addresses.
 */
export function github(
  options: ClientOptions & {
    readonly server?: { readonly web: string; readonly api: string }
  } = {},
): AuthProvider {
  const web = (options.server?.web ?? 'https://github.com').replace(/\/+$/, '')
  const api = (options.server?.api ?? 'https://api.github.com').replace(/\/+$/, '')
  const clientId = required(options.clientId ?? process.env.GITHUB_CLIENT_ID, 'GITHUB_CLIENT_ID')
  const clientSecret = required(
    options.clientSecret ?? process.env.GITHUB_CLIENT_SECRET,
    'GITHUB_CLIENT_SECRET',
  )
  const as: oauth.AuthorizationServer = {
    issuer: web,
    authorization_endpoint: `${web}/login/oauth/authorize`,
    token_endpoint: `${web}/login/oauth/access_token`,
  }
  const client: oauth.Client = { client_id: clientId }
  const insecure = local(web) ? { [oauth.allowInsecureRequests]: true } : {}
  const get = async <T>(path: string, token: string): Promise<T> => {
    const response = await fetch(`${api}${path}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'easy-cms',
      },
    })
    if (!response.ok) throw new Error(`GitHub ${path}: ${response.status}`)
    return (await response.json()) as T
  }
  return {
    id: 'github',
    apiVersion: 1,
    name: 'GitHub',
    ...(options.linkByEmail ? { linkByEmail: true } : {}),
    icon: 'github',
    async authorizationURL(request) {
      const url = new URL(as.authorization_endpoint as string)
      url.searchParams.set('client_id', clientId)
      url.searchParams.set('redirect_uri', request.redirectUri)
      url.searchParams.set('scope', 'read:user user:email')
      url.searchParams.set('state', request.state)
      url.searchParams.set(
        'code_challenge',
        await oauth.calculatePKCECodeChallenge(request.codeVerifier),
      )
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('allow_signup', 'false')
      return url
    },
    async callback(request) {
      const params = oauth.validateAuthResponse(as, client, request.url, request.state)
      const response = await oauth.authorizationCodeGrantRequest(
        as,
        client,
        oauth.ClientSecretPost(clientSecret),
        params,
        request.redirectUri,
        request.codeVerifier,
        insecure,
      )
      const { access_token: token } = await oauth.processAuthorizationCodeResponse(
        as,
        client,
        response,
      )
      const user = await get<GitHubUser>('/user', token)
      const emails = await get<GitHubEmail[]>('/user/emails', token)
      const primary = emails.find((e) => e.primary && e.verified)
      return {
        subject: String(user.id),
        email: primary?.email ?? null,
        emailVerified: primary !== undefined,
        name: user.name ?? user.login,
      }
    },
    describe: () => ({ server: web, clientId }),
  }
}

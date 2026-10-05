/**
 * Signing in to the admin with an outside account (`auth.providers`): Google, Microsoft, GitHub
 * or any OpenID Connect provider. `@easy-cms/auth-oauth` makes these; Easy CMS runs the rest
 * (the redirect, matching users, sessions).
 */

/** Values bound to one sign-in, checked when the browser comes back. */
export interface AuthProviderRequest {
  /** Where the provider sends the browser back: `<serverURL><api>/auth/<id>/callback`. */
  readonly redirectUri: string
  readonly state: string
  /** For PKCE: the provider gets its S256 challenge. */
  readonly codeVerifier: string
  /** For OpenID Connect: must come back in the ID token. */
  readonly nonce: string
}

/** Who signed in, as the provider says. */
export interface AuthProviderProfile {
  /** The provider's stable id for the account (`sub`). */
  readonly subject: string
  readonly email: string | null
  /** The provider vouches for the email. Only verified emails are matched to users. */
  readonly emailVerified: boolean
  readonly name?: string | undefined
}

export interface AuthProvider {
  /** In URLs and stored identities, e.g. `google`: lowercase letters, digits and `-`. */
  readonly id: string
  /** On the sign-in button, e.g. `Google`. */
  readonly name: string
  /** The button's icon in the admin. Default `key`. */
  readonly icon?: 'google' | 'microsoft' | 'github' | 'key'
  /** The provider's page to send the browser to. */
  authorizationURL(request: AuthProviderRequest): Promise<URL>
  /**
   * After the browser comes back to `redirectUri` (`url`, with its query): checks the response
   * and exchanges the code. Throws when anything does not check out.
   */
  callback(request: AuthProviderRequest & { readonly url: URL }): Promise<AuthProviderProfile>
  /** For Settings → SSO: what it connects to, never secrets. */
  describe?(): Readonly<Record<string, string>>
}

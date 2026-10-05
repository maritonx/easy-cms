import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { github, oidc } from '../src/index.js'
import { type MockProvider, startMockProvider } from './mock-provider.js'

let mock: MockProvider
beforeAll(async () => {
  mock = await startMockProvider()
})
afterAll(() => mock.close())

const request = {
  redirectUri: 'http://cms.test/api/cms/auth/oidc/callback',
  state: 'state-1234567890',
  codeVerifier: 'v'.repeat(43),
  nonce: 'nonce-1234567890',
}

/** Follows the provider's redirect back, as a browser would: the URL the CMS is called with. */
async function signIn(authorize: URL): Promise<URL> {
  const response = await fetch(authorize, { redirect: 'manual' })
  return new URL(String(response.headers.get('location')))
}

describe('OpenID Connect', () => {
  const provider = () =>
    oidc({ issuer: mock.url, clientId: mock.clientId, clientSecret: mock.clientSecret })

  it('signs in with the authorization code, PKCE and nonce', async () => {
    const p = provider()
    const authorize = await p.authorizationURL(request)
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorize.searchParams.get('scope')).toBe('openid email profile')
    mock.signInAs({ sub: 'u1', email: 'Ann@Example.com', name: 'Ann' })
    const back = await signIn(authorize)
    expect(await p.callback({ ...request, url: back })).toEqual({
      subject: 'u1',
      email: 'Ann@Example.com',
      emailVerified: true,
      name: 'Ann',
    })
  })

  it('refuses a wrong state, a wrong verifier and a wrong nonce', async () => {
    const p = provider()
    const authorize = await p.authorizationURL(request)
    mock.signInAs({ sub: 'u2', email: 'b@example.com' })
    const back = await signIn(authorize)
    await expect(p.callback({ ...request, state: 'other', url: back })).rejects.toThrow()

    mock.signInAs({ sub: 'u2', email: 'b@example.com' })
    const again = await signIn(await p.authorizationURL(request))
    await expect(
      p.callback({ ...request, codeVerifier: 'w'.repeat(43), url: again }),
    ).rejects.toThrow()

    mock.signInAs({ sub: 'u2', email: 'b@example.com' })
    const third = await signIn(await p.authorizationURL(request))
    await expect(p.callback({ ...request, nonce: 'another-nonce', url: third })).rejects.toThrow()
  })

  it('says when the email is not verified', async () => {
    const p = provider()
    mock.signInAs({ sub: 'u3', email: 'c@example.com', verified: false })
    const back = await signIn(await p.authorizationURL(request))
    expect((await p.callback({ ...request, url: back })).emailVerified).toBe(false)
  })
})

describe('GitHub', () => {
  it('signs in with the primary verified email', async () => {
    const p = github({
      clientId: mock.clientId,
      clientSecret: mock.clientSecret,
      server: { web: mock.url, api: `${mock.url}/api` },
    })
    const authorize = await p.authorizationURL(request)
    expect(authorize.pathname).toBe('/login/oauth/authorize')
    mock.signInAs({ sub: 'gh1', email: 'dev@example.com', name: 'Dev' })
    const profile = await p.callback({ ...request, url: await signIn(authorize) })
    expect(profile).toMatchObject({ email: 'dev@example.com', emailVerified: true, name: 'Dev' })
    expect(profile.subject).toMatch(/^\d+$/)
  })
})

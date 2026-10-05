import { createHash, createSign, generateKeyPairSync, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * A small OpenID Connect provider (and a GitHub look-alike) for tests: discovery, JWKS,
 * authorize, token (with PKCE) and userinfo, ID tokens signed with RS256. Who signs in is set
 * with `signInAs`, or chosen on a form when nobody is set (for browser tests).
 */
export interface MockAccount {
  sub: string
  email: string
  verified?: boolean
  name?: string
}

export interface MockProvider {
  /** The issuer: `http://localhost:<port>`. */
  readonly url: string
  readonly clientId: string
  readonly clientSecret: string
  /** The next sign-in is this account, without the form. */
  signInAs(account: MockAccount): void
  close(): Promise<void>
}

interface Grant {
  account: MockAccount
  redirectUri: string
  challenge: string
  nonce: string | null
  github: boolean
}

const b64 = (value: Buffer | string) => Buffer.from(value).toString('base64url')

export async function startMockProvider(port = 0): Promise<MockProvider> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256', use: 'sig' }
  const clientId = 'easy-cms-test'
  const clientSecret = 'test-secret'
  const grants = new Map<string, Grant>()
  const tokens = new Map<string, MockAccount>()
  let next: MockAccount | undefined
  let url = ''

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  const read = (req: IncomingMessage) =>
    new Promise<URLSearchParams>((resolve) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => resolve(new URLSearchParams(body)))
    })
  const idToken = (account: MockAccount, nonce: string | null) => {
    const now = Math.floor(Date.now() / 1000)
    const header = b64(JSON.stringify({ alg: 'RS256', kid: 'test', typ: 'JWT' }))
    const payload = b64(
      JSON.stringify({
        iss: url,
        aud: clientId,
        sub: account.sub,
        email: account.email,
        email_verified: account.verified !== false,
        name: account.name ?? account.email.split('@')[0],
        iat: now,
        exp: now + 300,
        ...(nonce ? { nonce } : {}),
      }),
    )
    const signature = createSign('RSA-SHA256').update(`${header}.${payload}`).sign(privateKey)
    return `${header}.${payload}.${b64(signature)}`
  }
  /** Back to the client with a code for this account. */
  const approve = (
    res: ServerResponse,
    query: URLSearchParams,
    account: MockAccount,
    github: boolean,
  ) => {
    const code = b64(randomBytes(16))
    grants.set(code, {
      account,
      redirectUri: String(query.get('redirect_uri')),
      challenge: String(query.get('code_challenge')),
      nonce: query.get('nonce'),
      github,
    })
    const back = new URL(String(query.get('redirect_uri')))
    back.searchParams.set('code', code)
    back.searchParams.set('state', String(query.get('state')))
    res.writeHead(302, { location: back.toString() })
    res.end()
  }

  const server = createServer(async (req, res) => {
    const { pathname, searchParams } = new URL(req.url ?? '/', url)
    if (pathname === '/.well-known/openid-configuration')
      return json(res, 200, {
        issuer: url,
        authorization_endpoint: `${url}/authorize`,
        token_endpoint: `${url}/token`,
        userinfo_endpoint: `${url}/userinfo`,
        jwks_uri: `${url}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
      })
    if (pathname === '/jwks') return json(res, 200, { keys: [jwk] })

    const github = pathname === '/login/oauth/authorize'
    if (pathname === '/authorize' || github) {
      if (searchParams.get('client_id') !== clientId)
        return json(res, 400, { error: 'invalid_client' })
      if (next) {
        const account = next
        next = undefined
        return approve(res, searchParams, account, github)
      }
      // No account set: a form, as a provider's sign-in page would be.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return res.end(`<!doctype html><title>Mock provider</title><form method="post" action="/approve?${searchParams}">
<label>Email <input name="email" type="email" required></label>
<label><input name="verified" type="checkbox" checked> Verified</label>
<input type="hidden" name="github" value="${github ? '1' : ''}">
<button>Continue</button></form>`)
    }
    if (pathname === '/approve' && req.method === 'POST') {
      const form = await read(req)
      const email = String(form.get('email'))
      return approve(
        res,
        searchParams,
        { sub: `sub-${email}`, email, verified: form.has('verified') },
        form.get('github') === '1',
      )
    }

    if (
      (pathname === '/token' || pathname === '/login/oauth/access_token') &&
      req.method === 'POST'
    ) {
      const form = await read(req)
      const grant = grants.get(String(form.get('code')))
      grants.delete(String(form.get('code')))
      const verifier = String(form.get('code_verifier'))
      if (
        !grant ||
        form.get('client_id') !== clientId ||
        form.get('client_secret') !== clientSecret ||
        form.get('redirect_uri') !== grant.redirectUri ||
        b64(createHash('sha256').update(verifier).digest()) !== grant.challenge
      )
        return json(res, 400, { error: 'invalid_grant' })
      const access = b64(randomBytes(16))
      tokens.set(access, grant.account)
      return json(res, 200, {
        access_token: access,
        token_type: grant.github ? 'bearer' : 'Bearer',
        expires_in: 300,
        ...(grant.github ? {} : { id_token: idToken(grant.account, grant.nonce) }),
      })
    }

    const account = tokens.get((req.headers.authorization ?? '').replace(/^Bearer /i, ''))
    if (pathname === '/userinfo') {
      if (!account) return json(res, 401, { error: 'invalid_token' })
      return json(res, 200, {
        sub: account.sub,
        email: account.email,
        email_verified: account.verified !== false,
      })
    }
    // GitHub's API (`server.api` = `<url>/api`).
    if (pathname === '/api/user') {
      if (!account) return json(res, 401, {})
      return json(res, 200, {
        id: Number.parseInt(createHash('sha1').update(account.sub).digest('hex').slice(0, 8), 16),
        login: account.email.split('@')[0],
        name: account.name ?? null,
      })
    }
    if (pathname === '/api/user/emails') {
      if (!account) return json(res, 401, {})
      return json(res, 200, [
        { email: account.email, primary: true, verified: account.verified !== false },
      ])
    }
    json(res, 404, { error: 'not_found' })
  })
  await new Promise<void>((resolve) => server.listen(port, resolve))
  url = `http://localhost:${(server.address() as AddressInfo).port}`
  return {
    url,
    clientId,
    clientSecret,
    signInAs: (account) => {
      next = account
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

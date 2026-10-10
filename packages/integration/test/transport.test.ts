import { createRestHandler, defineConfig } from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET, tempProject } from './helpers.js'

/** Cookies, headers and hosts between the browser and Easy CMS (#99). */
let cms: Awaited<ReturnType<typeof open>>

beforeAll(async () => {
  cms = await open(
    defineConfig({
      secret: SECRET,
      db: db(),
      upload: { mimeTypes: ['text/plain', 'image/*'] },
      collections: [{ slug: 'notes', fields: [{ name: 'text', type: 'text' }] }],
    }),
    tempProject(),
  )
  await cms.create('users', {
    email: 'admin@x.co',
    password: 'a-long-test-pass',
    role: 'admin',
  } as never)
})
afterAll(() => cms.destroy())

const login = (handle: ReturnType<typeof createRestHandler>, base: string) =>
  handle(
    new Request(`${base}/api/cms/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ email: 'admin@x.co', password: 'a-long-test-pass' }),
    }),
  )

/** `name=value` of each Set-Cookie. */
const cookies = (response: Response) =>
  response.headers.getSetCookie().map((c) => c.split(';')[0] as string)

describe('cookies', () => {
  it('are __Host- over HTTPS and plain over HTTP, and both are read', async () => {
    const handle = createRestHandler(cms)
    const secure = cookies(await login(handle, 'https://cms.test'))
    expect(secure.map((c) => c.split('=')[0])).toEqual(['__Host-ecms-session', '__Host-ecms-csrf'])
    const plain = cookies(await login(handle, 'http://cms.test'))
    expect(plain.map((c) => c.split('=')[0])).toEqual(['ecms-session', 'ecms-csrf'])
    // A session from before the prefix keeps working.
    const legacy = (secure[0] as string).replace('__Host-', '')
    for (const cookie of [secure[0], legacy]) {
      const me = await handle(
        new Request('https://cms.test/api/cms/auth/me', { headers: { cookie: cookie as string } }),
      )
      expect(((await me.json()) as { user: { email: string } }).user.email).toBe('admin@x.co')
    }
    expect(
      (await cms.auth.userFromHeaders(new Headers({ cookie: secure[0] as string })))?.email,
    ).toBe('admin@x.co')
  })

  it('logging out clears both names and the browser cache', async () => {
    const handle = createRestHandler(cms)
    const [session, csrf] = cookies(await login(handle, 'https://cms.test'))
    const out = await handle(
      new Request('https://cms.test/api/cms/auth/logout', {
        method: 'POST',
        headers: {
          cookie: session as string,
          origin: 'https://cms.test',
          'x-csrf-token': (csrf as string).split('=')[1] as string,
        },
      }),
    )
    expect(out.headers.get('clear-site-data')).toBe('"cache"')
    // Cleared over HTTPS: the prefixed ones and the old plain ones (in production also plain).
    expect(cookies(out)).toEqual(
      expect.arrayContaining(['__Host-ecms-session=', '__Host-ecms-csrf=']),
    )
  })
})

describe('headers', () => {
  it('sends HSTS in production', async () => {
    const before = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    let handle: ReturnType<typeof createRestHandler>
    try {
      handle = createRestHandler(cms)
    } finally {
      process.env.NODE_ENV = before
    }
    const response = await handle(new Request('https://cms.test/api/cms/notes'))
    expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000')
    const dev = await createRestHandler(cms)(new Request('http://cms.test/api/cms/notes'))
    expect(dev.headers.get('strict-transport-security')).toBeNull()
  })

  it('serves text files as UTF-8', async () => {
    const note = await cms.upload({ data: new TextEncoder().encode('สวัสดี'), name: 'hello.txt' })
    const handle = createRestHandler(cms)
    const file = await handle(
      new Request(`http://cms.test/api/cms/media/file/${String(note.filename)}`),
    )
    expect(file.headers.get('content-type')).toBe('text/plain; charset=utf-8')
  })
})

describe('X-Forwarded-Host', () => {
  it('counts for the CSRF check only behind a trusted proxy', async () => {
    const write = async (trustProxy: boolean) => {
      const handle = createRestHandler(cms, { trustProxy })
      const [session, csrf] = cookies(await login(handle, 'http://internal:3000'))
      // The public host, as only the proxy would say.
      return handle(
        new Request('http://internal:3000/api/cms/notes', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: session as string,
            'x-csrf-token': (csrf as string).split('=')[1] as string,
            origin: 'https://www.example.com',
            'x-forwarded-host': 'www.example.com',
          },
          body: '{"text":"hi"}',
        }),
      )
    }
    expect((await write(false)).status).toBe(403)
    expect((await write(true)).status).toBe(201)
  })
})

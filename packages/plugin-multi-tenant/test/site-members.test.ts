import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEasyCMS, createRestHandler, defineConfig, silentLogger } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { multiTenantPlugin } from '../src/index.js'

/** Site members (customers, `auth.members`) never get the rights of staff, in any tenant. */
const configWith = (publicReads: 'none' | 'all') =>
  defineConfig({
    secret: 'x'.repeat(32),
    db: sqlite({ url: 'file:./cms.db' }),
    auth: {
      roles: ['admin', 'editor', 'customer'],
      members: { roles: ['customer'], signUp: { role: 'customer', verifyEmail: false } },
    },
    collections: [
      {
        slug: 'posts',
        access: { read: () => true },
        fields: [{ name: 'title', type: 'text', required: true }],
      },
    ],
    plugins: [multiTenantPlugin({ collections: ['posts'], publicReads })],
  })

for (const publicReads of ['all', 'none'] as const) {
  describe(`a site member with publicReads: '${publicReads}'`, () => {
    let dir: string
    let cms: Awaited<ReturnType<typeof createEasyCMS<ReturnType<typeof configWith>>>>
    let handle: (request: Request) => Promise<Response>
    const token: Record<string, string> = {}
    const id: Record<string, number> = {}
    let a: number

    const call = async (
      method: string,
      path: string,
      options: { as?: string; tenant?: string; body?: unknown } = {},
    ) => {
      const response = await handle(
        new Request(`http://cms.test/api/cms${path}`, {
          method,
          headers: {
            ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...(options.as ? { authorization: `Bearer ${token[options.as]}` } : {}),
            ...(options.tenant ? { 'x-easy-cms-tenant': options.tenant } : {}),
          },
          ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        }),
      )
      const text = await response.text()
      // biome-ignore lint/suspicious/noExplicitAny: response bodies, checked by the assertions
      return { status: response.status, body: (text ? JSON.parse(text) : {}) as any }
    }

    beforeAll(async () => {
      dir = mkdtempSync(join(tmpdir(), 'easy-cms-tenant-members-'))
      cms = await createEasyCMS(configWith(publicReads), {
        cwd: dir,
        schema: 'push',
        logger: silentLogger,
      })
      handle = createRestHandler(cms)
      a = (await cms.create('tenants', { name: 'Brand A', slug: 'a' })).id as number
      await cms.create('tenants', { name: 'Brand B', slug: 'b' })
      await cms.create('posts', { title: 'Hello A', tenant: a } as never)
      const users = [
        { email: 'root@x.co', role: 'admin' },
        { email: 'alice@x.co', role: 'editor', tenants: [{ tenant: a, role: 'editor' }] },
        { email: 'carol@x.co', role: 'customer' },
      ]
      for (const user of users) {
        const name = user.email.split('@')[0] as string
        id[name] = (await cms.create('users', { ...user, password: 'password123' } as never))
          .id as number
        token[name] = (await cms.auth.login({ email: user.email, password: 'password123' })).token
      }
    })

    afterAll(async () => {
      await cms.destroy()
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
      } catch {
        // Windows may still hold the SQLite file; the OS cleans temp.
      }
    })

    it("can't change another user, or make users", async () => {
      for (const tenant of [undefined, 'a']) {
        const changed = await call('PATCH', `/users/${id.root}`, {
          as: 'carol',
          ...(tenant ? { tenant } : {}),
          body: { password: 'taken-over-1' },
        })
        expect([403, 404]).toContain(changed.status)
        const made = await call('POST', '/users', {
          as: 'carol',
          ...(tenant ? { tenant } : {}),
          body: { email: 'mallory@x.co', password: 'password123', role: 'admin' },
        })
        expect(made.status).toBe(403)
      }
      await expect(
        cms.auth.login({ email: 'root@x.co', password: 'password123' }),
      ).resolves.toBeTruthy()
    })

    it("can't make, change or delete tenants", async () => {
      expect(
        (await call('POST', '/tenants', { as: 'carol', body: { name: 'C', slug: 'c' } })).status,
      ).toBe(403)
      expect([403, 404]).toContain(
        (await call('PATCH', `/tenants/${a}`, { as: 'carol', body: { name: 'Mine' } })).status,
      )
      expect([403, 404]).toContain((await call('DELETE', `/tenants/${a}`, { as: 'carol' })).status)
      expect(await cms.findById('tenants', a)).toMatchObject({ name: 'Brand A' })
    })

    it('sees only themselves among users, whatever tenant they name', async () => {
      for (const tenant of [undefined, 'a', 'b']) {
        const list = await call('GET', '/users', { as: 'carol', ...(tenant ? { tenant } : {}) })
        expect(list.status).toBe(200)
        expect(list.body.docs.map((u: { email: string }) => u.email)).toEqual(['carol@x.co'])
      }
    })

    it("can't write tenant documents without a tenant, or give them another", async () => {
      const loose = await call('POST', '/posts', { as: 'carol', body: { title: 'Loose' } })
      expect(loose.status).toBe(403)
      const moved = await call('PATCH', `/posts/1`, { as: 'carol', body: { title: 'Moved' } })
      expect([403, 404]).toContain(moved.status)
    })

    it("aren't taken into a tenant by its admins", async () => {
      const added = await call('POST', '/tenant-members', {
        as: 'root',
        tenant: 'a',
        body: { email: 'carol@x.co', role: 'editor' },
      })
      expect(added.status).toBe(400)
    })

    it('reads published documents like a visitor', async () => {
      const list = await call('GET', '/posts', { as: 'carol', tenant: 'a' })
      expect(list.status).toBe(200)
      expect(list.body.docs.map((p: { title: string }) => p.title)).toEqual(['Hello A'])
    })
  })
}

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { type Config, defineConfig } from '@easy-cms/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { db, open, SECRET, table } from './helpers.js'

// cms.transaction and cms.sql (#439, ADR-0072): writes that commit or roll back together, after
// hooks and events only after the commit, and raw SQL with bound parameters.

let server: Server
let url = ''
/** Webhook events received, as `event:id`. */
let received: string[] = []
beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      const payload = JSON.parse(body)
      received.push(`${payload.event}:${payload.id ?? ''}`)
      res.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

/** Hook calls, in order. */
let calls: string[] = []
beforeEach(() => {
  calls = []
  received = []
})

const config = (extra: Partial<Config> = {}) =>
  defineConfig({
    secret: SECRET,
    db: db(),
    events: ['order.paid'],
    webhooks: [{ url: `${url}/hook`, events: ['create', 'update', 'delete', 'order.paid'] }],
    collections: [
      {
        slug: 'accounts',
        access: { update: ({ user }) => user?.role === 'admin' },
        hooks: {
          beforeChange: [({ data }) => void calls.push(`before:${String(data.name)}`)],
          afterChange: [({ doc }) => void calls.push(`after:${String(doc.name)}`)],
        },
        fields: [
          { name: 'name', type: 'text', required: true },
          { name: 'balance', type: 'number' },
        ],
      },
    ],
    ...extra,
  } as Config)

const balances = async (cms: Awaited<ReturnType<typeof open>>) =>
  Object.fromEntries(
    (await cms.find('accounts', { limit: 0, sort: 'name' })).docs.map((a) => [a.name, a.balance]),
  )

describe('cms.transaction (#439)', () => {
  it('commits every write together, then runs after hooks and webhooks', async () => {
    const cms = await open(config())
    const a = await cms.create('accounts', { name: 'a', balance: 100 })
    const b = await cms.create('accounts', { name: 'b', balance: 0 })
    await cms.flushWebhooks()
    calls = []
    received = []

    const result = await cms.transaction(async (tx) => {
      await tx.update('accounts', a.id, { balance: 70 })
      await tx.update('accounts', b.id, { balance: 30 })
      tx.emit('order.paid', { total: 30 })
      // Before the commit: before hooks ran, after hooks and events wait.
      expect(calls).toEqual(['before:a', 'before:b'])
      // Reads inside see the transaction's writes.
      expect((await tx.findById('accounts', b.id))?.balance).toBe(30)
      return 'done'
    })

    expect(result).toBe('done')
    expect(calls).toEqual(['before:a', 'before:b', 'after:a', 'after:b'])
    expect(await balances(cms)).toEqual({ a: 70, b: 30 })
    await cms.flushWebhooks()
    expect(received.sort()).toEqual(['order.paid:', `update:${a.id}`, `update:${b.id}`].sort())
    await cms.destroy()
  })

  it('rolls back every write when it throws, and sends nothing', async () => {
    const cms = await open(config())
    const a = await cms.create('accounts', { name: 'a', balance: 100 })
    await cms.flushWebhooks()
    calls = []
    received = []

    await expect(
      cms.transaction(async (tx) => {
        await tx.update('accounts', a.id, { balance: 0 })
        await tx.create('accounts', { name: 'c', balance: 100 })
        tx.emit('order.paid', { total: 100 })
        throw new Error('card declined')
      }),
    ).rejects.toThrow('card declined')

    expect(await balances(cms)).toEqual({ a: 100 })
    expect(calls).toEqual(['before:a', 'before:c'])
    await cms.flushWebhooks()
    expect(received).toEqual([])
    await cms.destroy()
  })

  it('rolls back when a write inside fails validation or access', async () => {
    const cms = await open(config())
    const a = await cms.create('accounts', { name: 'a', balance: 100 })
    await expect(
      cms.transaction(async (tx) => {
        await tx.update('accounts', a.id, { balance: 1 })
        // Not an admin: refused, and the first write goes too.
        await tx.update('accounts', a.id, { balance: 2 }, {
          user: { id: 99, role: 'editor' } as never,
          overrideAccess: false,
        })
      }),
    ).rejects.toThrow()
    await expect(
      cms.transaction(async (tx) => {
        await tx.update('accounts', a.id, { balance: 3 })
        await tx.create('accounts', { balance: 4 } as never)
      }),
    ).rejects.toThrow()
    expect(await balances(cms)).toEqual({ a: 100 })
    await cms.destroy()
  })

  it('joins an outer transaction, and code given cms instead of tx joins it too', async () => {
    const cms = await open(config())
    const a = await cms.create('accounts', { name: 'a', balance: 100 })
    const debit = (amount: number) =>
      // A helper that knows nothing of the transaction it is called in.
      cms.transaction(async () => {
        const current = (await cms.findById('accounts', a.id))?.balance as number
        await cms.update('accounts', a.id, { balance: current - amount })
      })
    await expect(
      cms.transaction(async () => {
        await debit(10)
        await debit(20)
        expect((await cms.findById('accounts', a.id))?.balance).toBe(70)
        throw new Error('undo')
      }),
    ).rejects.toThrow('undo')
    expect(await balances(cms)).toEqual({ a: 100 })
    await debit(5)
    expect(await balances(cms)).toEqual({ a: 95 })
    await cms.destroy()
  })

  it('keeps concurrent writes inside one transaction in order', async () => {
    const cms = await open(config())
    await cms.transaction(async (tx) => {
      await Promise.all(
        Array.from({ length: 10 }, (_, i) => tx.create('accounts', { name: `n${i}`, balance: i })),
      )
    })
    expect(Object.keys(await balances(cms))).toHaveLength(10)
    await cms.destroy()
  })

  it("doesn't hold up other work when it ends", async () => {
    const cms = await open(config())
    await cms.transaction(async (tx) => {
      await tx.create('accounts', { name: 'a', balance: 1 })
    })
    // Writes outside a transaction after one still work (no lock or queue left behind).
    await cms.create('accounts', { name: 'b', balance: 2 })
    expect(await balances(cms)).toEqual({ a: 1, b: 2 })
    await cms.destroy()
  })
})

describe('cms.sql (#439)', () => {
  it('runs raw SQL with bound parameters, in the transaction when inside one', async () => {
    const cms = await open(config())
    await cms.create('accounts', { name: 'a', balance: 100 })
    await cms.create('accounts', { name: 'b', balance: 50 })
    const accounts = table(cms.cwd, 'accounts')

    const [sum] = await cms.sql<{ total: number }>([
      `select sum(balance) as total from ${accounts} where balance >= `,
      '',
    ] as unknown as TemplateStringsArray, 50)
    expect(Number(sum?.total)).toBe(150)

    // A value is a parameter, never SQL: this matches no name, and drops nothing.
    const evil = "a'; drop table x; --"
    const none = await cms.sql([
      `select name from ${accounts} where name = `,
      '',
    ] as unknown as TemplateStringsArray, evil)
    expect(none).toEqual([])

    await expect(
      cms.transaction(async (tx) => {
        await tx.sql([`update ${accounts} set balance = 0 where name = `, ''] as unknown as TemplateStringsArray, 'a')
        const [row] = await tx.sql<{ balance: number }>([
          `select balance from ${accounts} where name = `,
          '',
        ] as unknown as TemplateStringsArray, 'a')
        expect(Number(row?.balance)).toBe(0)
        throw new Error('undo')
      }),
    ).rejects.toThrow('undo')
    expect(await balances(cms)).toEqual({ a: 100, b: 50 })
    await cms.destroy()
  })

  it('reads with the tagged template syntax', async () => {
    const cms = await open(config())
    await cms.create('accounts', { name: 'a', balance: 1 })
    const rows = await cms.sql`select ${7} as seven`
    expect(Number(rows[0]?.seven)).toBe(7)
    await cms.destroy()
  })
})

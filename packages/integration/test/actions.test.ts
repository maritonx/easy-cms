import {
  ActionError,
  type AdminSchema,
  createRestHandler,
  defineConfig,
  type RestHandler,
} from '@easy-cms/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

/** Actions (#386): buttons that run code on a document, one at a time or in bulk. */
const ran: { id: unknown; input: unknown; user: string }[] = []

const config = (rbac = false) =>
  defineConfig({
    secret: SECRET,
    db: db(),
    ...(rbac ? { auth: { rbac: true, roles: ['admin', 'editor'] } } : {}),
    collections: [
      {
        slug: 'bookings',
        access: {
          read: () => true,
          create: () => true,
          // Editors may change bookings that aren't locked; admins any.
          update: ({ user }) =>
            user?.role === 'admin' ? true : user ? { locked: { equals: false } } : false,
        },
        fields: [
          { name: 'title', type: 'text' },
          { name: 'status', type: 'select', options: ['pending', 'confirmed', 'cancelled'] },
          { name: 'note', type: 'text' },
          { name: 'locked', type: 'boolean', defaultValue: false },
        ],
        actions: [
          {
            name: 'confirm',
            label: { en: 'Confirm', th: 'ยืนยัน' },
            on: ['document', 'row', 'bulk'],
            default: 'editors',
            when: ({ doc }) => doc.status === 'pending',
            fields: [
              { name: 'note', type: 'textarea', required: true },
              { name: 'notify', type: 'boolean' },
            ],
            primary: true,
            run: async ({ doc, cms, input, user }) => {
              ran.push({ id: doc.id, input, user: user.email })
              await cms.update('bookings', doc.id, {
                status: 'confirmed',
                note: String(input.note),
              })
              return { message: `Confirmed ${String(doc.title)}` }
            },
          },
          {
            name: 'invoice',
            label: 'Open the invoice',
            run: ({ doc }) => ({ open: `https://pay.example/invoices/${doc.id}` }),
          },
          {
            name: 'refund',
            label: 'Refund',
            confirm: { text: 'Give the money back?', danger: true },
            run: ({ doc }) => {
              if (doc.title === 'late') throw new ActionError('Too late to refund')
              if (doc.title === 'broken') throw new Error('provider exploded')
              return undefined
            },
          },
        ],
      },
    ],
  })

const BASE = 'http://cms.test/api/cms'
let cms: Awaited<ReturnType<typeof open>>
let handle: RestHandler
const token: Record<string, string> = {}

function call(path: string, who: string | null, method = 'GET', body?: unknown) {
  return handle(
    new Request(`${BASE}${path}`, {
      method,
      headers: {
        ...(who ? { authorization: `Bearer ${token[who]}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  )
}
const json = async (response: Response | Promise<Response>) =>
  (await (await response).json()) as Record<string, any>

async function setup(rbac = false) {
  ran.length = 0
  cms = await open(config(rbac))
  handle = createRestHandler(cms)
  for (const [email, role] of [
    ['admin@x.co', 'admin'],
    ['editor@x.co', 'editor'],
  ] as const) {
    await cms.create('users', { email, password: 'password123', role })
    token[role] = (await cms.auth.login({ email, password: 'password123' })).token
  }
}
const booking = async (data: Record<string, unknown> = {}) =>
  (await cms.create('bookings', { title: 'Room 1', status: 'pending', ...data })).id as number

describe('actions', () => {
  beforeEach(() => setup())

  it('runs an action on a document with its form, and says what it did', async () => {
    const id = await booking()
    const res = await call(`/bookings/${id}/actions/confirm`, 'editor', 'POST', {
      input: { note: 'See you at 9', notify: true, extra: 'dropped' },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ message: 'Confirmed Room 1' })
    expect(ran).toEqual([
      { id, input: { note: 'See you at 9', notify: true }, user: 'editor@x.co' },
    ])
    expect(await cms.findById('bookings', id)).toMatchObject({
      status: 'confirmed',
      note: 'See you at 9',
    })
    // A link to open.
    expect(await json(call(`/bookings/${id}/actions/invoice`, 'admin', 'POST'))).toEqual({
      open: `https://pay.example/invoices/${id}`,
    })
  })

  it('checks the form, who may, and when it applies', async () => {
    const id = await booking()
    const missing = await call(`/bookings/${id}/actions/confirm`, 'admin', 'POST', { input: {} })
    expect(missing.status).toBe(400)
    expect(((await missing.json()) as Record<string, any>).errors).toEqual([
      expect.objectContaining({ field: 'note', message: 'is required' }),
    ])
    // Whoever may update it: a locked booking isn't the editor's.
    const locked = await booking({ locked: true })
    expect(
      (
        await call(`/bookings/${locked}/actions/confirm`, 'editor', 'POST', {
          input: { note: 'x' },
        })
      ).status,
    ).toBe(403)
    expect((await call(`/bookings/${id}/actions/invoice`, null, 'POST')).status).toBe(401)
    // `when`: a confirmed booking can't be confirmed again.
    await cms.update('bookings', id, { status: 'confirmed' })
    const twice = await call(`/bookings/${id}/actions/confirm`, 'admin', 'POST', {
      input: { note: 'x' },
    })
    expect(twice.status).toBe(400)
    expect(((await twice.json()) as Record<string, any>).errors[0].message).toContain(
      'doesn’t apply',
    )
    expect((await call(`/bookings/${id}/actions/nope`, 'admin', 'POST')).status).toBe(404)
  })

  it('lists the actions that apply to a document, for its page and row', async () => {
    const id = await booking()
    const locked = await booking({ locked: true })
    expect((await json(call(`/admin/ui/access/bookings/${id}`, 'editor'))).actions).toEqual([
      'confirm',
      'invoice',
      'refund',
    ])
    expect((await json(call(`/admin/ui/access/bookings/${locked}`, 'editor'))).actions).toEqual([])
    await cms.update('bookings', id, { status: 'confirmed' })
    expect((await json(call(`/admin/ui/access/bookings/${id}`, 'admin'))).actions).toEqual([
      'invoice',
      'refund',
    ])
    const schema = (await json(call('/admin/ui/schema', 'admin'))) as unknown as AdminSchema
    const actions = schema.collections.find((c) => c.slug === 'bookings')?.actions
    expect(actions?.map((a) => [a.name, a.on])).toEqual([
      ['confirm', ['document', 'row', 'bulk']],
      ['invoice', ['document', 'row']],
      ['refund', ['document', 'row']],
    ])
    expect(actions?.[0]).toMatchObject({
      primary: true,
      fields: [{ name: 'note' }, { name: 'notify' }],
    })
    expect(actions?.[2]?.confirm).toEqual({ text: 'Give the money back?', danger: true })
  })

  it('shows an action’s own refusal, and hides other errors behind a general one', async () => {
    const late = await booking({ title: 'late' })
    const refused = await call(`/bookings/${late}/actions/refund`, 'admin', 'POST')
    expect(refused.status).toBe(400)
    expect(((await refused.json()) as Record<string, any>).errors[0].message).toBe(
      'Too late to refund',
    )
    const broken = await booking({ title: 'broken' })
    const failed = await call(`/bookings/${broken}/actions/refund`, 'admin', 'POST')
    expect(failed.status).toBe(500)
    expect(((await failed.json()) as Record<string, any>).errors[0].message).toBe(
      'The action failed: see the server log',
    )
  })

  it('runs in bulk on named documents, skipping those it may not or that don’t apply', async () => {
    const open1 = await booking()
    const done = await booking({ status: 'confirmed' })
    const locked = await booking({ locked: true })
    const result = await json(
      call('/bookings/actions/confirm', 'editor', 'POST', {
        ids: [open1, done, locked],
        input: { note: 'All set' },
      }),
    )
    expect(result).toEqual({
      done: 1,
      skipped: [
        { id: done, reason: 'not-applicable' },
        { id: locked, reason: 'forbidden' },
      ],
      failed: [],
    })
    // Only actions that say so run in bulk; the form is checked once, before anything runs.
    expect(
      (await call('/bookings/actions/invoice', 'admin', 'POST', { ids: [open1] })).status,
    ).toBe(400)
    expect(
      (await call('/bookings/actions/confirm', 'admin', 'POST', { ids: [open1] })).status,
    ).toBe(400)
  })

  it('runs on every match in the background, keeping the form’s values', async () => {
    for (let n = 0; n < 3; n++) await booking({ title: `B${n}` })
    await booking({ title: 'other', status: 'cancelled' })
    const started = await call('/bookings/actions/confirm', 'admin', 'POST', {
      where: { status: { equals: 'pending' } },
      input: { note: 'Bulk' },
    })
    expect(started.status).toBe(202)
    let op = (await started.json()) as Record<string, any>
    for (let i = 0; i < 100 && ['pending', 'running'].includes(op.state); i++)
      op = await json(call(`/bookings/bulk/${op.id}`, 'admin'))
    expect(op).toMatchObject({ state: 'done', action: 'action:confirm', total: 3, done: 3 })
    expect(await cms.count('bookings', { where: { note: { equals: 'Bulk' } } })).toBe(3)
  })

  it('runs from code with cms.runAction', async () => {
    const id = await booking()
    const [first] = (await cms.find('users', { where: { role: { equals: 'admin' } } })).docs
    const admin = { id: first?.id as number, email: 'admin@x.co', role: 'admin' }
    expect(
      await cms.runAction('bookings', 'confirm', { id }, { user: admin, input: { note: 'Code' } }),
    ).toEqual({ message: 'Confirmed Room 1' })
    const other = await booking()
    expect(
      await cms.runAction(
        'bookings',
        'confirm',
        { ids: [other] },
        { user: admin, input: { note: 'Many' } },
      ),
    ).toEqual({ done: 1, skipped: [], failed: [] })
  })
})

describe('actions with roles', () => {
  beforeEach(() => setup(true))

  it('makes admins actions rights of their own, and lets editors actions follow update', async () => {
    const id = await booking()
    const roles = await json(call('/admin/roles', 'admin'))
    const target = roles.collections.find((c: { slug: string }) => c.slug === 'bookings')
    // `confirm` is for editors: not a right of its own.
    expect(target.actions.map((a: { name: string }) => a.name)).toEqual(['invoice', 'refund'])
    const editor = roles.roles.find((r: { key: string }) => r.key === 'editor')
    await call(`/admin/roles/${editor.id}`, 'admin', 'PATCH', {
      permissions: { collections: { bookings: ['read', 'update'] } },
    })
    expect(
      (await call(`/bookings/${id}/actions/confirm`, 'editor', 'POST', { input: { note: 'ok' } }))
        .status,
    ).toBe(200)
    expect((await call(`/bookings/${id}/actions/refund`, 'editor', 'POST')).status).toBe(403)
    let schema = (await json(call('/admin/ui/schema', 'editor'))) as unknown as AdminSchema
    expect(
      schema.collections.find((c) => c.slug === 'bookings')?.actions?.map((a) => a.name),
    ).toEqual(['confirm'])
    // Given the right, the editor may refund.
    const saved = await json(
      call(`/admin/roles/${editor.id}`, 'admin', 'PATCH', {
        permissions: {
          collections: { bookings: ['read', 'update'] },
          actions: { bookings: ['refund', 'unknown'] },
        },
      }),
    )
    expect(saved.permissions.actions).toEqual({ bookings: ['refund'] })
    expect((await call(`/bookings/${id}/actions/refund`, 'editor', 'POST')).status).toBe(200)
    schema = (await json(call('/admin/ui/schema', 'editor'))) as unknown as AdminSchema
    expect(
      schema.collections.find((c) => c.slug === 'bookings')?.actions?.map((a) => a.name),
    ).toEqual(['confirm', 'refund'])
  })
})

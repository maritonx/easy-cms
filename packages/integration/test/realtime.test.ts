import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  type AuthUser,
  createRestHandler,
  defineConfig,
  type EasyCMS,
  type RealtimeEvent,
} from '@easy-cms/core'
import { createClient, type LiveState } from '@easy-cms/core/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

// Realtime (ADR-0070): saves of collections with `realtime: true` reach subscribers over
// Server-Sent Events and `cms.subscribe()`, each as its subscriber may read them.

const config = (extra: { maxPerUser?: number; maxConnections?: number } = {}) =>
  defineConfig({
    secret: SECRET,
    db: db(),
    realtime: { pollMs: 50, heartbeatMs: 1000, ...extra },
    collections: [
      {
        slug: 'posts',
        realtime: true,
        drafts: true,
        versions: true,
        access: { read: () => true },
        fields: [
          { name: 'title', type: 'text' },
          { name: 'category', type: 'text' },
          // Staff only: visitors' events must not carry it.
          { name: 'notes', type: 'text', access: { read: ({ user }) => user !== null } },
        ],
      },
      {
        slug: 'notes',
        realtime: true,
        // Each user reads their own.
        access: {
          read: ({ user }) => (user ? { owner: { equals: user.id } } : false),
          create: () => true,
        },
        fields: [
          { name: 'text', type: 'text' },
          { name: 'owner', type: 'number' },
        ],
      },
      { slug: 'plain', fields: [{ name: 'title', type: 'text' }] },
    ],
  })

type CMS = Awaited<ReturnType<typeof open<ReturnType<typeof config>>>>

/** The REST API on a port, streaming as the standalone server does. */
async function serve(cms: EasyCMS): Promise<{ api: string; close: () => Promise<void> }> {
  const handle = createRestHandler(cms)
  const server: Server = createServer(async (req, res) => {
    const controller = new AbortController()
    res.on('close', () => controller.abort())
    const response = await handle(
      new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method ?? 'GET',
        headers: req.headers as Record<string, string>,
        signal: controller.signal,
      }),
    )
    res.writeHead(response.status, Object.fromEntries(response.headers))
    if (!response.body) return void res.end()
    await pipeline(
      Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),
      res,
    ).catch(() => {})
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    api: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/cms`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}

/** A raw stream: its messages as `event id` and their data, read until `close()`. */
function stream(url: string, headers: Record<string, string> = {}) {
  const controller = new AbortController()
  const messages: { event: string; id?: string; data: Record<string, unknown> }[] = []
  const response = fetch(url, { headers, signal: controller.signal })
  const done = response.then(async (res) => {
    if (!res.ok || !res.body) return
    let buffer = ''
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) return
        buffer += value
        let at = buffer.indexOf('\n\n')
        while (at >= 0) {
          const block = buffer.slice(0, at)
          buffer = buffer.slice(at + 2)
          const fields = Object.fromEntries(
            block
              .split('\n')
              .filter((l) => !l.startsWith(':'))
              .map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)]),
          )
          if (fields.event)
            messages.push({
              event: fields.event,
              ...(fields.id ? { id: fields.id } : {}),
              data: JSON.parse(fields.data || '{}'),
            })
          at = buffer.indexOf('\n\n')
        }
      }
    } catch {
      // Aborted.
    }
  })
  return {
    response,
    messages,
    /** Waits until a message matches. */
    async until(match: (m: (typeof messages)[number]) => boolean, ms = 5000) {
      const end = Date.now() + ms
      while (Date.now() < end) {
        const found = messages.find(match)
        if (found) return found
        await new Promise((r) => setTimeout(r, 20))
      }
      throw new Error(`No such message in ${JSON.stringify(messages)}`)
    },
    close() {
      controller.abort()
      return done
    },
  }
}

const cleanups: (() => Promise<unknown> | unknown)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function setup(extra?: Parameters<typeof config>[0]) {
  const cms: CMS = await open(config(extra))
  const { api, close } = await serve(cms as unknown as EasyCMS)
  cleanups.push(() => cms.destroy(), close)
  const admin = await cms.create('users', {
    email: 'admin@example.com',
    password: 'correct horse battery',
    role: 'admin',
  })
  const session = await cms.auth.login({
    email: 'admin@example.com',
    password: 'correct horse battery',
  })
  const other = await cms.create('users', {
    email: 'editor@example.com',
    password: 'correct horse battery',
    role: 'editor',
  })
  const editor = await cms.auth.login({
    email: 'editor@example.com',
    password: 'correct horse battery',
  })
  const open_ = (query: string, headers: Record<string, string> = {}) => {
    const s = stream(`${api}/realtime?${query}`, headers)
    cleanups.push(() => s.close())
    return s
  }
  return {
    cms,
    api,
    admin: admin as unknown as AuthUser,
    other: other as unknown as AuthUser,
    staff: { authorization: `Bearer ${session.token}` },
    editor: { authorization: `Bearer ${editor.token}` },
    open: open_,
  }
}

describe('realtime (ADR-0070)', () => {
  let ctx: Awaited<ReturnType<typeof setup>>
  beforeAll(async () => {
    // Warm up drizzle-kit for the first test's timing.
    await (await open(config())).destroy()
  })

  it('writes events only for collections with realtime, and only with one', async () => {
    ctx = await setup()
    await ctx.cms.create('plain', { title: 'Not followed' })
    await ctx.cms.create('posts', { title: 'Followed' })
    const rows = await ctx.cms.db.find({
      collection: 'realtime-events',
      sort: ['id'],
      limit: 0,
      page: 1,
    })
    expect(rows.docs.map((r) => [r.collection, r.event])).toEqual([['posts', 'create']])
    const without = await open(
      defineConfig({ secret: SECRET, db: db(), collections: [{ slug: 'a', fields: [] }] }),
    )
    cleanups.push(() => without.destroy())
    expect(without.config.collections.some((c) => c.slug === 'realtime-events')).toBe(false)
  })

  it('writes the event and the outbox row in one transaction when both are on', async () => {
    const both = await open(
      defineConfig({
        secret: SECRET,
        db: db(),
        outbox: true,
        collections: [
          {
            slug: 'posts',
            realtime: true,
            hooks: { afterChange: [() => {}] },
            fields: [{ name: 'title', type: 'text', unique: true }],
          },
        ],
      }),
    )
    cleanups.push(() => both.destroy())
    await both.create('posts', { title: 'One' })
    // A save that fails writes neither.
    await expect(both.create('posts', { title: 'One' })).rejects.toThrow()
    await both.flushOutbox()
    const events = await both.db.find({
      collection: 'realtime-events',
      sort: ['id'],
      limit: 0,
      page: 1,
    })
    expect(events.docs.map((r) => r.event)).toEqual(['create'])
  })

  it('streams create, update, publish, unpublish and delete to a visitor as it reads them', async () => {
    ctx = await setup()
    const s = ctx.open('s=posts')
    expect((await s.response).headers.get('content-type')).toContain('text/event-stream')
    await s.until((m) => m.event === 'ready')
    const post = await ctx.cms.create('posts', {
      title: 'Hello',
      notes: 'internal',
      status: 'published',
    })
    const created = await s.until((m) => m.event === 'create')
    expect(created.data).toMatchObject({ collection: 'posts', id: post.id })
    expect((created.data.doc as Record<string, unknown>).title).toBe('Hello')
    // Field-level read access: a visitor doesn't get `notes`.
    expect(created.data.doc).not.toHaveProperty('notes')
    expect(Number(created.id)).toBeGreaterThan(0)

    await ctx.cms.update('posts', post.id, { title: 'Hello again' })
    expect(
      ((await s.until((m) => m.event === 'update')).data.doc as Record<string, unknown>).title,
    ).toBe('Hello again')
    // A draft of a published post (kept as a version): not for visitors.
    await ctx.cms.update('posts', post.id, { title: 'Secret draft', status: 'draft' })
    await ctx.cms.update('posts', post.id, { title: 'Published', status: 'published' })
    await s.until(
      (m) => m.event === 'update' && (m.data.doc as { title: string }).title === 'Published',
    )
    expect(
      s.messages.some(
        (m) => (m.data.doc as { title?: string } | undefined)?.title === 'Secret draft',
      ),
    ).toBe(false)
    await ctx.cms.unpublish('posts', post.id)
    // It no longer shows for a visitor: `leave`, not the unpublished document.
    expect((await s.until((m) => m.event === 'leave')).data).toEqual({
      collection: 'posts',
      id: post.id,
    })
    await ctx.cms.update('posts', post.id, { status: 'published' })
    expect((await s.until((m) => m.event === 'publish')).data.id).toBe(post.id)
    await ctx.cms.delete('posts', post.id)
    expect((await s.until((m) => m.event === 'delete')).data).toEqual({
      collection: 'posts',
      id: post.id,
    })
    // Ids go up, in order.
    const ids = s.messages.filter((m) => m.id).map((m) => Number(m.id))
    expect(ids).toEqual([...ids].sort((a, b) => a - b))
  })

  it('sends drafts to staff who ask, with the fields they may read', async () => {
    ctx = await setup()
    const s = ctx.open('s=posts%3Fdraft%3Dtrue', ctx.staff)
    await s.until((m) => m.event === 'ready')
    const post = await ctx.cms.create('posts', { title: 'Draft', notes: 'for staff' })
    const created = await s.until((m) => m.event === 'create')
    expect(created.data.doc).toMatchObject({ title: 'Draft', notes: 'for staff', status: 'draft' })
    await ctx.cms.update('posts', post.id, { status: 'published' })
    await ctx.cms.update('posts', post.id, { title: 'Pending', status: 'draft' })
    // The pending draft, as the staff's draft read sees it.
    const pending = await s.until(
      (m) => m.event === 'update' && (m.data.doc as { title: string }).title === 'Pending',
    )
    expect(pending.data.doc).toMatchObject({ status: 'draft' })
    // A visitor asking for drafts gets published documents only.
    const visitor = ctx.open('s=posts%3Fdraft%3Dtrue')
    await visitor.until((m) => m.event === 'ready')
    await ctx.cms.create('posts', { title: 'Another draft' })
    await s.until(
      (m) => m.event === 'create' && (m.data.doc as { title: string }).title === 'Another draft',
    )
    await new Promise((r) => setTimeout(r, 200))
    expect(visitor.messages.filter((m) => m.event !== 'ready')).toEqual([])
  })

  it('follows a where and a single document', async () => {
    ctx = await setup()
    const where = encodeURIComponent(
      `posts?where=${JSON.stringify({ category: { equals: 'news' } })}`,
    )
    const news = ctx.open(`s=${where}`)
    await news.until((m) => m.event === 'ready')
    const a = await ctx.cms.create('posts', { title: 'A', category: 'news', status: 'published' })
    const b = await ctx.cms.create('posts', { title: 'B', category: 'sport', status: 'published' })
    await news.until((m) => m.event === 'create' && m.data.id === a.id)
    const one = ctx.open(`s=${encodeURIComponent(`posts/${b.id}`)}`)
    await one.until((m) => m.event === 'ready')
    await ctx.cms.update('posts', a.id, { category: 'sport' })
    // No longer matching the where: `leave`.
    await news.until((m) => m.event === 'leave' && m.data.id === a.id)
    await ctx.cms.update('posts', b.id, { title: 'B2' })
    await one.until((m) => m.event === 'update' && m.data.id === b.id)
    // Never matching: nothing at all about it, not even its id.
    expect(news.messages.some((m) => m.data.id === b.id)).toBe(false)
    // Deleting one it never matched: nothing either.
    const c = await ctx.cms.create('posts', { title: 'C', category: 'sport', status: 'published' })
    await ctx.cms.delete('posts', c.id)
    // Matching now, never before: an update with the document.
    await ctx.cms.update('posts', b.id, { category: 'news' })
    const joined = await news.until((m) => m.event === 'update' && m.data.id === b.id)
    expect(joined.data.doc).toMatchObject({ title: 'B2', category: 'news' })
    expect(news.messages.some((m) => m.data.id === c.id)).toBe(false)
    await ctx.cms.update('posts', b.id, { category: 'sport' })
    expect(one.messages.some((m) => m.data.id === a.id)).toBe(false)
    // Bracket where, as the REST list takes it, and several subscriptions on one stream.
    const both = ctx.open(
      `s=${encodeURIComponent('posts?where[category][equals]=sport')}&s=${encodeURIComponent(`posts/${a.id}`)}`,
    )
    await both.until((m) => m.event === 'ready')
    await ctx.cms.update('posts', a.id, { title: 'A2' })
    await both.until((m) => m.event === 'update' && m.data.id === a.id)
    // Once per event, though two subscriptions see it.
    await new Promise((r) => setTimeout(r, 200))
    expect(both.messages.filter((m) => m.event === 'update')).toHaveLength(1)
  })

  it('applies row-level read access per subscriber', async () => {
    ctx = await setup()
    const mine = ctx.open('s=notes', ctx.staff)
    const theirs = ctx.open('s=notes', ctx.editor)
    await mine.until((m) => m.event === 'ready')
    await theirs.until((m) => m.event === 'ready')
    const note = await ctx.cms.create('notes', { text: 'mine', owner: Number(ctx.admin.id) })
    await mine.until((m) => m.event === 'create' && m.data.id === note.id)
    const other = await ctx.cms.create('notes', { text: 'theirs', owner: Number(ctx.other.id) })
    await theirs.until((m) => m.event === 'create' && m.data.id === other.id)
    expect(theirs.messages.some((m) => m.data.id === note.id)).toBe(false)
    expect(mine.messages.some((m) => m.data.id === other.id)).toBe(false)
    // (1) Hidden by row-level access before and after: nothing, not even its id.
    await ctx.cms.update('notes', other.id, { text: 'theirs, edited' })
    await theirs.until((m) => m.event === 'update' && m.data.id === other.id)
    // (2) Visible before, hidden after: `leave` for the one who saw it, nothing for the other.
    await ctx.cms.update('notes', note.id, { owner: Number(ctx.other.id) })
    await mine.until((m) => m.event === 'leave' && m.data.id === note.id)
    // (3) Never visible, now visible: an update with the document, as before.
    const moved = await theirs.until((m) => m.event === 'update' && m.data.id === note.id)
    expect(moved.data.doc).toMatchObject({ text: 'mine' })
    // (4) Deleted, which only the other user could see: the first hears nothing.
    await ctx.cms.delete('notes', other.id)
    await theirs.until((m) => m.event === 'delete' && m.data.id === other.id)
    await ctx.cms.delete('notes', note.id)
    await theirs.until((m) => m.event === 'delete' && m.data.id === note.id)
    await new Promise((r) => setTimeout(r, 200))
    expect(mine.messages.filter((m) => m.data.id === other.id)).toEqual([])
    expect(mine.messages.filter((m) => m.data.id === note.id).map((m) => m.event)).toEqual([
      'create',
      'leave',
    ])
    // A visitor may not read notes at all: refused up front.
    const refused = await fetch(`${ctx.api}/realtime?s=notes`)
    expect(refused.status).toBe(401)
  })

  it('refuses what it can’t follow', async () => {
    ctx = await setup()
    const status = async (query: string) => (await fetch(`${ctx.api}/realtime?${query}`)).status
    expect(await status('')).toBe(400)
    expect(await status('s=plain')).toBe(400)
    expect(await status('s=nope')).toBe(400)
    expect(await status('s=realtime-events')).toBe(400)
    expect(await status('s=posts/abc')).toBe(400)
    // Querying a field it can't read, as over REST.
    expect(await status(`s=${encodeURIComponent('posts?where[notes][equals]=x')}`)).toBe(403)
    // Tokens only in headers: a token in the URL is just ignored, so this is a visitor.
    const res = await fetch(`${ctx.api}/realtime?s=notes&token=${ctx.staff.authorization.slice(7)}`)
    expect(res.status).toBe(401)
    expect((await fetch(`${ctx.api}/realtime?s=posts`, { method: 'POST' })).status).toBe(405)
  })

  it('resumes after Last-Event-ID, and resets once the events are gone', async () => {
    ctx = await setup()
    const first = ctx.open('s=posts')
    const ready = await first.until((m) => m.event === 'ready')
    const a = await ctx.cms.create('posts', { title: 'A', status: 'published' })
    const seen = await first.until((m) => m.event === 'create' && m.data.id === a.id)
    await first.close()
    // While away.
    const b = await ctx.cms.create('posts', { title: 'B', status: 'published' })
    await ctx.cms.update('posts', a.id, { title: 'A2' })
    await ctx.cms.create('posts', { title: 'Hidden draft' })

    const again = ctx.open('s=posts', { 'last-event-id': String(seen.id) })
    await again.until((m) => m.event === 'ready')
    const replayed = again.messages.filter((m) => m.event !== 'ready')
    expect(replayed.map((m) => [m.event, m.data.id])).toEqual([
      ['create', b.id],
      ['update', a.id],
    ])
    // `ready` comes after what was missed, and carries where the stream now is.
    expect(again.messages.at(-1)?.event).toBe('ready')

    // From the first `ready`: everything since.
    const fromStart = ctx.open('s=posts', { 'last-event-id': String(ready.id) })
    await fromStart.until((m) => m.event === 'ready')
    expect(fromStart.messages.filter((m) => m.event === 'create').map((m) => m.data.id)).toEqual([
      a.id,
      b.id,
    ])

    // A day later the events are pruned (the newest is kept): an old id can't resume.
    await ctx.cms.runJobs(new Date(Date.now() + 25 * 3_600_000))
    const late = ctx.open('s=posts', { 'last-event-id': String(seen.id) })
    await late.until((m) => m.event === 'ready')
    expect(late.messages.map((m) => m.event)).toEqual(['reset', 'ready'])
    // Nonsense resets too.
    const bad = ctx.open('s=posts', { 'last-event-id': 'nope' })
    await bad.until((m) => m.event === 'ready')
    expect(bad.messages[0]?.event).toBe('reset')
  })

  it('limits open streams per user and per server', async () => {
    ctx = await setup({ maxPerUser: 1, maxConnections: 2 })
    const a = ctx.open('s=posts', ctx.staff)
    await a.until((m) => m.event === 'ready')
    const over = await fetch(`${ctx.api}/realtime?s=posts`, { headers: ctx.staff })
    expect(over.status).toBe(429)
    expect(over.headers.get('retry-after')).toBeTruthy()
    const b = ctx.open('s=posts', ctx.editor)
    await b.until((m) => m.event === 'ready')
    const full = await fetch(`${ctx.api}/realtime?s=posts`)
    expect(full.status).toBe(503)
    // Closing one frees its place.
    await a.close()
    await new Promise((r) => setTimeout(r, 100))
    const c = ctx.open('s=posts', ctx.staff)
    await c.until((m) => m.event === 'ready')
    const hub = (ctx.cms as unknown as { realtime?: { connections: number } }).realtime
    expect(hub?.connections).toBe(2)
  })

  it('cms.subscribe() gives the same events in process', async () => {
    ctx = await setup()
    const all = ctx.cms.subscribe('posts', { draft: true })
    const visitor = ctx.cms.subscribe('posts', { overrideAccess: false, user: null })
    await all.ready
    await visitor.ready
    const post = await ctx.cms.create('posts', { title: 'Local', notes: 'n' })
    await ctx.cms.update('posts', post.id, { status: 'published' })
    await ctx.cms.delete('posts', post.id)
    const take = async <T>(it: AsyncIterator<T>, n: number) => {
      const out: T[] = []
      while (out.length < n) out.push((await it.next()).value as T)
      return out
    }
    const events = (await take(all, 3)) as RealtimeEvent[]
    expect(events.map((e) => e.event)).toEqual(['create', 'publish', 'delete'])
    expect(events[0]).toMatchObject({ doc: { title: 'Local', notes: 'n', status: 'draft' } })
    // A visitor's never saw the draft: publish, then delete.
    const seen = (await take(visitor, 2)) as RealtimeEvent[]
    expect(seen.map((e) => e.event)).toEqual(['publish', 'delete'])
    expect((seen[0] as { doc: object }).doc).not.toHaveProperty('notes')
    all.close()
    expect(await all.next()).toEqual({ value: undefined, done: true })
    // `break` ends it too.
    await visitor.return?.()
    expect(await visitor.next()).toEqual({ value: undefined, done: true })
    expect(() => ctx.cms.subscribe('plain' as 'posts')).toThrow(/no realtime/)
    await expect(
      ctx.cms.subscribe('notes', { overrideAccess: false, user: null }).ready,
    ).rejects.toThrow()
  })

  it('keeps a list up to date with the client’s live()', async () => {
    ctx = await setup()
    await ctx.cms.create('posts', { title: 'First', status: 'published' })
    const client = createClient({ url: ctx.api })
    let state: LiveState<Record<string, unknown>> | undefined
    const handle = client.live('posts', { sort: 'title' }, (s) => {
      state = s
    })
    cleanups.push(() => handle.close())
    const until = async (check: () => boolean) => {
      const end = Date.now() + 5000
      while (!check()) {
        if (Date.now() > end) throw new Error(`Timed out: ${JSON.stringify(state)}`)
        await new Promise((r) => setTimeout(r, 20))
      }
    }
    await until(() => state?.ready === true)
    expect(state?.docs.map((d) => d.title)).toEqual(['First'])
    const b = await ctx.cms.create('posts', { title: 'Before', status: 'published' })
    await until(() => state?.docs.length === 2)
    expect(state?.docs.map((d) => d.title)).toEqual(['Before', 'First'])
    await ctx.cms.unpublish('posts', b.id)
    await until(() => state?.docs.length === 1)
    // One document.
    let one: LiveState<Record<string, unknown>> | undefined
    const single = client.live('posts', { id: b.id }, (s) => {
      one = s
    })
    cleanups.push(() => single.close())
    await until(() => one?.ready === true)
    expect(one?.doc).toBeNull()
    await ctx.cms.update('posts', b.id, { status: 'published', title: 'Back' })
    await until(() => one?.doc?.title === 'Back')
  })
})

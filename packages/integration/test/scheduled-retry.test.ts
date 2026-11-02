import { createRestHandler, defineConfig } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  collections: [
    {
      slug: 'posts',
      drafts: true,
      schedule: true,
      access: { read: () => true, create: () => true, update: () => true },
      fields: [
        { name: 'title', type: 'text' },
        // Saving a draft works without it; publishing doesn't.
        { name: 'summary', type: 'text', required: true },
      ],
    },
  ],
})

const past = () => new Date(Date.now() - 60_000).toISOString()

/** The error a database driver gives when the database didn't answer. */
function dropped() {
  const cause = Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' })
  return new Error('Failed query: select "id" from "ecms_posts" params: published,1,1', { cause })
}

type CMS = Awaited<ReturnType<typeof open<typeof config>>>

/** Makes the database fail the next `times` reads of posts, as a dropped connection would. */
function failReads(cms: CMS, times: number) {
  const find = cms.db.find.bind(cms.db)
  const findById = cms.db.findById.bind(cms.db)
  let left = times
  const fail = (collection: string) => {
    if (collection !== 'posts' || left <= 0) return
    left--
    throw dropped()
  }
  cms.db.find = (async (args: Parameters<typeof find>[0]) => {
    fail(args.collection)
    return find(args)
  }) as typeof cms.db.find
  cms.db.findById = (async (args: Parameters<typeof findById>[0]) => {
    fail(args.collection)
    return findById(args)
  }) as typeof cms.db.findById
  return () => {
    left = 0
  }
}

const jobs = async (cms: CMS) =>
  (await cms.db.find({ collection: 'scheduled-jobs', sort: ['id'], limit: 0, page: 1 })).docs

describe('scheduled publishing that fails (#333)', () => {
  it('tries again after an error that passes, and publishes', async () => {
    const cms = await open(config)
    const post = await cms.create('posts', { title: 'A', summary: 'S' })
    await cms.schedule('posts', post.id, { action: 'publish', at: past() })
    const stop = failReads(cms, 1)
    expect(await cms.runScheduled()).toEqual({ ran: 1, failed: 0 })
    stop()
    expect((await cms.findById('posts', post.id))?.status).toBe('published')
    await cms.destroy()
  })

  it('records the cause when the database keeps failing', async () => {
    const cms = await open(config)
    const post = await cms.create('posts', { title: 'B', summary: 'S' })
    await cms.schedule('posts', post.id, { action: 'publish', at: past() })
    const stop = failReads(cms, 10)
    expect(await cms.runScheduled()).toEqual({ ran: 0, failed: 1 })
    stop()
    const [job] = await jobs(cms)
    expect(job).toMatchObject({ state: 'failed' })
    expect(String(job?.error)).toMatch(/^Failed query: .* — fetch failed ECONNRESET$/)
    await cms.destroy()
  }, 15_000)

  it("doesn't retry a document that can't be published, and an admin can retry it later", async () => {
    const cms = await open(config)
    const post = await cms.create('posts', { title: 'C' } as never)
    await cms.schedule('posts', post.id, { action: 'publish', at: past() })
    const started = Date.now()
    expect(await cms.runScheduled()).toEqual({ ran: 0, failed: 1 })
    // At once: a validation error isn't waited on.
    expect(Date.now() - started).toBeLessThan(900)
    const [job] = await jobs(cms)
    expect(String(job?.error)).toMatch(/summary/)

    // Fixed, then retried from Settings → Jobs.
    await cms.update('posts', post.id, { summary: 'Now there is one', status: 'draft' })
    for (const [email, role] of [
      ['admin@x.co', 'admin'],
      ['editor@x.co', 'editor'],
    ] as const)
      await cms.create('users', { email, password: 'password123', role })
    const tokenOf = async (email: string) =>
      (await cms.auth.login({ email, password: 'password123' })).token
    const handle = createRestHandler(cms)
    const retry = async (email: string) =>
      handle(
        new Request(`http://cms.test/api/cms/admin/jobs/scheduled/${job?.id}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${await tokenOf(email)}` },
        }),
      )
    expect((await retry('editor@x.co')).status).toBe(403)
    expect((await retry('admin@x.co')).status).toBe(200)
    expect((await cms.findById('posts', post.id))?.status).toBe('published')
    expect((await jobs(cms))[0]).toMatchObject({ state: 'done' })
    // Only failed jobs.
    expect(await cms.retryScheduled(job?.id as number)).toBe(false)
    await cms.destroy()
  })
})

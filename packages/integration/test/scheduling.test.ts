import { createRestHandler, defineConfig, isLoggedIn } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

const config = defineConfig({
  secret: SECRET,
  db: db(),
  cronSecret: 'cron-secret-value',
  collections: [
    {
      slug: 'posts',
      drafts: true,
      versions: true,
      schedule: true,
      access: { read: () => true, update: isLoggedIn },
      fields: [
        { name: 'title', type: 'text' },
        { name: 'summary', type: 'text', required: true },
      ],
    },
    { slug: 'notes', fields: [{ name: 'text', type: 'text' }] },
  ],
  globals: [
    { slug: 'banner', drafts: true, schedule: true, fields: [{ name: 'text', type: 'text' }] },
  ],
})

const past = () => new Date(Date.now() - 60_000)
const future = () => new Date(Date.now() + 3_600_000)

describe('scheduled publishing (FR-SCH)', () => {
  it('publishes and unpublishes when the time comes (FR-SCH-01)', async () => {
    const cms = await open(config)
    const post = await cms.create('posts', { title: 'Soon', summary: 's' })
    const job = await cms.schedule('posts', post.id, { action: 'publish', at: past() })
    expect(job).toMatchObject({ action: 'publish', state: 'pending' })
    await cms.schedule('posts', post.id, { action: 'unpublish', at: future() })

    expect(await cms.runScheduled()).toEqual({ ran: 1, failed: 0 })
    expect((await cms.findById('posts', post.id))?.title).toBe('Soon')
    // The unpublish is still ahead; running again does nothing new.
    expect((await cms.scheduled('posts', post.id)).map((j) => j.action)).toEqual(['unpublish'])
    expect(await cms.runScheduled()).toEqual({ ran: 0, failed: 0 })

    expect(await cms.runScheduled(new Date(Date.now() + 7_200_000))).toEqual({ ran: 1, failed: 0 })
    expect(await cms.findById('posts', post.id)).toBeNull()
    await cms.destroy()
  })

  it('publishes the pending draft of a published document (FR-SCH-02)', async () => {
    const cms = await open(config)
    const post = await cms.create('posts', { title: 'Live', summary: 's', status: 'published' })
    await cms.update('posts', post.id, { title: 'Next week', status: 'draft' })
    await cms.schedule('posts', post.id, { action: 'publish', at: past() })
    expect((await cms.findById('posts', post.id))?.title).toBe('Live')
    await cms.runScheduled()
    expect((await cms.findById('posts', post.id))?.title).toBe('Next week')
    await cms.destroy()
  })

  it('replaces, cancels and records failures', async () => {
    const cms = await open(config)
    // No summary: saving the draft works, publishing fails validation.
    const post = await cms.create('posts', { title: 'x' } as never)
    await cms.schedule('posts', post.id, { action: 'publish', at: future() })
    const replaced = await cms.schedule('posts', post.id, { action: 'publish', at: past() })
    expect((await cms.scheduled('posts', post.id)).map((j) => j.id)).toEqual([replaced.id])

    expect(await cms.runScheduled()).toEqual({ ran: 0, failed: 1 })
    expect(await cms.scheduled('posts', post.id)).toEqual([])

    const later = await cms.schedule('posts', post.id, { action: 'unpublish', at: future() })
    await cms.cancelSchedule('posts', post.id, later.id)
    expect(await cms.scheduled('posts', post.id)).toEqual([])

    await expect(
      cms.schedule('posts', post.id, { action: 'nope' as never, at: 'not a date' }),
    ).rejects.toMatchObject({
      errors: [
        { field: 'action', message: 'must be "publish" or "unpublish"' },
        { field: 'at', message: 'must be a valid date' },
      ],
    })
    const note = await cms.create('notes', { text: 'x' })
    await expect(cms.scheduled('notes', note.id)).rejects.toThrow(/has no schedule/)
    await expect(
      cms.scheduled('posts', post.id, { overrideAccess: false, user: null }),
    ).rejects.toMatchObject({ status: 401 })

    // Deleting a document removes its jobs.
    await cms.schedule('posts', post.id, { action: 'unpublish', at: past() })
    await cms.delete('posts', post.id)
    expect(await cms.runScheduled()).toEqual({ ran: 0, failed: 0 })
    await cms.destroy()
  })

  it('lists upcoming jobs across collections and globals, for users who may update them', async () => {
    const cms = await open(config)
    const post = await cms.create('posts', { title: 'Later', summary: 's' })
    await cms.schedule('posts', post.id, { action: 'publish', at: future() })
    await cms.updateGlobal('banner', { text: 'Soon' })
    await cms.scheduleGlobal('banner', { action: 'publish', at: new Date(Date.now() + 60_000) })

    const all = await cms.upcomingJobs()
    expect(all.map((j) => j.global ?? j.collection)).toEqual(['banner', 'posts'])
    expect(all[1]).toMatchObject({ collection: 'posts', doc: post.id, action: 'publish' })
    // Visitors may not update posts (isLoggedIn) or the banner (default: logged in).
    expect(await cms.upcomingJobs({ overrideAccess: false, user: null })).toEqual([])

    const handle = createRestHandler(cms)
    const admin = await cms.create('users', {
      email: 'jobs@x.test',
      password: 'password123',
      role: 'admin',
    } as never)
    const { token } = await cms.auth.createSession(admin.id)
    const res = await handle(
      new Request('http://cms.test/api/cms/admin/scheduled', {
        headers: { authorization: `Bearer ${token}` },
      }),
    )
    const jobs = (await res.json()) as { action: string }[]
    expect(jobs.map((j) => j.action)).toEqual(['publish', 'publish'])
    await cms.destroy()
  })

  it('schedules globals', async () => {
    const cms = await open(config)
    await cms.updateGlobal('banner', { text: 'Sale' })
    await cms.scheduleGlobal('banner', { action: 'publish', at: past() })
    expect((await cms.scheduledGlobal('banner')).length).toBe(1)
    await cms.runScheduled()
    expect((await cms.findGlobal('banner')).status).toBe('published')
    await cms.destroy()
  })

  it('is available over REST, with a cron endpoint', async () => {
    const cms = await open(config)
    const handle = createRestHandler(cms)
    const admin = await cms.create('users', {
      email: 'admin@x.test',
      password: 'password123',
      role: 'admin',
    } as never)
    const { token } = await cms.auth.createSession(admin.id)
    const call = async (method: string, path: string, body?: unknown, auth = `Bearer ${token}`) => {
      const response = await handle(
        new Request(`http://cms.test/api/cms${path}`, {
          method,
          headers: { authorization: auth, 'content-type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      )
      return { status: response.status, json: JSON.parse(await response.text()) }
    }
    const post = await cms.create('posts', { title: 'REST', summary: 's' })
    const created = await call('POST', `/posts/${post.id}/schedule`, {
      action: 'publish',
      at: past().toISOString(),
    })
    expect(created.status).toBe(201)
    expect((await call('GET', `/posts/${post.id}/schedule`)).json).toHaveLength(1)

    // The cron endpoint needs the cron secret (or an admin).
    expect((await call('GET', '/jobs/run', undefined, '')).status).toBe(401)
    expect((await call('GET', '/jobs/run', undefined, 'Bearer wrong')).status).toBe(401)
    expect((await call('GET', '/jobs/run', undefined, 'Bearer cron-secret-value')).json).toEqual({
      ran: 1,
      failed: 0,
      webhooks: { sent: 0, failed: 0 },
      emails: { sent: 0, failed: 0 },
      jobs: { ran: 0, failed: 0 },
    })
    expect((await call('POST', '/jobs/run')).json).toMatchObject({ ran: 0, failed: 0 })

    const job = (
      await call('POST', `/posts/${post.id}/schedule`, {
        action: 'unpublish',
        at: future().toISOString(),
      })
    ).json
    expect((await call('DELETE', `/posts/${post.id}/schedule/${job.id}`)).status).toBe(200)
    expect((await call('GET', `/posts/${post.id}/schedule`)).json).toEqual([])
    expect(
      (await call('POST', '/globals/banner/schedule', { action: 'publish', at: 'x' })).status,
    ).toBe(400)
    await cms.destroy()
  })
})

import {
  type AdminJob,
  type AdminJobs,
  type AdminSchema,
  type AdminStatus,
  createRestHandler,
  defineConfig,
  type RestHandler,
} from '@easy-cms/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

/** Settings → Jobs (#185): the config's jobs, the scheduled queue, pausing and schedules. */
const runs: string[] = []
let failNext = false
const config = () =>
  defineConfig({
    secret: SECRET,
    db: db(),
    timeZone: 'Asia/Bangkok',
    auth: { rbac: true },
    jobs: [
      { name: 'sitemap', at: '02:00', adminSchedule: true, run: () => void runs.push('sitemap') },
      {
        name: 'feed',
        every: 300,
        run: () => {
          runs.push('feed')
          if (failNext) throw new Error('feed is down')
        },
      },
    ],
    collections: [
      { slug: 'posts', drafts: true, schedule: true, fields: [{ name: 'title', type: 'text' }] },
    ],
  })

type CMS = Awaited<ReturnType<typeof open>>
let cms: CMS
let handle: RestHandler
const headers: Record<string, Record<string, string>> = {}

beforeEach(async () => {
  runs.length = 0
  failNext = false
  cms = await open(config())
  handle = createRestHandler(cms)
  await cms.create('users', { email: 'admin@x.co', password: 'password123', role: 'admin' })
  await cms.create('users', { email: 'ops@x.co', password: 'password123', role: 'editor' })
  for (const email of ['admin@x.co', 'ops@x.co']) {
    const { token } = await cms.auth.login({ email, password: 'password123' })
    headers[email] = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  }
  return () => cms.destroy()
})

async function call(path: string, method = 'GET', who = 'admin@x.co', body?: unknown) {
  const response = await handle(
    new Request(`http://cms.test/api/cms${path}`, {
      method,
      headers: headers[who] ?? {},
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  )
  const text = await response.text()
  return { status: response.status, json: text ? JSON.parse(text) : undefined }
}
const job = (data: AdminJobs, name: string) => data.jobs.find((j) => j.name === name) as AdminJob

describe('Settings → Jobs', () => {
  it('lists the jobs with their schedule and last run, and the scheduled queue', async () => {
    const post = await cms.create('posts', { title: 'Soon' })
    await cms.schedule('posts', post.id, {
      action: 'publish',
      at: new Date(Date.now() + 3_600_000),
    })
    await cms.runJobs()
    const { status, json } = await call('/admin/jobs')
    expect(status).toBe(200)
    const data = json as AdminJobs
    expect(data.timeZone).toBe('Asia/Bangkok')
    expect(data.canChange).toBe(true)
    expect(job(data, 'sitemap')).toMatchObject({
      every: null,
      at: '02:00',
      code: { every: null, at: '02:00' },
      adminSchedule: true,
      paused: null,
      changed: null,
      lastStatus: 'ok',
    })
    // Daily at 02:00 Bangkok: the next run is a slot in the future.
    expect(Date.parse(job(data, 'sitemap').nextAt as string)).toBeGreaterThan(Date.now())
    expect(job(data, 'feed')).toMatchObject({ every: 300, at: null, adminSchedule: false })
    expect(data.scheduled).toMatchObject([
      { action: 'publish', state: 'pending', collection: 'posts', doc: post.id },
    ])
  })

  it('records a failed run, and the dashboard says so', async () => {
    failNext = true
    await cms.runJobs()
    const feed = job((await call('/admin/jobs')).json, 'feed')
    expect(feed).toMatchObject({ lastStatus: 'failed', lastError: 'feed is down' })
    const status = (await call('/admin/status')).json as AdminStatus
    expect(status.attention).toContainEqual({ id: 'jobs', count: 1, names: ['feed'] })
  })

  it('runs due jobs from the admin, once', async () => {
    const first = await call('/admin/jobs/run', 'POST')
    expect(first.status).toBe(200)
    expect(first.json.jobs).toEqual({ ran: 2, failed: 0 })
    // Nothing is due a second time.
    expect((await call('/admin/jobs/run', 'POST')).json.jobs).toEqual({ ran: 0, failed: 0 })
    expect(runs.sort()).toEqual(['feed', 'sitemap'])
  })

  it('pauses and resumes a job; a paused job does not run and shows on the dashboard', async () => {
    const paused = await call('/admin/jobs/feed', 'PATCH', 'admin@x.co', { paused: true })
    expect(paused.status).toBe(200)
    expect(job(paused.json, 'feed').paused).toMatchObject({ by: 'admin@x.co' })
    await cms.runJobs()
    expect(runs).toEqual(['sitemap'])
    const status = (await call('/admin/status')).json as AdminStatus
    expect(status.attention).toContainEqual({ id: 'jobs-paused', count: 1, names: ['feed'] })

    await call('/admin/jobs/feed', 'PATCH', 'admin@x.co', { paused: false })
    await cms.runJobs()
    expect(runs).toEqual(['sitemap', 'feed'])
  })

  it("sets a job's schedule when the config allows it, and goes back to the config's", async () => {
    const set = await call('/admin/jobs/sitemap', 'PATCH', 'admin@x.co', {
      every: 2 * 86_400,
      at: '03:30',
    })
    expect(set.status).toBe(200)
    expect(job(set.json, 'sitemap')).toMatchObject({
      every: 172_800,
      at: '03:30',
      code: { every: null, at: '02:00' },
      changed: { by: 'admin@x.co' },
    })
    const reset = await call('/admin/jobs/sitemap', 'PATCH', 'admin@x.co', {
      every: null,
      at: null,
    })
    expect(job(reset.json, 'sitemap')).toMatchObject({ every: null, at: '02:00', changed: null })

    // feed's schedule is the config's alone; bad values are refused.
    expect((await call('/admin/jobs/feed', 'PATCH', 'admin@x.co', { every: 600 })).status).toBe(400)
    expect(
      (await call('/admin/jobs/sitemap', 'PATCH', 'admin@x.co', { every: 3600, at: '03:30' }))
        .status,
    ).toBe(400)
    expect((await call('/admin/jobs/sitemap', 'PATCH', 'admin@x.co', { at: '25:00' })).status).toBe(
      400,
    )
    expect((await call('/admin/jobs/nope', 'PATCH', 'admin@x.co', { paused: true })).status).toBe(
      404,
    )
  })

  it('runs an admin schedule in place of the config one', async () => {
    await call('/admin/jobs/feed', 'PATCH', 'admin@x.co', { paused: true })
    await call('/admin/jobs/sitemap', 'PATCH', 'admin@x.co', { every: 600 })
    const t = Date.now()
    await cms.runJobs(new Date(t))
    await cms.runJobs(new Date(t + 5 * 60_000))
    await cms.runJobs(new Date(t + 11 * 60_000))
    // Every 10 minutes now, instead of daily at 02:00.
    expect(runs).toEqual(['sitemap', 'sitemap'])
  })

  it('records pauses and schedule changes in the audit log', async () => {
    const withAudit = await open(defineConfig({ ...config(), audit: true }))
    try {
      const h = createRestHandler(withAudit)
      await withAudit.create('users', { email: 'a@x.co', password: 'password123', role: 'admin' })
      const { token } = await withAudit.auth.login({ email: 'a@x.co', password: 'password123' })
      await h(
        new Request('http://cms.test/api/cms/admin/jobs/feed', {
          method: 'PATCH',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ paused: true }),
        }),
      )
      const { docs } = await withAudit.db.find({
        collection: 'audit-logs',
        where: { action: { equals: 'jobs.pause' } },
        sort: ['createdAt'],
        limit: 0,
        page: 1,
      })
      expect(docs).toHaveLength(1)
    } finally {
      await withAudit.destroy()
    }
  })

  it('is for admins and roles given it; only admins change jobs', async () => {
    expect((await call('/admin/jobs', 'GET', 'ops@x.co')).status).toBe(403)
    expect((await call('/admin/jobs', 'GET', 'nobody')).status).toBe(401)
    const schema = (await call('/admin/ui/schema', 'GET', 'ops@x.co')).json as AdminSchema
    expect(schema.views.jobs).toBe(false)

    // A role given Settings → Jobs sees it, but can't pause or reschedule.
    await call('/admin/roles', 'POST', 'admin@x.co', {
      key: 'ops',
      name: 'Ops',
      permissions: { collections: {}, admin: ['jobs'] },
    })
    const ops = await cms.find('users', { where: { email: { equals: 'ops@x.co' } } })
    await cms.update('users', ops.docs[0]?.id as number, { role: 'ops' })
    const seen = await call('/admin/jobs', 'GET', 'ops@x.co')
    expect(seen.status).toBe(200)
    expect((seen.json as AdminJobs).canChange).toBe(false)
    expect((await call('/admin/jobs/run', 'POST', 'ops@x.co')).status).toBe(200)
    expect((await call('/admin/jobs/feed', 'PATCH', 'ops@x.co', { paused: true })).status).toBe(403)
    expect(
      ((await call('/admin/ui/schema', 'GET', 'ops@x.co')).json as AdminSchema).views.jobs,
    ).toBe(true)
  })
})

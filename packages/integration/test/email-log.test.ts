import {
  type AdminEmailLog,
  createRestHandler,
  defineConfig,
  type EmailAdapter,
  type EmailMessage,
  type RestHandler,
} from '@easy-cms/core'
import { afterEach, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

/** The log of emails sent (Settings → Email): who, what kind and how it went, never the content. */
const sent: EmailMessage[] = []
let failing = false
const adapter: EmailAdapter = {
  name: 'test-mail',
  from: 'site@x.co',
  async send(message) {
    if (failing) throw new Error('SMTP down')
    sent.push(message)
  },
}

let cms: Awaited<ReturnType<typeof open>>
let handle: RestHandler
const token: Record<string, string> = {}

async function setup(emailLog?: false | { keepDays?: number }) {
  sent.length = 0
  failing = false
  cms = await open(
    defineConfig({
      secret: SECRET,
      db: db(),
      email: adapter,
      ...(emailLog !== undefined ? { emailLog } : {}),
      collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
    }),
  )
  handle = createRestHandler(cms)
  for (const [email, role] of [
    ['admin@x.co', 'admin'],
    ['editor@x.co', 'editor'],
  ] as const) {
    await cms.create('users', { email, password: 'password123', role })
    token[role] = (await cms.auth.login({ email, password: 'password123' })).token
  }
}
afterEach(() => cms?.destroy())

const log = async (query = '', who = 'admin') =>
  handle(
    new Request(`http://cms.test/api/cms/admin/email/log${query}`, {
      headers: { authorization: `Bearer ${token[who]}` },
    }),
  )
const entries = async (query = '') => (await (await log(query)).json()) as AdminEmailLog

describe('email log', () => {
  it('logs each email sent, without its content, and never sends the tag', async () => {
    await setup()
    await cms.sendEmail({
      to: ['a@x.co', 'b@x.co'],
      cc: 'c@x.co',
      bcc: ['d@x.co', 'e@x.co'],
      subject: 'Your order',
      html: '<p>secret link</p>',
      tag: 'order:paid',
    })
    await cms.flushEmails()
    expect(sent).toHaveLength(1)
    expect(sent[0]).not.toHaveProperty('tag')
    expect(Object.keys(sent[0] ?? {}).some((k) => k.startsWith('$'))).toBe(false)
    const { docs, tags, enabled, keepDays } = await entries()
    expect({ enabled, keepDays, tags }).toEqual({
      enabled: true,
      keepDays: 30,
      tags: ['order:paid'],
    })
    expect(docs[0]).toMatchObject({
      to: 'a@x.co, b@x.co',
      cc: 'c@x.co',
      bcc: 2,
      subject: 'Your order',
      tag: 'order:paid',
      state: 'sent',
      attempts: 1,
      adapter: 'test-mail',
      sentAt: expect.any(String),
    })
    expect(JSON.stringify(docs[0])).not.toContain('secret link')
  })

  it('follows an email through its retries until it is sent', async () => {
    await setup()
    failing = true
    await cms.sendEmail({ to: 'a@x.co', subject: 'Hello' })
    await cms.flushEmails()
    expect((await entries()).docs[0]).toMatchObject({
      state: 'pending',
      attempts: 1,
      error: 'SMTP down',
    })
    failing = false
    await cms.runJobs(new Date(Date.now() + 2 * 60_000))
    expect((await entries()).docs[0]).toMatchObject({ state: 'sent', attempts: 2, error: null })
  })

  it('tags the emails Easy CMS sends, and narrows the log by state, kind and words', async () => {
    await setup()
    const user = await cms.find('users', { where: { email: { equals: 'editor@x.co' } } })
    await cms.auth.sendPasswordLink(user.docs[0]?.id as number, { origin: 'http://cms.test' })
    await cms.sendEmail({ to: 'z@x.co', subject: 'Weekly news', tag: 'news' })
    await cms.flushEmails()
    expect((await entries()).tags).toEqual(['news', 'password-reset'])
    expect((await entries('?tag=password-reset')).docs.map((d) => d.to)).toEqual(['editor@x.co'])
    expect((await entries('?q=weekly')).docs.map((d) => d.subject)).toEqual(['Weekly news'])
    expect((await entries('?state=failed')).docs).toEqual([])
    expect((await log('', 'editor')).status).toBe(403)
  })

  it('keeps entries for keepDays', async () => {
    await setup({ keepDays: 7 })
    await cms.sendEmail({ to: 'a@x.co', subject: 'Old' })
    await cms.flushEmails()
    await cms.runJobs(new Date(Date.now() + 6 * 86_400_000))
    expect((await entries()).docs).toHaveLength(1)
    await cms.runJobs(new Date(Date.now() + 8 * 86_400_000))
    expect((await entries()).docs).toHaveLength(0)
  })

  it('keeps nothing with emailLog: false', async () => {
    await setup(false)
    await cms.sendEmail({ to: 'a@x.co', subject: 'Unlogged' })
    await cms.flushEmails()
    expect(sent).toHaveLength(1)
    expect(await entries()).toMatchObject({ enabled: false, docs: [] })
  })
})

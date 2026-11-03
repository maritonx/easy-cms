import { createRestHandler, defineConfig } from '@easy-cms/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db, open, SECRET } from './helpers.js'

// A list as CSV (#89).

const config = defineConfig({
  secret: SECRET,
  db: db(),
  timeZone: 'Asia/Bangkok',
  audit: true,
  collections: [
    {
      slug: 'pages',
      labels: { singular: { en: 'Page', th: 'หน้า' } },
      useAsTitle: 'title',
      fields: [{ name: 'title', type: 'text' }],
    },
    {
      slug: 'posts',
      useAsTitle: 'title',
      drafts: true,
      fields: [
        { name: 'title', type: 'text', label: { en: 'Title', th: 'ชื่อเรื่อง' } },
        {
          name: 'kind',
          type: 'select',
          options: [{ label: { en: 'News', th: 'ข่าว' }, value: 'news' }, 'other'],
        },
        { name: 'publishedAt', type: 'date' },
        { name: 'featured', type: 'boolean' },
        { name: 'related', type: 'relationship', to: ['posts', 'pages'], hasMany: true },
        { name: 'body', type: 'richText' },
        { name: 'note', type: 'text', access: { read: ({ user }) => user?.role === 'admin' } },
      ],
    },
    { slug: 'secrets', admin: { export: false }, fields: [{ name: 'x', type: 'text' }] },
  ],
})

type CMS = Awaited<ReturnType<typeof open<typeof config>>>
let cms: CMS
const tokens: Record<string, string> = {}

beforeAll(async () => {
  cms = await open(config)
  for (const [email, role] of [
    ['admin@x.co', 'admin'],
    ['ed@x.co', 'editor'],
  ] as const) {
    await cms.create('users', { email, password: 'password123', role })
    tokens[email] = (await cms.auth.login({ email, password: 'password123' })).token
  }
  const page = await cms.create('pages', { title: 'About' })
  const first = await cms.create('posts', {
    title: '=cmd|calc',
    kind: 'news',
    publishedAt: '2026-11-03T07:05:00.000Z',
    featured: true,
    note: 'internal',
    body: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello, "world"' }] }],
    },
    status: 'published',
  })
  await cms.create('posts', {
    title: 'Second',
    kind: 'other',
    related: [
      { relationTo: 'pages', value: page.id },
      { relationTo: 'posts', value: first.id },
    ],
    status: 'published',
  })
})
afterAll(() => cms.destroy())

async function csv(query: string, who = 'admin@x.co') {
  const res = await createRestHandler(cms)(
    new Request(`http://cms.test/api/cms/${query}`, {
      headers: { authorization: `Bearer ${tokens[who]}` },
    }),
  )
  const bytes = new Uint8Array(await res.arrayBuffer())
  // `text`: without the byte order mark, which TextDecoder drops.
  return { res, bytes, text: new TextDecoder().decode(bytes) }
}

describe('export to CSV (#89)', () => {
  it('writes a header and every matching document, with a BOM for Excel', async () => {
    const { res, bytes, text } = await csv('posts/export.csv?sort=title&lang=th')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('content-disposition')).toMatch(
      /^attachment; filename="posts-\d{4}-\d{2}-\d{2}\.csv"$/,
    )
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const [header, ...rows] = text.trimEnd().split('\r\n')
    expect(header).toBe(
      'ID,ชื่อเรื่อง,kind,publishedAt,featured,related,body,note,สถานะ,สร้างเมื่อ,แก้ไขเมื่อ',
    )
    expect(rows).toHaveLength(2)
    // A formula is defused; select labels, dates in the config's time zone, rich text as text.
    expect(rows[0]).toContain(
      `'=cmd|calc,ข่าว,2026-11-03T14:05:00+07:00,true,,"Hello, ""world""",internal,published`,
    )
    // Several collections: "Page · About"; lists joined with "; ".
    expect(rows[1]).toContain('Second,other,,,หน้า · About; posts · =cmd|calc')
  })

  it('takes the columns asked for, field names as headers, the selection and the filters', async () => {
    const { text } = await csv(
      'posts/export.csv?columns=title,kind&headers=names&where[kind][equals]=news',
    )
    expect(text.trimEnd().split('\r\n')).toEqual([
      'id,title,kind',
      expect.stringMatching(/^\d+,'=cmd\|calc,News$/),
    ])
    const ids = (await cms.find('posts', { where: { title: { equals: 'Second' } } })).docs.map(
      (d) => d.id,
    )
    const picked = await csv(`posts/export.csv?columns=title&ids=${ids.join(',')}`)
    expect(picked.text.trimEnd().split('\r\n')).toEqual(['ID,Title', `${ids[0]},Second`])
  })

  it('leaves out fields the user may not read, and refuses when export is off', async () => {
    const { text } = await csv('posts/export.csv', 'ed@x.co')
    expect(text.split('\r\n')[0]).not.toContain('note')
    expect((await csv('secrets/export.csv')).res.status).toBe(403)
  })

  it('records the export in the audit log', async () => {
    const entries = await cms.audit.list({ action: 'export' } as never)
    expect((entries as unknown as { docs: { target: string }[] }).docs[0]).toMatchObject({
      target: 'posts',
    })
  })
})

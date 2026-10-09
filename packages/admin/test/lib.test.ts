import { ADMIN_ICONS, type AdminField } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { toQuery } from '../app/src/lib/api'
import {
  errorsUnder,
  fromLocalInput,
  initialValues,
  titleOf,
  toFormValues,
  toLocalInput,
} from '../app/src/lib/fields'
import { extensionOf, fileKind } from '../app/src/lib/filetypes'
import { humanize, label, setLocale, singularize, t } from '../app/src/lib/i18n'
import { ICON_NAMES } from '../app/src/lib/icons'
import { menuOrder } from '../app/src/lib/menu'
import { decodeText, parseCsv } from '../app/src/lib/text-preview'
import { initials, textOn } from '../app/src/lib/theme'
import { inLocale, missingLocales } from '../app/src/lib/translation'

const fields: AdminField[] = [
  { name: 'title', type: 'text', required: true },
  { name: 'count', type: 'number', defaultValue: 3 },
  { name: 'flag', type: 'boolean' },
  { name: 'tags', type: 'select', hasMany: true, options: [{ label: 'A', value: 'a' }] },
  { name: 'author', type: 'relationship', to: 'users' },
  { name: 'related', type: 'relationship', to: 'posts', hasMany: true },
  { name: 'seo', type: 'group', fields: [{ name: 'title', type: 'text' }] },
  { name: 'rows', type: 'array', fields: [{ name: 'x', type: 'text' }] },
]

describe('form values', () => {
  it('builds initial values with defaults and empty containers', () => {
    expect(initialValues(fields)).toEqual({
      title: null,
      count: 3,
      flag: false,
      tags: [],
      author: null,
      related: [],
      seo: { title: null },
      rows: [],
    })
  })

  it('turns populated documents into form values and drops unknown keys', () => {
    const values = toFormValues(fields, {
      id: 1,
      createdAt: 'x',
      title: 'T',
      author: { id: 7, email: 'a@b.co' },
      related: [{ id: 2 }, 3],
      rows: [{ id: 'r1', x: 'y', extra: true }],
    })
    expect(values).toEqual({
      title: 'T',
      count: null,
      flag: false,
      tags: [],
      author: 7,
      related: [2, 3],
      seo: { title: null },
      rows: [{ id: 'r1', x: 'y' }],
    })
  })

  it('converts between ISO and datetime-local in local time', () => {
    const iso = '2026-01-02T03:04:00.000Z'
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso)
    expect(toLocalInput(null)).toBe('')
    expect(fromLocalInput('')).toBeNull()
  })

  it('counts errors under a path', () => {
    expect(errorsUnder({ rows: ['x'], 'rows.0.x': ['y'], rowsOther: ['z'] }, 'rows')).toBe(2)
  })

  it('titles documents by useAsTitle or id', () => {
    const collection = {
      slug: 'p',
      drafts: false,
      versions: false,
      preview: false,
      schedule: false,
      fields: [],
      useAsTitle: 'title',
      permissions: { read: true, create: true, update: true, delete: true, publish: true },
    }
    expect(titleOf(collection, { id: 1, title: 'Hi' })).toBe('Hi')
    expect(titleOf(collection, { id: 1, title: '' })).toBe('#1')
    expect(titleOf(undefined, { id: 5 })).toBe('#5')
  })
})

describe('toQuery', () => {
  it('builds bracket parameters and skips empty values', () => {
    expect(
      toQuery({
        where: { title: { like: 'a b' }, id: { in: [1, 2] } },
        limit: 10,
        q: '',
        x: undefined,
      }),
    ).toBe(
      '?where[title][like]=a%20b&where[id][in][0]=1&where[id][in][1]=2&limit=10'
        .replace(/\[/g, '%5B')
        .replace(/\]/g, '%5D'),
    )
    expect(toQuery({})).toBe('')
  })
})

describe('i18n', () => {
  it('translates with parameters and switches language', () => {
    setLocale('en')
    expect(t('list.selected', { count: 3 })).toBe('3 selected')
    setLocale('th')
    expect(t('list.selected', { count: 3 })).toBe('เลือกแล้ว 3 รายการ')
    expect(document.documentElement.lang).toBe('th')
    setLocale('en')
  })

  it('resolves labels per locale with fallbacks', () => {
    setLocale('th')
    expect(label({ en: 'Title', th: 'ชื่อเรื่อง' }, 'title')).toBe('ชื่อเรื่อง')
    expect(label({ en: 'Only English' }, 'x')).toBe('Only English')
    setLocale('en')
    expect(label('Plain', 'x')).toBe('Plain')
    expect(label(undefined, 'publishedAt')).toBe('Published at')
  })

  it('humanizes and singularizes slugs', () => {
    expect(humanize('site-settings')).toBe('Site settings')
    expect(['posts', 'categories', 'users', 'boxes', 'status', 'news'].map(singularize)).toEqual([
      'post',
      'category',
      'user',
      'box',
      'status',
      'new',
    ])
  })
})

describe('theme', () => {
  it('picks readable text on the brand color', () => {
    expect(textOn('#0f766e')).toBe('#ffffff')
    expect(textOn('#1d4ed8')).toBe('#ffffff')
    expect(textOn('#facc15')).toBe('#18181b')
    expect(textOn('#ffffff')).toBe('#18181b')
  })

  it('makes avatar initials from a name or an email', () => {
    expect(initials('ada.lovelace@example.com')).toBe('AL')
    expect(initials('admin@example.com')).toBe('AD')
    expect(initials('สมชาย')).toBe('สม')
    expect(initials(undefined)).toBe('?')
  })

  it('has a menu icon for every name the config accepts', () => {
    expect([...ICON_NAMES].sort()).toEqual([...ADMIN_ICONS].sort())
  })
})

describe('menu order', () => {
  const list = ['users', 'media', 'categories', 'posts', 'pages'].map((slug) => ({ slug }))
  const slugs = (items: { slug: string }[]) => items.map((i) => i.slug)

  it('keeps config order, with the media library last', () => {
    expect(slugs(menuOrder(list))).toEqual(['users', 'categories', 'posts', 'pages', 'media'])
  })

  it("follows the menu's order, groups included", () => {
    const nav = [
      { kind: 'collection', slug: 'posts' },
      {
        kind: 'group',
        id: 'content',
        label: 'Content',
        items: [
          { kind: 'collection', slug: 'categories' },
          { kind: 'page', path: 'stats' },
        ],
      },
      { kind: 'collection', slug: 'media' },
    ] as never
    expect(slugs(menuOrder(list, nav))).toEqual(['posts', 'categories', 'media', 'users', 'pages'])
  })
})

describe('translations', () => {
  const localizedFields: AdminField[] = [
    { name: 'title', type: 'text', localized: true },
    { name: 'body', type: 'richText', localized: true },
    { name: 'slug', type: 'slug' },
  ]
  const empty = { type: 'doc', content: [{ type: 'paragraph' }] }
  const filled = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }],
  }

  it('finds the locales a document still needs', () => {
    const doc = {
      title: { th: 'สวัสดี', en: 'Hello', ja: null },
      body: { th: filled, en: empty, ja: null },
      slug: 'hi',
    }
    expect(missingLocales(localizedFields, doc, ['th', 'en', 'ja'], 'th')).toEqual(['en', 'ja'])
    // Fields empty in the default locale don't count.
    const short = { title: { th: 'สวัสดี', en: 'Hello' }, body: { th: empty, en: null } }
    expect(missingLocales(localizedFields, short, ['th', 'en'], 'th')).toEqual([])
  })

  it('shows a document in one locale', () => {
    expect(inLocale(localizedFields, { title: { th: 'ก', en: 'A' }, slug: 'a' }, 'en')).toEqual({
      title: 'A',
      slug: 'a',
    })
  })
})

describe('file types and text previews', () => {
  it('names a file kind from its type', () => {
    expect(fileKind('application/pdf')).toBe('pdf')
    expect(fileKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(
      'sheet',
    )
    expect(fileKind('text/csv')).toBe('sheet')
    expect(fileKind('video/webm')).toBe('video')
    expect(fileKind('audio/mpeg')).toBe('audio')
    expect(fileKind('application/x-unknown')).toBe('file')
    expect(fileKind(undefined)).toBe('file')
    expect(extensionOf('รายงาน-1a2b3c4d.docx')).toBe('DOCX')
    expect(extensionOf('noextension')).toBe('')
  })

  it("parses CSV with quotes, and Excel's semicolons", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ])
    expect(parseCsv('name;price\r\nชา;30')).toEqual([
      ['name', 'price'],
      ['ชา', '30'],
    ])
  })

  it('decodes UTF-8, UTF-16 and Thai Windows-874 text', () => {
    expect(decodeText(new TextEncoder().encode('สวัสดี'))).toBe('สวัสดี')
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe('A')
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x41, 0x00]))).toBe('A')
    // "สวัสดี" in Windows-874.
    expect(decodeText(new Uint8Array([0xca, 0xc7, 0xd1, 0xca, 0xb4, 0xd5]))).toBe('สวัสดี')
  })
})

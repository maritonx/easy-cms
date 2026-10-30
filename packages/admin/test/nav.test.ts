import type { AdminNavNode, AdminSchema } from '@easy-cms/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { setLocale } from '../app/src/lib/i18n'
import { filterNav, groupForPath, HOME, itemCount, railGroups } from '../app/src/lib/nav'
import { session } from '../app/src/lib/session'

const collection = (slug: string, plural: string) => ({
  slug,
  labels: { plural },
  fields: [],
  permissions: {},
})

const nav: AdminNavNode[] = [
  {
    kind: 'group',
    id: 'content',
    label: 'Content',
    items: [
      { kind: 'collection', slug: 'posts' },
      { kind: 'collection', slug: 'pages' },
    ],
  },
  { kind: 'view', view: 'calendar' },
  { kind: 'collection', slug: 'media' },
  {
    kind: 'group',
    id: 'settings',
    label: 'Settings',
    items: [
      {
        kind: 'group',
        id: 'settings.site',
        label: 'Site',
        items: [{ kind: 'global', slug: 'site' }],
      },
      {
        kind: 'group',
        id: 'settings.people',
        label: 'Users & access',
        items: [
          { kind: 'collection', slug: 'users' },
          { kind: 'view', view: 'roles' },
        ],
      },
    ],
  },
]

beforeEach(() => {
  setLocale('en')
  session.schema = {
    collections: [
      collection('posts', 'Posts'),
      collection('pages', 'Pages'),
      collection('media', 'Media'),
      collection('users', 'Users'),
    ],
    globals: [{ slug: 'site', label: 'Site', fields: [] }],
    pages: [],
    nav,
  } as unknown as AdminSchema
})

describe('the rail', () => {
  it('puts items in no group under Home, then one icon per group', () => {
    expect(railGroups.value.map((g) => g.id)).toEqual([HOME, 'content', 'settings'])
    expect(railGroups.value[0]?.nodes).toEqual([
      { kind: 'view', view: 'calendar' },
      { kind: 'collection', slug: 'media' },
    ])
  })

  it('finds the group of a page: its outermost one, or Home', () => {
    expect(groupForPath('/')).toBe(HOME)
    expect(groupForPath('/collections/posts/12')).toBe('content')
    expect(groupForPath('/collections/media')).toBe(HOME)
    expect(groupForPath('/roles')).toBe('settings')
    expect(groupForPath('/account')).toBeNull()
  })
})

describe('the panel', () => {
  it('counts the items of a group, its groups included', () => {
    expect(itemCount(nav)).toBe(7)
  })

  it('filters by name, keeping the groups that still hold a match', () => {
    const settings = nav[3] as Extract<AdminNavNode, { kind: 'group' }>
    expect(filterNav(settings.items, ' us')).toEqual([
      {
        kind: 'group',
        id: 'settings.people',
        label: 'Users & access',
        items: [{ kind: 'collection', slug: 'users' }],
      },
    ])
    expect(filterNav(settings.items, 'nothing')).toEqual([])
    expect(filterNav(settings.items, '  ')).toEqual(settings.items)
  })
})

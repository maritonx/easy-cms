import type { AdminField } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import {
  conditionOf,
  dayOf,
  dayStart,
  filterFields,
  readCondition,
  readConditions,
  today,
  whereOf,
  writeConditions,
} from '../app/src/lib/list-filters'

const fields = [
  { name: 'title', type: 'text' },
  { name: 'views', type: 'number' },
  { name: 'publishedAt', type: 'date' },
  { name: 'featured', type: 'boolean' },
  { name: 'tags', type: 'select', hasMany: true, options: [{ label: 'News', value: 'news' }] },
  { name: 'author', type: 'relationship', to: 'authors' },
  { name: 'body', type: 'richText' },
  { name: 'layout', type: 'blocks' },
  { name: 'internal', type: 'text', noFilter: true },
  { name: 'seo', type: 'group', fields: [{ name: 'title', type: 'text' }] },
] as AdminField[]

describe('list filters (#88)', () => {
  it('offers readable fields by path, groups included, not lists, rich text or noFilter', () => {
    expect(filterFields(fields).map((f) => f.path)).toEqual([
      'title',
      'views',
      'publishedAt',
      'featured',
      'tags',
      'author',
      'seo.title',
      'createdAt',
      'updatedAt',
    ])
  })

  it('makes REST operators, and reads them back', () => {
    const cases = [
      ['title', 'text', 'contains', ['news'], { like: 'news' }],
      ['title', 'text', 'empty', [], { exists: false }],
      ['views', 'number', 'gte', ['10'], { gte: '10' }],
      ['views', 'number', 'between', ['10', '20'], { gte: '10', lte: '20' }],
      ['featured', 'boolean', 'no', [], { equals: false }],
      ['tags', 'select', 'anyOf', ['news', 'guide'], { in: ['news', 'guide'] }],
      ['tags', 'select', 'noneOf', ['news'], { not_in: ['news'] }],
      ['author', 'relation', 'anyOf', ['3', '7'], { in: ['3', '7'] }],
    ] as const
    for (const [field, kind, op, values, ops] of cases) {
      const condition = conditionOf(field, kind, op, values)
      expect(condition).toEqual({ field, ops })
      expect(readCondition(condition as never, kind)).toEqual({ op, values: [...values] })
    }
    // A value is needed.
    expect(conditionOf('title', 'text', 'contains', [''])).toBeNull()
    expect(conditionOf('views', 'number', 'between', ['1', ''])).toBeNull()
  })

  it('filters dates by whole days in the time zone', () => {
    const tz = 'Asia/Bangkok' // UTC+7
    expect(dayStart('2026-10-30', tz)).toBe('2026-10-29T17:00:00.000Z')
    expect(dayStart('2026-10-30', 'UTC')).toBe('2026-10-30T00:00:00.000Z')
    // Across a change of daylight saving time: 1 November 2026 in New York starts at UTC−4.
    expect(dayStart('2026-11-01', 'America/New_York')).toBe('2026-11-01T04:00:00.000Z')
    expect(dayStart('2026-11-02', 'America/New_York')).toBe('2026-11-02T05:00:00.000Z')
    expect(dayOf('2026-10-29T17:30:00.000Z', tz)).toBe('2026-10-30')

    const before = conditionOf('publishedAt', 'date', 'before', ['2026-10-30'], tz)
    expect(before?.ops).toEqual({ lt: '2026-10-29T17:00:00.000Z' })
    const after = conditionOf('publishedAt', 'date', 'after', ['2026-10-30'], tz)
    expect(after?.ops).toEqual({ gte: '2026-10-30T17:00:00.000Z' })
    const between = conditionOf('publishedAt', 'date', 'between', ['2026-10-01', '2026-10-31'], tz)
    expect(between?.ops).toEqual({
      gte: '2026-09-30T17:00:00.000Z',
      lt: '2026-10-31T17:00:00.000Z',
    })
    const on = conditionOf('publishedAt', 'date', 'on', ['2026-10-30'], tz)
    for (const [condition, read] of [
      [before, { op: 'before', values: ['2026-10-30'] }],
      [after, { op: 'after', values: ['2026-10-30'] }],
      [between, { op: 'between', values: ['2026-10-01', '2026-10-31'] }],
      [on, { op: 'on', values: ['2026-10-30'] }],
    ] as const)
      expect(readCondition(condition as never, 'date', tz)).toEqual(read)

    // "Last 7 days" is worked out when chosen: a day, not "7 days ago" kept for later.
    expect(today(tz, -7, new Date('2026-10-30T20:00:00Z'))).toBe('2026-10-24')
  })

  it('keeps conditions in the URL as the REST API reads them, and back', () => {
    const conditions = [
      { field: 'views', ops: { gte: '10' } },
      { field: 'tags', ops: { in: ['news', 'guide'] } },
      { field: 'seo.title', ops: { like: 'x' } },
    ]
    const query = writeConditions(conditions, { page: '2', status: 'draft', f_form: '3' })
    expect(query).toEqual({
      status: undefined,
      f_form: undefined,
      'where[and][0][views][gte]': '10',
      'where[and][1][tags][in]': 'news,guide',
      'where[and][2][seo.title][like]': 'x',
    })
    const defined = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined))
    expect(readConditions(defined)).toEqual(conditions)
    expect(whereOf(conditions)).toEqual([
      { views: { gte: '10' } },
      { tags: { in: ['news', 'guide'] } },
      { 'seo.title': { like: 'x' } },
    ])
  })

  it('reads the older ?status= and ?f_<field>= links', () => {
    expect(readConditions({ status: 'draft', f_form: '3', q: 'x' })).toEqual([
      { field: 'status', ops: { equals: 'draft' } },
      { field: 'form', ops: { equals: '3' } },
    ])
    // Shown, and edited, as "is any of" one document.
    expect(readCondition({ field: 'form', ops: { equals: '3' } }, 'relation')).toEqual({
      op: 'anyOf',
      values: ['3'],
    })
    // A condition in the new form wins over an old key for the same field.
    expect(
      readConditions({ 'where[and][0][status][equals]': 'published', status: 'draft' }),
    ).toEqual([{ field: 'status', ops: { equals: 'published' } }])
  })
})

import type { AuthUser, RequestContext, Where } from '../access.js'
import { FieldAccessChecker } from '../access-control.js'
import type { CollectionConfig } from '../config.js'
import { csvCell } from '../csv.js'
import { ForbiddenError, QueryError } from '../errors.js'
import {
  type Field,
  isPolymorphic,
  type Label,
  polymorphicValue,
  relationTargets,
} from '../fields.js'
import type { EasyCMS } from '../local-api.js'
import { richText } from '../search.js'

// A list as CSV (#89): `GET <api>/:collection/export.csv`, read in steps by cursor and streamed.

/** More rows than this: filter further. */
export const EXPORT_MAX = 100_000
const STEP = 500

type Data = Record<string, unknown>

export interface ExportOptions {
  readonly user: AuthUser | null
  readonly context: RequestContext
  readonly locale?: string
  readonly fallbackLocale?: boolean
  readonly draft: boolean
  readonly where?: Where
  readonly sort?: string[]
}

/** A column of the file: a field, or one of the document's own values. */
interface Column {
  readonly key: string
  readonly label: Label
  readonly field?: Field
}

const SYSTEM: Record<string, Label> = {
  id: 'ID',
  status: { en: 'Status', th: 'สถานะ' },
  createdAt: { en: 'Created', th: 'สร้างเมื่อ' },
  updatedAt: { en: 'Updated', th: 'แก้ไขเมื่อ' },
}

const text = (label: Label | undefined, fallback: string, lang: string) =>
  label === undefined
    ? fallback
    : typeof label === 'string'
      ? label
      : (label[lang] ?? label.en ?? Object.values(label)[0] ?? fallback)

/** `2026-11-03T14:05:00+07:00`: an instant in the config's time zone (UTC without one). */
export function isoInZone(value: string, timeZone: string | undefined): string {
  const date = new Date(value)
  if (!timeZone || Number.isNaN(date.getTime())) return value
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  )
  const local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
  const offset = Math.round((Date.parse(`${local}Z`) - date.getTime()) / 60_000)
  const sign = offset < 0 ? '-' : '+'
  const abs = Math.abs(offset)
  return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

/** The text of a field's value in a cell. */
function cellOf(
  cms: EasyCMS,
  field: Field | undefined,
  value: unknown,
  key: string,
  lang: string,
): unknown {
  if (value === null || value === undefined) return ''
  const timeZone = cms.config.timeZone
  if (!field)
    return key === 'createdAt' || key === 'updatedAt' ? isoInZone(String(value), timeZone) : value
  const titleOf = (slug: string, doc: unknown) => {
    if (!doc || typeof doc !== 'object') return String(doc)
    const d = doc as Data
    if (slug === 'media' && typeof d.url === 'string') return d.url
    const collection = cms.config.collections.find((c) => c.slug === slug)
    const title = collection?.useAsTitle ? d[collection.useAsTitle] : undefined
    return typeof title === 'string' && title !== '' ? title : String(d.id ?? '')
  }
  switch (field.type) {
    case 'date':
      return isoInZone(String(value), timeZone)
    case 'boolean':
      return value ? 'true' : 'false'
    case 'select': {
      const label = (v: unknown) => {
        const option = field.options.find((o) => (typeof o === 'string' ? o : o.value) === v)
        return option === undefined || typeof option === 'string'
          ? String(v)
          : text(option.label, String(v), lang)
      }
      return Array.isArray(value) ? value.map(label).join('; ') : label(value)
    }
    case 'richText':
      return richText(value)
    case 'relationship':
    case 'upload': {
      const one = (item: unknown) => {
        if (isPolymorphic(field)) {
          const pair = polymorphicValue(item)
          if (!pair) return ''
          const collection = cms.config.collections.find((c) => c.slug === pair.relationTo)
          const name = text(collection?.labels?.singular, pair.relationTo, lang)
          return `${name} · ${titleOf(pair.relationTo, pair.value)}`
        }
        return titleOf(relationTargets(field)[0] as string, item)
      }
      return Array.isArray(value) ? value.map(one).join('; ') : one(value)
    }
    default:
      return value
  }
}

/**
 * The columns: `id` first, then the ones asked for (`columns=title,author,updatedAt`), or every
 * field the user may read and the document's own values (`columns=all` or none).
 */
async function columnsOf(
  cms: EasyCMS,
  config: CollectionConfig,
  asked: readonly string[] | null,
  options: ExportOptions,
): Promise<Column[]> {
  const rules = await cms.roles.fieldRules(options.user)
  const read = new FieldAccessChecker(
    'read',
    { user: options.user, context: options.context },
    rules,
  )
  const readable: Field[] = []
  for (const field of config.fields)
    if (!field.hidden && field.name !== 'password' && (await read.allows(field)))
      readable.push(field)
  const system = [...(config.drafts ? ['status'] : []), 'createdAt', 'updatedAt']
  const of = (key: string): Column | undefined => {
    const field = readable.find((f) => f.name === key)
    if (field) return { key, label: field.label ?? key, field }
    return key in SYSTEM && (key !== 'status' || config.drafts)
      ? { key, label: SYSTEM[key] as Label }
      : undefined
  }
  const keys = asked ?? [...readable.map((f) => f.name), ...system]
  const columns = keys
    .filter((k) => k !== 'id')
    .map(of)
    .filter((c): c is Column => c !== undefined)
  return [{ key: 'id', label: SYSTEM.id as Label }, ...columns]
}

/** The file: a header row, then the documents, read `STEP` at a time. */
export async function exportCsv(
  cms: EasyCMS,
  slug: string,
  url: URL,
  options: ExportOptions,
): Promise<Response> {
  const config = cms.collection(slug)
  if (config.admin?.export === false)
    throw new ForbiddenError('Export is turned off for this collection')
  const q = url.searchParams
  const lang = q.get('lang') ?? 'en'
  const names = q.get('headers') === 'names'
  const columnsParam = q.get('columns')
  const asked =
    columnsParam && columnsParam !== 'all' ? columnsParam.split(',').filter(Boolean) : null
  const ids = q.get('ids')?.split(',').filter(Boolean)
  const where: Where | undefined = ids?.length
    ? { and: [...(options.where ? [options.where] : []), { id: { in: ids } }] }
    : options.where

  const read = {
    user: options.user,
    context: options.context,
    overrideAccess: false,
    draft: options.draft,
    ...(options.locale ? { locale: options.locale } : {}),
    ...(options.fallbackLocale === false ? { fallbackLocale: false } : {}),
  } as const
  const total = await cms.count(slug, { ...read, ...(where ? { where } : {}), max: EXPORT_MAX })
  if (total > EXPORT_MAX)
    throw new QueryError(
      `More than ${EXPORT_MAX.toLocaleString('en')} documents match: filter the list further`,
    )
  const columns = await columnsOf(cms, config, asked, options)
  const header = columns.map((c) => (names ? c.key : text(c.label, c.key, lang)))

  await cms.audit.record({
    action: 'export',
    target: slug,
    user: options.user,
    detail: { rows: total, columns: columns.map((c) => c.key) },
  })

  const encoder = new TextEncoder()
  let cursor: string | null = ''
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // A byte order mark: Excel reads the file as UTF-8 (Thai included).
      controller.enqueue(encoder.encode(`﻿${header.map(csvCell).join(',')}\r\n`))
    },
    async pull(controller) {
      if (cursor === null) {
        controller.close()
        return
      }
      try {
        const page = await cms.find(
          slug as never,
          {
            ...read,
            ...(where ? { where } : {}),
            ...(options.sort?.length ? { sort: options.sort } : {}),
            limit: STEP,
            depth: 1,
            cursor,
          } as never,
        )
        const lines = (page.docs as Data[]).map((doc) =>
          columns.map((c) => csvCell(cellOf(cms, c.field, doc[c.key], c.key, lang))).join(','),
        )
        if (lines.length) controller.enqueue(encoder.encode(`${lines.join('\r\n')}\r\n`))
        cursor = page.nextCursor ?? null
        if (cursor === null) controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })
  const day = new Date().toISOString().slice(0, 10)
  return new Response(stream, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${slug}-${day}.csv"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}

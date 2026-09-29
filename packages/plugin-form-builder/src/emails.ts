import type { EmailMessage } from '@easy-cms/core'
import { escapeHtml, renderRichText, richTextToPlainText } from '@easy-cms/richtext'
import type { FieldKind } from './shared.js'

type Row = Record<string, unknown>

/** Fields safe to repeat in an email to the submitter: short, not free text. */
const SHORT: readonly FieldKind[] = [
  'text',
  'email',
  'phone',
  'select',
  'number',
  'date',
  'checkbox',
]
const SHORT_LENGTH = 100
const PLACEHOLDER = /\{\{\s*([A-Za-z][A-Za-z0-9_]*|\*)\s*\}\}/g

export interface EmailContext {
  /** The form as read in the submission's locale. */
  readonly form: Row
  /** The form's field rows. */
  readonly fields: readonly Row[]
  /** The stored values. */
  readonly values: Readonly<Record<string, unknown>>
  readonly locale: string | null
  readonly defaultFrom: string | undefined
  readonly defaultTo: readonly string[]
}

/**
 * The emails to send for a submission, from the form's `emails` list. An email whose recipient
 * comes from the submission (`{{email}}`) is a confirmation to the submitter: it may repeat
 * only short fields and no `{{*}}`, so the form can't be used to send spam to anyone.
 */
export function buildEmails(context: EmailContext): EmailMessage[] {
  const { form, fields, values, locale } = context
  const rows = Array.isArray(form.emails) ? (form.emails as Row[]) : []
  const kindOf = new Map(fields.map((f) => [String(f.name ?? ''), f.blockType as FieldKind]))
  const out: EmailMessage[] = []
  for (const row of rows) {
    let toSubmitter = false
    const recipients: string[] = []
    for (const part of splitList(row.to)) {
      const field = /^\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}$/.exec(part)?.[1]
      if (field) {
        const value = values[field]
        if (kindOf.get(field) === 'email' && typeof value === 'string' && value) {
          recipients.push(value)
          toSubmitter = true
        }
      } else if (part.includes('@')) recipients.push(part)
    }
    if (splitList(row.to).length === 0) recipients.push(...context.defaultTo)
    if (recipients.length === 0) continue

    const fill = (template: string, html: boolean) =>
      template.replace(PLACEHOLDER, (_, name: string) => {
        if (name === '*') return toSubmitter ? '' : table(fields, values, locale, html)
        const kind = kindOf.get(name)
        if (!kind || (toSubmitter && !SHORT.includes(kind))) return ''
        let text = display(values[name], locale)
        if (toSubmitter) text = text.slice(0, SHORT_LENGTH)
        return html ? escapeHtml(text) : text
      })

    const title = String(form.title ?? '')
    const subjectTemplate =
      typeof row.subject === 'string' && row.subject.trim()
        ? row.subject
        : locale === 'th'
          ? `ข้อมูลใหม่จากฟอร์ม: ${title}`
          : `New submission: ${title}`
    const subject = fill(subjectTemplate, false)
      .replace(/[\r\n]+/g, ' ')
      .trim()

    const message = row.message as Parameters<typeof renderRichText>[0] | undefined
    const hasMessage = richTextToPlainText(message ?? null).trim() !== ''
    const fallback = toSubmitter ? thanks(locale) : '{{*}}'
    const html = hasMessage
      ? fill(renderRichText(message), true)
      : toSubmitter
        ? `<p>${escapeHtml(fallback)}</p>`
        : fill(fallback, true)
    // Placeholders left out (e.g. for the submitter) leave no trailing spaces.
    const text = (hasMessage ? fill(richTextToPlainText(message), false) : fill(fallback, false))
      .replace(/[ \t]+$/gm, '')
      .trim()

    const replyField = /^\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}$/.exec(
      String(row.replyTo ?? '').trim(),
    )?.[1]
    const replyTo = replyField
      ? kindOf.get(replyField) === 'email' && typeof values[replyField] === 'string'
        ? (values[replyField] as string)
        : undefined
      : typeof row.replyTo === 'string' && row.replyTo.includes('@')
        ? row.replyTo.trim()
        : undefined
    const from =
      typeof row.from === 'string' && row.from.trim() ? row.from.trim() : context.defaultFrom
    const cc = splitList(row.cc).filter((a) => a.includes('@') && !a.includes('{{'))
    const bcc = splitList(row.bcc).filter((a) => a.includes('@') && !a.includes('{{'))

    out.push({
      to: recipients,
      ...(cc.length ? { cc } : {}),
      ...(bcc.length ? { bcc } : {}),
      ...(from ? { from } : {}),
      ...(replyTo ? { replyTo } : {}),
      subject,
      html,
      text,
    })
  }
  return out
}

function splitList(value: unknown): string[] {
  return typeof value === 'string'
    ? value
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean)
    : []
}

function display(value: unknown, locale: string | null): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean')
    return locale === 'th' ? (value ? 'ใช่' : 'ไม่') : value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.map(String).join(', ')
  return String(value)
}

/** Every field with its value: a table in HTML, lines in text. */
function table(
  fields: readonly Row[],
  values: Readonly<Record<string, unknown>>,
  locale: string | null,
  html: boolean,
): string {
  const rows = fields
    .filter((f) => f.blockType !== 'message' && typeof f.name === 'string')
    .map((f) => {
      const label = (typeof f.label === 'string' && f.label) || String(f.name)
      return [label, display(values[String(f.name)], locale)] as const
    })
  if (!html) return rows.map(([label, value]) => `${label}: ${value}`).join('\n')
  const cells = rows
    .map(
      ([label, value]) =>
        `<tr><th align="left" style="padding:4px 12px 4px 0;vertical-align:top">${escapeHtml(label)}</th><td style="padding:4px 0;white-space:pre-wrap">${escapeHtml(value)}</td></tr>`,
    )
    .join('')
  return `<table cellpadding="0" cellspacing="0">${cells}</table>`
}

const thanks = (locale: string | null) =>
  locale === 'th' ? 'ขอบคุณ เราได้รับข้อมูลของคุณแล้ว' : 'Thank you, we received your submission.'

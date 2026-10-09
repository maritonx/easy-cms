import { readFile } from 'node:fs/promises'
import {
  type CollectionConfig,
  type Config,
  definePlugin,
  type EasyCMS,
  type Endpoint,
  type Field,
  type RequestContext,
  resolveAdminModule,
  type TypedPlugin,
} from '@easy-cms/core'
import { renderRichText } from '@easy-cms/richtext'
import { buildEmails } from './emails.js'
import { fieldBlocks } from './fields.js'
import { INFO } from './info.js'
import {
  type Confirmation,
  FIELD_KINDS,
  type FieldKind,
  type PublicField,
  type PublicForm,
} from './shared.js'
import { checkToken, formToken, honeypotName, rateKeys, verifyTurnstile } from './spam.js'
import { validateSubmission } from './validate.js'

type Row = Record<string, unknown>

export interface FormBuilderOptions {
  /** Field types editors can add. Default: all. */
  readonly fields?: readonly FieldKind[]
  /** Sender of form emails that don't set one. Default: the email adapter's `from`. */
  readonly defaultFrom?: string
  /** Recipients of form emails whose "To" is empty, e.g. the site owner. */
  readonly defaultTo?: string | readonly string[]
  /**
   * Submissions allowed per visitor (by IP address) and form in `window` seconds. Default
   * 5 in 600. `false` turns it off.
   */
  readonly rateLimit?: { readonly max?: number; readonly window?: number } | false
  /** Submissions sent sooner than this after the form loaded are treated as bots. Default 2000 ms. */
  readonly minSubmitTime?: number
  /** Cloudflare Turnstile, to check that visitors are people. Keys from the Cloudflare dashboard. */
  readonly turnstile?: { readonly siteKey: string; readonly secretKey: string }
  /** Delete submissions older than this many days. Default: keep them. */
  readonly retentionDays?: number
  /** Slugs of the two collections. Default `forms` and `form-submissions`. */
  readonly slugs?: { readonly forms?: string; readonly submissions?: string }
  /** For tests: the `fetch` for Turnstile. */
  readonly fetch?: typeof fetch
}

const ADMIN_MODULE = '@easy-cms/plugin-form-builder/admin'

/**
 * Forms editors build in the admin from field blocks, with submissions, email notifications and
 * spam protection. Pages render them with `<easy-form>` or the `getForm` / `submitForm` client.
 */
/** The forms and submissions collections, as the inferred document types see them. */
export type FormBuilderPluginTypes<F extends string, S extends string> = {
  readonly collections: readonly [
    {
      readonly slug: F
      readonly drafts: true
      readonly fields: readonly [
        { readonly name: 'title'; readonly type: 'text'; readonly required: true },
        { readonly name: 'slug'; readonly type: 'slug' },
        /** The form's field blocks (see `PublicForm` from the client for their shape). */
        { readonly name: 'fields'; readonly type: 'json' },
        { readonly name: 'submitLabel'; readonly type: 'text' },
        {
          readonly name: 'confirmationType'
          readonly type: 'select'
          readonly options: readonly ['message', 'redirect']
          readonly defaultValue: 'message'
        },
        { readonly name: 'confirmationMessage'; readonly type: 'richText' },
        { readonly name: 'redirectUrl'; readonly type: 'text' },
        {
          readonly name: 'emails'
          readonly type: 'array'
          readonly fields: readonly [
            { readonly name: 'to'; readonly type: 'text' },
            { readonly name: 'cc'; readonly type: 'text' },
            { readonly name: 'bcc'; readonly type: 'text' },
            { readonly name: 'replyTo'; readonly type: 'text' },
            { readonly name: 'from'; readonly type: 'text' },
            { readonly name: 'subject'; readonly type: 'text' },
            { readonly name: 'message'; readonly type: 'richText' },
          ]
        },
      ]
    },
    {
      readonly slug: S
      readonly fields: readonly [
        {
          readonly name: 'form'
          readonly type: 'relationship'
          readonly to: F
          readonly required: true
        },
        { readonly name: 'summary'; readonly type: 'text' },
        { readonly name: 'data'; readonly type: 'json' },
        { readonly name: 'locale'; readonly type: 'text' },
        { readonly name: 'page'; readonly type: 'text' },
      ]
    },
  ]
}

export function formBuilderPlugin<
  const F extends string = 'forms',
  const S extends string = 'form-submissions',
>(
  options: FormBuilderOptions & {
    readonly slugs?: { readonly forms?: F; readonly submissions?: S }
  } = {},
): TypedPlugin<FormBuilderPluginTypes<F, S>> {
  return definePlugin<FormBuilderPluginTypes<F, S>>((config: Config): Config => {
    const forms = options.slugs?.forms ?? 'forms'
    const submissions = options.slugs?.submissions ?? 'form-submissions'
    for (const slug of [forms, submissions])
      if (config.collections?.some((c) => c.slug === slug))
        throw new Error(`formBuilderPlugin: there is already a collection "${slug}"; set \`slugs\``)
    const kinds = options.fields ?? FIELD_KINDS
    const localized = !!config.localization
    const l = localized ? { localized: true } : {}
    const secret = config.secret
    const locales = config.localization?.locales ?? []
    const defaultLocale = config.localization?.defaultLocale ?? locales[0] ?? null
    const rate = options.rateLimit === false ? null : { max: 5, window: 600, ...options.rateLimit }
    const minTime = options.minSubmitTime ?? 2000
    const defaultTo =
      options.defaultTo === undefined
        ? []
        : typeof options.defaultTo === 'string'
          ? [options.defaultTo]
          : [...options.defaultTo]
    const loggedIn = ({ user }: { user: unknown }) => !!user

    const formFields: Field[] = [
      { name: 'title', type: 'text', required: true, label: { en: 'Title', th: 'ชื่อฟอร์ม' }, ...l },
      { name: 'slug', type: 'slug', from: 'title', label: { en: 'Slug', th: 'Slug' } },
      {
        name: 'fields',
        type: 'blocks',
        label: { en: 'Fields', th: 'ช่องกรอก' },
        blocks: fieldBlocks(localized, kinds),
        validate: (rows) => {
          const names = (Array.isArray(rows) ? (rows as Row[]) : [])
            .map((r) => r.name)
            .filter((n): n is string => typeof n === 'string' && n !== '')
          const twice = names.find((n, i) => names.indexOf(n) !== i)
          return twice ? `each field needs its own name: "${twice}" is used twice` : true
        },
      },
      {
        name: 'submitLabel',
        type: 'text',
        label: { en: 'Submit button', th: 'ปุ่มส่ง' },
        ...l,
      },
      {
        name: 'confirmationType',
        type: 'select',
        options: ['message', 'redirect'],
        defaultValue: 'message',
        label: { en: 'After sending', th: 'หลังส่ง' },
        position: 'sidebar',
      },
      {
        name: 'confirmationMessage',
        type: 'richText',
        label: { en: 'Confirmation message', th: 'ข้อความหลังส่ง' },
        ...l,
      },
      {
        name: 'redirectUrl',
        type: 'text',
        label: { en: 'Redirect to', th: 'ไปที่หน้า' },
        validate: (value) =>
          !value || /^(\/|https?:\/\/)/.test(String(value))
            ? true
            : 'must start with / or http(s)://',
      },
      {
        name: 'emails',
        type: 'array',
        label: { en: 'Emails', th: 'อีเมลแจ้งเตือน' },
        // Addresses stay with editors, never in the public API.
        access: { read: loggedIn },
        fields: [
          {
            name: 'to',
            type: 'text',
            label: {
              en: 'To (comma separated, or {{email}})',
              th: 'ถึง (คั่นด้วยจุลภาค หรือ {{email}})',
            },
          },
          { name: 'cc', type: 'text', label: { en: 'Cc', th: 'Cc' } },
          { name: 'bcc', type: 'text', label: { en: 'Bcc', th: 'Bcc' } },
          { name: 'replyTo', type: 'text', label: { en: 'Reply to', th: 'ตอบกลับถึง' } },
          { name: 'from', type: 'text', label: { en: 'From', th: 'จาก' } },
          { name: 'subject', type: 'text', label: { en: 'Subject', th: 'หัวเรื่อง' }, ...l },
          {
            name: 'message',
            type: 'richText',
            label: {
              en: 'Message ({{name}}, {{*}} for all fields)',
              th: 'ข้อความ ({{name}}, {{*}} คือทุกช่อง)',
            },
            ...l,
          },
        ],
      },
    ]

    const adminPath = `/${(config.admin?.path ?? '/admin').replace(/^\/+|\/+$/g, '')}`
    const formsCollection: CollectionConfig = {
      slug: forms,
      labels: { singular: { en: 'Form', th: 'ฟอร์ม' }, plural: { en: 'Forms', th: 'ฟอร์ม' } },
      icon: 'mail',
      useAsTitle: 'title',
      drafts: true,
      fields: formFields,
      admin: {
        group: 'forms',
        sidebar: [
          {
            tag: 'ecms-form-submissions',
            props: {
              submissions,
              adminPath,
              apiPath: (config.routes?.api ?? '/api/cms').replace(/\/+$/, ''),
            },
          },
        ],
      },
    }

    const submissionsCollection: CollectionConfig = {
      slug: submissions,
      labels: {
        singular: { en: 'Form submission', th: 'ข้อมูลที่ส่งจากฟอร์ม' },
        plural: { en: 'Form submissions', th: 'ข้อมูลที่ส่งจากฟอร์ม' },
      },
      icon: 'message-square',
      useAsTitle: 'summary',
      admin: { group: 'forms', count: false },
      // Only the form's public endpoint creates submissions, after validation and spam checks.
      access: {
        read: loggedIn,
        create: () => false,
        update: () => false,
        delete: ({ user }) => (user as { role?: string } | null)?.role === 'admin',
      },
      fields: [
        {
          name: 'form',
          type: 'relationship',
          to: forms,
          required: true,
          label: { en: 'Form', th: 'ฟอร์ม' },
        },
        { name: 'summary', type: 'text', label: { en: 'Summary', th: 'สรุป' } },
        { name: 'data', type: 'json', label: { en: 'Data', th: 'ข้อมูล' } },
        { name: 'locale', type: 'text', label: { en: 'Locale', th: 'ภาษา' }, position: 'sidebar' },
        { name: 'page', type: 'text', label: { en: 'Page', th: 'หน้า' }, position: 'sidebar' },
        // A hash of the IP address and the time window, for rate limits; never shown.
        {
          name: 'rateKey',
          type: 'text',
          index: true,
          access: { read: () => false, update: () => false },
        },
      ],
    }

    /**
     * The published form with this slug, in `locale`; with slugs unique per scope (e.g. per
     * tenant), the request's.
     */
    const findForm = async (
      cms: EasyCMS,
      slug: string,
      locale: string | null,
      context: RequestContext,
    ) => {
      const scope = await cms.uniqueScope(forms, 'slug', { context })
      const { docs } = await cms.find(forms, {
        where: {
          and: [
            { slug: { equals: slug } },
            ...Object.entries(scope).map(([name, value]) => ({ [name]: { equals: value } })),
          ],
        },
        limit: 1,
        depth: 0,
        ...(locale ? { locale } : {}),
      })
      return docs[0] as Row | undefined
    }
    const localeOf = (value: unknown) =>
      typeof value === 'string' && locales.includes(value) ? value : defaultLocale
    const rowsOf = (form: Row) => (Array.isArray(form.fields) ? (form.fields as Row[]) : [])
    const namesOf = (form: Row) => rowsOf(form).map((r) => String(r.name ?? ''))
    const confirmationOf = (form: Row, locale: string | null): Confirmation =>
      form.confirmationType === 'redirect' &&
      typeof form.redirectUrl === 'string' &&
      form.redirectUrl
        ? { type: 'redirect', url: form.redirectUrl }
        : {
            type: 'message',
            html:
              renderRichText(form.confirmationMessage as Parameters<typeof renderRichText>[0]) ||
              `<p>${locale === 'th' ? 'ขอบคุณ ส่งข้อมูลเรียบร้อยแล้ว' : 'Thank you, your message was sent.'}</p>`,
          }
    const fail = (status: number, errors: { message: string; field?: string }[]) =>
      Response.json({ errors }, { status, headers: { 'cache-control': 'no-store' } })

    const publicForm = (form: Row, slug: string, locale: string | null): PublicForm => ({
      slug,
      title: String(form.title ?? ''),
      fields: rowsOf(form).map((row): PublicField => {
        const kind = row.blockType as FieldKind
        const text = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
        const base = {
          kind,
          name: String(row.name ?? ''),
          label: text(row.label) ?? String(row.name ?? ''),
          required: row.required === true,
          width: row.width === 'half' ? ('half' as const) : ('full' as const),
        }
        switch (kind) {
          case 'message':
            return {
              ...base,
              name: '',
              label: '',
              html: renderRichText(row.content as Parameters<typeof renderRichText>[0]),
            }
          case 'checkbox':
            return { ...base, defaultValue: row.checked === true }
          case 'select':
            return {
              ...base,
              ...(text(row.placeholder) ? { placeholder: text(row.placeholder) as string } : {}),
              options: (Array.isArray(row.options) ? (row.options as Row[]) : []).map((o) => ({
                label: text(o.label) ?? String(o.value ?? ''),
                value: String(o.value ?? ''),
              })),
              multiple: row.multiple === true,
              display: row.display === 'radio' ? 'radio' : 'dropdown',
            }
          default:
            return {
              ...base,
              ...(text(row.placeholder) ? { placeholder: text(row.placeholder) as string } : {}),
              ...(text(row.defaultValue) ? { defaultValue: text(row.defaultValue) as string } : {}),
              ...(typeof row.min === 'number' ? { min: row.min } : {}),
              ...(typeof row.max === 'number' ? { max: row.max } : {}),
            }
        }
      }),
      submitLabel: String(form.submitLabel || (locale === 'th' ? 'ส่ง' : 'Send')),
      token: formToken(secret, slug),
      honeypot: honeypotName(namesOf(form)),
      turnstile: options.turnstile?.siteKey ?? null,
      locale,
    })

    const getEndpoint: Endpoint = {
      path: '/form/:slug',
      method: 'get',
      handler: async ({ params, url, cms, context }) => {
        const slug = params.slug as string
        const locale = localeOf(url.searchParams.get('locale'))
        const form = await findForm(cms, slug, locale, context)
        if (!form) return fail(404, [{ message: `No published form "${slug}"` }])
        return Response.json(publicForm(form, slug, locale), {
          // The token is fresh on every request.
          headers: { 'cache-control': 'no-store' },
        })
      },
    }

    const submitEndpoint: Endpoint = {
      path: '/form/:slug/submit',
      method: 'post',
      handler: async ({ params, json, ip, cms, context }) => {
        const slug = params.slug as string
        const body = await json()
        const locale = localeOf(body.locale)
        const form = await findForm(cms, slug, locale, context)
        if (!form) return fail(404, [{ message: `No published form "${slug}"` }])
        const confirmation = confirmationOf(form, locale)
        const reload =
          locale === 'th'
            ? 'ฟอร์มหมดอายุ โปรดโหลดหน้าใหม่แล้วลองอีกครั้ง'
            : 'The form expired: reload the page and try again'

        // Bots get the same answer as people, so they don't learn they were caught.
        const honeypot = body[honeypotName(namesOf(form))]
        if (typeof honeypot === 'string' && honeypot.trim() !== '') return { confirmation }
        // Mistakes first: people who skip a field get told, whatever the timing.
        const data = typeof body.data === 'object' && body.data !== null ? (body.data as Row) : {}
        const { values, errors } = validateSubmission(rowsOf(form), data, locale)
        if (errors.length > 0) return fail(400, errors)
        const token = checkToken(secret, slug, body.token, minTime)
        if (token === 'too-fast') return { confirmation }
        if (token !== 'ok') return fail(400, [{ message: reload }])
        if (
          options.turnstile &&
          !(await verifyTurnstile(options.turnstile.secretKey, body.turnstile, ip, options.fetch))
        )
          return fail(400, [
            {
              message:
                locale === 'th'
                  ? 'ยืนยันว่าไม่ใช่บอทไม่สำเร็จ โปรดลองอีกครั้ง'
                  : 'Verification failed: try again',
            },
          ])

        let rateKey: string | undefined
        if (rate && ip) {
          const keys = rateKeys(secret, ip, form.id, rate.window)
          const since = new Date(Date.now() - rate.window * 1000).toISOString()
          const recent = await cms.count(submissions, {
            where: {
              and: [
                { form: { equals: form.id } },
                { rateKey: { in: [keys.current, keys.previous] } },
                { createdAt: { gte: since } },
              ],
            },
          })
          if (recent >= rate.max)
            return fail(429, [
              {
                message:
                  locale === 'th'
                    ? 'ส่งบ่อยเกินไป โปรดรอสักครู่แล้วลองใหม่'
                    : 'Too many submissions: wait a few minutes and try again',
              },
            ])
          rateKey = keys.current
        }

        const page = typeof body.page === 'string' ? body.page.slice(0, 500) : null
        await cms.create(
          submissions,
          {
            form: form.id,
            data: values,
            summary: summarize(rowsOf(form), values),
            locale,
            page,
            ...(rateKey ? { rateKey } : {}),
          },
          { context },
        )
        for (const email of buildEmails({
          form,
          fields: rowsOf(form),
          values,
          locale,
          defaultFrom: options.defaultFrom,
          defaultTo,
        }))
          await cms.sendEmail(email)
        if (options.retentionDays) await removeOld(cms, submissions, options.retentionDays)
        return { confirmation }
      },
    }

    const csvEndpoint: Endpoint = {
      path: '/form/:slug/submissions.csv',
      method: 'get',
      handler: async ({ params, user, context, cms }) => {
        const slug = params.slug as string
        if (!user) return fail(401, [{ message: 'Log in to export submissions' }])
        const { docs } = await cms.find(forms, {
          where: { slug: { equals: slug } },
          limit: 1,
          depth: 0,
          draft: true,
          overrideAccess: false,
          user,
          context,
        })
        const form = docs[0] as Row | undefined
        if (!form) return fail(404, [{ message: `No form "${slug}"` }])
        const rows: Row[] = []
        for (let page = 1; ; page++) {
          const result = await cms.find(submissions, {
            where: { form: { equals: form.id } },
            sort: 'createdAt',
            limit: 500,
            page,
            depth: 0,
            overrideAccess: false,
            user,
            context,
          })
          rows.push(...(result.docs as Row[]))
          if (!result.hasNextPage) break
        }
        const names = namesOf(form).filter(Boolean)
        for (const row of rows)
          for (const key of Object.keys((row.data as Row | null) ?? {}))
            if (!names.includes(key)) names.push(key)
        const header = ['createdAt', 'locale', 'page', ...names]
        const lines = [
          header,
          ...rows.map((row) => [
            String(row.createdAt ?? ''),
            String(row.locale ?? ''),
            String(row.page ?? ''),
            ...names.map((n) => cell((row.data as Row | null)?.[n])),
          ]),
        ]
        // A byte-order mark, so Excel reads Thai text as UTF-8.
        const csv = `${BOM}${lines.map((line) => line.map(csvField).join(',')).join('\r\n')}\r\n`
        return new Response(csv, {
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': `attachment; filename="${slug.replace(/[^\w-]/g, '_')}-submissions.csv"`,
            'cache-control': 'no-store',
          },
        })
      },
    }

    /**
     * Submissions per form and day over the last 7 or 30 days, for the overview page and the
     * dashboard widget. Days are counted in the browser's time zone (`tz`).
     */
    const statsEndpoint: Endpoint = {
      path: '/form/stats.json',
      method: 'get',
      handler: async ({ url, user, context, cms }) => {
        if (!user) return fail(401, [{ message: 'Log in to see form statistics' }])
        const days = url.searchParams.get('days') === '30' ? 30 : 7
        const timeZone = validTimeZone(url.searchParams.get('tz'))
        const dayOf = new Intl.DateTimeFormat('en-CA', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
        const now = Date.now()
        const dates = Array.from({ length: days }, (_, i) =>
          dayOf.format(new Date(now - (days - 1 - i) * 86_400_000)),
        )
        const index = new Map(dates.map((d, i) => [d, i]))

        const formRows: Row[] = []
        for (let page = 1; ; page++) {
          const result = await cms.find(forms, {
            sort: 'title',
            limit: 100,
            page,
            depth: 0,
            draft: true,
            overrideAccess: false,
            user,
            context,
          })
          formRows.push(...(result.docs as Row[]))
          if (!result.hasNextPage) break
        }
        const counts = new Map(formRows.map((f) => [String(f.id), new Array<number>(days).fill(0)]))
        // A day more than the range, so the first day is whole in any time zone.
        const since = new Date(now - (days + 1) * 86_400_000).toISOString()
        for (let page = 1; ; page++) {
          const result = await cms.find(submissions, {
            where: { createdAt: { gte: since } },
            limit: 500,
            page,
            depth: 0,
            overrideAccess: false,
            user,
            context,
          })
          for (const row of result.docs as Row[]) {
            const perDay = counts.get(String(row.form))
            const i = index.get(dayOf.format(new Date(String(row.createdAt))))
            if (perDay && i !== undefined) perDay[i] = (perDay[i] ?? 0) + 1
          }
          if (!result.hasNextPage) break
        }
        const list = formRows
          .map((f) => {
            const perDay = counts.get(String(f.id)) ?? []
            return {
              id: f.id,
              slug: String(f.slug ?? ''),
              title: String(f.title ?? f.slug ?? f.id),
              total: perDay.reduce((a, b) => a + b, 0),
              perDay,
            }
          })
          .sort((a, b) => b.total - a.total)
        return {
          days,
          timeZone,
          dates,
          total: list.reduce((a, f) => a + f.total, 0),
          perDay: dates.map((_, i) => list.reduce((a, f) => a + (f.perDay[i] ?? 0), 0)),
          forms: list,
        }
      },
    }

    /** The `<easy-form>` element, for pages that can't import it from npm (static sites). */
    let element: Promise<string | undefined> | undefined
    const elementEndpoint: Endpoint = {
      path: '/form/element.js',
      method: 'get',
      handler: async ({ cms }) => {
        element ??= (async () => {
          const file = resolveAdminModule('@easy-cms/plugin-form-builder/element', cms.cwd)
          return file ? readFile(file, 'utf8') : undefined
        })()
        const code = await element
        if (!code) return fail(404, [{ message: 'The <easy-form> element was not found' }])
        return new Response(code, {
          headers: {
            'content-type': 'text/javascript; charset=utf-8',
            'cache-control': 'public, max-age=3600',
          },
        })
      },
    }

    return {
      ...config,
      collections: [...(config.collections ?? []), formsCollection, submissionsCollection],
      admin: {
        ...config.admin,
        modules: [...new Set([...(config.admin?.modules ?? []), ADMIN_MODULE])],
        // The menu's Forms group: forms, submissions and their overview.
        nav: [
          ...(config.admin?.nav ?? []),
          { id: 'forms', label: { en: 'Forms', th: 'ฟอร์ม' }, icon: 'mail', order: 200 },
        ],
        // Submissions at a glance: a page and a dashboard panel.
        pages: [
          ...(config.admin?.pages ?? []),
          {
            path: 'forms-overview',
            label: { en: 'Form overview', th: 'ภาพรวมฟอร์ม' },
            icon: 'chart-column',
            group: 'forms',
            component: { tag: 'ecms-forms-overview', props: { forms, submissions, adminPath } },
          },
        ],
        dashboard: [
          ...(config.admin?.dashboard ?? []),
          { component: { tag: 'ecms-forms-widget', props: { forms, submissions, adminPath } } },
        ],
      },
      endpoints: [
        ...(config.endpoints ?? []),
        getEndpoint,
        submitEndpoint,
        csvEndpoint,
        statsEndpoint,
        elementEndpoint,
      ],
    }
  }, INFO)
}

/** A short line for the admin list: the first few values. */
function summarize(rows: readonly Row[], values: Readonly<Record<string, unknown>>): string {
  const parts = rows
    .filter((r) => r.blockType !== 'message' && typeof r.name === 'string')
    .map((r) => cell(values[r.name as string]))
    .filter(Boolean)
  const text = parts.slice(0, 3).join(' · ')
  return text.length > 120 ? `${text.slice(0, 119)}…` : text
}

/** An IANA time zone the runtime knows, e.g. `Asia/Bangkok`; otherwise UTC. */
function validTimeZone(value: string | null): string {
  if (!value) return 'UTC'
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

/** A byte-order mark: Excel then reads the CSV as UTF-8. */
const BOM = String.fromCharCode(0xfeff)

function cell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(String).join(', ')
  return String(value)
}

/** A CSV field: quoted when needed; a leading =, +, - or @ is escaped so spreadsheets don't run it. */
function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

async function removeOld(cms: EasyCMS, submissions: string, days: number) {
  const before = new Date(Date.now() - days * 86_400_000).toISOString()
  const { docs } = await cms.find(submissions, {
    where: { createdAt: { lt: before } },
    limit: 50,
    depth: 0,
  })
  for (const doc of docs) await cms.delete(submissions, doc.id as string | number)
}

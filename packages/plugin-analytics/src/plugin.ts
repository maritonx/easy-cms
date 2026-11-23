import type { CollectionConfig, Config, EasyCMS, Endpoint, GlobalConfig } from '@easy-cms/core'
import { definePlugin } from '@easy-cms/core'
import { INFO } from './info.js'
import { analyticsScript } from './script.js'
import {
  type BannerTexts,
  CONSENT_ID,
  type ConsentRegion,
  DEFAULT_TEXTS,
  GTM_ID,
  RECORDS,
  SETTINGS,
  VERSION,
  versionOf,
} from './shared.js'

export interface AnalyticsPluginOptions {
  /**
   * Defaults for Settings → Analytics & consent, used until an admin saves it; the admin's values
   * win. Handy with an environment variable: `{ gtm: process.env.GTM_ID }`.
   */
  readonly defaults?: {
    readonly gtm?: string
    readonly banner?: boolean
    readonly region?: ConsentRegion
  }
  /** Rename the global and the collection, e.g. when the names are taken. */
  readonly slugs?: { readonly settings?: string; readonly records?: string }
}

const isAdmin = ({ user }: { user: unknown }) =>
  (user as { role?: string } | null)?.role === 'admin'

/**
 * Google Tag Manager for the site's pages, with a consent banner (Consent Mode v2), consent
 * records and GA4 events (ADR-0073). Experimental. The pages load one script,
 * `<api>/analytics.js`: the Nuxt module adds it, Next.js has `<EasyAnalytics />`.
 */
export function analyticsPlugin(options: AnalyticsPluginOptions = {}) {
  const settings = options.slugs?.settings ?? SETTINGS
  const records = options.slugs?.records ?? RECORDS
  const defaults = options.defaults ?? {}
  if (defaults.gtm !== undefined && defaults.gtm !== '' && !GTM_ID.test(defaults.gtm))
    throw new Error(
      `analyticsPlugin: defaults.gtm "${defaults.gtm}" is not a container ID (GTM-XXXXXXX)`,
    )

  return definePlugin((config: Config): Config => {
    for (const slug of [settings, records])
      if (
        config.collections?.some((c) => c.slug === slug) ||
        config.globals?.some((g) => g.slug === slug)
      )
        throw new Error(`analyticsPlugin: "${slug}" is taken; set \`slugs\``)
    const locales = config.localization ? config.localization.locales.map(codeOf) : []
    const l = locales.length > 0 ? { localized: true } : {}

    const settingsGlobal: GlobalConfig = {
      slug: settings,
      label: { en: 'Analytics & consent', th: 'Analytics และความยินยอม' },
      admin: { group: 'settings', icon: 'chart-line' },
      access: { read: isAdmin, update: isAdmin },
      fields: [
        {
          name: 'gtm',
          type: 'text',
          label: { en: 'Google Tag Manager container', th: 'Google Tag Manager container' },
          admin: {
            description: {
              en: 'Tag Manager → Admin → Container ID. Empty: no Tag Manager (the banner and events still work).',
              th: 'Tag Manager → Admin → Container ID ว่างไว้: ไม่โหลด Tag Manager (banner และ event ยังทำงาน)',
            },
          },
          validate: (value: unknown) =>
            value === undefined || value === null || value === '' || GTM_ID.test(String(value))
              ? true
              : 'GTM-XXXXXXX',
          ...(defaults.gtm ? { defaultValue: defaults.gtm } : {}),
        },
        {
          name: 'banner',
          type: 'boolean',
          defaultValue: defaults.banner ?? true,
          label: { en: 'Show the consent banner', th: 'แสดง banner ขอความยินยอม' },
          admin: {
            description: {
              en: 'Off: use your own consent tool, which calls gtag("consent", "update", …) or easyConsent.set().',
              th: 'ปิด: ใช้เครื่องมือขอความยินยอมของคุณเอง ที่เรียก gtag("consent", "update", …) หรือ easyConsent.set()',
            },
          },
        },
        {
          name: 'title',
          type: 'text',
          ...l,
          label: { en: 'Banner title', th: 'หัวข้อของ banner' },
          admin: {
            description: {
              en: `Empty: "${DEFAULT_TEXTS.en.title}" (in Thai on Thai pages).`,
              th: `ว่างไว้: "${DEFAULT_TEXTS.th.title}" (ภาษาอังกฤษในหน้าภาษาอังกฤษ)`,
            },
          },
        },
        {
          name: 'text',
          type: 'textarea',
          ...l,
          label: { en: 'Banner text', th: 'ข้อความของ banner' },
          admin: {
            description: {
              en: 'Empty: the built-in text, in English or Thai to match the page.',
              th: 'ว่างไว้: ใช้ข้อความในตัว เป็นภาษาไทยหรืออังกฤษตามหน้าเว็บ',
            },
          },
        },
        {
          name: 'privacy',
          type: 'text',
          ...l,
          label: { en: 'Privacy policy page', th: 'หน้านโยบายความเป็นส่วนตัว' },
          admin: { description: { en: 'e.g. /privacy', th: 'เช่น /privacy' } },
        },
        {
          name: 'region',
          type: 'select',
          defaultValue: defaults.region ?? 'everywhere',
          label: { en: 'Ask for consent', th: 'ขอความยินยอม' },
          options: [
            {
              value: 'everywhere',
              label: { en: 'Everywhere (recommended)', th: 'ทุกประเทศ (แนะนำ)' },
            },
            {
              value: 'eea-th',
              label: {
                en: 'Only in the EU/EEA, UK, Switzerland and Thailand',
                th: 'เฉพาะ EU/EEA, สหราชอาณาจักร, สวิตเซอร์แลนด์ และไทย',
              },
            },
          ],
        },
        {
          name: 'record',
          type: 'boolean',
          defaultValue: true,
          label: { en: 'Keep consent records', th: 'เก็บบันทึกความยินยอม' },
          admin: {
            description: {
              en: 'A random ID, the choice, the banner version and the time; no IP address. Proof of consent (PDPA, GDPR).',
              th: 'ID สุ่ม การเลือก เวอร์ชันของ banner และเวลา ไม่เก็บ IP ใช้พิสูจน์ความยินยอม (PDPA, GDPR)',
            },
          },
        },
        {
          name: 'keepDays',
          type: 'number',
          defaultValue: 730,
          min: 30,
          label: { en: 'Keep records for (days)', th: 'เก็บบันทึกไว้ (วัน)' },
        },
      ],
    }

    const recordsCollection: CollectionConfig = {
      slug: records,
      labels: {
        singular: { en: 'Consent record', th: 'บันทึกความยินยอม' },
        plural: { en: 'Consent records', th: 'บันทึกความยินยอม' },
      },
      useAsTitle: 'consentId',
      admin: { group: 'settings', icon: 'key', count: false },
      // Only the public endpoint writes them; nobody edits proof of consent.
      access: { read: isAdmin, create: () => false, update: () => false, delete: isAdmin },
      fields: [
        { name: 'consentId', type: 'text', index: true, label: { en: 'Consent ID', th: 'ID' } },
        { name: 'analytics', type: 'boolean', label: { en: 'Analytics', th: 'การวิเคราะห์' } },
        { name: 'marketing', type: 'boolean', label: { en: 'Marketing', th: 'การตลาด' } },
        { name: 'version', type: 'text', label: { en: 'Banner version', th: 'เวอร์ชัน banner' } },
      ],
    }

    const scriptEndpoint: Endpoint = {
      path: '/analytics.js',
      method: 'get',
      handler: async ({ url, cms, context }) => {
        const read = async (locale?: string) =>
          (await cms.findGlobal(
            settings as never,
            {
              context,
              ...(locale ? { locale } : {}),
            } as never,
          )) as Record<string, unknown>
        const base = await read(locales[0])
        const texts: Record<string, BannerTexts> = {}
        for (const lang of new Set(['en', 'th', ...locales])) {
          const own = locales.includes(lang) ? await read(lang) : base
          const builtIn = DEFAULT_TEXTS[lang as 'en' | 'th'] ?? DEFAULT_TEXTS.en
          texts[lang] = {
            ...builtIn,
            ...(str(own.title) ? { title: str(own.title) } : {}),
            ...(str(own.text) ? { text: str(own.text) } : {}),
            ...(str(own.privacy) ? { privacy: str(own.privacy) } : {}),
          }
        }
        const gtm = str(base.gtm) || defaults.gtm || ''
        const body = analyticsScript({
          gtm: GTM_ID.test(gtm) ? gtm : null,
          banner: typeof base.banner === 'boolean' ? base.banner : defaults.banner !== false,
          record: base.record !== false,
          region: (base.region ?? defaults.region) === 'eea-th' ? 'eea-th' : 'everywhere',
          version: versionOf(
            JSON.stringify(Object.entries(texts).map(([k, t]) => [k, t.title, t.text, t.privacy])),
          ),
          texts,
          api: url.pathname.replace(/\/analytics\.js$/, ''),
        })
        return new Response(body, {
          headers: {
            'content-type': 'text/javascript; charset=utf-8',
            // Admins' changes show within a minute.
            'cache-control': 'public, max-age=60',
          },
        })
      },
    }

    const consentEndpoint: Endpoint = {
      path: '/analytics/consent',
      method: 'post',
      handler: async ({ json, cms, context }) => {
        const body = (await json().catch(() => null)) as Record<string, unknown> | null
        const id = body?.id
        const version = body?.version
        if (
          typeof id !== 'string' ||
          !CONSENT_ID.test(id) ||
          typeof version !== 'string' ||
          !VERSION.test(version) ||
          typeof body?.analytics !== 'boolean' ||
          typeof body?.marketing !== 'boolean'
        )
          return new Response(null, { status: 400 })
        const current = (await cms.findGlobal(settings as never, { context } as never)) as Record<
          string,
          unknown
        >
        if (current.record === false) return new Response(null, { status: 204 })
        await cms.create(
          records as never,
          {
            consentId: id,
            analytics: body.analytics,
            marketing: body.marketing,
            version,
          } as never,
          { context } as never,
        )
        const days = typeof current.keepDays === 'number' ? current.keepDays : 730
        await removeOld(cms, records, days, context)
        return new Response(null, { status: 204 })
      },
    }

    return {
      ...config,
      globals: [...(config.globals ?? []), settingsGlobal],
      collections: [...(config.collections ?? []), recordsCollection],
      endpoints: [...(config.endpoints ?? []), scriptEndpoint, consentEndpoint],
    }
  }, INFO)
}

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const codeOf = (locale: string | { code: string }) =>
  typeof locale === 'string' ? locale : locale.code

/** Records past their keeping time, a few at a time as new ones arrive. */
async function removeOld(cms: EasyCMS, records: string, days: number, context: unknown) {
  const before = new Date(Date.now() - days * 86_400_000).toISOString()
  const { docs } = await cms.find(
    records as never,
    {
      where: { createdAt: { lt: before } },
      limit: 50,
      depth: 0,
      context,
    } as never,
  )
  for (const doc of docs as { id: string | number }[])
    await cms.delete(records as never, doc.id as never, { context } as never)
}

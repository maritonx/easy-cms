import {
  type CollectionConfig,
  type Config,
  definePlugin,
  type EasyCMS,
  type EventMessage,
  type IntegrationConfig,
  type IntegrationConnection,
} from '@easy-cms/core'
import { ChannelError, type NotifyChannel } from './channel.js'
import { INFO } from './info.js'
import {
  EVENT_LABELS,
  type Language,
  NOTIFY_EVENTS,
  type Notice,
  noticeOf,
  OPT_IN_EVENTS,
  texts,
} from './messages.js'
import { telegram } from './telegram.js'

export interface NotifyPluginOptions {
  /** Where notifications go. Default: Telegram. */
  readonly channels?: readonly NotifyChannel[]
  /**
   * Notifications a connection sends an hour, at most; the ones over it are counted and told
   * in one message once the hour allows. Default 60.
   */
  readonly limit?: number
  /** Slug of the collection that queues notifications. Default `notify-messages`. */
  readonly slug?: string
}

type Row = Record<string, unknown> & { id: string | number }

/** Waits before the second, third and fourth tries; then it gives up. */
const RETRIES = [60_000, 5 * 60_000, 30 * 60_000]
/** A notification being sent is someone else's to retry after this long. */
const CLAIM = 2 * 60_000
const HOUR = 60 * 60_000
/** Sent and given-up notifications are kept this long. */
const KEEP = 7 * 24 * HOUR
const nobody = () => false
const later = (now: Date, ms: number) => new Date(now.getTime() + ms).toISOString()

/**
 * Tells admins about events in a chat: new orders, form answers, and failures (scheduled
 * publishing, webhooks and email, backups, integrations). Each channel (Telegram) is an
 * integration admins connect on the Integrations page.
 */
export function notifyPlugin(options: NotifyPluginOptions = {}) {
  const channels = options.channels ?? [telegram]
  const limit = options.limit ?? 60
  const slug = options.slug ?? 'notify-messages'
  const channelIds = new Set(channels.map((c) => c.integration.id))
  if (!Number.isInteger(limit) || limit < 1)
    throw new Error('notifyPlugin: `limit` must be a whole number above 0')

  return definePlugin((config: Config): Config => {
    if (config.collections?.some((c) => c.slug === slug))
      throw new Error(`notifyPlugin: there is already a collection "${slug}"; set \`slug\``)
    const adminLanguage: Language = config.admin?.locale === 'th' ? 'th' : 'en'

    // Kept out of the admin and the APIs: only this plugin reads it, through the database.
    const messages: CollectionConfig = {
      slug,
      labels: { singular: 'Notification', plural: 'Notifications' },
      access: { read: nobody, create: nobody, update: nobody, delete: nobody },
      fields: [
        { name: 'channel', type: 'text', required: true, index: true },
        { name: 'connection', type: 'text', required: true },
        { name: 'event', type: 'text', required: true },
        { name: 'text', type: 'textarea', required: true },
        // pending | sent | failed | dropped (over the limit) | counted (told in a summary)
        { name: 'state', type: 'text', required: true, index: true },
        { name: 'attempts', type: 'number' },
        { name: 'nextAttemptAt', type: 'text', index: true },
        { name: 'error', type: 'text' },
      ],
    }

    const channelOf = (id: unknown) => channels.find((c) => c.integration.id === id)
    const languageOf = (conn: IntegrationConnection): Language =>
      conn.values.language === 'th' || conn.values.language === 'en'
        ? conn.values.language
        : adminLanguage
    const linkOf = (cms: EasyCMS, path: string | undefined) => {
      const server = cms.config.serverURL?.replace(/\/+$/, '')
      if (!server || !path) return undefined
      return `${server}${cms.config.admin.path.replace(/\/+$/, '')}${path}`
    }
    const recent = (cms: EasyCMS, row: { channel: string; connection: string }, now: Date) =>
      cms.db.count({
        collection: slug,
        where: {
          and: [
            { channel: { equals: row.channel } },
            { connection: { equals: row.connection } },
            { state: { in: ['pending', 'sent', 'failed'] } },
            { createdAt: { gt: new Date(now.getTime() - HOUR).toISOString() } },
          ],
        },
        max: limit,
      })

    /** One try; a failure waits for the next or, after the last, marks the connection. */
    async function deliver(cms: EasyCMS, row: Row, now = new Date()) {
      const channel = channelOf(row.channel)
      const conn = channel
        ? await cms.integrations.get(channel.integration.id, { name: String(row.connection) })
        : null
      const attempts = Number(row.attempts ?? 0) + 1
      const { id, ...data } = row
      try {
        if (!channel || !conn) throw new ChannelError('The connection is gone', true)
        await channel.send(conn.values, String(row.text))
        await cms.db.update({
          collection: slug,
          id,
          data: { ...data, state: 'sent', attempts, error: null, updatedAt: now.toISOString() },
        })
        await cms.integrations.markUsed(channel.integration.id, conn.name)
      } catch (error) {
        const message = (error as Error).message
        const wait =
          error instanceof ChannelError && error.permanent ? undefined : RETRIES[attempts - 1]
        await cms.db.update({
          collection: slug,
          id,
          data: {
            ...data,
            attempts,
            state: wait === undefined ? 'failed' : 'pending',
            nextAttemptAt: later(now, wait ?? 0),
            error: message.slice(0, 500),
            updatedAt: now.toISOString(),
          },
        })
        if (wait === undefined && channel && conn)
          await cms.integrations.markError(channel.integration.id, message, conn.name)
      }
    }

    async function enqueue(
      cms: EasyCMS,
      channel: NotifyChannel,
      conn: IntegrationConnection,
      event: string,
      text: string,
      now = new Date(),
    ) {
      const key = { channel: channel.integration.id, connection: conn.name }
      const over = (await recent(cms, key, now)) >= limit
      const row = (await cms.db.create({
        collection: slug,
        data: {
          ...key,
          event,
          text,
          state: over ? 'dropped' : 'pending',
          attempts: 0,
          nextAttemptAt: later(now, CLAIM),
          error: null,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      })) as Row
      // Sent at once; the job retries what fails, or what a stopped server didn't finish.
      if (!over) await deliver(cms, row, now)
    }

    async function listen(message: EventMessage, { cms }: { cms: EasyCMS }) {
      const data = message.data as Record<string, unknown>
      // Its own channels failing would only fail again.
      if (message.event === 'integration.failed' && channelIds.has(String(data.integration))) return
      for (const channel of channels) {
        for (const conn of await cms.integrations.all(channel.integration.id)) {
          const wanted = (conn.values.events ?? '').split(',').filter(Boolean)
          if (wanted.length > 0 && !wanted.includes(message.event)) continue
          // Bounces and spam reports only when ticked: there can be many.
          if (wanted.length === 0 && (OPT_IN_EVENTS as readonly string[]).includes(message.event))
            continue
          const notice = noticeOf(message, languageOf(conn))
          if (!notice) continue
          await enqueue(
            cms,
            channel,
            conn,
            message.event,
            channel.format(notice, linkOf(cms, notice.path)),
          )
        }
      }
    }

    /** Tells each connection how many notifications the limit held back, once it can. */
    async function summarize(cms: EasyCMS, now: Date) {
      const dropped = await cms.db.find({
        collection: slug,
        where: { state: { equals: 'dropped' } },
        sort: ['id'],
        limit: 0,
        page: 1,
      })
      const groups = new Map<string, Row[]>()
      for (const row of dropped.docs as Row[]) {
        const key = `${String(row.channel)}\n${String(row.connection)}`
        groups.set(key, [...(groups.get(key) ?? []), row])
      }
      for (const [key, rows] of groups) {
        const [channelId = '', connection = ''] = key.split('\n')
        if ((await recent(cms, { channel: channelId, connection }, now)) >= limit) continue
        for (const { id, ...data } of rows)
          await cms.db.update({ collection: slug, id, data: { ...data, state: 'counted' } })
        const channel = channelOf(channelId)
        const conn = channel && (await cms.integrations.get(channelId, { name: connection }))
        if (!channel || !conn) continue
        const t = texts(languageOf(conn))
        const notice: Notice = {
          title: 'Easy CMS',
          lines: [t.dropped(rows.length, limit)],
          open: t.open,
        }
        await enqueue(cms, channel, conn, 'notify.dropped', channel.format(notice, undefined), now)
      }
    }

    async function run({ cms, now }: { cms: EasyCMS; now: Date }) {
      const due = await cms.db.find({
        collection: slug,
        where: {
          and: [{ state: { equals: 'pending' } }, { nextAttemptAt: { lte: now.toISOString() } }],
        },
        sort: ['nextAttemptAt'],
        limit: 50,
        page: 1,
      })
      for (const found of due.docs as Row[]) {
        // Claimed first, so two servers don't send it twice.
        const { id, ...data } = found
        const claimed = (await cms.db.update({
          collection: slug,
          id,
          data: { ...data, nextAttemptAt: later(now, CLAIM) },
          where: {
            and: [
              { state: { equals: 'pending' } },
              { nextAttemptAt: { equals: found.nextAttemptAt } },
            ],
          },
        })) as Row | null
        if (claimed) await deliver(cms, { ...found, ...claimed, id }, now)
      }
      await summarize(cms, now)
      const old = await cms.db.find({
        collection: slug,
        where: {
          and: [
            { state: { not_equals: 'pending' } },
            { updatedAt: { lt: new Date(now.getTime() - KEEP).toISOString() } },
          ],
        },
        sort: ['id'],
        limit: 500,
        page: 1,
      })
      for (const row of old.docs) await cms.db.delete({ collection: slug, id: row.id as Row['id'] })
    }

    const integrations: IntegrationConfig[] = channels.map(({ integration }) => ({
      ...integration,
      fields: [
        ...(integration.fields ?? []),
        {
          name: 'language',
          label: { en: 'Language', th: 'ภาษา' },
          type: 'select',
          options: [
            { value: 'en', label: 'English' },
            { value: 'th', label: 'ภาษาไทย' },
          ],
          description: {
            en: "Of the notifications. Empty: the admin's language.",
            th: 'ของการแจ้งเตือน ถ้าว่าง: ภาษาของหน้า admin',
          },
        },
        {
          name: 'events',
          label: { en: 'Events', th: 'เหตุการณ์' },
          type: 'multiselect',
          options: NOTIFY_EVENTS.map((value) => ({ value, label: EVENT_LABELS[value] })),
          description: {
            en: 'None ticked: all but bounced and spam-reported emails.',
            th: 'ถ้าไม่เลือก: ทั้งหมด ยกเว้นอีเมลตีกลับและถูกแจ้งสแปม',
          },
        },
      ],
      async test(values, args) {
        const channel = channelOf(integration.id) as NotifyChannel
        try {
          const own = await integration.test?.(values, args)
          if (own && !own.ok) return own
          const account = own?.account
          const language =
            values.language === 'th' || values.language === 'en' ? values.language : adminLanguage
          await channel.send(values, texts(language).test)
          return { ok: true, ...(account ? { account } : {}) }
        } catch (error) {
          return { ok: false, message: (error as Error).message }
        }
      },
    }))

    return {
      ...config,
      collections: [...(config.collections ?? []), messages],
      integrations: [...(config.integrations ?? []), ...integrations],
      jobs: [...(config.jobs ?? []), { name: 'notify:send', run }],
      listeners: [...(config.listeners ?? []), { events: [...NOTIFY_EVENTS], handler: listen }],
    }
  }, INFO)
}

import {
  type AuthUser,
  type CollectionConfig,
  type Config,
  definePlugin,
  type EasyCMS,
  type Endpoint,
  type Field,
  type IntegrationConfig,
  type Where,
} from '@easy-cms/core'
import { ChannelError, type SocialChannel, type SocialMessage } from './channel.js'
import { facebook } from './facebook.js'
import { INFO } from './info.js'
import { line } from './line.js'
import {
  ACTION_PATH,
  AI_PATH,
  CHANNELS_PATH,
  type ChannelDelivery,
  type ChannelOption,
  type Delivery,
  SHARE_PATH,
} from './shared.js'
import { webhook } from './webhook.js'

type Doc = Record<string, unknown>

/** What a social post starts with when shared from a document. */
export interface ShareValues {
  readonly title?: string | null
  readonly text?: string | null
  readonly link?: string | null
  /** A media document's id. */
  readonly image?: string | number | null
}

export interface SocialPluginOptions {
  /** Collections whose edit page has **Share**, e.g. `['posts']`; the post's source points to them. */
  readonly collections?: readonly string[]
  /**
   * What a shared document fills in. Default: its title (`useAsTitle`), its first textarea (an
   * excerpt), `url`, and its first image.
   */
  readonly share?: (args: {
    doc: Doc
    collection: string
    cms: EasyCMS
  }) => ShareValues | Promise<ShareValues>
  /** A document's public address, for the post's link, e.g. `({ doc }) => \`https://…/${doc.slug}\``. */
  readonly url?: (args: { doc: Doc; collection: string }) => string | null | undefined
  /** Where posts go. Default: the webhook (Make, n8n, Zapier), Facebook Pages and LINE OA. */
  readonly channels?: readonly SocialChannel[]
  /** Slug of the social posts collection. Default `social-posts`. */
  readonly slug?: string
}

/** Waits before the second, third and fourth tries; then the channel is given up on. */
const RETRIES = [60_000, 5 * 60_000, 30 * 60_000]
/** A post being sent is someone else's to pick up after this long. */
const LEASE = 2 * 60_000
/** A scheduled post waits this long for its source to be published, then fails. */
const SOURCE_WAIT = 60 * 60_000
const nobody = () => false
const later = (from: Date, ms: number) => new Date(from.getTime() + ms).toISOString()
const json = (status: number, message: string) =>
  Response.json({ errors: [{ message }] }, { status })

/**
 * Social posts (#312, experimental): write once, send to several channels, each with its own text,
 * now or at a time, with retries and a state per channel. Channels are integrations admins connect
 * on the Integrations page; the webhook comes first.
 */
export function socialPlugin(options: SocialPluginOptions = {}) {
  const channels = options.channels ?? [webhook, facebook, line]
  const slug = options.slug ?? 'social-posts'
  const sources = options.collections ?? []

  return definePlugin((config: Config): Config => {
    if (config.collections?.some((c) => c.slug === slug))
      throw new Error(`socialPlugin: there is already a collection "${slug}"; set \`slug\``)
    const missing = sources.filter((s) => !config.collections?.some((c) => c.slug === s))
    if (missing.length > 0)
      throw new Error(`socialPlugin: unknown collection ${missing.map((s) => `"${s}"`).join(', ')}`)

    const channelOf = (connection: string) =>
      channels.find((c) => connection.startsWith(`${c.integration.id}:`))
    const nameOf = (connection: string) => connection.slice(connection.indexOf(':') + 1)

    // --- The collection ---------------------------------------------------------------------

    const fields: Field[] = [
      { name: 'title', type: 'text', required: true, label: { en: 'Title', th: 'ชื่อ' } },
      {
        name: 'text',
        type: 'textarea',
        required: true,
        label: { en: 'Text', th: 'ข้อความ' },
        admin: { after: [{ tag: 'ecms-social-count' }] },
      },
      { name: 'link', type: 'text', label: { en: 'Link', th: 'ลิงก์' } },
      {
        name: 'image',
        type: 'upload',
        mimeTypes: ['image/*'],
        label: { en: 'Image', th: 'รูป' },
        admin: {
          description: {
            en: 'Channels fetch it from its public URL.',
            th: 'ช่องทางจะดึงรูปจาก URL สาธารณะ',
          },
        },
      },
      ...(sources.length > 0
        ? ([
            {
              name: 'source',
              type: 'relationship',
              to: sources.length === 1 ? (sources[0] as string) : [...sources],
              label: { en: 'Shared from', th: 'แชร์จาก' },
            },
          ] as Field[])
        : []),
      {
        name: 'channels',
        type: 'array',
        label: { en: 'Channels', th: 'ช่องทาง' },
        fields: [
          {
            name: 'connection',
            type: 'text',
            required: true,
            label: { en: 'Channel', th: 'ช่องทาง' },
            admin: { component: { tag: 'ecms-social-channel' } },
          },
          {
            name: 'text',
            type: 'textarea',
            label: { en: 'Text for this channel', th: 'ข้อความเฉพาะช่องทางนี้' },
            admin: {
              description: { en: "Empty: the post's text.", th: 'ถ้าว่าง: ใช้ข้อความของโพสต์' },
              after: [{ tag: 'ecms-social-count' }],
            },
          },
        ],
      },
      {
        // Each channel's state, written by the plugin; the side panel shows it with the actions.
        name: 'delivery',
        type: 'json',
        label: { en: 'Posting', th: 'การโพสต์' },
        access: { create: nobody, update: nobody },
        admin: { position: 'sidebar', component: { tag: 'ecms-social-panel' } },
      },
      // When the job should look again: the earliest due channel. Not shown, not sent.
      {
        name: 'nextAt',
        type: 'text',
        index: true,
        access: { read: nobody, create: nobody, update: nobody },
      },
    ]

    const posts: CollectionConfig = {
      slug,
      labels: {
        singular: { en: 'Social post', th: 'โพสต์โซเชียล' },
        plural: { en: 'Social posts', th: 'โพสต์โซเชียล' },
      },
      useAsTitle: 'title',
      // Posting is its own permission (`publish`, "Post" in Settings → Roles): drafting isn't.
      admin: { icon: 'megaphone', permissions: ['publish'] },
      fields,
      hooks: {
        beforeChange: [
          ({ data, previousDoc: originalDoc }) => {
            const rows = Array.isArray(data.channels) ? (data.channels as Doc[]) : []
            const seen = new Set<string>()
            const delivery = ((originalDoc?.delivery ?? null) as Delivery | null)?.channels ?? {}
            const before = Array.isArray(originalDoc?.channels)
              ? (originalDoc.channels as Doc[])
              : []
            const kept: Doc[] = []
            for (const row of rows) {
              const connection = String(row.connection ?? '')
              if (seen.has(connection)) continue
              seen.add(connection)
              // A channel that posted keeps the text it posted.
              if (delivery[connection]?.state === 'posted') {
                const old = before.find((r) => r.connection === connection)
                kept.push(old ? { ...row, text: old.text ?? null } : row)
              } else kept.push(row)
            }
            // A channel that posted can't be taken off the post: it stays as a record.
            for (const [connection, state] of Object.entries(delivery))
              if (state.state === 'posted' && !seen.has(connection)) {
                const old = before.find((r) => r.connection === connection)
                if (old) kept.push(old)
              }
            return { ...data, channels: kept }
          },
        ],
      },
    }

    // --- Who may, and what goes out ----------------------------------------------------------

    /** Posting needs `publish` on the collection (admins always) and the right to change the post. */
    const mayPost = async (cms: EasyCMS, user: AuthUser, id?: string | number) => {
      if ((await cms.roles.allows(user, { collection: slug }, 'publish')) === false) return false
      if (id === undefined) return true
      return (await cms.documentPermissions(slug, String(id), user)).update
    }

    /** The image as a public URL, or why there can't be one. */
    const imageOf = async (
      cms: EasyCMS,
      id: unknown,
    ): Promise<{ image: SocialMessage['image'] } | { error: string }> => {
      if (id === null || id === undefined || id === '') return { image: null }
      const media = (await cms.findById(
        'media',
        (typeof id === 'object' ? (id as Doc).id : id) as string,
        {
          depth: 0,
        },
      )) as Doc | null
      if (!media) return { error: 'The image was deleted' }
      if (media.private === true) return { error: 'The image is private: channels can’t fetch it' }
      const raw = String(media.url ?? '')
      const server = cms.config.serverURL?.replace(/\/+$/, '')
      const url = /^https?:\/\//.test(raw) ? raw : server ? `${server}${raw}` : ''
      if (!url) return { error: 'Set `serverURL` so channels can fetch the image' }
      const host = new URL(url).hostname
      if (host === 'localhost' || host.endsWith('.localhost') || /^(127\.|\[?::1)/.test(host))
        return { error: `The image is at ${host}, which channels can’t reach` }
      return { image: { url, alt: typeof media.alt === 'string' && media.alt ? media.alt : null } }
    }

    const deliveryOf = (doc: Doc): Delivery => {
      const d = (doc.delivery ?? {}) as Partial<Delivery>
      return { postAt: d.postAt ?? null, channels: { ...(d.channels ?? {}) } }
    }
    const rowsOf = (doc: Doc) =>
      (Array.isArray(doc.channels) ? (doc.channels as Doc[]) : []).filter(
        (r) => typeof r.connection === 'string' && r.connection,
      )
    /** The earliest time the job should look at the post again, or `null`. */
    const nextAtOf = (delivery: Delivery): string | null => {
      const times = Object.values(delivery.channels)
        .filter((c) => c.state === 'sending' || c.state === 'scheduled')
        .map((c) =>
          c.state === 'scheduled' ? (delivery.postAt ?? null) : (c.nextAttemptAt ?? null),
        )
        .filter((t): t is string => !!t)
        .sort()
      return times[0] ?? null
    }
    const save = (cms: EasyCMS, id: string | number, delivery: Delivery, where?: Where) => {
      const data = { delivery, nextAt: nextAtOf(delivery) }
      return where
        ? cms.update(slug, id, data, { live: true, where })
        : cms.update(slug, id, data, { live: true })
    }

    /** The document a post was shared from. */
    const sourceOf = (doc: Doc): { collection: string; id: string | number } | null => {
      const source = doc.source as
        | { relationTo?: string; value?: unknown }
        | string
        | number
        | null
        | undefined
      if (source && typeof source === 'object' && 'relationTo' in source) {
        const value = source.value as Doc | string | number
        return {
          collection: String(source.relationTo),
          id: (typeof value === 'object' ? value.id : value) as string,
        }
      }
      if (source != null && sources.length === 1)
        return {
          collection: sources[0] as string,
          id: (typeof source === 'object' ? (source as Doc).id : source) as string,
        }
      return null
    }
    /** Published, for collections with drafts (others are always live). */
    const isLive = async (cms: EasyCMS, ref: { collection: string; id: string | number }) => {
      const config = cms.config.collections.find((c) => c.slug === ref.collection)
      if (!config?.drafts) return true
      const live = await cms.findById(ref.collection, ref.id as string, { depth: 0 })
      return !!live && (live as Doc).status === 'published'
    }

    /** Sends the channels that are due; each on its own, so one failing stops none. */
    async function sendDue(cms: EasyCMS, doc: Doc, now = new Date()) {
      const id = doc.id as string | number
      const delivery = deliveryOf(doc)
      const due = rowsOf(doc).filter((row) => {
        const state = delivery.channels[row.connection as string]
        if (!state) return false
        if (state.state === 'scheduled')
          return !!delivery.postAt && delivery.postAt <= now.toISOString()
        return state.state === 'sending' && (state.nextAttemptAt ?? '') <= now.toISOString()
      })
      if (due.length === 0) return deliveryOf(doc)
      // Claimed: two servers don't post it twice.
      const lease = later(now, LEASE)
      const claimed = await cms.update(
        slug,
        id,
        { nextAt: lease },
        {
          live: true,
          where:
            doc.nextAt == null ? { nextAt: { exists: false } } : { nextAt: { equals: doc.nextAt } },
        },
      )
      if (!claimed) return deliveryOf(doc)

      // A source that isn't published yet: a scheduled post waits for it a while.
      const sourceRef = sourceOf(doc)
      const sourceIssue =
        sourceRef && !(await isLive(cms, sourceRef)) ? 'The source isn’t published' : null
      const { image, error: imageError } = {
        image: null,
        error: null,
        ...(await imageOf(cms, doc.image)),
      } as {
        image: SocialMessage['image']
        error: string | null
      }

      for (const row of due) {
        const connection = row.connection as string
        const state: ChannelDelivery = { ...(delivery.channels[connection] as ChannelDelivery) }
        const attempts = state.attempts + 1
        const fail = async (message: string, permanent: boolean) => {
          const wait = permanent ? undefined : RETRIES[attempts - 1]
          delivery.channels[connection] = {
            ...state,
            state: wait === undefined ? 'failed' : 'sending',
            attempts,
            error: message.slice(0, 500),
            nextAttemptAt: wait === undefined ? null : later(now, wait),
          }
          if (wait === undefined) {
            cms.emit(
              'social.failed',
              { post: { id, title: doc.title }, channel: connection, error: message },
              { collection: slug, id },
            )
            const channel = channelOf(connection)
            if (channel)
              await cms.integrations.markError(channel.integration.id, message, nameOf(connection))
          }
        }
        if (sourceIssue) {
          const since = new Date(delivery.postAt ?? now.toISOString()).getTime()
          if (now.getTime() - since < SOURCE_WAIT) {
            delivery.channels[connection] = {
              ...state,
              state: 'sending',
              nextAttemptAt: later(now, 60_000),
            }
            continue
          }
          await fail(`${sourceIssue} after an hour`, true)
          continue
        }
        if (imageError) {
          await fail(imageError, true)
          continue
        }
        const channel = channelOf(connection)
        const conn = channel
          ? await cms.integrations.get(channel.integration.id, { name: nameOf(connection) })
          : null
        if (!channel || !conn) {
          await fail('The channel is no longer connected', true)
          continue
        }
        try {
          const result = await channel.send(conn.values, {
            post: id,
            channel: connection,
            title: String(doc.title ?? ''),
            text: String(row.text || doc.text || ''),
            link: typeof doc.link === 'string' && doc.link ? doc.link : null,
            image,
            source: sourceRef
              ? { collection: sourceRef.collection, id: sourceRef.id as string }
              : null,
          })
          delivery.channels[connection] = {
            state: 'posted',
            attempts,
            url: result.url ?? null,
            error: null,
            nextAttemptAt: null,
            postedAt: now.toISOString(),
          }
          await cms.integrations.markUsed(channel.integration.id, conn.name)
          cms.emit(
            'social.posted',
            { post: { id, title: doc.title }, channel: connection, url: result.url ?? null },
            { collection: slug, id },
          )
        } catch (error) {
          await fail((error as Error).message, error instanceof ChannelError && error.permanent)
        }
      }
      await save(cms, id, delivery, { nextAt: { equals: lease } })
      return delivery
    }

    // --- Endpoints ---------------------------------------------------------------------------

    const channelsEndpoint: Endpoint = {
      path: CHANNELS_PATH,
      method: 'get',
      handler: async ({ user, cms }) => {
        if (!user) return json(401, 'Log in to see the channels')
        const out: ChannelOption[] = []
        for (const channel of channels) {
          const { id, label, icon } = channel.integration
          for (const conn of await cms.integrations.all(id)) {
            const name = typeof label === 'string' ? label : (label.en ?? id)
            out.push({
              id: `${id}:${conn.name}`,
              label: `${name} · ${conn.name}`,
              ...(icon ? { icon } : {}),
              ...(channel.maxLength ? { maxLength: channel.maxLength } : {}),
            })
          }
        }
        return { channels: out, canPost: await mayPost(cms, user) }
      },
    }

    const actionEndpoint: Endpoint = {
      path: ACTION_PATH,
      method: 'post',
      handler: async ({ json: body, user, cms }) => {
        if (!user) return json(401, 'Log in to post')
        const input = (await body()) as Doc
        const id =
          typeof input.post === 'string' || typeof input.post === 'number' ? input.post : null
        if (id === null) return json(400, 'post is required')
        // What would stop the post going out, for the panel to say before anyone presses.
        if (input.action === 'check') {
          const saved = (await cms.findById(slug, id, {
            depth: 0,
            user,
            overrideAccess: false,
          })) as Doc | null
          if (!saved) return json(404, 'No such post')
          // The form's image and source, not yet saved, when the panel sends them.
          const doc: Doc = {
            ...saved,
            ...('image' in input ? { image: input.image } : {}),
            ...('source' in input ? { source: input.source } : {}),
          }
          const problems: string[] = []
          const image = await imageOf(cms, doc.image)
          if ('error' in image) problems.push(image.error)
          const ref = sourceOf(doc)
          if (ref && !(await isLive(cms, ref)))
            problems.push('The source isn’t published yet: its link may not open')
          // Each channel's word before posting (a LINE broadcast's reach and quota).
          const notes: Record<string, { info?: string; warning?: string }> = {}
          for (const row of rowsOf(saved)) {
            const connection = row.connection as string
            const channel = channelOf(connection)
            if (!channel?.preview) continue
            const conn = await cms.integrations.get(channel.integration.id, {
              name: nameOf(connection),
            })
            if (conn) notes[connection] = await channel.preview(conn.values).catch(() => ({}))
          }
          return { problems, notes }
        }
        if (!(await mayPost(cms, user, id))) return json(403, 'You may not post this')
        const doc = (await cms.findById(slug, id, { depth: 0 })) as Doc | null
        if (!doc) return json(404, 'No such post')
        const rows = rowsOf(doc)
        const delivery = deliveryOf(doc)
        const now = new Date()
        const action = input.action
        // Channels that haven't posted (or, for retry, the one that failed).
        const open = rows
          .map((r) => r.connection as string)
          .filter((c) => delivery.channels[c]?.state !== 'posted')
        if (action === 'now' || action === 'schedule' || action === 'retry') {
          if (rows.length === 0) return json(400, 'Add a channel first')
          const image = await imageOf(cms, doc.image)
          if ('error' in image) return json(400, image.error)
          for (const c of open)
            if (!channelOf(c)) return json(400, `"${c}" is not a channel this site has`)
        }
        if (action === 'now' || action === 'retry') {
          const targets =
            action === 'retry'
              ? open.filter((c) => c === input.channel && delivery.channels[c]?.state === 'failed')
              : open.filter((c) => delivery.channels[c]?.state !== 'sending')
          if (targets.length === 0)
            return json(400, action === 'retry' ? 'Nothing to retry' : 'Nothing left to post')
          for (const c of targets)
            delivery.channels[c] = {
              state: 'sending',
              attempts: 0,
              error: null,
              url: null,
              nextAttemptAt: now.toISOString(),
              postedAt: null,
            }
          if (action === 'now') delivery.postAt = null
          const saved = (await save(cms, id, delivery)) as Doc
          // Sent at once; the job retries what fails.
          return { delivery: await sendDue(cms, saved, now) }
        }
        if (action === 'schedule') {
          const postAt = typeof input.postAt === 'string' ? new Date(input.postAt) : null
          if (!postAt || Number.isNaN(postAt.getTime()) || postAt <= now)
            return json(400, 'postAt must be a time in the future')
          delivery.postAt = postAt.toISOString()
          for (const c of open)
            delivery.channels[c] = {
              state: 'scheduled',
              attempts: 0,
              error: null,
              nextAttemptAt: null,
            }
          await save(cms, id, delivery)
          return { delivery }
        }
        if (action === 'cancel') {
          delivery.postAt = null
          for (const [c, state] of Object.entries(delivery.channels))
            if (state.state === 'scheduled')
              delivery.channels[c] = { state: 'waiting', attempts: 0 }
          await save(cms, id, delivery)
          return { delivery }
        }
        return json(400, 'action must be now, schedule, cancel or retry')
      },
    }

    /** "Write with AI": a post's text from what it shares, for review in the form. */
    const aiEndpoint: Endpoint = {
      path: AI_PATH,
      method: 'post',
      handler: async ({ json: body, user, cms }) => {
        if (!user) return json(401, 'Log in to write with AI')
        const ai = cms.ai
        if (!ai) return json(404, 'No AI plugin')
        const input = (await body()) as Doc
        const id =
          typeof input.post === 'string' || typeof input.post === 'number' ? input.post : null
        // Who may change the post (or create one, before it is saved) may have it written.
        const allowed =
          id !== null
            ? (await cms.documentPermissions(slug, String(id), user)).update
            : (await cms.roles.allows(user, { collection: slug }, 'create')) !== false
        if (!allowed) return json(403, 'You may not change this post')
        const form = (typeof input.doc === 'object' && input.doc !== null ? input.doc : {}) as Doc
        const parts: string[] = []
        const ref = sourceOf(form)
        if (ref) {
          const config = cms.config.collections.find((c) => c.slug === ref.collection)
          const source = (await cms.findById(ref.collection, ref.id as string, {
            depth: 0,
            draft: true,
            user,
            overrideAccess: false,
          })) as Doc | null
          if (source && config) parts.push(contentText(config, source))
        }
        if (parts.length === 0)
          for (const key of ['title', 'text'] as const)
            if (typeof form[key] === 'string' && (form[key] as string).trim())
              parts.push(form[key] as string)
        const source = parts.join('\n\n').trim()
        if (!source) return json(400, 'Nothing to write from yet: share a document or add a title')
        const channel = typeof input.channel === 'string' ? input.channel : null
        const adapter = channel ? channelOf(channel) : undefined
        const max = adapter?.maxLength ?? 500
        const where = channel
          ? `a post on ${channel.slice(0, channel.indexOf(':')) || 'social media'}`
          : 'a social media post'
        try {
          const result = await ai.generate(
            {
              feature: 'social',
              system: [
                `You write ${where} that makes people want to read the page it shares.`,
                `At most ${max} characters, plain text, no hashtags unless they fit, no link (it is added`,
                `separately). Write it in ${ai.languageOf(null)}. Answer with the post only.`,
              ].join(' '),
              prompt: `The page:\n\n${source.slice(0, 6000)}`,
              maxTokens: 400,
            },
            { user, ...(id !== null ? { about: { collection: slug, id } } : {}) },
          )
          let text = result.text.trim().replace(/^["“]+|["”]+$/g, '')
          if ([...text].length > max)
            text =
              [...text]
                .slice(0, max - 1)
                .join('')
                .trimEnd() + '…'
          return { text }
        } catch (e) {
          const status = (e as { status?: number }).status
          return json(typeof status === 'number' ? status : 400, (e as Error).message)
        }
      },
    }

    const shareEndpoint: Endpoint = {
      path: SHARE_PATH,
      method: 'post',
      handler: async ({ json: body, user, cms }) => {
        if (!user) return json(401, 'Log in to share')
        const input = (await body()) as Doc
        const collection = typeof input.collection === 'string' ? input.collection : ''
        const id = typeof input.id === 'string' || typeof input.id === 'number' ? input.id : null
        if (!sources.includes(collection) || id === null)
          return json(404, 'This document can’t be shared')
        if ((await cms.roles.allows(user, { collection: slug }, 'create')) === false)
          return json(403, 'You may not create social posts')
        const doc = (await cms.findById(collection, id, {
          depth: 0,
          draft: true,
          user,
          overrideAccess: false,
        })) as Doc | null
        if (!doc) return json(404, 'No such document')
        const values = options.share
          ? await options.share({ doc, collection, cms })
          : defaults(
              cms.config.collections.find((c) => c.slug === collection),
              doc,
            )
        const link = values.link ?? options.url?.({ doc, collection }) ?? null
        const connections: string[] = []
        for (const channel of channels)
          for (const conn of await cms.integrations.all(channel.integration.id))
            connections.push(`${channel.integration.id}:${conn.name}`)
        const title = String(values.title ?? '').trim() || `${collection} ${id}`
        const created = (await cms.create(
          slug,
          {
            title,
            text: String(values.text ?? '').trim() || title,
            link,
            image: values.image ?? null,
            source: sources.length === 1 ? id : { relationTo: collection, value: id },
            channels: connections.map((connection) => ({ connection })),
            delivery: { postAt: null, channels: {} },
          },
          { user, overrideAccess: false },
        )) as Doc
        return { id: created.id, path: `/collections/${slug}/${String(created.id)}` }
      },
    }

    const job = {
      name: 'social:send',
      run: async ({ cms, now }: { cms: EasyCMS; now: Date }) => {
        const due = await cms.find(slug, {
          where: { nextAt: { lte: now.toISOString() } },
          limit: 20,
          depth: 0,
          sort: 'nextAt',
        })
        for (const doc of due.docs as Doc[]) await sendDue(cms, doc, now)
      },
    }

    // A share panel on each source collection's edit page.
    const withShare = (c: CollectionConfig): CollectionConfig =>
      sources.includes(c.slug)
        ? {
            ...c,
            admin: {
              ...c.admin,
              sidebar: [...(c.admin?.sidebar ?? []), { tag: 'ecms-social-share' }],
            },
          }
        : c

    const integrations: IntegrationConfig[] = channels.map((c) => c.integration)
    return {
      ...config,
      collections: [...(config.collections ?? []).map(withShare), posts],
      integrations: [...(config.integrations ?? []), ...integrations],
      endpoints: [
        ...(config.endpoints ?? []),
        channelsEndpoint,
        actionEndpoint,
        shareEndpoint,
        aiEndpoint,
      ],
      // Used only with an AI plugin (`ai` in the config): Write with AI on a post's text.
      aiFeatures: [
        ...(config.aiFeatures ?? []),
        {
          id: 'social',
          label: { en: 'Social posts', th: 'โพสต์โซเชียล' },
          description: {
            en: 'Writes a social post from the document it shares',
            th: 'เขียนโพสต์โซเชียลจากเอกสารที่แชร์',
          },
        },
      ],
      jobs: [...(config.jobs ?? []), job],
      events: [...new Set([...(config.events ?? []), 'social.posted', 'social.failed'])],
      admin: {
        ...config.admin,
        modules: [...new Set([...(config.admin?.modules ?? []), '@easy-cms/plugin-social/admin'])],
      },
    }
  }, INFO)
}

/** A document's words for AI: its title, then its text, textarea and rich text fields. */
function contentText(collection: CollectionConfig, doc: Doc): string {
  const parts: string[] = []
  const titleField = collection.useAsTitle
  if (titleField && typeof doc[titleField] === 'string') parts.push(doc[titleField] as string)
  const words = (node: unknown): string => {
    if (!node || typeof node !== 'object') return ''
    const n = node as { text?: unknown; content?: unknown[] }
    const own = typeof n.text === 'string' ? n.text : ''
    const kids = Array.isArray(n.content)
      ? n.content.map(words).join(n.text === undefined ? ' ' : '')
      : ''
    return `${own}${kids}`
  }
  for (const field of collection.fields) {
    if (!('name' in field) || field.name === titleField) continue
    const value = doc[field.name]
    if ((field.type === 'text' || field.type === 'textarea') && typeof value === 'string')
      parts.push(value)
    else if (field.type === 'richText') parts.push(words(value).replace(/\s+/g, ' '))
  }
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join('\n\n')
}

/** What a document shares by default: its title, first textarea, and first image. */
function defaults(collection: CollectionConfig | undefined, doc: Doc): ShareValues {
  const fields = collection?.fields ?? []
  const titleField = collection?.useAsTitle
  const first = (type: string) => {
    const field = fields.find(
      (f) => 'name' in f && f.type === type && doc[f.name] != null && doc[f.name] !== '',
    )
    return field && 'name' in field ? doc[field.name] : null
  }
  const image = first('upload')
  return {
    title: titleField && typeof doc[titleField] === 'string' ? (doc[titleField] as string) : null,
    text: (first('textarea') as string | null) ?? null,
    image:
      image && typeof image === 'object' ? ((image as Doc).id as string) : (image as string | null),
  }
}

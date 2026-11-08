import type { IntegrationConfig } from '@easy-cms/core'

/** What a channel posts: the text for it, a link, a public image URL, and the source document. */
export interface SocialMessage {
  /** The social post's id. */
  readonly post: string | number
  /** `<integration>:<connection name>`. */
  readonly channel: string
  /** The post's title, e.g. a LINE card's heading. */
  readonly title: string
  readonly text: string
  readonly link: string | null
  readonly image: { readonly url: string; readonly alt: string | null } | null
  readonly source: { readonly collection: string; readonly id: string | number } | null
}

/**
 * A place social posts go (#312): an integration admins connect accounts to, and how it posts.
 * The webhook comes first; Facebook Pages and LINE follow (#313).
 */
export interface SocialChannel {
  readonly integration: IntegrationConfig
  /** Characters a post may have there, for the admin's counter. */
  readonly maxLength?: number
  /**
   * What to say before posting, beside the channel in the panel, e.g. how many people a LINE
   * broadcast reaches and the month's quota; `warning` when it may cost or fail.
   */
  readonly preview?: (
    values: Readonly<Record<string, string>>,
  ) => Promise<{ readonly info?: string; readonly warning?: string }>
  /** Posts; returns the post's URL when the channel says. Throws `ChannelError` with the reason. */
  readonly send: (
    values: Readonly<Record<string, string>>,
    message: SocialMessage,
  ) => Promise<{ url?: string | null }>
}

/** A channel's refusal; `permanent` when trying again won't help (e.g. a revoked token). */
export class ChannelError extends Error {
  readonly permanent: boolean
  constructor(message: string, permanent = false) {
    super(message)
    this.name = 'ChannelError'
    this.permanent = permanent
  }
}

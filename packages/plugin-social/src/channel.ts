import type { IntegrationConfig } from '@easy-cms/core'

/** What a channel posts: the text for it, a link, a public image URL, and the source document. */
export interface SocialMessage {
  /** The social post's id. */
  readonly post: string | number
  /** `<integration>:<connection name>`. */
  readonly channel: string
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

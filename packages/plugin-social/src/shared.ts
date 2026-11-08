// Shared by the server and the admin module (which must not import core).

/** `GET`: the channels a post can go to, and whether the user may post. */
export const CHANNELS_PATH = '/social/channels'
/** `POST { post, action: 'now' | 'schedule' | 'cancel' | 'retry', postAt?, channel? }`. */
export const ACTION_PATH = '/social/post'
/** `POST { collection, id }`: a social post filled from a document; returns `{ id }`. */
export const SHARE_PATH = '/social/share'

/**
 * A channel's state: `waiting` (not sent), `scheduled`, `sending` (due or being tried again),
 * `posted`, `failed` (given up on).
 */
export type ChannelState = 'waiting' | 'scheduled' | 'sending' | 'posted' | 'failed'

export interface ChannelDelivery {
  state: ChannelState
  /** The post on the channel, when it says. */
  url?: string | null
  error?: string | null
  attempts: number
  nextAttemptAt?: string | null
  postedAt?: string | null
}

/** The `delivery` field of a social post: when to post, and each channel's state by connection. */
export interface Delivery {
  postAt?: string | null
  channels: Record<string, ChannelDelivery>
}

/** A channel as the admin lists it (`GET /social/channels`). */
export interface ChannelOption {
  /** `<integration>:<connection name>`. */
  id: string
  label: string
  /** The integration's logo (SVG paths), or its first letter. */
  icon?: unknown
  maxLength?: number
}

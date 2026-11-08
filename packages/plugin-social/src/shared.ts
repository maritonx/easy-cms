// Shared by the server and the admin module (which must not import core).

/** `GET`: the channels a post can go to, and whether the user may post. */
export const CHANNELS_PATH = '/social/channels'
/** `POST { post, action: 'now' | 'schedule' | 'cancel' | 'retry', postAt?, channel? }`. */
export const ACTION_PATH = '/social/post'
/**
 * `POST { post?, doc, channel? }` (#312, with an AI plugin): the post's text written by AI from its
 * source, for a channel's length when one is named; returns `{ text }`.
 */
export const AI_PATH = '/social/ai'
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
  /** How the channel counts: `x`, X's weighted length (see `xLength`). */
  counting?: 'x'
}

/** Characters an X post may have, by X's count. */
export const X_MAX = 280

/** X's weight-1 ranges: Latin to Georgian (Thai is in them), and some punctuation. */
const LIGHT: readonly (readonly [number, number])[] = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
]

/**
 * A text's length as X counts it: a link 23 whatever its length, an emoji 2, CJK and other
 * scripts 2 a character, the rest (Thai among them) 1 a code point.
 */
export function xLength(text: string): number {
  let total = 0
  for (const part of text.split(/(https?:\/\/\S+)/)) {
    if (/^https?:\/\//.test(part)) {
      total += 23
      continue
    }
    const graphemes =
      typeof Intl.Segmenter === 'function'
        ? Array.from(
            new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(part),
            (g) => g.segment,
          )
        : [...part]
    for (const grapheme of graphemes) {
      if (/\p{Extended_Pictographic}/u.test(grapheme)) {
        total += 2
        continue
      }
      for (const char of grapheme) {
        const code = char.codePointAt(0) ?? 0
        total += LIGHT.some(([from, to]) => code >= from && code <= to) ? 1 : 2
      }
    }
  }
  return total
}

import type { IntegrationConfig } from '@easy-cms/core'
import type { Notice } from './messages.js'

/**
 * A place notifications go (Telegram first; LINE, Slack and Discord later). Its integration
 * gives the fields admins fill on the Integrations page, beside the ones every channel has
 * (`language`, `events`).
 */
export interface NotifyChannel {
  readonly integration: IntegrationConfig
  /** Formats a notice for this channel; `link` is the admin page, when `serverURL` is set. */
  readonly format: (notice: Notice, link: string | undefined) => string
  /** Sends a formatted message; throws with the provider's reason. */
  readonly send: (values: Readonly<Record<string, string>>, text: string) => Promise<void>
}

/** A provider's answer that wasn't OK, for the error a connection shows. */
export class ChannelError extends Error {
  /** Retrying won't help, e.g. a revoked token. */
  readonly permanent: boolean
  constructor(message: string, permanent = false) {
    super(message)
    this.name = 'ChannelError'
    this.permanent = permanent
  }
}

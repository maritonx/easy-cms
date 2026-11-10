import { type Config, definePlugin, type IntegrationConfig } from '@easy-cms/core'
import { brevo } from './brevo.js'
import { INFO } from './info.js'
import { postmark } from './postmark.js'
import { resend } from './resend.js'

/** The providers `emailPlugin()` offers by default. */
export const emailProviders: readonly IntegrationConfig[] = [resend, postmark, brevo]

export interface EmailPluginOptions {
  /**
   * The providers offered in Integrations → Email. Default: Resend, Postmark and Brevo. Add
   * `smtpProvider` from `@easy-cms/email-smtp` for any mail server, or your own with
   * `defineEmailProvider()`.
   */
  readonly providers?: readonly IntegrationConfig[]
}

/**
 * Email providers an admin connects and chooses in Integrations → Email (#404): the config's
 * `email`, if any, stays the default. Their webhooks say what happened to each email, and
 * bounces and spam reports keep an address off the suppression list.
 */
export function emailPlugin(options: EmailPluginOptions = {}) {
  const providers = options.providers ?? emailProviders
  for (const provider of providers)
    if (!provider.email)
      throw new Error(`emailPlugin: "${provider.id}" doesn't send email (use defineEmailProvider)`)
  return definePlugin(
    (config: Config): Config => ({
      ...config,
      integrations: [...(config.integrations ?? []), ...providers],
    }),
    INFO,
  )
}

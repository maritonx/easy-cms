import { type Config, definePlugin, type IntegrationConfig } from '@easy-cms/core'
import { INFO } from './info.js'
import { PROVIDERS, type ProviderId } from './providers.js'

export interface AiPluginOptions {
  /** The providers offered on the Integrations page. Default: all four. */
  readonly providers?: readonly ProviderId[]
  readonly limits?: {
    /** Requests a user makes a day. Admins can change it. Default 100. */
    readonly perUserPerDay?: number
    /** Per role, e.g. `{ editor: 50 }`; 0 keeps a role from using AI. */
    readonly roles?: Readonly<Record<string, number>>
  }
}

/**
 * AI for the admin's features: admins connect Claude, GPT, Gemini or an OpenAI-compatible server
 * in Settings → Integrations (AI), and features ask `cms.ai.generate()`.
 */
export function aiPlugin(options: AiPluginOptions = {}) {
  const ids = options.providers ?? (Object.keys(PROVIDERS) as ProviderId[])
  const unknown = ids.filter((id) => !(id in PROVIDERS))
  if (unknown.length > 0)
    throw new Error(
      `aiPlugin: unknown provider ${unknown.map((id) => `"${id}"`).join(', ')}; use ${Object.keys(PROVIDERS).join(', ')}`,
    )
  const chosen = ids.map((id) => PROVIDERS[id])

  return definePlugin((config: Config): Config => {
    if (config.ai) throw new Error('aiPlugin: `ai` is set already; add the plugin once')
    // Test asks for a word through `cms.ai`, so its tokens show on the card.
    const integrations: IntegrationConfig[] = chosen.map(({ integration, defaultModel }) => ({
      ...integration,
      async test(values, { cms, name }) {
        if (!cms.ai) return { ok: false, message: 'AI is not set up' }
        const result = await cms.ai.test(integration.id, values, name)
        // The card names the model it answers with.
        return result.ok && !result.account && defaultModel
          ? { ...result, account: defaultModel }
          : result
      },
    }))
    return {
      ...config,
      integrations: [...(config.integrations ?? []), ...integrations],
      ai: {
        providers: chosen.map((p) => ({ integration: p.integration.id, generate: p.generate })),
        ...(options.limits ? { limits: options.limits } : {}),
      },
    }
  }, INFO)
}

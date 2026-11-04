import {
  type AiProvider,
  AiProviderError,
  type AiProviderRequest,
  type AiProviderResult,
  type IntegrationConfig,
  type IntegrationField,
} from '@easy-cms/core'

// The providers' HTTP APIs, without their SDKs. `<NAME>_API_URL` points tests at a stand-in
// server.

type Values = Readonly<Record<string, string>>
type Choice = { value: string; label: string }

/** A provider: its card on the Integrations page, and how it answers. */
export interface AiProviderDefinition {
  readonly integration: IntegrationConfig
  readonly generate: AiProvider['generate']
  /** The models it offers, for the model's Find button. */
  readonly models: (values: Values) => Promise<Choice[]>
  readonly defaultModel?: string
}

const trim = (url: string) => url.replace(/\/+$/, '')

async function request(url: string, init: RequestInit & { signal?: AbortSignal }) {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(30_000),
    })
  } catch (error) {
    if ((error as Error).name === 'TimeoutError') throw error
    throw new AiProviderError(`The AI provider could not be reached: ${(error as Error).message}`)
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const error = body.error as { message?: string } | string | undefined
    const message = typeof error === 'string' ? error : error?.message
    throw new AiProviderError(message ?? `HTTP ${response.status}`, response.status)
  }
  return body
}

/** Asks for JSON in words too: not every provider has a JSON mode. */
function systemOf(req: AiProviderRequest): string | undefined {
  const json = req.json
    ? `Answer with JSON only, no other text, matching this JSON schema: ${JSON.stringify(req.json)}`
    : undefined
  return [req.system, json].filter(Boolean).join('\n\n') || undefined
}

const keyField = (label: string, required = true): IntegrationField => ({
  name: 'apiKey',
  label: { en: 'API key', th: 'API key' },
  description: { en: `From ${label}.`, th: `จาก ${label}` },
  secret: true,
  required,
})
const modelField = (defaultModel: string | undefined, models: AiProviderDefinition['models']) =>
  ({
    name: 'model',
    label: { en: 'Model', th: 'Model' },
    ...(defaultModel
      ? {
          placeholder: defaultModel,
          description: {
            en: `Empty: ${defaultModel}. Find lists the models your key can use.`,
            th: `ถ้าว่าง: ${defaultModel} ปุ่มค้นหาแสดง model ที่ key นี้ใช้ได้`,
          },
        }
      : {
          required: true,
          description: { en: 'Find lists the models offered.', th: 'ปุ่มค้นหาแสดง model ที่มี' },
        }),
    lookup: (values) => models(values),
  }) satisfies IntegrationField

const consent = (provider: string, policy: string) => ({
  text: {
    en: `Text and images used with AI features are sent to ${provider}, which handles them under its own policy. Keys stay on this server.`,
    th: `ข้อความและรูปที่ใช้กับฟีเจอร์ AI จะถูกส่งไปที่ ${provider} ซึ่งจัดการตามนโยบายของตัวเอง key อยู่บนเซิร์ฟเวอร์นี้เท่านั้น`,
  },
  policy,
})

// --- Anthropic ----------------------------------------------------------------------------------

const anthropicURL = () => trim(process.env.ANTHROPIC_API_URL ?? 'https://api.anthropic.com')
const anthropicHeaders = (values: Values) => ({
  'content-type': 'application/json',
  'x-api-key': values.apiKey ?? '',
  'anthropic-version': '2023-06-01',
})

const anthropicModels = async (values: Values) => {
  const body = await request(`${anthropicURL()}/v1/models?limit=100`, {
    headers: anthropicHeaders(values),
  })
  return ((body.data ?? []) as { id: string; display_name?: string }[]).map((m) => ({
    value: m.id,
    label: m.display_name ? `${m.display_name} (${m.id})` : m.id,
  }))
}

export const anthropic: AiProviderDefinition = {
  defaultModel: 'claude-sonnet-5-5',
  integration: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    category: 'ai',
    description: { en: 'Claude models', th: 'model Claude' },
    plugin: '@easy-cms/plugin-ai',
    docs: 'https://easycms.dev/docs/ai',
    kind: 'fields',
    fields: [keyField('console.anthropic.com'), modelField('claude-sonnet-5-5', anthropicModels)],
    env: { apiKey: 'ANTHROPIC_API_KEY' },
    consent: consent('Anthropic', 'https://www.anthropic.com/legal/privacy'),
  },
  models: anthropicModels,
  async generate(values, req): Promise<AiProviderResult> {
    const system = systemOf(req)
    const body = await request(`${anthropicURL()}/v1/messages`, {
      method: 'POST',
      headers: anthropicHeaders(values),
      signal: req.signal,
      body: JSON.stringify({
        model: values.model || 'claude-sonnet-5-5',
        max_tokens: req.maxTokens,
        ...(system ? { system } : {}),
        messages: [
          {
            role: 'user',
            content: [
              ...req.images.map((i) => ({
                type: 'image',
                source: { type: 'base64', media_type: i.mediaType, data: i.data },
              })),
              { type: 'text', text: req.prompt },
            ],
          },
        ],
      }),
    })
    const content = (body.content ?? []) as { type: string; text?: string }[]
    const usage = (body.usage ?? {}) as { input_tokens?: number; output_tokens?: number }
    return {
      text: content
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join(''),
      usage: { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0 },
    }
  },
}

// --- OpenAI and OpenAI-compatible ---------------------------------------------------------------

function openAiCompatible(options: {
  id: string
  label: IntegrationConfig['label']
  description: { en: string; th: string }
  base: (values: Values) => string
  defaultModel?: string
  /** OpenAI's own API takes `max_completion_tokens`; others still `max_tokens`. */
  official: boolean
  fields: (models: AiProviderDefinition['models']) => IntegrationField[]
  env?: Record<string, string>
  consent: IntegrationConfig['consent']
}): AiProviderDefinition {
  const headers = (values: Values) => ({
    'content-type': 'application/json',
    ...(values.apiKey ? { authorization: `Bearer ${values.apiKey}` } : {}),
  })
  const models = async (values: Values) => {
    const body = await request(`${options.base(values)}/models`, { headers: headers(values) })
    return ((body.data ?? []) as { id: string }[])
      .map((m) => ({ value: m.id, label: m.id }))
      .sort((a, b) => a.value.localeCompare(b.value))
  }
  return {
    ...(options.defaultModel ? { defaultModel: options.defaultModel } : {}),
    integration: {
      id: options.id,
      label: options.label,
      category: 'ai',
      description: options.description,
      plugin: '@easy-cms/plugin-ai',
      docs: 'https://easycms.dev/docs/ai',
      kind: 'fields',
      fields: options.fields(models),
      ...(options.env ? { env: options.env } : {}),
      ...(options.consent ? { consent: options.consent } : {}),
    },
    models,
    async generate(values, req) {
      const system = systemOf(req)
      const text = { type: 'text', text: req.prompt }
      const images = req.images.map((i) => ({
        type: 'image_url',
        image_url: { url: `data:${i.mediaType};base64,${i.data}` },
      }))
      const body = await request(`${options.base(values)}/chat/completions`, {
        method: 'POST',
        headers: headers(values),
        signal: req.signal,
        body: JSON.stringify({
          model: values.model || options.defaultModel,
          [options.official ? 'max_completion_tokens' : 'max_tokens']: req.maxTokens,
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            // Text alone as a string: some compatible servers take nothing else.
            { role: 'user', content: images.length > 0 ? [text, ...images] : req.prompt },
          ],
          ...(req.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      })
      const choices = (body.choices ?? []) as { message?: { content?: string } }[]
      const usage = (body.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number }
      return {
        text: choices[0]?.message?.content ?? '',
        usage: { input: usage.prompt_tokens ?? 0, output: usage.completion_tokens ?? 0 },
      }
    },
  }
}

export const openai: AiProviderDefinition = openAiCompatible({
  id: 'openai',
  label: 'OpenAI (GPT)',
  description: { en: 'GPT models', th: 'model GPT' },
  base: () => trim(process.env.OPENAI_API_URL ?? 'https://api.openai.com/v1'),
  defaultModel: 'gpt-5-mini',
  official: true,
  fields: (models) => [keyField('platform.openai.com'), modelField('gpt-5-mini', models)],
  env: { apiKey: 'OPENAI_API_KEY' },
  consent: consent('OpenAI', 'https://openai.com/policies/privacy-policy'),
})

export const openaiCompatible: AiProviderDefinition = openAiCompatible({
  id: 'openai-compatible',
  label: 'OpenAI-compatible',
  description: {
    en: 'Ollama, OpenRouter or another server with an OpenAI-style API',
    th: 'Ollama, OpenRouter หรือเซิร์ฟเวอร์อื่นที่มี API แบบ OpenAI',
  },
  base: (values) => trim(values.baseUrl ?? ''),
  official: false,
  fields: (models) => [
    {
      name: 'baseUrl',
      label: { en: 'Base URL', th: 'Base URL' },
      type: 'url',
      placeholder: 'http://localhost:11434/v1',
      description: {
        en: 'Up to /v1, e.g. https://openrouter.ai/api/v1',
        th: 'ถึง /v1 เช่น https://openrouter.ai/api/v1',
      },
      required: true,
    },
    keyField('the provider, if it needs one', false),
    modelField(undefined, models),
  ],
  consent: {
    text: {
      en: 'Text and images used with AI features are sent to the server at this address, which handles them under its own policy.',
      th: 'ข้อความและรูปที่ใช้กับฟีเจอร์ AI จะถูกส่งไปที่เซิร์ฟเวอร์ตามที่อยู่นี้ ซึ่งจัดการตามนโยบายของตัวเอง',
    },
  },
})

// --- Google Gemini ------------------------------------------------------------------------------

const geminiURL = () =>
  trim(process.env.GEMINI_API_URL ?? 'https://generativelanguage.googleapis.com')
const geminiHeaders = (values: Values) => ({
  'content-type': 'application/json',
  'x-goog-api-key': values.apiKey ?? '',
})
const geminiModels = async (values: Values) => {
  const body = await request(`${geminiURL()}/v1beta/models?pageSize=1000`, {
    headers: geminiHeaders(values),
  })
  return (
    (body.models ?? []) as {
      name: string
      displayName?: string
      supportedGenerationMethods?: string[]
    }[]
  )
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent') ?? true)
    .map((m) => {
      const id = m.name.replace(/^models\//, '')
      return { value: id, label: m.displayName ? `${m.displayName} (${id})` : id }
    })
}

export const gemini: AiProviderDefinition = {
  defaultModel: 'gemini-flash-latest',
  integration: {
    id: 'gemini',
    label: 'Google Gemini',
    category: 'ai',
    description: { en: 'Gemini models', th: 'model Gemini' },
    plugin: '@easy-cms/plugin-ai',
    docs: 'https://easycms.dev/docs/ai',
    kind: 'fields',
    fields: [keyField('aistudio.google.com'), modelField('gemini-flash-latest', geminiModels)],
    env: { apiKey: 'GEMINI_API_KEY' },
    consent: consent('Google', 'https://ai.google.dev/gemini-api/terms'),
  },
  models: geminiModels,
  async generate(values, req) {
    const system = systemOf(req)
    const model = values.model || 'gemini-flash-latest'
    const body = await request(
      `${geminiURL()}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: geminiHeaders(values),
        signal: req.signal,
        body: JSON.stringify({
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents: [
            {
              role: 'user',
              parts: [
                ...req.images.map((i) => ({ inlineData: { mimeType: i.mediaType, data: i.data } })),
                { text: req.prompt },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: req.maxTokens,
            ...(req.json ? { responseMimeType: 'application/json' } : {}),
          },
        }),
      },
    )
    const candidates = (body.candidates ?? []) as { content?: { parts?: { text?: string }[] } }[]
    const usage = (body.usageMetadata ?? {}) as {
      promptTokenCount?: number
      candidatesTokenCount?: number
    }
    return {
      text: (candidates[0]?.content?.parts ?? []).map((p) => p.text ?? '').join(''),
      usage: { input: usage.promptTokenCount ?? 0, output: usage.candidatesTokenCount ?? 0 },
    }
  },
}

export const PROVIDERS = {
  anthropic,
  openai,
  gemini,
  'openai-compatible': openaiCompatible,
} as const
export type ProviderId = keyof typeof PROVIDERS

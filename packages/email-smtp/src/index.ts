import { defineEmailProvider, type EmailAdapter } from '@easy-cms/core'
import nodemailer, { type Transporter } from 'nodemailer'

export interface SmtpOptions {
  /** SMTP server, e.g. `smtp.gmail.com`. Default: `SMTP_HOST`. */
  readonly host?: string
  /** Default: `SMTP_PORT`, else 587. */
  readonly port?: number
  /** TLS from the start (port 465). Default: true for port 465; others upgrade with STARTTLS. */
  readonly secure?: boolean
  /**
   * Refuse to send unless the connection upgrades with STARTTLS, so passwords and mail never
   * cross the network in the clear. Default: true for port 587; `false` e.g. for a local mail
   * catcher without TLS.
   */
  readonly requireTLS?: boolean
  /** Default: `SMTP_USER` and `SMTP_PASSWORD`. */
  readonly user?: string
  readonly password?: string
  /** Sender when a message has none, e.g. `My Site <no-reply@example.com>`. Default: `SMTP_FROM`. */
  readonly from?: string
  /** Other nodemailer transport options (pooling, DKIM, proxies…). */
  readonly transport?: Record<string, unknown>
}

/**
 * Sends Easy CMS email over SMTP with nodemailer: Gmail, Amazon SES, Resend, Mailgun, Postmark,
 * or your own server. Settings are read when the first email is sent, so the config can load
 * without them (e.g. during a build).
 *
 * ```ts
 * email: smtp({ host: 'smtp.resend.com', user: 'resend', password: process.env.RESEND_KEY })
 * ```
 */
export function smtp(options: SmtpOptions = {}): EmailAdapter {
  let transporter: Transporter | undefined
  const env = process.env
  const transport = () => {
    if (transporter) return transporter
    const host = options.host ?? env.SMTP_HOST
    if (!host) throw new Error('smtp: set `host` (or SMTP_HOST)')
    const port = options.port ?? (env.SMTP_PORT ? Number(env.SMTP_PORT) : 587)
    const user = options.user ?? env.SMTP_USER
    const pass = options.password ?? env.SMTP_PASSWORD
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: options.secure ?? port === 465,
      requireTLS: options.requireTLS ?? port === 587,
      ...(user ? { auth: { user, pass } } : {}),
      ...options.transport,
    })
    return transporter
  }
  /** A setting and where it comes from: the option, else its environment variable. */
  const setting = (key: string, option: string, value: unknown, variable: string) => {
    if (value !== undefined) return { key, value: String(value), source: `smtp({ ${option} })` }
    const fromEnv = env[variable]
    return fromEnv
      ? { key, value: fromEnv, source: variable }
      : { key, value: null, source: variable }
  }
  const adapter: EmailAdapter = {
    name: 'smtp',
    apiVersion: 1,
    get from() {
      return options.from ?? env.SMTP_FROM
    },
    describe() {
      const port = options.port ?? (env.SMTP_PORT ? Number(env.SMTP_PORT) : 587)
      const password = options.password ?? env.SMTP_PASSWORD
      return [
        setting('host', 'host', options.host, 'SMTP_HOST'),
        options.port !== undefined || env.SMTP_PORT
          ? setting('port', 'port', options.port, 'SMTP_PORT')
          : { key: 'port', value: '587', source: 'default' },
        {
          key: 'secure',
          value: String(options.secure ?? port === 465),
          source: options.secure !== undefined ? 'smtp({ secure })' : 'port 465 or not',
        },
        {
          key: 'requireTLS',
          value: String(options.requireTLS ?? port === 587),
          source: options.requireTLS !== undefined ? 'smtp({ requireTLS })' : 'port 587 or not',
        },
        setting('user', 'user', options.user, 'SMTP_USER'),
        // Never the password itself.
        {
          key: 'password',
          value: password ? 'set' : null,
          source: options.password !== undefined ? 'smtp({ password })' : 'SMTP_PASSWORD',
        },
        setting('from', 'from', options.from, 'SMTP_FROM'),
      ]
    },
    async verify() {
      await transport().verify()
    },
    async send(message) {
      const list = (value: string | readonly string[] | undefined) =>
        value === undefined ? undefined : typeof value === 'string' ? value : [...value]
      const info = await transport().sendMail({
        from: message.from,
        to: list(message.to),
        cc: list(message.cc),
        bcc: list(message.bcc),
        ...(message.replyTo ? { replyTo: message.replyTo } : {}),
        subject: message.subject,
        ...(message.html ? { html: message.html } : {}),
        ...(message.text ? { text: message.text } : {}),
      })
      return typeof info?.messageId === 'string' ? { id: info.messageId } : undefined
    },
  }
  return adapter
}

/**
 * SMTP as a provider an admin connects in Integrations → Email (with `emailPlugin()` from
 * `@easy-cms/plugin-email`): host, port, user and password typed in the admin, not the code.
 *
 * ```ts
 * emailPlugin({ providers: [...emailProviders, smtpProvider] })
 * ```
 */
export const smtpProvider = defineEmailProvider({
  id: 'smtp',
  label: 'SMTP',
  description: {
    en: 'Any mail server: Gmail, Microsoft 365, your host’s',
    th: 'เซิร์ฟเวอร์อีเมลใดก็ได้ เช่น Gmail, Microsoft 365 หรือของโฮสต์',
  },
  icon: 'mail',
  docs: 'https://easycms.dev/docs/email#smtp',
  plugin: '@easy-cms/email-smtp',
  fields: [
    { name: 'host', label: 'Host', placeholder: 'smtp.gmail.com', required: true },
    { name: 'port', label: 'Port', placeholder: '587' },
    { name: 'user', label: { en: 'User', th: 'ชื่อผู้ใช้' } },
    { name: 'password', label: { en: 'Password', th: 'รหัสผ่าน' }, secret: true },
  ],
  create: (values) => fromValues(values),
  async test(values) {
    try {
      const adapter = fromValues(values)
      await adapter.verify?.()
      return { ok: true, account: values.user || values.host || '' }
    } catch (error) {
      return { ok: false, message: (error as Error).message }
    }
  },
})

/** The adapter for a connection's values: nothing from the environment. */
function fromValues(values: Readonly<Record<string, string>>): EmailAdapter {
  const port = Number(values.port || 587)
  return smtp({
    host: values.host ?? '',
    port: Number.isFinite(port) ? port : 587,
    // Empty: no login, rather than SMTP_USER from the environment.
    user: values.user ?? '',
    password: values.password ?? '',
    ...(values.from ? { from: values.from } : {}),
  })
}

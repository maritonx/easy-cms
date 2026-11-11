import { type Config, definePlugin, type IntegrationConfig } from '@easy-cms/core'
import { github, google, microsoft, oidc } from './index.js'
import { INFO } from './info.js'
import { GITHUB, GOOGLE, MICROSOFT, OPENID } from './logos.js'

// Sign-in providers an admin turns on in Settings → Integrations → Sign-in (ADR-0066), beside
// the config's `auth.providers`.

const PLUGIN = '@easy-cms/auth-oauth'
const DOCS = 'https://easycms.dev/docs/sso#in-the-admin'

/** An app's client id and secret, from the admin or the environment. */
const appKeys = (prefix: string, shared: string) => ({
  fields: [
    { name: 'clientId', label: { en: 'Client ID', th: 'Client ID' }, required: true },
    {
      name: 'clientSecret',
      label: { en: 'Client secret', th: 'Client secret' },
      secret: true,
      required: true,
    },
  ],
  env: { clientId: `${prefix}_CLIENT_ID`, clientSecret: `${prefix}_CLIENT_SECRET` },
  shared,
})

function keys(app: Readonly<Record<string, string>>) {
  if (!app.clientId || !app.clientSecret)
    throw new Error("enter the app's Client ID and Client secret first")
  return { clientId: app.clientId, clientSecret: app.clientSecret }
}

/** Google accounts, including Google Workspace. Shares its app keys with Google Drive backups. */
export const googleSignIn: IntegrationConfig = {
  id: 'google-sign-in',
  label: 'Google',
  category: 'sign-in',
  icon: GOOGLE,
  description: {
    en: 'Sign in with Google accounts, through a Google Cloud app of your own.',
    th: 'เข้าสู่ระบบด้วยบัญชี Google ผ่านแอป Google Cloud ของคุณเอง',
  },
  docs: DOCS,
  plugin: PLUGIN,
  kind: 'fields',
  app: appKeys('GOOGLE', 'google'),
  fields: [
    {
      name: 'hd',
      label: { en: 'Workspace domain', th: 'โดเมน Workspace' },
      description: {
        en: 'Shows only accounts of this Google Workspace domain. Who gets in is decided by existing users and sign-up rules.',
        th: 'แสดงเฉพาะบัญชีของโดเมน Google Workspace นี้ ส่วนใครเข้าได้ขึ้นกับผู้ใช้ที่มีอยู่และกฎการสมัคร',
      },
      placeholder: 'example.com',
    },
  ],
  signIn: {
    providerId: 'google',
    single: true,
    create: (values, { app }) => google({ ...keys(app), ...(values.hd ? { hd: values.hd } : {}) }),
  },
}

/** Work and school accounts of one Microsoft Entra ID organization. */
export const microsoftSignIn: IntegrationConfig = {
  id: 'microsoft-sign-in',
  label: 'Microsoft',
  category: 'sign-in',
  icon: MICROSOFT,
  description: {
    en: 'Sign in with work and school accounts of your Microsoft Entra ID organization.',
    th: 'เข้าสู่ระบบด้วยบัญชีที่ทำงานหรือสถานศึกษาขององค์กรใน Microsoft Entra ID',
  },
  docs: DOCS,
  plugin: PLUGIN,
  kind: 'fields',
  app: appKeys('MICROSOFT', 'microsoft'),
  fields: [
    {
      name: 'tenant',
      label: { en: 'Directory (tenant) ID', th: 'Directory (tenant) ID' },
      required: true,
      placeholder: '00000000-0000-0000-0000-000000000000',
    },
  ],
  signIn: {
    providerId: 'microsoft',
    single: true,
    create: (values, { app }) => microsoft({ ...keys(app), tenant: values.tenant ?? '' }),
  },
}

/** GitHub accounts (an OAuth app), or GitHub Enterprise Server's. */
export const githubSignIn: IntegrationConfig = {
  id: 'github-sign-in',
  label: 'GitHub',
  category: 'sign-in',
  icon: GITHUB,
  description: {
    en: 'Sign in with GitHub accounts, through a GitHub OAuth app of your own.',
    th: 'เข้าสู่ระบบด้วยบัญชี GitHub ผ่าน GitHub OAuth app ของคุณเอง',
  },
  docs: DOCS,
  plugin: PLUGIN,
  kind: 'fields',
  app: appKeys('GITHUB', 'github'),
  fields: [
    {
      name: 'server',
      type: 'url',
      label: { en: 'GitHub Enterprise Server', th: 'GitHub Enterprise Server' },
      description: {
        en: 'Its address, for GitHub Enterprise Server only. Leave empty for github.com.',
        th: 'ที่อยู่ของเซิร์ฟเวอร์ เฉพาะ GitHub Enterprise Server เว้นว่างไว้สำหรับ github.com',
      },
      placeholder: 'https://github.example.com',
    },
  ],
  signIn: {
    providerId: 'github',
    single: true,
    create: (values, { app }) => {
      const web = values.server?.replace(/\/+$/, '')
      return github({ ...keys(app), ...(web ? { server: { web, api: `${web}/api/v3` } } : {}) })
    },
  },
}

/** Any OpenID Connect provider: Okta, Keycloak, Auth0, Authentik, Zitadel… One per connection. */
export const oidcSignIn: IntegrationConfig = {
  id: 'oidc-sign-in',
  label: 'OpenID Connect',
  category: 'sign-in',
  icon: OPENID,
  description: {
    en: 'Sign in with Okta, Keycloak, Auth0 or any other OpenID Connect provider.',
    th: 'เข้าสู่ระบบด้วย Okta, Keycloak, Auth0 หรือผู้ให้บริการ OpenID Connect อื่น',
  },
  docs: DOCS,
  plugin: PLUGIN,
  kind: 'fields',
  fields: [
    {
      name: 'label',
      label: { en: 'Button text', th: 'ข้อความบนปุ่ม' },
      required: true,
      placeholder: 'Okta',
    },
    {
      name: 'id',
      label: { en: 'Id', th: 'Id' },
      description: {
        en: 'In the redirect URL (…/auth/<id>/callback) and linked accounts: lowercase letters, digits and -. Changing it unlinks everyone.',
        th: 'อยู่ใน redirect URL (…/auth/<id>/callback) และบัญชีที่เชื่อมไว้ ใช้ตัวพิมพ์เล็ก ตัวเลข และ - ถ้าเปลี่ยน ทุกคนต้องเชื่อมบัญชีใหม่',
      },
      required: true,
      placeholder: 'okta',
    },
    {
      name: 'issuer',
      type: 'url',
      label: { en: 'Issuer', th: 'Issuer' },
      required: true,
      placeholder: 'https://example.okta.com',
    },
    { name: 'clientId', label: { en: 'Client ID', th: 'Client ID' }, required: true },
    {
      name: 'clientSecret',
      label: { en: 'Client secret', th: 'Client secret' },
      description: {
        en: 'Leave empty for a public client (PKCE only).',
        th: 'เว้นว่างสำหรับ public client (ใช้ PKCE อย่างเดียว)',
      },
      secret: true,
    },
  ],
  // Reads the provider's discovery document: the issuer is right and it answers.
  test: async (values) => {
    try {
      const url = new URL(
        '.well-known/openid-configuration',
        `${values.issuer?.replace(/\/+$/, '')}/`,
      )
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (!response.ok) return { ok: false, message: `${url} answered ${response.status}` }
      const doc = (await response.json()) as { issuer?: string }
      return { ok: true, ...(doc.issuer ? { account: doc.issuer } : {}) }
    } catch (error) {
      return { ok: false, message: `The issuer can't be reached: ${(error as Error).message}` }
    }
  },
  signIn: {
    create: (values) =>
      oidc({
        id: values.id ?? '',
        name: values.label || 'SSO',
        issuer: values.issuer ?? '',
        clientId: values.clientId ?? '',
        ...(values.clientSecret ? { clientSecret: values.clientSecret } : {}),
      }),
  },
}

export interface SignInPluginOptions {
  /** The providers offered in Integrations → Sign-in. Default: Google, Microsoft, GitHub and OpenID Connect. */
  readonly providers?: readonly IntegrationConfig[]
}

/**
 * Sign-in providers to turn on in the admin (Settings → Integrations → Sign-in): Google,
 * Microsoft, GitHub and any OpenID Connect provider. The config's `auth.providers` stay the
 * default; `auth.locked: true` keeps only them.
 */
export function signInPlugin(options: SignInPluginOptions = {}) {
  const providers = options.providers ?? [googleSignIn, microsoftSignIn, githubSignIn, oidcSignIn]
  for (const provider of providers)
    if (typeof provider.signIn?.create !== 'function')
      throw new Error(`signInPlugin: "${provider.id}" has no signIn.create()`)
  return definePlugin(
    (config: Config): Config => ({
      ...config,
      integrations: [...(config.integrations ?? []), ...providers],
    }),
    INFO,
  )
}

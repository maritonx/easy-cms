import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { type Access, type AuthUser, isSystemAdmin, type RequestContext } from './access.js'
import type { CollectionConfig } from './config.js'

export const API_KEYS = 'api-keys'

/** What a key may do with a collection. `create` on `media` means uploading. */
export const API_KEY_OPERATIONS = ['read', 'create', 'update', 'delete', 'publish'] as const
export type ApiKeyOperation = (typeof API_KEY_OPERATIONS)[number]
/** What a key may do with a global. */
export const API_KEY_GLOBAL_OPERATIONS = ['read', 'update', 'publish'] as const
export type ApiKeyGlobalOperation = (typeof API_KEY_GLOBAL_OPERATIONS)[number]

/** Stored in the key's `permissions` field. Anything not listed is not allowed. */
export interface ApiKeyPermissions {
  readonly collections?: Readonly<Record<string, readonly ApiKeyOperation[]>>
  readonly globals?: Readonly<Record<string, readonly ApiKeyGlobalOperation[]>>
  /**
   * With `upload.folders`: the media folders (ids) the key may use, with their subfolders. Empty
   * or missing: every folder.
   */
  readonly folders?: readonly (string | number)[]
  /**
   * The context the key was created in (`onRequest`, e.g. its tenant), kept for good: requests
   * with the key get it as `user.apiKey.permissions.context`. Set by Easy CMS, not by input.
   */
  readonly context?: RequestContext
}

/** Set on `AuthUser.apiKey` when a request authenticated with an API key. */
export interface ApiKeyContext {
  readonly id: number | string
  readonly name: string
  readonly permissions: ApiKeyPermissions
}

/** Collections a key can never be given access to. */
export const API_KEY_EXCLUDED: ReadonlySet<string> = new Set(['users', API_KEYS])

/** `ecms_<8 hex prefix>_<secret>`: the prefix finds the key, the secret proves it. */
const KEY_PATTERN = /^ecms_([0-9a-f]{8})_([A-Za-z0-9_-]{32,})$/

export function isApiKey(token: string): boolean {
  return token.startsWith('ecms_')
}

export function newApiKey(): { key: string; prefix: string; hash: string } {
  const prefix = randomBytes(4).toString('hex')
  const secret = randomBytes(32).toString('base64url')
  return { key: `ecms_${prefix}_${secret}`, prefix, hash: hashSecret(secret) }
}

/** The secret is random and long, so a fast hash is enough (no password stretching needed). */
function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

export function parseApiKey(token: string): { prefix: string; secret: string } | null {
  const match = KEY_PATTERN.exec(token)
  return match ? { prefix: match[1] as string, secret: match[2] as string } : null
}

export function secretMatches(secret: string, hash: unknown): boolean {
  if (typeof hash !== 'string') return false
  const a = Buffer.from(hashSecret(secret), 'hex')
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Whether a request's API key allows an operation. Always true without a key (sessions are
 * governed by access rules alone); a key only narrows what its user may do.
 */
export function keyAllows(
  user: AuthUser | null,
  target: { collection: string } | { global: string },
  operation: ApiKeyOperation,
): boolean {
  const key = user?.apiKey as ApiKeyContext | undefined
  if (!key) return true
  if ('collection' in target) {
    if (API_KEY_EXCLUDED.has(target.collection)) return false
    return key.permissions.collections?.[target.collection]?.includes(operation) ?? false
  }
  const allowed = key.permissions.globals?.[target.global] as readonly string[] | undefined
  return allowed?.includes(operation) ?? false
}

/** Admins of the system manage every key; other users only their own. API keys never manage keys. */
const ownKeys: Access = ({ user }) =>
  !user || user.apiKey ? false : isSystemAdmin(user) ? true : { user: { equals: user.id } }
const system = { update: () => false }

/** The `api-keys` collection, added with `apiKeys: true`. Keys are created with `cms.createApiKey()`. */
export const apiKeysCollection: CollectionConfig = {
  slug: API_KEYS,
  labels: {
    singular: { en: 'API key', th: 'API key' },
    plural: { en: 'API keys', th: 'API keys' },
  },
  useAsTitle: 'name',
  admin: { icon: 'key' },
  access: {
    read: ownKeys,
    // Through `createApiKey` (POST <api>/api-keys), which generates the secret.
    create: ({ user }) => !!user && !user.apiKey,
    update: ownKeys,
    delete: ownKeys,
  },
  fields: [
    { name: 'name', type: 'text', required: true, label: { en: 'Name', th: 'ชื่อ' } },
    {
      name: 'permissions',
      type: 'json',
      label: { en: 'Permissions', th: 'สิทธิ์' },
      admin: { component: 'ecms-api-key-permissions' },
    },
    {
      name: 'expiresAt',
      type: 'date',
      label: { en: 'Expires', th: 'หมดอายุ' },
      admin: { position: 'sidebar' },
    },
    {
      name: 'prefix',
      type: 'text',
      index: true,
      label: { en: 'Key starts with', th: 'ขึ้นต้นด้วย' },
      admin: { position: 'sidebar' },
      access: system,
    },
    {
      name: 'user',
      type: 'relationship',
      to: 'users',
      label: { en: 'Owner', th: 'เจ้าของ' },
      admin: { position: 'sidebar' },
      access: system,
    },
    {
      name: 'lastUsedAt',
      type: 'date',
      label: { en: 'Last used', th: 'ใช้ล่าสุด' },
      admin: { position: 'sidebar' },
      access: system,
    },
    { name: 'keyHash', type: 'text', hidden: true },
  ],
  hooks: {
    // Only real collections, globals and operations are kept. A key keeps the context it was
    // created in (`createApiKey`), whatever its permissions are changed to.
    beforeChange: [
      ({ data, cms, operation, previousDoc }) => {
        if (data.permissions === undefined) return data
        const context =
          operation === 'create'
            ? (data.permissions as ApiKeyPermissions).context
            : (previousDoc?.permissions as ApiKeyPermissions | undefined)?.context
        const permissions = cleanPermissions(data.permissions, {
          collections: cms.config.collections.map((c) => c.slug),
          globals: cms.config.globals.map((g) => g.slug),
        })
        return { ...data, permissions: context ? { ...permissions, context } : permissions }
      },
    ],
  },
}

/** Keeps only known collections, globals and operations; drops what keys may never have. */
export function cleanPermissions(
  value: unknown,
  known: { collections: readonly string[]; globals: readonly string[] },
): ApiKeyPermissions {
  const input = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >
  const pick = <T extends string>(
    group: unknown,
    slugs: readonly string[],
    operations: readonly T[],
  ): Record<string, T[]> => {
    const out: Record<string, T[]> = {}
    if (typeof group !== 'object' || group === null) return out
    for (const [slug, ops] of Object.entries(group)) {
      if (!slugs.includes(slug) || API_KEY_EXCLUDED.has(slug) || !Array.isArray(ops)) continue
      const valid = operations.filter((op) => ops.includes(op))
      if (valid.length) out[slug] = valid
    }
    return out
  }
  const folders = Array.isArray(input.folders)
    ? input.folders.filter(
        (f): f is string | number => typeof f === 'string' || typeof f === 'number',
      )
    : []
  return {
    collections: pick(input.collections, known.collections, API_KEY_OPERATIONS),
    globals: pick(input.globals, known.globals, API_KEY_GLOBAL_OPERATIONS),
    ...(folders.length > 0 ? { folders } : {}),
  }
}

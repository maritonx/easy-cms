import { type Access, anyone, type ID, isAdmin, isLoggedIn } from './access.js'
import type { CollectionConfig, Config } from './config.js'
import type { Field } from './fields.js'

export const USERS = 'users'
export const MEDIA = 'media'
export const MEDIA_FOLDERS = 'media-folders'
export const SESSIONS = 'sessions'
export const LOGIN_ATTEMPTS = 'login-attempts'
export const VERSIONS = 'document-versions'
export const SCHEDULED_JOBS = 'scheduled-jobs'
export const WEBHOOK_DELIVERIES = 'webhook-deliveries'
export const EMAIL_DELIVERIES = 'email-deliveries'
export const DATABASE_BACKUPS = 'database-backups'
export const ROLES = 'user-roles'
export const USER_IDENTITIES = 'user-identities'
export const AUDIT_LOGS = 'audit-logs'

/** Collections Easy CMS uses internally. Not exposed over REST or in the admin UI. */
export const INTERNAL_COLLECTIONS: ReadonlySet<string> = new Set([
  SESSIONS,
  LOGIN_ATTEMPTS,
  VERSIONS,
  SCHEDULED_JOBS,
  WEBHOOK_DELIVERIES,
  EMAIL_DELIVERIES,
  DATABASE_BACKUPS,
  ROLES,
  USER_IDENTITIES,
  AUDIT_LOGS,
])

export const DEFAULT_ROLES = ['admin', 'editor'] as const

/**
 * Who created a document, set by Easy CMS (`auth.rbac`): for roles given "own documents only".
 * Added to every collection but users; trusted Local API calls may set it, e.g. in imports.
 */
export const CREATED_BY_FIELD: Field = {
  name: 'createdBy',
  type: 'relationship',
  to: USERS,
  position: 'sidebar',
  access: { update: () => false },
  label: { en: 'Created by', th: 'สร้างโดย' },
}

/** Adds `createdBy` to every collection but users (a collection with its own is reported). */
export function withCreatedBy(config: Config): Config {
  if (config.auth?.rbac !== true) return config
  return {
    ...config,
    collections: (config.collections ?? []).map((c) =>
      c.slug === USERS || c.fields?.some((f) => f.name === CREATED_BY_FIELD.name)
        ? c
        : { ...c, fields: [...c.fields, CREATED_BY_FIELD] },
    ),
  }
}

/** Admins can update anyone; other users only themselves. */
const adminOrSelf: Access = ({ user }) => {
  if (!user) return false
  if (user.role === 'admin') return true
  return { id: { equals: user.id } }
}

const adminOnly = {
  update: ({ user }: { user: { role: string } | null }) => user?.role === 'admin',
}

function userFields(roles: readonly string[], rbac: boolean): Field[] {
  const defaultRole = roles.includes('editor') ? 'editor' : (roles[roles.length - 1] as string)
  return [
    {
      name: 'email',
      type: 'email',
      required: true,
      unique: true,
      label: { en: 'Email', th: 'อีเมล' },
    },
    { name: 'name', type: 'text', label: { en: 'Name', th: 'ชื่อ' } },
    // With roles from the admin (`auth.rbac`), any role in Settings → Roles: checked on save.
    rbac
      ? {
          name: 'role',
          type: 'text',
          required: true,
          defaultValue: defaultRole,
          access: adminOnly,
          label: { en: 'Role', th: 'บทบาท' },
        }
      : {
          name: 'role',
          type: 'select',
          options: roles,
          required: true,
          defaultValue: defaultRole,
          access: adminOnly,
          label: { en: 'Role', th: 'บทบาท' },
        },
    {
      name: 'active',
      type: 'boolean',
      defaultValue: true,
      access: adminOnly,
      label: { en: 'Active', th: 'ใช้งาน' },
    },
    { name: 'passwordHash', type: 'text', hidden: true },
  ]
}

/**
 * Adds the built-in users collection, merging a user-supplied `users`
 * collection into it (extra fields appended, access and hooks overridden).
 */
export function withUsers(config: Config): Config {
  const roles = config.auth?.roles ?? DEFAULT_ROLES
  const custom = config.collections?.find((c) => c.slug === USERS)
  const users: CollectionConfig = {
    slug: USERS,
    labels: { singular: { en: 'User', th: 'ผู้ใช้' }, plural: { en: 'Users', th: 'ผู้ใช้' } },
    useAsTitle: 'email',
    icon: 'users',
    ...custom,
    fields: [...userFields(roles, config.auth?.rbac === true), ...(custom?.fields ?? [])],
    access: {
      read: isLoggedIn,
      create: isAdmin,
      update: adminOrSelf,
      delete: isAdmin,
      ...custom?.access,
    },
  }
  const others = (config.collections ?? []).filter((c) => c.slug !== USERS)
  return { ...config, collections: [users, ...others] }
}

/** File metadata is set by uploads, never edited directly. */
const systemField = { update: () => false }

function mediaFields(): Field[] {
  return [
    {
      name: 'filename',
      type: 'text',
      required: true,
      unique: true,
      access: systemField,
      label: { en: 'File name', th: 'ชื่อไฟล์' },
    },
    {
      name: 'originalName',
      type: 'text',
      access: systemField,
      label: { en: 'Original name', th: 'ชื่อเดิม' },
    },
    {
      name: 'mimeType',
      type: 'text',
      required: true,
      access: systemField,
      label: { en: 'Type', th: 'ชนิด' },
    },
    {
      name: 'filesize',
      type: 'number',
      required: true,
      access: systemField,
      label: { en: 'Size (bytes)', th: 'ขนาด (ไบต์)' },
    },
    { name: 'width', type: 'number', access: systemField, label: { en: 'Width', th: 'กว้าง' } },
    { name: 'height', type: 'number', access: systemField, label: { en: 'Height', th: 'สูง' } },
    {
      name: 'sizes',
      type: 'json',
      access: systemField,
      label: { en: 'Resized copies', th: 'ขนาดย่อ' },
    },
    { name: 'alt', type: 'text', label: { en: 'Alternative text', th: 'ข้อความแทนรูป' } },
  ]
}

/** Set by Easy CMS from the file's folder (`upload.folders`): only served to who may see it. */
const privateField: Field = {
  name: 'private',
  type: 'boolean',
  index: true,
  access: systemField,
  position: 'sidebar',
  label: { en: 'Private', th: 'ส่วนตัว' },
}

interface StoredSize {
  filename: string
  width?: number
  height?: number
}

/** Only admins (signed in, not API keys) see and set a folder's permissions. */
const adminField = {
  read: ({ user }: { user: { role: string; apiKey?: unknown } | null }) =>
    user?.role === 'admin' && !user.apiKey,
  update: ({ user }: { user: { role: string; apiKey?: unknown } | null }) =>
    user?.role === 'admin' && !user.apiKey,
}

/**
 * Folders of the media library (`upload.folders`). Roles' grants on `media` apply to them too;
 * with `auth.rbac`, a folder's `permissions` narrow them for its files and subfolders.
 */
export const mediaFoldersCollection: CollectionConfig = {
  slug: MEDIA_FOLDERS,
  labels: {
    singular: { en: 'Folder', th: 'โฟลเดอร์' },
    plural: { en: 'Folders', th: 'โฟลเดอร์' },
  },
  icon: 'folder',
  useAsTitle: 'name',
  admin: { list: { tree: 'parent', sort: 'name' } },
  access: { read: isLoggedIn, create: isLoggedIn, update: isLoggedIn, delete: isLoggedIn },
  hooks: {
    // What the reader may do here (`view`, `edit`, `manage`), for the admin's buttons.
    afterRead: [
      async ({ doc, user, cms }) => ({
        ...doc,
        level: await cms.folders.level(user, doc.id as ID),
      }),
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      maxLength: 120,
      label: { en: 'Name', th: 'ชื่อ' },
    },
    {
      name: 'parent',
      type: 'relationship',
      to: MEDIA_FOLDERS,
      index: true,
      label: { en: 'In folder', th: 'อยู่ในโฟลเดอร์' },
    },
    // For code to find the folder (`folder: 'banners'` on upload fields); set when it is made.
    {
      name: 'key',
      type: 'text',
      unique: true,
      maxLength: 60,
      access: { update: ({ id }) => id === undefined },
      label: { en: 'Key', th: 'คีย์' },
    },
    // Its files and subfolders are private: only for users who may see them, and signed links.
    {
      name: 'private',
      type: 'boolean',
      access: { update: adminField.update },
      label: { en: 'Private', th: 'ส่วนตัว' },
    },
    // `null`: as the parent folder. Otherwise each role's level (`view`, `edit`, `manage`);
    // roles not listed get nothing.
    {
      name: 'permissions',
      type: 'json',
      access: adminField,
      label: { en: 'Permissions', th: 'สิทธิ์เข้าถึง' },
    },
  ],
}

const folderField: Field = {
  name: 'folder',
  type: 'relationship',
  to: MEDIA_FOLDERS,
  index: true,
  position: 'sidebar',
  label: { en: 'Folder', th: 'โฟลเดอร์' },
}

/**
 * Adds the built-in media collection, merging a user-supplied `media`
 * collection into it like `withUsers`. Files are public; metadata is readable by anyone
 * so frontends can populate uploads, and writable by logged-in users. With `upload.folders`,
 * also the folders and each file's `folder`.
 */
export function withMedia(config: Config): Config {
  const custom = config.collections?.find((c) => c.slug === MEDIA)
  const folders = config.upload?.folders === true
  const media: CollectionConfig = {
    slug: MEDIA,
    labels: { singular: { en: 'Media', th: 'สื่อ' }, plural: { en: 'Media', th: 'คลังสื่อ' } },
    icon: 'image',
    useAsTitle: 'filename',
    ...custom,
    fields: [
      ...mediaFields(),
      ...(folders ? [folderField, privateField] : []),
      ...(custom?.fields ?? []),
    ],
    access: {
      read: anyone,
      create: isLoggedIn,
      update: isLoggedIn,
      delete: isLoggedIn,
      ...custom?.access,
    },
    hooks: {
      ...custom?.hooks,
      afterRead: [
        ({ doc, cms }) => {
          const sizes = (doc.sizes ?? {}) as Record<string, StoredSize>
          return {
            ...doc,
            url: typeof doc.filename === 'string' ? cms.mediaURL(doc.filename) : null,
            sizes: Object.fromEntries(
              Object.entries(sizes).map(([name, size]) => [
                name,
                { ...size, url: cms.mediaURL(size.filename) },
              ]),
            ),
          }
        },
        ...(custom?.hooks?.afterRead ?? []),
      ],
      afterDelete: [
        async ({ doc, cms }) => {
          const sizes = Object.values((doc.sizes ?? {}) as Record<string, StoredSize>)
          const storage = cms.storageFor(doc.private === true)
          for (const key of [doc.filename, ...sizes.map((s) => s.filename)]) {
            if (typeof key === 'string') await storage.delete(key)
          }
        },
        ...(custom?.hooks?.afterDelete ?? []),
      ],
    },
  }
  const others = (config.collections ?? []).filter((c) => c.slug !== MEDIA)
  return {
    ...config,
    collections: [
      ...others.slice(0, 1),
      media,
      ...(folders ? [mediaFoldersCollection] : []),
      ...others.slice(1),
    ],
  }
}

const nobody: Access = () => false

/** Collections that back sessions and login rate limiting. */
export const internalCollections: readonly CollectionConfig[] = [
  {
    slug: SESSIONS,
    access: { read: nobody, create: nobody, update: nobody, delete: nobody },
    fields: [
      { name: 'tokenHash', type: 'text', required: true, unique: true },
      { name: 'user', type: 'relationship', to: USERS, required: true },
      { name: 'expiresAt', type: 'date', required: true, index: true },
    ],
  },
  {
    slug: LOGIN_ATTEMPTS,
    access: { read: nobody, create: nobody, update: nobody, delete: nobody },
    fields: [{ name: 'key', type: 'text', required: true, index: true }],
  },
]

/**
 * Snapshots for collections and globals with `versions`. Only added to the schema when one of
 * them uses versions, so projects without versions keep their tables unchanged.
 */
export const versionsCollection: CollectionConfig = {
  slug: VERSIONS,
  access: { read: nobody, create: nobody, update: nobody, delete: nobody },
  fields: [
    // Collection slug, or `global:<slug>`.
    { name: 'parent', type: 'text', required: true, index: true },
    // Document id; 0 for globals.
    { name: 'doc', type: 'number', required: true, index: true },
    { name: 'status', type: 'text' },
    // The newest version of the document: its current editable state.
    { name: 'latest', type: 'boolean', index: true },
    { name: 'author', type: 'number' },
    { name: 'snapshot', type: 'json', required: true },
  ],
}

/** Publish/unpublish jobs for collections and globals with `schedule`; added only when used. */
export const scheduledJobsCollection: CollectionConfig = {
  slug: SCHEDULED_JOBS,
  access: { read: nobody, create: nobody, update: nobody, delete: nobody },
  fields: [
    // Collection slug, or `global:<slug>`.
    { name: 'parent', type: 'text', required: true, index: true },
    // Document id; 0 for globals.
    { name: 'doc', type: 'number', required: true, index: true },
    { name: 'action', type: 'text', required: true },
    { name: 'runAt', type: 'text', required: true, index: true },
    // pending | done | failed
    { name: 'state', type: 'text', required: true, index: true },
    { name: 'error', type: 'text' },
    { name: 'author', type: 'number' },
  ],
}

/** Webhook deliveries until they succeed; added only when `webhooks` is set. */
export const webhookDeliveriesCollection: CollectionConfig = {
  slug: WEBHOOK_DELIVERIES,
  access: { read: nobody, create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'url', type: 'text', required: true },
    { name: 'event', type: 'text', required: true },
    // The JSON body as first sent: retries are byte-for-byte the same, signature included.
    { name: 'body', type: 'textarea', required: true },
    { name: 'delivery', type: 'text', required: true },
    { name: 'attempts', type: 'number', required: true },
    { name: 'nextAttemptAt', type: 'text', required: true, index: true },
    // pending | failed
    { name: 'state', type: 'text', required: true, index: true },
    { name: 'error', type: 'text' },
  ],
}

/** Backups of the database (Settings → Backups): the record of each, the files are in storage. */
export const databaseBackupsCollection: CollectionConfig = {
  slug: DATABASE_BACKUPS,
  access: { read: nobody, create: nobody, update: nobody, delete: nobody },
  fields: [
    // pending | running | done | failed
    { name: 'state', type: 'text', required: true, index: true },
    // manual | scheduled
    { name: 'trigger', type: 'text', required: true },
    { name: 'filename', type: 'text' },
    { name: 'size', type: 'number' },
    { name: 'startedAt', type: 'text', index: true },
    { name: 'finishedAt', type: 'text' },
    { name: 'error', type: 'text' },
    // Who started it (email), for manual ones.
    { name: 'author', type: 'text' },
    { name: 'downloadedBy', type: 'text' },
    { name: 'downloadedAt', type: 'text' },
  ],
}

/** Outside accounts users sign in with (`auth.providers`); added only when there are providers. */
export const userIdentitiesCollection: CollectionConfig = {
  slug: USER_IDENTITIES,
  access: { read: nobody, create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'user', type: 'relationship', to: USERS, required: true, index: true },
    // The provider's id (`google`) and its id for the account (`sub`).
    { name: 'provider', type: 'text', required: true, index: true },
    { name: 'subject', type: 'text', required: true, index: true },
    { name: 'email', type: 'text' },
    { name: 'lastUsedAt', type: 'text' },
  ],
}

/** The audit log (`audit`): append-only, each row signed. Added only with `audit`. */
export const auditLogsCollection: CollectionConfig = {
  slug: AUDIT_LOGS,
  access: { read: nobody, create: nobody, update: nobody, delete: nobody },
  fields: [
    { name: 'action', type: 'text', required: true, index: true },
    // A collection slug, `global:<slug>`, or an area (auth, roles, backups…).
    { name: 'target', type: 'text', index: true },
    { name: 'doc', type: 'text', index: true },
    { name: 'title', type: 'text' },
    { name: 'actorId', type: 'text' },
    { name: 'actorEmail', type: 'text', index: true },
    // user | api-key | system | scheduler
    { name: 'via', type: 'text' },
    { name: 'ip', type: 'text' },
    { name: 'userAgent', type: 'text' },
    { name: 'changes', type: 'json' },
    { name: 'detail', type: 'json' },
    { name: 'signature', type: 'text' },
  ],
}

/** Emails until they are sent; added only when `email` is set. */
export const emailDeliveriesCollection: CollectionConfig = {
  slug: EMAIL_DELIVERIES,
  access: { read: nobody, create: nobody, update: nobody, delete: nobody },
  fields: [
    // The message as JSON.
    { name: 'message', type: 'textarea', required: true },
    { name: 'attempts', type: 'number', required: true },
    { name: 'nextAttemptAt', type: 'text', required: true, index: true },
    // pending | failed
    { name: 'state', type: 'text', required: true, index: true },
    { name: 'error', type: 'text' },
  ],
}

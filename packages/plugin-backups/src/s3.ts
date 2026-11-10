import type { BackupDestination, IntegrationConfig } from '@easy-cms/core'
import { s3Storage } from '@easy-cms/storage-s3'
import { DestinationError } from './errors.js'

// S3-compatible storage (Cloudflare R2, Backblaze B2, AWS S3, Wasabi) as a backup destination,
// through @easy-cms/storage-s3.

/** The key connecting writes and deletes, to check the bucket. */
const CHECK = '.easy-cms-check'

/** Refusals trying again won't fix: wrong keys, no access, no bucket. */
const LASTING =
  /\b(401|403|404)\b|AccessDenied|InvalidAccessKeyId|SignatureDoesNotMatch|NoSuchBucket/

function storageOf(values: Readonly<Record<string, string>>, fetcher?: typeof fetch) {
  const storage = s3Storage({
    bucket: values.bucket ?? '',
    region: values.region || 'auto',
    ...(values.endpoint ? { endpoint: values.endpoint } : {}),
    accessKeyId: values.accessKeyId ?? '',
    secretAccessKey: values.secretAccessKey ?? '',
    ...(values.prefix ? { prefix: values.prefix } : {}),
    ...(fetcher ? { fetch: fetcher } : {}),
  })
  storage.init?.({ cwd: process.cwd() })
  return storage
}

/** Runs a storage call, telling which failures are lasting. */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    const message = (error as Error).message || String(error)
    throw new DestinationError(`S3: ${message}`, LASTING.test(message))
  }
}

/** S3-compatible storage; `fetch` for tests. */
export function s3Compatible(options: { fetch?: typeof fetch } = {}): IntegrationConfig {
  return {
    id: 's3-backups',
    label: 'S3-compatible storage',
    category: 'backups',
    icon: 'box',
    description: {
      en: 'Keeps backups in a private bucket: Cloudflare R2, Backblaze B2, AWS S3 or Wasabi.',
      th: 'เก็บ backup ใน bucket ส่วนตัว: Cloudflare R2, Backblaze B2, AWS S3 หรือ Wasabi',
    },
    docs: 'https://easycms.dev/docs/backups#s3-compatible',
    plugin: '@easy-cms/plugin-backups',
    kind: 'fields',
    fields: [
      {
        name: 'endpoint',
        type: 'url',
        label: { en: 'Endpoint', th: 'Endpoint' },
        placeholder: 'https://<account>.r2.cloudflarestorage.com',
        description: {
          en: 'R2, B2 and Wasabi give one; empty for AWS S3.',
          th: 'R2, B2 และ Wasabi มีให้ ถ้าเป็น AWS S3 ปล่อยว่าง',
        },
      },
      {
        name: 'region',
        label: { en: 'Region', th: 'Region' },
        placeholder: 'auto',
        description: { en: 'R2: auto. Empty: auto.', th: 'R2: auto ถ้าว่าง: auto' },
      },
      { name: 'bucket', label: { en: 'Bucket', th: 'Bucket' }, required: true },
      {
        name: 'prefix',
        label: { en: 'Folder in the bucket', th: 'โฟลเดอร์ใน bucket' },
        placeholder: 'backups/',
      },
      {
        name: 'accessKeyId',
        label: { en: 'Access key ID', th: 'Access key ID' },
        required: true,
      },
      {
        name: 'secretAccessKey',
        label: { en: 'Secret access key', th: 'Secret access key' },
        secret: true,
        required: true,
      },
    ],
    consent: {
      text: {
        en: 'Backups of the whole database, users’ emails included, are stored in this bucket. Keep it private, and set backups.encryptionKey to encrypt them.',
        th: 'backup ของทั้งฐานข้อมูล รวมอีเมลของผู้ใช้ จะถูกเก็บใน bucket นี้ ตั้ง bucket เป็นส่วนตัว และตั้ง backups.encryptionKey เพื่อเข้ารหัส',
      },
    },
    // Writes and deletes a small file: the keys, the bucket and the right to write all work.
    async test(values) {
      try {
        const storage = storageOf(values, options.fetch)
        await guarded(() =>
          storage.put(CHECK, new TextEncoder().encode('ok'), { contentType: 'text/plain' }),
        )
        await guarded(() => storage.delete(CHECK))
        return { ok: true, account: `${values.bucket}${values.prefix ? `/${values.prefix}` : ''}` }
      } catch (error) {
        return { ok: false, message: (error as Error).message }
      }
    },
    backups(values): BackupDestination {
      const storage = storageOf(values, options.fetch)
      return {
        async put(name, data) {
          await guarded(() => storage.put(name, data, { contentType: 'application/octet-stream' }))
          return undefined
        },
        async get(name) {
          return (await guarded(() => storage.get(name)))?.body ?? null
        },
        async delete(name) {
          await guarded(() => storage.delete(name))
        },
      }
    },
  }
}

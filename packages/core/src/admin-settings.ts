// Settings admins change in the admin rather than the code (`admin-settings`), by key.
import { ADMIN_SETTINGS } from './builtins.js'
import type { EasyCMS } from './local-api.js'

/** The value saved for a key, or `undefined`. */
export async function getSetting<T>(cms: EasyCMS, key: string): Promise<T | undefined> {
  const { docs } = await cms.db.find({
    collection: ADMIN_SETTINGS,
    where: { key: { equals: key } },
    sort: ['id'],
    limit: 1,
    page: 1,
  })
  return (docs[0]?.value ?? undefined) as T | undefined
}

/** Saves the value for a key. */
export async function setSetting(cms: EasyCMS, key: string, value: unknown): Promise<void> {
  const now = new Date().toISOString()
  const { docs } = await cms.db.find({
    collection: ADMIN_SETTINGS,
    where: { key: { equals: key } },
    sort: ['id'],
    limit: 1,
    page: 1,
  })
  const row = docs[0]
  if (row) {
    const { id, ...rest } = row
    await cms.db.update({
      collection: ADMIN_SETTINGS,
      id,
      data: { ...rest, value, updatedAt: now },
    })
  } else
    await cms.db.create({
      collection: ADMIN_SETTINGS,
      data: { key, value, createdAt: now, updatedAt: now },
    })
}

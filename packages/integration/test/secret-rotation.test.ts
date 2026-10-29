import { ConfigError, defineConfig } from '@easy-cms/core'
import { describe, expect, it } from 'vitest'
import { db, open, rawQuery, SECRET, table, tempProject } from './helpers.js'

const NEW = 'n'.repeat(16) + SECRET.slice(16)

const configWith = (secret: string, previousSecrets?: string[]) =>
  defineConfig({
    secret,
    ...(previousSecrets ? { previousSecrets } : {}),
    db: db(),
    audit: {},
    collections: [{ slug: 'notes', fields: [{ name: 'text', type: 'text' }] }],
  })

describe('rotating the secret (#167)', () => {
  it('keeps sessions and the audit log valid while the old secret is a previous one', async () => {
    const cwd = tempProject()
    const before = await open(configWith(SECRET), cwd)
    const email = 'admin@example.test'
    await before.create('users', { email, password: 'password123', role: 'admin' } as never)
    const { token } = await before.auth.login({ email, password: 'password123' })
    await before.create('notes', { text: 'one' })
    await before.destroy()

    // The new secret, the old one kept as a previous one.
    const during = await open(configWith(NEW, [SECRET]), cwd)
    expect((await during.auth.verify(token))?.email).toBe(email)
    expect((await during.audit.verify()).invalid).toEqual([])
    // An entry changed in the database is caught, whatever the secret.
    await rawQuery(
      cwd,
      `update ${table(cwd, 'audit_logs')} set target = 'changed' where id = (select min(id) from ${table(cwd, 'audit_logs')})`,
    )
    const entries = async () =>
      (await rawQuery(cwd, `select * from ${table(cwd, 'audit_logs')} order by id`)).map(
        ({ signature: _, ...rest }) => rest,
      )
    const unsigned = await entries()
    const resigned = await during.audit.resign()
    // Only signatures change; the run itself is recorded after them.
    const now = await entries()
    expect(now.slice(0, unsigned.length)).toEqual(unsigned)
    expect(now.at(-1)).toMatchObject({ action: 'audit.resign' })
    expect(resigned.invalid).toHaveLength(1)
    expect(resigned.resigned).toBeGreaterThan(0)
    // Signed again: once more, nothing is left to do.
    expect((await during.audit.resign()).resigned).toBe(0)
    await during.destroy()

    // Without the old secret: its sessions end, the log still verifies but for the changed entry.
    const after = await open(configWith(NEW), cwd)
    expect(await after.auth.verify(token)).toBeNull()
    expect((await after.audit.verify()).invalid).toEqual(resigned.invalid)
    await after.destroy()
  })

  it('refuses a previous secret that is short or the current one', async () => {
    await expect(open(configWith(SECRET, ['short']))).rejects.toThrow(ConfigError)
    await expect(open(configWith(SECRET, [SECRET]))).rejects.toThrow(/is the same as secret/)
  })
})

import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { type IO, run } from '../src/index.js'

/** Temp cleanup: Windows may still hold SQLite files for a moment after close; retry, then give up quietly. */
function removeTemp(path: string) {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    // leave it to the OS temp cleaner
  }
}

// Projects live inside the package so the config can import workspace packages.
const TMP = join(import.meta.dirname, '.tmp')
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) removeTemp(dir)
})

function project(fields = "[{ name: 'title', type: 'text' }]") {
  mkdirSync(TMP, { recursive: true })
  const dir = mkdtempSync(join(TMP, 'project-'))
  dirs.push(dir)
  writeConfig(dir, fields)
  return dir
}

function writeConfig(dir: string, fields: string) {
  writeFileSync(
    join(dir, 'easy-cms.config.ts'),
    `import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

export default defineConfig({
  secret: '${'s'.repeat(32)}',
  db: sqlite({ url: 'file:./cms.db' }),
  collections: [{ slug: 'posts', fields: ${fields} }],
})
`,
  )
}

async function cli(...argv: string[]) {
  const out: string[] = []
  const err: string[] = []
  const io: IO = { out: (l) => out.push(l), err: (l) => err.push(l), interactive: false }
  const code = await run(argv, io)
  return { code, out: out.join('\n'), err: err.join('\n') }
}

describe('easy-cms CLI (FR-INS-06..08)', () => {
  it('shows help', async () => {
    const help = await cli('--help')
    expect(help.code).toBe(0)
    expect(help.out).toContain('migrate:create <name>')
    expect((await cli('migrate', '--help')).out).toContain('Usage: easy-cms migrate')
  })

  it('fails with a non-zero code on bad input', async () => {
    expect((await cli()).code).toBe(1)
    expect(await cli('nope')).toMatchObject({
      code: 1,
      err: expect.stringContaining('Unknown command "nope"'),
    })
    expect(await cli('--bogus')).toMatchObject({ code: 1 })
    const dir = project()
    expect(await cli('migrate:create', '--cwd', dir)).toMatchObject({
      code: 1,
      err: expect.stringContaining('Missing migration name'),
    })
  })

  it('explains a missing config', async () => {
    mkdirSync(TMP, { recursive: true })
    const empty = mkdtempSync(join(TMP, 'empty-'))
    dirs.push(empty)
    const result = await cli('migrate', '--cwd', empty)
    expect(result.code).toBe(1)
    expect(result.err).toContain('create easy-cms')
    expect(result.err).not.toContain('    at ') // no stack trace
  })

  it('creates, lists and applies migrations', async () => {
    const dir = project()
    expect((await cli('migrate:status', '--cwd', dir)).out).toContain('No migrations yet')

    const created = await cli('migrate:create', 'init', '--cwd', dir)
    expect(created).toMatchObject({ code: 0, out: expect.stringMatching(/Created .*_init\.sql/) })
    expect(await cli('migrate:create', 'again', '--cwd', dir)).toMatchObject({
      out: 'No changes; nothing to migrate.',
    })
    expect((await cli('migrate:status', '--cwd', dir)).out).toMatch(/• pending\s+\d+_init/)

    expect(await cli('migrate', '--cwd', dir)).toMatchObject({
      code: 0,
      out: expect.stringContaining('Applied 1 migration(s).'),
    })
    expect((await cli('migrate:status', '--cwd', dir)).out).toMatch(/✓ applied\s+\d+_init/)
    expect((await cli('migrate', '--cwd', dir)).out).toContain('No pending migrations.')
    expect(readdirSync(join(dir, 'easy-cms/migrations'))).toHaveLength(2)
  })

  it('loads .env from the project root', async () => {
    const dir = project()
    const config = join(dir, 'easy-cms.config.ts')
    writeFileSync(
      config,
      readFileSync(config, 'utf8').replace(
        /secret: '[^']+'/,
        'secret: process.env.CLI_TEST_SECRET ?? ""',
      ),
    )
    expect((await cli('migrate:status', '--cwd', dir)).code).toBe(1)
    writeFileSync(join(dir, '.env'), `CLI_TEST_SECRET=${'e'.repeat(32)}\n`)
    expect(await cli('migrate:status', '--cwd', dir)).toMatchObject({ code: 0 })
    delete process.env.CLI_TEST_SECRET
  })

  it('generates types (FR-INS-05)', async () => {
    const dir = project("[{ name: 'title', type: 'text', required: true }]")
    const result = await cli('generate:types', '--cwd', dir)
    expect(result).toMatchObject({ code: 0, out: expect.stringContaining('easy-cms-types.ts') })
    const types = readFileSync(join(dir, 'easy-cms-types.ts'), 'utf8')
    expect(types).toContain('export interface Post {')
    expect(types).toContain('  title: string')
    expect((await cli('generate:types', '--cwd', dir, '--out', 'cms-types.ts')).code).toBe(0)
    expect(readFileSync(join(dir, 'cms-types.ts'), 'utf8')).toContain('export interface Post {')
  })

  it('creates an admin from flags and EASY_CMS_ADMIN_PASSWORD (FR-INS-04)', async () => {
    const dir = project()
    process.env.EASY_CMS_ADMIN_PASSWORD = 'a strong password'
    try {
      expect(
        await cli('create-admin', '--email', 'Ada@Example.com', '--name', 'Ada', '--cwd', dir),
      ).toMatchObject({
        code: 0,
        out: expect.stringMatching(/Created admin ada@example\.com\. Log in at \/admin$/),
      })
      // Duplicate emails are reported, not thrown.
      const again = await cli('create-admin', '--email', 'ada@example.com', '--cwd', dir)
      expect(again).toMatchObject({ code: 1, err: 'email: must be unique' })
    } finally {
      delete process.env.EASY_CMS_ADMIN_PASSWORD
    }
  })

  it('backs up a SQLite database to a new file', async () => {
    const dir = project()
    process.env.EASY_CMS_ADMIN_PASSWORD = 'a strong password'
    try {
      await cli('create-admin', '--email', 'ada@example.com', '--cwd', dir)
    } finally {
      delete process.env.EASY_CMS_ADMIN_PASSWORD
    }
    const first = await cli('backup', 'backups/cms.db', '--cwd', dir)
    expect(first).toMatchObject({ code: 0, out: expect.stringContaining('Backed up the database') })
    // Restored into another project, the copy has the data: the same admin already exists.
    const restored = project()
    copyFileSync(join(dir, 'backups/cms.db'), join(restored, 'cms.db'))
    process.env.EASY_CMS_ADMIN_PASSWORD = 'a strong password'
    try {
      expect(
        await cli('create-admin', '--email', 'ada@example.com', '--cwd', restored),
      ).toMatchObject({ code: 1, err: 'email: must be unique' })
    } finally {
      delete process.env.EASY_CMS_ADMIN_PASSWORD
    }

    expect(await cli('backup', 'backups/cms.db', '--cwd', dir)).toMatchObject({
      code: 1,
      err: expect.stringContaining('already exists'),
    })
    expect(await cli('backup', '--cwd', dir)).toMatchObject({
      code: 1,
      err: expect.stringContaining('Missing backup file'),
    })
  })

  it("copies another config's database into an empty one", async () => {
    const dir = project()
    process.env.EASY_CMS_ADMIN_PASSWORD = 'a strong password'
    try {
      await cli('create-admin', '--email', 'ada@example.com', '--cwd', dir)
      // The old database becomes the source; the project's config moves to a new database.
      writeFileSync(
        join(dir, 'easy-cms.old.config.ts'),
        `import { sqlite } from '@easy-cms/db-sqlite'
import config from './easy-cms.config.ts'
export default { ...config, db: sqlite({ url: 'file:./cms.db' }) }
`,
      )
      const main = readFileSync(join(dir, 'easy-cms.config.ts'), 'utf8')
      writeFileSync(join(dir, 'easy-cms.config.ts'), main.replace('./cms.db', './new.db'))

      expect(await cli('copy', '--cwd', dir)).toMatchObject({
        code: 1,
        err: expect.stringContaining('Missing --from'),
      })
      const copied = await cli('copy', '--from', 'easy-cms.old.config.ts', '--cwd', dir)
      expect(copied).toMatchObject({ code: 0, out: expect.stringContaining('ecms_users: 1') })
      expect(copied.out).toContain('Uploaded files were not copied')
      // The admin is in the new database now.
      expect(await cli('create-admin', '--email', 'ada@example.com', '--cwd', dir)).toMatchObject({
        code: 1,
        err: 'email: must be unique',
      })
      // A second copy would mix content: refused.
      expect(await cli('copy', '--from', 'easy-cms.old.config.ts', '--cwd', dir)).toMatchObject({
        code: 1,
        err: expect.stringContaining('is not empty'),
      })
    } finally {
      delete process.env.EASY_CMS_ADMIN_PASSWORD
    }
  })

  it('asks for the email and a hidden password in a terminal', async () => {
    const dir = project()
    const asked: { question: string; hidden: boolean }[] = []
    const io: IO = {
      out: () => {},
      err: () => {},
      interactive: true,
      prompt: async (question, options) => {
        asked.push({ question, hidden: options?.hidden === true })
        return question.startsWith('Email') ? 'term@example.com' : 'short'
      },
    }
    const errors: string[] = []
    const code = await run(['create-admin', '--cwd', dir], { ...io, err: (l) => errors.push(l) })
    expect(asked).toEqual([
      { question: 'Email: ', hidden: false },
      { question: 'Password (8+ characters): ', hidden: true },
    ])
    expect(code).toBe(1)
    expect(errors).toEqual(['password: must be at least 8 characters'])
  })

  it('needs a password without a terminal', async () => {
    const dir = project()
    expect(await cli('create-admin', '--email', 'x@example.com', '--cwd', dir)).toMatchObject({
      code: 1,
      err: expect.stringContaining('EASY_CMS_ADMIN_PASSWORD'),
    })
  })

  it('reports config errors', async () => {
    const dir = project("[{ name: 'bad name', type: 'text' }]")
    const result = await cli('migrate:status', '--cwd', dir)
    expect(result.code).toBe(1)
    expect(result.err).toContain('Invalid Easy CMS config')
  })
})

describe('commands from the config', () => {
  it('runs them with the CMS open', async () => {
    const dir = project()
    writeFileSync(
      join(dir, 'easy-cms.config.ts'),
      `import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

export default defineConfig({
  secret: '${'s'.repeat(32)}',
  db: sqlite({ url: 'file:./cms.db' }),
  collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],
  commands: [
    {
      name: 'posts:hello',
      description: 'Says hello',
      run: ({ cms, args, log }) => {
        log(\`hello \${args.join(' ')} \${cms.config.collections.some((c) => c.slug === 'posts')}\`)
        return args.includes('fail') ? 2 : undefined
      },
    },
  ],
})
`,
    )
    expect(await cli('posts:hello', 'there', '--cwd', dir)).toMatchObject({
      code: 0,
      out: 'hello there true',
    })
    expect((await cli('posts:hello', 'fail', '--cwd', dir)).code).toBe(2)
    expect((await cli('posts:hello', '--help', '--cwd', dir)).out).toContain('Says hello')
    const unknown = await cli('posts:nope', '--cwd', dir)
    expect(unknown.code).toBe(1)
    expect(unknown.err).toContain('posts:hello')
  })
})

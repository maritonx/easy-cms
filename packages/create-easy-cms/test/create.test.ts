import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import pkg from '../package.json' with { type: 'json' }
import {
  detectPackageManager,
  type IO,
  isYarnBerry,
  packagesFor,
  run,
  translateCommands,
  translateLine,
} from '../src/index.js'

/** The version range the CLI installs: its own version once released. */
const V = pkg.version === '0.0.0' ? 'latest' : `^${pkg.version}`

/** Temp cleanup: Windows may still hold SQLite files for a moment after close; retry, then give up quietly. */
function removeTemp(path: string) {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  } catch {
    // leave it to the OS temp cleaner
  }
}

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) removeTemp(dir)
})

function project(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'create-easy-cms-'))
  dirs.push(dir)
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true })
    writeFileSync(join(dir, name), content)
  }
  return dir
}

async function create(dir: string, ...args: string[]) {
  return createWith({}, dir, ...args)
}

async function createWith(extra: Partial<IO>, dir: string, ...args: string[]) {
  const out: string[] = []
  const err: string[] = []
  const commands: string[] = []
  const io: IO = {
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    interactive: false,
    exec: async (command, argv) => {
      commands.push(`${command} ${argv.join(' ')}`)
      return 0
    },
    // No Yarn on the machine unless a test says so.
    capture: async () => null,
    ...extra,
  }
  const code = await run([dir, ...args], io)
  return { code, out: out.join('\n'), err: err.join('\n'), commands }
}

const read = (dir: string, file: string) => readFileSync(join(dir, file), 'utf8')

const NUXT_CONFIG = `// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true }
})
`
const NEXT_CONFIG = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
`

describe('create-easy-cms (FR-INS-01..03)', () => {
  it('refuses projects that are not Nuxt or Next', async () => {
    const dir = project({ 'package.json': '{"dependencies":{"vite":"1"}}' })
    const result = await create(dir, '--yes')
    expect(result.code).toBe(1)
    expect(result.err).toContain('not look like a Nuxt or Next.js project')
    expect(result.err).toContain('--standalone')
  })

  it('sets up a standalone server in a new directory (FR-STD-02)', async () => {
    const dir = join(project({}), 'my-cms')
    const result = await create(dir, '--yes')
    expect(result.code).toBe(0)
    expect(JSON.parse(read(dir, 'package.json'))).toEqual({
      name: 'my-cms',
      private: true,
      type: 'module',
      scripts: {
        dev: 'easy-cms serve --watch',
        start: 'easy-cms serve',
        migrate: 'easy-cms migrate',
        'migrate:create': 'easy-cms migrate:create',
      },
    })
    expect(read(dir, 'easy-cms.config.ts')).toContain("cors: ['http://localhost:5173']")
    expect(read(dir, '.env')).toMatch(/^EASY_CMS_SECRET=[0-9a-f]{64}\n$/)
    // The CLI is the server, so it is a runtime dependency: one install, no dev packages.
    // (The package manager depends on who runs the tests, so only the packages are checked.)
    expect(result.commands).toHaveLength(1)
    expect(result.commands[0]).toMatch(
      new RegExp(` @easy-cms/core@\\${V} easy-cms@\\${V} @easy-cms/db-sqlite@\\${V}$`),
    )
    expect(result.out).toContain('http://localhost:4000/admin')
  })

  it('adds a standalone server to an existing package on request', async () => {
    const dir = project({
      'package.json':
        '{"name":"api","scripts":{"start":"node server.js"},"dependencies":{"vite":"1"}}',
    })
    const result = await create(dir, '--standalone', '--skip-install')
    expect(result.code).toBe(0)
    const pkg = JSON.parse(read(dir, 'package.json'))
    // Existing scripts are kept.
    expect(pkg.scripts).toMatchObject({ start: 'node server.js', dev: 'easy-cms serve --watch' })
    expect(pkg.dependencies).toEqual({ vite: '1' })

    const asked = project({ 'package.json': '{"dependencies":{"vite":"1"}}' })
    const io: IO = { out: () => {}, err: () => {}, interactive: true, prompt: async () => '' }
    expect(await run([asked, '--skip-install', '--db', 'sqlite'], io)).toBe(0)
    expect(read(asked, 'package.json')).toContain('easy-cms serve')
  })

  it('sets up a Nuxt project with SQLite', async () => {
    const dir = project({
      'package.json': '{"devDependencies":{"nuxt":"^4"}}',
      'nuxt.config.ts': NUXT_CONFIG,
      'pnpm-lock.yaml': '',
    })
    const result = await create(dir, '--yes')
    expect(result.code).toBe(0)
    expect(read(dir, 'nuxt.config.ts')).toContain(
      "defineNuxtConfig({\n  modules: ['@easy-cms/nuxt'],\n  compatibilityDate",
    )
    expect(read(dir, 'easy-cms.config.ts')).toContain(
      "sqlite({ url: process.env.DATABASE_URL ?? 'file:./cms.db' })",
    )
    expect(read(dir, '.env')).toMatch(/^EASY_CMS_SECRET=[0-9a-f]{64}\n$/)
    expect(read(dir, '.gitignore')).toContain('cms.db*\nuploads/')
    expect(result.commands).toEqual([
      `pnpm add @easy-cms/core@${V} @easy-cms/nuxt@${V} @easy-cms/db-sqlite@${V}`,
      `pnpm add -D easy-cms@${V}`,
    ])
  })

  it('adds the module to an existing modules array', async () => {
    const dir = project({
      'package.json': '{"dependencies":{"nuxt":"^4"}}',
      'nuxt.config.ts': "export default defineNuxtConfig({ modules: ['@nuxt/ui'] })\n",
    })
    await create(dir, '--yes', '--skip-install')
    expect(read(dir, 'nuxt.config.ts')).toContain("modules: ['@easy-cms/nuxt', '@nuxt/ui']")
  })

  it('sets up a Next project with Postgres', async () => {
    const dir = project({
      'package.json': '{"dependencies":{"next":"16","react":"19"}}',
      'next.config.ts': NEXT_CONFIG,
      'src/app/page.tsx': 'export default function Page() { return null }\n',
      'package-lock.json': '{}',
    })
    const result = await create(dir, '--db', 'postgres')
    expect(result.code).toBe(0)
    expect(read(dir, 'src/app/api/cms/[[...path]]/route.ts')).toContain(
      "import config from '../../../../../easy-cms.config'",
    )
    expect(read(dir, 'src/app/admin/[[...path]]/route.ts')).toContain(
      'createAdminRouteHandlers(config)',
    )
    expect(read(dir, 'next.config.ts')).toMatch(
      /^import \{ withEasyCMS \} from '@easy-cms\/next\/config'\n/,
    )
    expect(read(dir, 'next.config.ts')).toContain('export default withEasyCMS(nextConfig)')
    expect(read(dir, 'easy-cms.config.ts')).toContain("postgres({ pglite: '.pglite' })")
    expect(result.commands[0]).toBe(
      `npm install @easy-cms/core@${V} @easy-cms/next@${V} @easy-cms/db-postgres@${V} @electric-sql/pglite`,
    )
    expect(result.commands[1]).toBe(`npm install --save-dev easy-cms@${V}`)
  })

  it('creates next.config.ts when there is none, and leaves unusual configs to the user', async () => {
    const plain = project({ 'package.json': '{"dependencies":{"next":"16"}}' })
    await create(plain, '--yes', '--skip-install')
    expect(read(plain, 'next.config.ts')).toContain('export default withEasyCMS({})')
    expect(read(plain, 'app/api/cms/[[...path]]/route.ts')).toContain(
      "from '../../../../easy-cms.config'",
    )

    const odd = project({
      'package.json': '{"dependencies":{"next":"16"}}',
      'next.config.mjs': 'export default { reactStrictMode: true }\n',
    })
    const result = await create(odd, '--yes', '--skip-install')
    expect(result.out).toContain('Could not edit next.config.mjs')
    expect(read(odd, 'next.config.mjs')).toBe('export default { reactStrictMode: true }\n')
  })

  it('is safe to run twice', async () => {
    const dir = project({
      'package.json': '{"devDependencies":{"nuxt":"^4"}}',
      'nuxt.config.ts': NUXT_CONFIG,
      '.env': 'OTHER=1',
    })
    await create(dir, '--yes', '--skip-install')
    const first = {
      env: read(dir, '.env'),
      nuxt: read(dir, 'nuxt.config.ts'),
      ignore: read(dir, '.gitignore'),
    }
    const second = await create(dir, '--yes', '--skip-install')
    expect(second.out).toContain('easy-cms.config.ts already exists')
    expect(read(dir, '.env')).toBe(first.env)
    expect(read(dir, '.env')).toMatch(/^OTHER=1\nEASY_CMS_SECRET=/)
    expect(read(dir, 'nuxt.config.ts')).toBe(first.nuxt)
    expect(read(dir, '.gitignore')).toBe(first.ignore)
  })

  it('asks for the database in a terminal', async () => {
    const dir = project({ 'package.json': '{"dependencies":{"next":"16"}}' })
    const io: IO = { out: () => {}, err: () => {}, interactive: true, prompt: async () => '2' }
    expect(await run([dir, '--skip-install'], io)).toBe(0)
    expect(read(dir, 'easy-cms.config.ts')).toContain('@easy-cms/db-postgres')
  })

  it('reports install failures and bad options', async () => {
    const dir = project({ 'package.json': '{"dependencies":{"nuxt":"4"}}' })
    const io: IO = { out: () => {}, err: () => {}, interactive: false, exec: async () => 1 }
    expect(await run([dir, '--yes'], io)).toBe(1)
    expect((await create(dir, '--db', 'mysql')).code).toBe(1)
  })
})

describe('package managers', () => {
  it('installs and prints the next steps in the chosen package manager', async () => {
    const steps = async (pm: string) => {
      const dir = join(project({}), 'my-cms')
      const result = await create(dir, '--yes', '--pm', pm)
      expect(result.code).toBe(0)
      return result
    }
    const npm = await steps('npm')
    expect(npm.commands[0]).toMatch(/^npm install @easy-cms\/core@/)
    expect(npm.out).toMatch(/my-cms && npm run dev/)
    expect(npm.out).toContain('npx easy-cms create-admin')
    expect(npm.out).toContain('NODE_ENV=production npm run start')

    const pnpm = await steps('pnpm')
    expect(pnpm.commands[0]).toMatch(/^pnpm add @easy-cms\/core@/)
    expect(pnpm.out).toMatch(/my-cms && pnpm dev/)
    expect(pnpm.out).toContain('pnpm exec easy-cms migrate:create init')

    const yarn = await steps('yarn')
    expect(yarn.out).toContain('yarn easy-cms migrate')
    expect(yarn.out).toContain('NODE_ENV=production yarn start')

    const bun = await steps('bun')
    expect(bun.commands[0]).toMatch(/^bun add @easy-cms\/core@/)
    expect(bun.out).toMatch(/my-cms && bun run dev/)
    expect(bun.out).toContain('bunx easy-cms create-admin')
    expect(bun.out).not.toContain('npx')

    expect((await create(join(project({}), 'x'), '--pm', 'deno')).code).toBe(1)
  })

  it('uses node_modules with Yarn 2+', async () => {
    const dir = join(project({}), 'my-cms')
    const result = await createWith({ capture: async () => '4.9.1' }, dir, '--yes', '--pm', 'yarn')
    expect(result.code).toBe(0)
    expect(read(dir, '.yarnrc.yml')).toBe('nodeLinker: node-modules\n')
    const classic = join(project({}), 'my-cms')
    await createWith({ capture: async () => '1.22.22' }, classic, '--yes', '--pm', 'yarn')
    expect(() => read(classic, '.yarnrc.yml')).toThrow()
  })

  it('says how to get a package manager that is not installed', async () => {
    const dir = join(project({}), 'my-cms')
    const result = await createWith({ exec: async () => 127 }, dir, '--yes', '--pm', 'pnpm')
    expect(result.code).toBe(1)
    expect(result.err).toContain('pnpm is not installed')
    expect(result.err).toContain('corepack enable')
    expect(result.err).toContain('pnpm add @easy-cms/core@')
  })
})

describe('translating npm commands', () => {
  const all = (line: string) =>
    (['pnpm', 'yarn', 'bun'] as const).map((pm) => translateLine(line, pm))

  it('installs, runs scripts and binaries', () => {
    expect(all('npm install @easy-cms/plugin-seo')).toEqual([
      'pnpm add @easy-cms/plugin-seo',
      'yarn add @easy-cms/plugin-seo',
      'bun add @easy-cms/plugin-seo',
    ])
    expect(all('npm install -D easy-cms')).toEqual([
      'pnpm add -D easy-cms',
      'yarn add -D easy-cms',
      'bun add --dev easy-cms',
    ])
    expect(all('npm install')).toEqual(['pnpm install', 'yarn install', 'bun install'])
    expect(all('npm run dev')).toEqual(['pnpm dev', 'yarn dev', 'bun run dev'])
    expect(all('npm run migrate:create -- init')).toEqual([
      'pnpm migrate:create init',
      'yarn migrate:create init',
      'bun run migrate:create init',
    ])
    expect(all('npx easy-cms migrate')).toEqual([
      'pnpm exec easy-cms migrate',
      'yarn easy-cms migrate',
      'bunx easy-cms migrate',
    ])
    expect(all('npx nuxi init my-app')[0]).toBe('pnpm exec nuxi init my-app')
    expect(all('npx @modelcontextprotocol/inspector')).toEqual([
      'pnpm dlx @modelcontextprotocol/inspector',
      'yarn dlx @modelcontextprotocol/inspector',
      'bunx @modelcontextprotocol/inspector',
    ])
  })

  it('creates projects', () => {
    expect(all('npx create-easy-cms')).toEqual([
      'pnpm create easy-cms',
      'yarn create easy-cms',
      'bun create easy-cms',
    ])
    expect(all('npm create easy-cms@latest my-cms')).toEqual([
      'pnpm create easy-cms my-cms',
      'yarn create easy-cms my-cms',
      'bun create easy-cms my-cms',
    ])
    expect(all('npx create-next-app@latest my-app')[2]).toBe('bun create next-app my-app')
  })

  it('keeps everything around the command', () => {
    expect(translateLine('NODE_ENV=production npm start   # serve', 'pnpm')).toBe(
      'NODE_ENV=production pnpm start   # serve',
    )
    expect(translateLine('cd my-cms && npm run dev', 'bun')).toBe('cd my-cms && bun run dev')
    expect(translateLine('# npm install', 'pnpm')).toBe('# npm install')
    expect(translateLine('pg_dump --format=custom', 'yarn')).toBe('pg_dump --format=custom')
    expect(translateLine('npm audit', 'pnpm')).toBeNull()
    expect(translateCommands('npm install\nnpm run dev', 'yarn')).toBe('yarn install\nyarn dev')
    expect(translateCommands('npm install\nnpm audit', 'yarn')).toBeNull()
  })
})

describe('helpers', () => {
  it('detects the package manager: --pm, packageManager, lockfile, then the caller', () => {
    vi.stubEnv('npm_config_user_agent', 'bun/1.3.0 npm/? node/v24.0.0 darwin arm64')
    try {
      expect(detectPackageManager(project({ 'yarn.lock': '' }))).toBe('yarn')
      expect(detectPackageManager(project({ 'bun.lock': '' }))).toBe('bun')
      expect(detectPackageManager(project({ 'bun.lockb': '' }))).toBe('bun')
      expect(detectPackageManager(project({ 'package-lock.json': '{}' }))).toBe('npm')
      expect(detectPackageManager(project({ 'pnpm-lock.yaml': '' }), 'npm')).toBe('npm')
      const corepack = project({
        'package.json': '{"packageManager":"pnpm@10.12.1"}',
        'package-lock.json': '{}',
      })
      expect(detectPackageManager(corepack)).toBe('pnpm')
      // No lockfile: the package manager that runs create-easy-cms.
      expect(detectPackageManager(project({}))).toBe('bun')
      vi.stubEnv('npm_config_user_agent', 'pnpm/10.12.1 npm/? node/v24.0.0')
      expect(detectPackageManager(project({}))).toBe('pnpm')
      vi.stubEnv('npm_config_user_agent', '')
      expect(detectPackageManager(project({}))).toBe('npm')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('tells Yarn 1 from Yarn 2+', async () => {
    const io = (version: string | null): IO => ({
      out: () => {},
      err: () => {},
      interactive: false,
      capture: async () => version,
    })
    expect(await isYarnBerry(project({}), io('1.22.22'))).toBe(false)
    expect(await isYarnBerry(project({}), io('4.9.1'))).toBe(true)
    expect(
      await isYarnBerry(project({ 'yarn.lock': '__metadata:\n  version: 8\n' }), io(null)),
    ).toBe(true)
    expect(await isYarnBerry(project({ 'yarn.lock': '# yarn lockfile v1\n' }), io('4.9.1'))).toBe(
      false,
    )
    expect(
      await isYarnBerry(project({ 'package.json': '{"packageManager":"yarn@4.9.1"}' }), io(null)),
    ).toBe(true)
  })

  it('lists packages per framework and database', () => {
    expect(packagesFor('standalone', 'postgres')).toEqual({
      deps: [
        `@easy-cms/core@${V}`,
        `easy-cms@${V}`,
        `@easy-cms/db-postgres@${V}`,
        '@electric-sql/pglite',
      ],
      devDeps: [],
    })
    expect(packagesFor('next', 'sqlite').deps).toEqual([
      `@easy-cms/core@${V}`,
      `@easy-cms/next@${V}`,
      `@easy-cms/db-sqlite@${V}`,
    ])
  })
})

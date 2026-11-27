import { cpSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { defaultClientConditions, defineConfig, type Plugin } from 'vite'

const packagesDir = resolve(import.meta.dirname, '../packages')
const adminApp = join(packagesDir, 'admin/dist/app')

/** Every file under `dir` whose name ends with `suffix`. */
function filesIn(dir: string, suffix: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return filesIn(path, suffix)
    return entry.name.endsWith(suffix) ? [path] : []
  })
}

/**
 * `virtual:studio-types`: the published type declarations of every @easy-cms package, laid out
 * under node_modules for the editor's TypeScript, so a config gets completions and errors.
 */
function studioTypes(): Plugin {
  const id = 'virtual:studio-types'
  return {
    name: 'studio-types',
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load(loaded) {
      if (loaded !== `\0${id}`) return
      const files: Record<string, string> = {}
      for (const dir of readdirSync(packagesDir)) {
        const manifest = join(packagesDir, dir, 'package.json')
        if (!existsSync(manifest)) continue
        const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as {
          name: string
          private?: boolean
          exports?: Record<string, { types?: string } | string>
        }
        if (pkg.private || !pkg.name.startsWith('@easy-cms/')) continue
        const root = `file:///node_modules/${pkg.name}`
        const declarations = filesIn(join(packagesDir, dir, 'dist'), '.d.ts')
        if (declarations.length === 0) continue
        for (const file of declarations)
          files[`${root}/${relative(join(packagesDir, dir), file)}`] = readFileSync(file, 'utf8')
        // Node-style resolution in the editor reads `types`; subpaths get a package.json each.
        const exports = pkg.exports ?? {}
        for (const [subpath, target] of Object.entries(exports)) {
          const types = typeof target === 'object' ? target.types : undefined
          if (!types) continue
          const at = subpath === '.' ? root : `${root}/${subpath.slice(2)}`
          files[`${at}/package.json`] = JSON.stringify({
            name: pkg.name,
            types: join(relative(at, root) || '.', types),
          })
        }
      }
      return `export default ${JSON.stringify(files)}`
    },
  }
}

/**
 * Monaco with TypeScript (and JavaScript) only: its main entry brings every language Monaco
 * knows, and the CSS, HTML and JSON services with their workers, which a config never needs.
 */
function monacoTypeScriptOnly(): Plugin {
  const unused =
    /monaco-editor\/esm\/vs\/languages\/(definitions\/(?!typescript\/|javascript\/)[^/]+|features\/(css|html|json))\/register\.js$/
  return {
    name: 'monaco-typescript-only',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer?.includes('monaco-editor')) return
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      return resolved && unused.test(resolved.id) ? '\0monaco-unused' : undefined
    },
    load: (id) => (id === '\0monaco-unused' ? 'export {}' : undefined),
  }
}

/** The admin's built app at /admin/, served as files; the Service Worker renders its shell. */
function copyAdminApp(): Plugin {
  let outDir = 'dist'
  return {
    name: 'studio-admin-app',
    apply: 'build',
    configResolved: (config) => {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      if (!existsSync(join(adminApp, 'shell.html')))
        throw new Error('Build @easy-cms/admin first: its dist/app is missing')
      cpSync(adminApp, join(outDir, 'admin'), { recursive: true })
    },
  }
}

export default defineConfig({
  // Studio's own builds of core and the in-memory database, without Node's modules (ADR-0074).
  resolve: { conditions: ['easy-cms-browser', ...defaultClientConditions] },
  plugins: [monacoTypeScriptOnly(), studioTypes(), copyAdminApp()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        sandbox: resolve(import.meta.dirname, 'sandbox.html'),
        sw: resolve(import.meta.dirname, 'src/sw.ts'),
      },
      output: {
        // The Service Worker's scope is where its file is: the root.
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  preview: { port: 5180, strictPort: true },
})

// `easy-cms build:admin`: admin components written in Vue, React or Svelte, built with Vite into
// the admin's contract (ADR-0018): one ES module without imports that defines custom elements.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Plugin, PluginOption } from 'vite'
import { defineRuntime, FRAMEWORK_CODE, SVELTE_ADAPTER } from './runtime.js'

export type Framework = 'vue' | 'react' | 'svelte'

const EXTENSIONS: Record<string, Framework> = {
  '.vue': 'vue',
  '.tsx': 'react',
  '.jsx': 'react',
  '.svelte': 'svelte',
}

/** What each framework needs installed in the project, and from which version. */
const NEEDS: Record<Framework, { package: string; min: [number, number]; plugin: string }> = {
  vue: { package: 'vue', min: [3, 5], plugin: '@vitejs/plugin-vue' },
  react: { package: 'react', min: [18, 0], plugin: '@vitejs/plugin-react' },
  svelte: { package: 'svelte', min: [5, 0], plugin: '@sveltejs/vite-plugin-svelte' },
}

/** Where components are looked for, and the module they make, without entries. */
// With `/` on Windows too: they are shown in messages, and path functions take them.
export const DEFAULT_DIR = 'admin/components'
export const DEFAULT_OUT = 'admin/dist/components.js'

export class AdminBuildError extends Error {
  override name = 'AdminBuildError'
}

export interface BuildAdminOptions {
  /** The project root: components, the frameworks and their Vite plugins are found from it. */
  readonly cwd: string
  /**
   * Component files, each built into a module of its own. Default: every component in
   * `admin/components/`, together in one module.
   */
  readonly entries?: readonly string[]
  /**
   * Where the module goes (one module), or the folder for them (several entries). Default
   * `admin/dist/components.js`, or `admin/dist/<tag>.js` per entry.
   */
  readonly out?: string
  /** Build again when a file changes, until the process ends. */
  readonly watch?: boolean
  readonly log?: (line: string) => void
}

export interface BuiltModule {
  /** The module's file, absolute. */
  readonly file: string
  /** The custom elements it defines. */
  readonly tags: readonly string[]
}

interface Component {
  readonly file: string
  readonly tag: string
  readonly framework: Framework
}

/** A custom element name: lowercase, starting with a letter, with a `-`. */
const TAG = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/

/** Builds the modules; with `watch`, keeps building them as files change. */
export async function buildAdmin(options: BuildAdminOptions): Promise<BuiltModule[]> {
  const cwd = resolve(options.cwd)
  const log = options.log ?? (() => {})
  const groups = plan(cwd, options)
  const require = createRequire(join(cwd, 'package.json'))
  const { build } = await import('vite')
  const built: BuiltModule[] = []
  for (const group of groups) {
    const frameworks = [...new Set(group.components.map((c) => c.framework))]
    for (const framework of frameworks) checkVersion(require, framework)
    const plugins = await Promise.all(frameworks.map((f) => frameworkPlugin(require, f)))
    const entry = await writeEntry(cwd, group.out, group.components)
    await viteBuild(build, {
      root: cwd,
      configFile: false,
      logLevel: 'warn',
      plugins: [...plugins, inlineCss()],
      // React reads it; nothing replaces it in a library build otherwise.
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      build: {
        lib: { entry, formats: ['es'], fileName: () => basename(group.out) },
        outDir: dirname(group.out),
        emptyOutDir: false,
        copyPublicDir: false,
        cssCodeSplit: false,
        rolldownOptions: { output: { codeSplitting: false } },
        ...(options.watch ? { watch: {} } : {}),
      },
    })
    built.push({ file: group.out, tags: group.components.map((c) => c.tag) })
    log(
      `${options.watch ? 'Watching' : 'Built'} ${relative(cwd, group.out)} (${group.components.map((c) => `<${c.tag}>`).join(', ')})`,
    )
  }
  return built
}

/**
 * Vite's build, with what to do when the TypeScript transform can't load the project's
 * tsconfig.json: Nuxt's points to `.nuxt/` files that `nuxi prepare` writes.
 */
async function viteBuild(
  build: typeof import('vite').build,
  config: Parameters<typeof import('vite').build>[0],
): Promise<void> {
  try {
    await build(config)
  } catch (error) {
    const message = (error as Error).message ?? ''
    const missing = /Failed to load tsconfig '([^']+)'/.exec(message)?.[1]
    if (!missing) throw error
    throw new AdminBuildError(
      `TypeScript components need the project's tsconfig.json, which names ${missing}, not there yet.${missing.includes('.nuxt') ? ' Run `nuxi prepare` first (e.g. "build": "nuxi prepare && easy-cms build:admin && nuxi build").' : ''}`,
    )
  }
}

function plan(cwd: string, options: BuildAdminOptions): { out: string; components: Component[] }[] {
  if (!options.entries || options.entries.length === 0) {
    const dir = join(cwd, DEFAULT_DIR)
    const files = existsSync(dir)
      ? readdirSync(dir)
          .filter((f) => extname(f) in EXTENSIONS)
          .sort()
          .map((f) => join(dir, f))
      : []
    if (files.length === 0)
      throw new AdminBuildError(
        `No components in ${DEFAULT_DIR}/: add one, e.g. ${DEFAULT_DIR}/acme-color-picker.vue (the file name is the tag), or name the files to build.`,
      )
    return [{ out: resolve(cwd, options.out ?? DEFAULT_OUT), components: files.map(component) }]
  }
  const components = options.entries.map((e) => component(resolve(cwd, e)))
  if (components.length === 1 && options.out)
    return [{ out: resolve(cwd, options.out), components }]
  const dir = resolve(cwd, options.out ?? dirname(DEFAULT_OUT))
  return components.map((c) => ({ out: join(dir, `${c.tag}.js`), components: [c] }))
}

function component(file: string): Component {
  if (!existsSync(file)) throw new AdminBuildError(`${file} not found.`)
  const framework = EXTENSIONS[extname(file)]
  if (!framework)
    throw new AdminBuildError(
      `${file}: a component is a .vue, .tsx, .jsx or .svelte file (got ${extname(file) || 'no extension'}).`,
    )
  const tag = basename(file, extname(file))
  if (!TAG.test(tag))
    throw new AdminBuildError(
      `${basename(file)}: the file name is the element's tag, so it must be lowercase with a "-", e.g. acme-${tag.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'component'}${extname(file)}.`,
    )
  return { file, tag, framework }
}

/** The framework's version in the project, refused below the one the admin elements need. */
function checkVersion(require: NodeJS.Require, framework: Framework) {
  const need = NEEDS[framework]
  let version: string
  try {
    version = JSON.parse(readFileSync(require.resolve(`${need.package}/package.json`), 'utf8'))
      .version as string
  } catch {
    throw new AdminBuildError(
      `${framework} components need ${need.package} ${need.min.join('.')} or later and ${need.plugin} in the project: npm install -D ${need.package} ${need.plugin}${framework === 'react' ? ' react-dom' : ''}`,
    )
  }
  const [major = 0, minor = 0] = version.split('.').map(Number)
  if (major < need.min[0] || (major === need.min[0] && minor < need.min[1]))
    throw new AdminBuildError(
      `${need.package} ${version} is installed; ${framework} admin components need ${need.min.join('.')} or later.`,
    )
}

async function frameworkPlugin(
  require: NodeJS.Require,
  framework: Framework,
): Promise<PluginOption> {
  const need = NEEDS[framework]
  let file: string
  try {
    file = require.resolve(need.plugin)
  } catch {
    throw new AdminBuildError(
      `${framework} components need ${need.plugin} in the project: npm install -D ${need.plugin}`,
    )
  }
  const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>
  const create = (framework === 'svelte' ? mod.svelte : mod.default) as (
    options?: unknown,
  ) => PluginOption
  return create(framework === 'vue' ? await vueOptions(require, file) : undefined)
}

/**
 * `defineProps<AdminComponentProps<…>>()` needs Vue's compiler to read types from packages, which
 * it does with TypeScript: the project's, when it has it.
 */
async function vueOptions(require: NodeJS.Require, pluginFile: string) {
  let ts: unknown
  try {
    ts = await import(pathToFileURL(require.resolve('typescript')).href).then((m) => m.default ?? m)
  } catch {
    return undefined
  }
  const compilerFile = createRequire(pluginFile).resolve('vue/compiler-sfc')
  const compiler = (await import(pathToFileURL(compilerFile).href)) as {
    registerTS: (load: () => unknown) => void
  }
  compiler.registerTS(() => ts)
  return { compiler }
}

/**
 * The module's entry, written under the project's node_modules so the frameworks resolve from
 * the project and the Svelte plugin compiles the adapter's runes.
 */
async function writeEntry(cwd: string, out: string, components: Component[]): Promise<string> {
  const dir = join(
    cwd,
    'node_modules',
    '.easy-cms',
    'admin-build',
    relative(cwd, out).replace(/[^a-zA-Z0-9]+/g, '_'),
  )
  await mkdir(dir, { recursive: true })
  const frameworks = [...new Set(components.map((c) => c.framework))]
  const lines = [defineRuntime()]
  for (const framework of frameworks) {
    if (framework === 'svelte') {
      await writeFile(join(dir, 'svelte-adapter.svelte.js'), SVELTE_ADAPTER)
      lines.push(`import { svelte } from './svelte-adapter.svelte.js'`)
    } else lines.push(FRAMEWORK_CODE[framework])
  }
  components.forEach((c, i) => {
    lines.push(`import C${i} from ${JSON.stringify(c.file)}`)
    lines.push(`define(${JSON.stringify(c.tag)}, ${c.framework}(C${i}))`)
  })
  const entry = join(dir, 'entry.js')
  await writeFile(entry, `${lines.join('\n')}\n`)
  return entry
}

const CSS_PLACEHOLDER = '__EASY_CMS_ADMIN_CSS__'

/**
 * The components' CSS (Vue and Svelte styles, imported .css files) goes into the module, which
 * puts it in each element's shadow root: the admin loads no stylesheets of modules.
 */
function inlineCss(): Plugin {
  return {
    name: 'easy-cms:inline-css',
    enforce: 'post' as const,
    generateBundle(_, bundle) {
      let css = ''
      for (const [name, item] of Object.entries(bundle)) {
        if (item.type === 'asset' && name.endsWith('.css')) {
          css +=
            typeof item.source === 'string' ? item.source : new TextDecoder().decode(item.source)
          delete bundle[name]
        }
      }
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk' && item.code) {
          const literal = JSON.stringify(css)
          item.code = item.code
            .replaceAll(`"${CSS_PLACEHOLDER}"`, literal)
            .replaceAll(`'${CSS_PLACEHOLDER}'`, literal)
            .replaceAll(`\`${CSS_PLACEHOLDER}\``, literal)
        }
      }
    },
  }
}

// Reads the public options and methods from @easy-cms/core's source with the TypeScript compiler,
// so the reference pages can be checked against the code.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const CORE = join(dirname(fileURLToPath(import.meta.url)), '../../packages/core/src')
/** TypeScript reports file names with `/`, also on Windows. */
const CORE_POSIX = CORE.replace(/\\/g, '/')

/** Interfaces whose properties are config options, by the reference page that documents them. */
export const CONFIG_INTERFACES = [
  'Config',
  'AdminConfig',
  'AdminBrand',
  'AdminPage',
  'DashboardWidget',
  'RoutesConfig',
  'AuthConfig',
  'UploadConfig',
  'UploadFromURLConfig',
  'BackupsConfig',
  'ImageSize',
  'LocalizationConfig',
  'CollectionConfig',
  'GlobalConfig',
  'VersionsConfig',
  'CollectionAdmin',
  'CollectionHooks',
  'GlobalHooks',
  'Endpoint',
  'EndpointRequest',
  'WebhookConfig',
] as const

export const FIELD_INTERFACES = [
  'BaseField',
  'FieldAdmin',
  'TextField',
  'TextareaField',
  'NumberField',
  'SelectField',
  'SlugField',
  'RelationshipField',
  'ArrayField',
  'GroupField',
  'BlocksField',
  'Block',
] as const

let program: ts.Program | undefined
function load() {
  program ??= ts.createProgram(
    ['config.ts', 'fields.ts', 'webhooks.ts', 'local-api.ts'].map((f) => join(CORE, f)),
    { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, strict: true, noEmit: true },
  )
  return program
}

/** Own property names of an interface (not inherited ones), in declaration order. */
export function properties(name: string): string[] {
  for (const file of load().getSourceFiles()) {
    if (!file.fileName.startsWith(CORE_POSIX)) continue
    for (const statement of file.statements) {
      if (ts.isInterfaceDeclaration(statement) && statement.name.text === name) {
        return statement.members.flatMap((m) =>
          (ts.isPropertySignature(m) || ts.isMethodSignature(m)) &&
          m.name &&
          ts.isIdentifier(m.name)
            ? [m.name.text]
            : [],
        )
      }
    }
  }
  throw new Error(`interface ${name} not found in core`)
}

/** Public methods of the EasyCMS class (the Local API). */
export function localApiMethods(): string[] {
  for (const file of load().getSourceFiles()) {
    if (!file.fileName.endsWith('local-api.ts')) continue
    for (const statement of file.statements) {
      if (ts.isClassDeclaration(statement) && statement.name?.text === 'EasyCMS') {
        return statement.members.flatMap((m) => {
          if (!ts.isMethodDeclaration(m) || !m.name || !ts.isIdentifier(m.name)) return []
          const modifiers = ts.getCombinedModifierFlags(m)
          if (modifiers & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) return []
          // Internal helpers are marked @internal.
          if (m.getFullText(file).includes('@internal')) return []
          return [m.name.text]
        })
      }
    }
  }
  throw new Error('class EasyCMS not found')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const name of [...CONFIG_INTERFACES, ...FIELD_INTERFACES])
    console.log(name, properties(name).join(', '))
  console.log('EasyCMS', [...new Set(localApiMethods())].join(', '))
}

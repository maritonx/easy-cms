// The reference pages must list every option and method of @easy-cms/core, in both languages.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { CONFIG_INTERFACES, FIELD_INTERFACES, localApiMethods, properties } from './api-surface.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const page = (path: string) => readFileSync(join(ROOT, path), 'utf8')

/**
 * The part of a page documenting one type: from its `<!-- api: Name -->` marker to the heading
 * after the one it introduces.
 */
function section(markdown: string, name: string): string {
  const marker = markdown.indexOf(`<!-- api: ${name} -->`)
  if (marker === -1) return ''
  const rest = markdown.slice(marker)
  const heading = rest.search(/^#{2,4} /m)
  const body = rest.indexOf('\n', heading) + 1
  const next = rest.slice(body).search(/^#{2,4} /m)
  return next === -1 ? rest : rest.slice(0, body + next)
}

/** Whether a section has a table row for a name: `| \`name\`` or `| \`name(…)\``. */
const documented = (text: string, name: string) =>
  new RegExp(`^\\| \`${name}(\\(|\`)`, 'm').test(text)

const LANGS = [
  ['en', ''],
  ['th', 'th/'],
] as const

/** Fails with the names a section does not mention. */
function checkSection(file: string, name: string) {
  const text = section(page(file), name)
  assert.notEqual(text, '', `${file}: no <!-- api: ${name} --> section`)
  const missing = properties(name).filter((p) => !documented(text, p))
  assert.deepEqual(missing, [], `${file}: ${name} is missing ${missing.join(', ')}`)
}

for (const [lang, prefix] of LANGS) {
  describe(`reference pages (${lang})`, () => {
    for (const name of CONFIG_INTERFACES)
      it(`config: ${name}`, () => checkSection(`${prefix}reference/config.md`, name))

    for (const name of FIELD_INTERFACES)
      it(`fields: ${name}`, () => checkSection(`${prefix}reference/fields.md`, name))

    it('Local API: every method of EasyCMS', () => {
      const text = page(`${prefix}reference/local-api.md`)
      const missing = [...new Set(localApiMethods())].filter((m) => !documented(text, m))
      assert.deepEqual(missing, [], `local-api.md is missing ${missing.join(', ')}`)
    })

    it('CLI: every command', () => {
      const source = readFileSync(join(ROOT, '../packages/cli/src/index.ts'), 'utf8')
      const help = source.slice(
        source.indexOf('const COMMAND_HELP'),
        source.indexOf('/** Runs the CLI'),
      )
      const commands = [...help.matchAll(/^ {2}'?([a-z:-]+)'?: `Usage/gm)].map(
        (m) => m[1] as string,
      )
      assert.ok(commands.length > 5, 'could not read the CLI commands')
      const text = page(`${prefix}guide/cli.md`)
      assert.deepEqual(
        commands.filter((c) => !text.includes(`### ${c}`)),
        [],
      )
    })
  })
}

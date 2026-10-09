import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { test } from 'node:test'
import navigation from '../sidebar.json' with { type: 'json' }

const root = join(import.meta.dirname, '..')
const paths = navigation.groups.flatMap((group) => group.items.map((item) => item.path))

/** Every .md file under a folder, as `guide/deploy/vercel` (forward slashes on Windows too). */
function pages(folder: string, base = folder): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) return pages(path, base)
    if (!entry.name.endsWith('.md')) return []
    return [relative(base, path).split(sep).join('/').replace(/\.md$/, '')]
  })
}

/**
 * Pages kept only so old links still work: front matter `moved: <new page>`. Line endings are
 * normalised, since Git on Windows may check files out with CRLF.
 */
const moved = (file: string) =>
  /^---\n(?:.*\n)*?moved: .+\n(?:.*\n)*?---/.test(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'))

test('every sidebar page exists in English and Thai', () => {
  const missing = paths.flatMap((path) =>
    [join(root, `${path}.md`), join(root, 'th', `${path}.md`)].filter((file) => !existsSync(file)),
  )
  assert.deepEqual(
    missing.map((file) => relative(root, file)),
    [],
  )
})

test('every sidebar page has a title in both languages', () => {
  const untitled = navigation.groups.flatMap((group) =>
    [group, ...group.items].filter((entry) => !entry.title.en || !entry.title.th),
  )
  assert.deepEqual(untitled, [])
})

test('every guide and reference page is in the sidebar, unless it moved', () => {
  const listed = new Set(paths)
  for (const lang of ['', 'th']) {
    const files = ['guide', 'reference'].flatMap((folder) =>
      pages(join(root, lang, folder)).map((page) => `${folder}/${page}`),
    )
    const unlisted = files.filter(
      (page) => !listed.has(page) && !moved(join(root, lang, `${page}.md`)),
    )
    assert.deepEqual(unlisted, [], `${lang || 'en'}: pages missing from sidebar.json`)
  }
})

test('the sidebar lists each page once', () => {
  assert.deepEqual(
    paths.filter((path, i) => paths.indexOf(path) !== i),
    [],
  )
})

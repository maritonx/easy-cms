// @vitest-environment happy-dom
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AdminBuildError, buildAdmin } from '../src/index.js'

const fixture = join(import.meta.dirname, 'fixture')
// Inside the package: Vitest imports the module, and won't from outside the project.
mkdirSync(join(import.meta.dirname, '.tmp'), { recursive: true })
const out = mkdtempSync(join(import.meta.dirname, '.tmp', 'build-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

let code = ''
beforeAll(async () => {
  const [module] = JSON.parse(
    execFileSync(
      process.execPath,
      [join(import.meta.dirname, 'build-fixture.mjs'), fixture, join(out, 'components.js')],
      // Vite skips writing files when it sees it runs under Vitest.
      {
        encoding: 'utf8',
        env: Object.fromEntries(
          Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST') && k !== 'NODE_ENV'),
        ),
      },
    ),
  ) as { file: string; tags: string[] }[]
  expect(module?.tags).toEqual(['acme-react-count', 'acme-svelte-count', 'acme-vue-count'])
  code = readFileSync(module?.file as string, 'utf8')
  await import(/* @vite-ignore */ module?.file as string)
})

/** An element as the admin makes one: properties set, then added to the page. */
async function element(tag: string, props: Record<string, unknown>) {
  const el = document.createElement(tag) as HTMLElement & Record<string, unknown>
  Object.assign(el, { apiVersion: 1, readOnly: false, options: {}, doc: {}, ...props })
  document.body.append(el)
  await new Promise((r) => setTimeout(r, 20))
  const events: { type: string; detail: unknown }[] = []
  for (const type of ['change', 'set-field', 'navigate'])
    el.addEventListener(type, (e) => events.push({ type, detail: (e as CustomEvent).detail }))
  return { el, root: el.shadowRoot as ShadowRoot, events }
}

const settle = () => new Promise((r) => setTimeout(r, 20))

function type(input: HTMLInputElement, text: string) {
  // As typing does: React tracks the value it set, and skips changes made through `input.value`.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, text)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('easy-cms build:admin (#443)', () => {
  it('makes one ES module without imports, with the CSS inside', () => {
    expect(code).not.toMatch(/^\s*import\s/m)
    expect(code).not.toContain('__EASY_CMS_ADMIN_CSS__')
    expect(code).toContain('--brand')
    expect(code).toContain('font-weight')
  })

  it('Vue: gets the properties as props, and change() sets the field', async () => {
    const { el, root, events } = await element('acme-vue-count', {
      value: 'Hi',
      options: { max: 10 },
    })
    expect(root.textContent).toContain('2/10')
    expect(root.querySelector('style')?.textContent).toContain('--brand')
    type(root.querySelector('input') as HTMLInputElement, 'Hello')
    expect(events).toEqual([{ type: 'change', detail: 'Hello' }])
    el.value = 'Hello'
    await settle()
    expect(root.textContent).toContain('5/10')
    // Only declared props reach Vue: no attributes on its root element.
    expect(root.querySelector('label')?.getAttribute('doc')).toBeNull()
  })

  it('React: change() and setField()', async () => {
    const { el, root, events } = await element('acme-react-count', { value: 'abc' })
    expect(root.textContent).toContain('3')
    type(root.querySelector('input') as HTMLInputElement, 'abcd')
    ;(root.querySelector('button') as HTMLButtonElement).click()
    expect(events).toEqual([
      { type: 'change', detail: 'abcd' },
      { type: 'set-field', detail: { path: 'meta.title', value: 'abc' } },
    ])
    el.readOnly = true
    await settle()
    expect((root.querySelector('input') as HTMLInputElement).disabled).toBe(true)
  })

  it('Svelte: change() and navigate()', async () => {
    const { el, root, events } = await element('acme-svelte-count', { value: 'xy' })
    expect(root.textContent).toContain('2')
    type(root.querySelector('input') as HTMLInputElement, 'xyz')
    ;(root.querySelector('a') as HTMLAnchorElement).click()
    expect(events).toEqual([
      { type: 'change', detail: 'xyz' },
      { type: 'navigate', detail: '/collections/posts' },
    ])
    el.value = 'xyz!'
    await settle()
    expect(root.textContent).toContain('4')
  })

  it('refuses file names that are no tag, and an empty folder', async () => {
    await expect(buildAdmin({ cwd: fixture, entries: ['package.json'] })).rejects.toThrow(
      AdminBuildError,
    )
    await expect(buildAdmin({ cwd: out })).rejects.toThrow(/No components in/)
  })
})

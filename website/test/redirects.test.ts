import assert from 'node:assert/strict'
import { test } from 'node:test'
// @ts-expect-error: a plain .mjs script, without types
import { target } from '../redirects.mjs'

test('old GitHub Pages URLs go to the same page on easycms.dev', () => {
  const cases: [string, string][] = [
    ['index', 'https://easycms.dev/'],
    ['th/index', 'https://easycms.dev/th'],
    ['guide/what-is-easy-cms', 'https://easycms.dev/docs'],
    ['th/guide/what-is-easy-cms', 'https://easycms.dev/th/docs'],
    ['guide/hooks', 'https://easycms.dev/docs/hooks'],
    ['th/guide/drafts', 'https://easycms.dev/th/docs/drafts'],
    ['guide/recipes/index', 'https://easycms.dev/docs/recipes'],
    ['guide/deploy/vercel', 'https://easycms.dev/docs/deploy/vercel'],
    ['reference/config', 'https://easycms.dev/docs/reference/config'],
    ['th/reference/config', 'https://easycms.dev/th/docs/reference/config'],
  ]
  for (const [file, url] of cases) assert.equal(target(file), url, file)
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { packageManagerTabs } from '../.vitepress/package-managers.ts'

test('a [pm] block becomes a code group for npm, pnpm, Yarn and Bun', () => {
  const page = 'Run:\n\n```bash [pm]\nnpx easy-cms migrate\nnpm run dev\n```\n\nDone.'
  assert.equal(
    packageManagerTabs(page),
    [
      'Run:',
      '',
      '::: code-group',
      '',
      '```bash [npm]\nnpx easy-cms migrate\nnpm run dev\n```',
      '',
      '```bash [pnpm]\npnpm exec easy-cms migrate\npnpm dev\n```',
      '',
      '```bash [yarn]\nyarn easy-cms migrate\nyarn dev\n```',
      '',
      '```bash [bun]\nbunx easy-cms migrate\nbun run dev\n```',
      '',
      ':::',
      '',
      'Done.',
    ].join('\n'),
  )
})

test('indented blocks (in lists) stay indented, other blocks stay as they are', () => {
  const page =
    '1. Install:\n\n   ```sh [pm]\n   npm install @easy-cms/plugin-seo\n   ```\n\n```bash\nnpm audit\n```'
  const out = packageManagerTabs(page)
  assert.match(out, /^ {3}::: code-group$/m)
  assert.match(out, /^ {3}bun add @easy-cms\/plugin-seo$/m)
  assert.match(out, /```bash\nnpm audit\n```$/)
})

test('a command with no translation fails the build', () => {
  assert.throws(
    () => packageManagerTabs('```sh [pm]\nnpm audit\n```', 'guide/x.md'),
    /guide\/x\.md/,
  )
})

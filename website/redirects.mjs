// The docs moved to easycms.dev. GitHub Pages (maritonx.github.io/easy-cms) now serves one small
// page per old URL that sends readers, and search engines, to the same page there.
//
//   node website/redirects.mjs <out-dir>
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, posix, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = 'https://easycms.dev'
const root = dirname(fileURLToPath(import.meta.url))

/**
 * A docs file (`guide/next`, `th/reference/config`, `index`) → its URL on easycms.dev, as the
 * site maps them (lib/docs/sidebar.ts there): /docs/… in English, /th/docs/… in Thai.
 */
export function target(file) {
  const th = file === 'th/index' || file.startsWith('th/')
  const page = th ? file.replace(/^th\/?/, '') : file
  if (page === 'index' || page === '') return th ? `${SITE}/th` : `${SITE}/`
  const docs = th ? '/th/docs' : '/docs'
  if (page === 'guide/what-is-easy-cms') return SITE + docs
  const path = page.replace(/^guide\//, '').replace(/(^|\/)index$/, '')
  return `${SITE}${docs}/${path}`.replace(/\/$/, '')
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** A page that redirects at once, keeping the #section, with a link for readers without scripts. */
function page(url) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Easy CMS docs moved to easycms.dev</title>
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=${esc(url)}">
<script>location.replace(${JSON.stringify(url)} + location.hash)</script>
</head>
<body>
<p>The Easy CMS docs moved to <a href="${esc(url)}">${esc(url)}</a>.</p>
</body>
</html>
`
}

/** Old URLs with no page above (assets, pages since removed): the docs, in the same language. */
const fallback = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Easy CMS docs moved to easycms.dev</title>
<meta name="robots" content="noindex">
<script>location.replace('${SITE}' + (/^\\/easy-cms\\/th(\\/|$)/.test(location.pathname) ? '/th/docs' : '/docs'))</script>
</head>
<body>
<p>The Easy CMS docs moved to <a href="${SITE}/docs">${SITE}/docs</a>.</p>
</body>
</html>
`

async function markdown(dir) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!['node_modules', 'public', 'test', '.vitepress'].includes(entry.name))
        files.push(...(await markdown(full)))
    } else if (entry.name.endsWith('.md')) files.push(relative(root, full).replace(/\.md$/, ''))
  }
  return files
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[2]
  if (!out) throw new Error('usage: node website/redirects.mjs <out-dir>')
  const files = await markdown(root)
  for (const file of files) {
    // A page that says `moved: ../deploy/vercel` goes where it moved to.
    const moved = /^---\n[\s\S]*?^moved:\s*(\S+)[\s\S]*?^---/m.exec(
      await readFile(join(root, `${file}.md`), 'utf8'),
    )?.[1]
    const to = moved ? posix.join(posix.dirname(file), moved) : file
    // cleanUrls: /guide/next was guide/next.html; /guide/recipes/ was guide/recipes/index.html.
    const name = join(out, `${file}.html`)
    await mkdir(dirname(name), { recursive: true })
    await writeFile(name, page(target(to)))
  }
  await writeFile(join(out, '404.html'), fallback)
  console.log(`${files.length} redirect pages to ${SITE} in ${out}`)
}

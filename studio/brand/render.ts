/**
 * Renders the share image (brand/og.html → public/og.png) and the home-screen icon
 * (public/favicon.svg → public/apple-touch-icon.png) in headless Chrome.
 *
 *   node brand/render.ts   (Node 23.6+; on 22, add --experimental-strip-types)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'

const root = join(import.meta.dirname, '..')
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch())
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
  await page.goto(pathToFileURL(join(root, 'brand/og.html')).href)
  await page.evaluate(
    () =>
      (globalThis as unknown as { document: { fonts: { ready: Promise<unknown> } } }).document.fonts
        .ready,
  )
  await page.screenshot({ path: join(root, 'public/og.png') })

  const icon = readFileSync(join(root, 'public/favicon.svg'), 'utf8')
  await page.setViewportSize({ width: 180, height: 180 })
  // Square corners: iOS rounds them itself.
  await page.setContent(
    `<style>*{margin:0}svg{display:block;width:180px;height:180px}</style>${icon.replace('rx="8"', 'rx="0"')}`,
  )
  await page.screenshot({ path: join(root, 'public/apple-touch-icon.png') })
} finally {
  await browser.close()
}

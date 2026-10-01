/**
 * Package-manager tabs (```sh [pm] blocks): choosing npm, pnpm, Yarn or Bun on one block
 * chooses it on every block, and on later pages.
 */
const NAMES = ['npm', 'pnpm', 'yarn', 'bun']
const KEY = 'easy-cms-package-manager'

function saved(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** Selects `pm` in every package-manager group on the page. */
export function showPackageManager(pm: string | null) {
  if (!pm || !NAMES.includes(pm)) return
  for (const label of document.querySelectorAll<HTMLLabelElement>('.vp-code-group .tabs label')) {
    if (label.dataset.title !== pm) continue
    const input = document.getElementById(label.htmlFor) as HTMLInputElement | null
    const group = label.closest('.vp-code-group')
    if (!input || !group) continue
    input.checked = true
    // The block at the tab's position, as VitePress shows it on a click (which may not be
    // listening yet while the page loads).
    const index = [...group.querySelectorAll('.tabs input')].indexOf(input)
    const blocks = group.querySelector('.blocks')?.children ?? []
    for (const [i, block] of [...blocks].entries()) block.classList.toggle('active', i === index)
  }
}

export function setupPackageManagerTabs() {
  document.addEventListener('click', (event) => {
    const label = (event.target as Element | null)?.closest?.('.vp-code-group .tabs label')
    const pm = (label as HTMLLabelElement | null)?.dataset.title
    if (!pm || !NAMES.includes(pm)) return
    try {
      localStorage.setItem(KEY, pm)
    } catch {
      // private mode: the choice lasts for this page
    }
    setTimeout(() => showPackageManager(pm))
  })
  showPackageManager(saved())
}

/** After a page change in the browser, the saved choice for the new page's blocks. */
export const restorePackageManager = () => setTimeout(() => showPackageManager(saved()))

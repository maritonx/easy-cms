import { ref } from 'vue'
import { settings } from './settings'

export type ThemeMode = 'light' | 'dark' | 'system'

const KEY = 'easy-cms-theme'

function stored(): ThemeMode {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

/** Light, dark, or following the operating system; remembered in this browser. */
export const themeMode = ref<ThemeMode>(stored())

export function setTheme(mode: ThemeMode) {
  themeMode.value = mode
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    // private mode: the choice lasts for this page only
  }
  applyTheme()
}

/** `system` leaves the choice to `prefers-color-scheme` in the stylesheet. */
export function applyTheme() {
  const root = document.documentElement
  if (themeMode.value === 'system') delete root.dataset.theme
  else root.dataset.theme = themeMode.value
}

const HEX = /^#[0-9a-f]{6}$/i

/** Relative luminance (WCAG) of a `#rrggbb` color. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0)
}

/** White text on the brand color when it reads at 4.5:1, dark text otherwise. */
export function textOn(hex: string): string {
  return 1.05 / (luminance(hex) + 0.05) >= 4.5 ? '#ffffff' : '#18181b'
}

/** The brand from the config: main color (other shades derive from it in CSS), tab title, icon. */
export function applyBrand() {
  const { color, name } = settings.brand
  const root = document.documentElement
  if (color && HEX.test(color)) {
    root.style.setProperty('--brand', color)
    root.style.setProperty('--accent-text', textOn(color))
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (icon) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${color}"/><path d="M10 10h12M10 16h9M10 22h12" stroke="${textOn(color)}" stroke-width="3" stroke-linecap="round"/></svg>`
      icon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`
    }
  }
  if (name) document.title = name
}

/** The name shown in the menu and on the login page. */
export const brandName = () => settings.brand.name || 'Easy CMS'

/** One or two letters for a round avatar: from a name, else the part of an email before `@`. */
export function initials(text: string | undefined): string {
  const source = (text ?? '').split('@')[0]?.trim() ?? ''
  const words = source.split(/[\s._-]+/).filter(Boolean)
  const letters =
    words.length > 1 ? `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}` : source.slice(0, 2)
  return letters.toUpperCase() || '?'
}

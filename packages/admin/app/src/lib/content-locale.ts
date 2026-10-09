import { ref } from 'vue'
import { locale as uiLocale } from './i18n'
import { session } from './session'

// The content locale being edited (with `localization` in the config). Separate from the admin's
// own UI language; remembered in this browser.
const KEY = 'easy-cms-content-locale'
const chosen = ref<string | null>(read())

function read(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** The content locale in use, or `null` without localization. */
export function contentLocale(): string | null {
  const localization = session.schema?.localization
  if (!localization) return null
  return chosen.value && localization.locales.includes(chosen.value)
    ? chosen.value
    : localization.defaultLocale
}

export function setContentLocale(next: string) {
  chosen.value = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // private mode: keep it for this page only
  }
}

/**
 * Query parameters for the content locale: `&locale=en`. Editing asks for no fallback, so an
 * untranslated field shows empty instead of the default locale's text.
 */
export function localeQuery(options: { editing?: boolean } = {}): string {
  const current = contentLocale()
  if (!current) return ''
  return `&locale=${encodeURIComponent(current)}${options.editing ? '&fallbackLocale=false' : ''}`
}

/** "ไทย", "English"… in the admin's language. */
export function localeName(code: string): string {
  try {
    const name = new Intl.DisplayNames([uiLocale.value], { type: 'language' }).of(code)
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : code
  } catch {
    return code
  }
}

export interface Settings {
  adminPath: string
  apiPath: string
  locale: 'en' | 'th'
  /** `admin.brand` from the config. */
  brand: { name?: string; logo?: string; color?: string }
  /** The public site for the "View site" link; empty when unknown. */
  siteURL: string
}

/** Injected by the server as <meta name="easy-cms">. Falls back to defaults for `vite dev`. */
export function readSettings(): Settings {
  const defaults: Settings = {
    adminPath: '/admin',
    apiPath: '/api/cms',
    locale: 'en',
    brand: {},
    siteURL: '',
  }
  const content = document.querySelector('meta[name="easy-cms"]')?.getAttribute('content')
  if (!content) return defaults
  try {
    return { ...defaults, ...(JSON.parse(content) as Partial<Settings>) }
  } catch {
    return defaults
  }
}

export const settings = readSettings()

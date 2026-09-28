/** Shared by the server plugin and the admin module (which must not import anything else). */

/** Length ranges search engines show in full, from Payload's SEO plugin and Google's guidance. */
export const DEFAULT_TITLE_LENGTH = { min: 50, max: 60 } as const
export const DEFAULT_DESCRIPTION_LENGTH = { min: 100, max: 150 } as const

/** The group field the plugin adds, and the endpoint its admin components call. */
export const META_FIELD = 'meta'
export const GENERATE_PATH = '/seo/generate'

export type GenerateKind = 'title' | 'description' | 'image' | 'url'
export const GENERATE_KINDS: readonly GenerateKind[] = ['title', 'description', 'image', 'url']

/** Props of the admin components, set in the config and sent to the browser as JSON. */
export interface MeterProps {
  kind: 'title' | 'description'
  min: number
  max: number
  /** A generator is configured, so show the Generate button. */
  generate: boolean
}

export interface ImageProps {
  generate: boolean
}

export interface PreviewProps {
  /** Field used as the page title when `meta.title` is empty. */
  titleField: string | null
  /** A `generateURL` is configured; the preview asks the server for the page's URL. */
  url: boolean
  /** Shown in the preview when there is no URL generator. */
  siteUrl: string
}

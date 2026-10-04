declare const __EASY_CMS_VERSION__: string | undefined

/** The version of `@easy-cms/core`, set when the package is built. */
export const VERSION: string =
  typeof __EASY_CMS_VERSION__ === 'string' ? __EASY_CMS_VERSION__ : '0.0.0-dev'

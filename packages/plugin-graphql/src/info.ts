declare const __PACKAGE_VERSION__: string | undefined

/** This plugin's package and version, listed for admins on the dashboard (System). */
export const INFO = {
  name: '@easy-cms/plugin-graphql',
  ...(typeof __PACKAGE_VERSION__ === 'string' ? { version: __PACKAGE_VERSION__ } : {}),
}

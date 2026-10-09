declare const __PACKAGE_VERSION__: string | undefined

/** This plugin's package and version, listed for admins on the dashboard (System). */
export const INFO = {
  name: '@easy-cms/plugin-multi-tenant',
  // The plugin API it is written for (`PLUGIN_API_VERSION` of @easy-cms/core).
  apiVersion: 1,
  ...(typeof __PACKAGE_VERSION__ === 'string' ? { version: __PACKAGE_VERSION__ } : {}),
}

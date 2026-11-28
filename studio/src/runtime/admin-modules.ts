/**
 * The admin modules (`admin.modules`) of the packages Studio bundles: the browser has no files
 * for core to find them in, so they're given as code (ADR-0074). Without them the SEO panel, the
 * tenant Members page and the color field don't show, and core logs each one as not found.
 */
import { provideAdminModules } from '@easy-cms/core/internal'
import fields from '@easy-cms/fields/admin?raw'
import multiTenant from '@easy-cms/plugin-multi-tenant/admin?raw'
import seo from '@easy-cms/plugin-seo/admin?raw'

export const ADMIN_MODULES: Readonly<Record<string, string>> = {
  '@easy-cms/fields/admin': fields,
  '@easy-cms/plugin-multi-tenant/admin': multiTenant,
  '@easy-cms/plugin-seo/admin': seo,
}

provideAdminModules(ADMIN_MODULES)

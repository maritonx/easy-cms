/**
 * The admin modules (`admin.modules`) of the packages Studio bundles: the browser has no files
 * for core to find them in, so they're given as code (ADR-0074). Without them their panels,
 * pages and fields don't show, and core logs each one as not found.
 */
import { provideAdminModules } from '@easy-cms/core/internal'
import fields from '@easy-cms/fields/admin?raw'
import formBuilder from '@easy-cms/plugin-form-builder/admin?raw'
import multiTenant from '@easy-cms/plugin-multi-tenant/admin?raw'
import nestedDocs from '@easy-cms/plugin-nested-docs/admin?raw'
import seo from '@easy-cms/plugin-seo/admin?raw'
import social from '@easy-cms/plugin-social/admin?raw'

export const ADMIN_MODULES: Readonly<Record<string, string>> = {
  '@easy-cms/fields/admin': fields,
  '@easy-cms/plugin-form-builder/admin': formBuilder,
  '@easy-cms/plugin-multi-tenant/admin': multiTenant,
  '@easy-cms/plugin-nested-docs/admin': nestedDocs,
  '@easy-cms/plugin-seo/admin': seo,
  '@easy-cms/plugin-social/admin': social,
}

provideAdminModules(ADMIN_MODULES)

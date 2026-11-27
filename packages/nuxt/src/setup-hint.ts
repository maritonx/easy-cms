/**
 * What the module logs when the app has no Easy CMS config, e.g. right after
 * `nuxi module add easy-cms`, which installs only this module.
 */
export function missingConfigHint(rootDir: string): string {
  return [
    `No Easy CMS config found in ${rootDir}, so the module is disabled. To set it up:`,
    '',
    '  1. npm install @easy-cms/core @easy-cms/db-sqlite',
    '  2. Create easy-cms.config.ts:',
    '',
    "     import { defineConfig } from '@easy-cms/core'",
    "     import { sqlite } from '@easy-cms/db-sqlite'",
    '',
    '     export default defineConfig({',
    "       secret: process.env.EASY_CMS_SECRET ?? '', // 32+ random characters",
    "       db: sqlite({ url: 'file:./cms.db' }),",
    "       collections: [{ slug: 'posts', fields: [{ name: 'title', type: 'text' }] }],",
    '     })',
    '',
    '  3. Set EASY_CMS_SECRET in .env, then restart. The admin is at /admin.',
    '',
    'Or start a new app with `npm create easy-cms`. Docs: https://easycms.dev/docs',
  ].join('\n')
}

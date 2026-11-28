// The built package, as a project's config imports it (tests run after the build): importing
// ../src made jiti transpile all of core's source first, 20x slower, and past the 90s timeout
// on starved macOS CI runners (#500).
import { type Config, defineConfig, isAdmin } from '@easy-cms/core'
import { fakeDb } from '../../helpers.js'

export default defineConfig({
  secret: 'fixture-secret-fixture-secret-fixture',
  // fakeDb is typed with core's source, which TypeScript sees as other types than the built
  // ones this config is checked against: the same adapter at runtime.
  db: fakeDb as unknown as Config['db'],
  admin: { locale: 'th' },
  collections: [
    {
      slug: 'posts',
      access: { update: isAdmin },
      fields: [{ name: 'title', type: 'text', required: true }],
    },
  ],
})

import { describe, expect, it } from 'vitest'
import type { CollectionConfig, Field } from '../src/index.js'
import { validateConfig } from '../src/internal.js'
import { baseConfig } from './helpers.js'

const paths = (collections: CollectionConfig[]) =>
  validateConfig(baseConfig({ collections })).map((i) => i.path)

const withFields = (fields: Field[], extra: Partial<CollectionConfig> = {}) =>
  paths([{ slug: 'posts', fields, ...extra }])

describe('validateConfig', () => {
  it('accepts a minimal config', () => {
    expect(validateConfig(baseConfig())).toEqual([])
  })

  it('accepts a full config', () => {
    const issues = validateConfig(
      baseConfig({
        admin: { path: '/cms', locale: 'th' },
        upload: { dir: 'files', maxFileSize: 1024 },
        collections: [
          {
            slug: 'posts',
            drafts: true,
            useAsTitle: 'title',
            fields: [
              { name: 'title', type: 'text', required: true, maxLength: 200 },
              { name: 'slug', type: 'slug', from: 'title' },
              {
                name: 'tags',
                type: 'select',
                options: ['a', { label: 'B', value: 'b' }],
                hasMany: true,
                defaultValue: ['a'],
              },
              { name: 'author', type: 'relationship', to: 'users' },
              { name: 'related', type: 'relationship', to: 'posts', hasMany: true },
              { name: 'cover', type: 'upload' },
              { name: 'links', type: 'array', fields: [{ name: 'url', type: 'text' }] },
              { name: 'seo', type: 'group', fields: [{ name: 'title', type: 'text' }] },
            ],
          },
        ],
        globals: [{ slug: 'site', fields: [{ name: 'siteName', type: 'text' }] }],
      }),
    )
    expect(issues).toEqual([])
  })

  describe('secret (FR-CFG-04)', () => {
    it('is required', () => {
      const issues = validateConfig(baseConfig({ secret: '' }))
      expect(issues).toMatchObject([{ path: 'secret', message: 'is required' }])
      expect(issues[0]?.hint).toContain('EASY_CMS_SECRET')
    })

    it('must be at least 32 characters', () => {
      const issues = validateConfig(baseConfig({ secret: 'x'.repeat(31) }))
      expect(issues).toMatchObject([{ path: 'secret', message: expect.stringContaining('got 31') }])
    })

    it('in production, is not an example or a pattern', () => {
      const previous = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
      try {
        for (const secret of [
          'development-secret-change-me-development-secret',
          'x'.repeat(32),
          'abcabcabcabcabcabcabcabcabcabcabc',
        ])
          expect(
            validateConfig(baseConfig({ secret })).map((i) => i.path),
            secret,
          ).toEqual(['secret'])
        expect(validateConfig(baseConfig({ secret: '3f9c1e7a52b84d06a1c9e3f7b25d8c4e' }))).toEqual(
          [],
        )
      } finally {
        process.env.NODE_ENV = previous
      }
    })
  })

  it('requires a db adapter', () => {
    // @ts-expect-error testing a JS user who forgot db
    expect(validateConfig({ secret: 'x'.repeat(32) }).map((i) => i.path)).toEqual(['db'])
  })

  it('checks admin options', () => {
    // @ts-expect-error invalid locale
    const issues = validateConfig(baseConfig({ admin: { path: 'admin', locale: 'fr' } }))
    expect(issues.map((i) => i.path)).toEqual(['admin.path', 'admin.locale'])
  })

  it('checks the admin brand and menu icons', () => {
    expect(
      validateConfig(
        baseConfig({
          admin: { brand: { name: 'Acme', logo: '/logo.svg', color: '#0F766E' } },
          collections: [{ slug: 'posts', admin: { icon: 'newspaper', order: 1 }, fields: [] }],
          globals: [{ slug: 'site', admin: { icon: 'house' }, fields: [] }],
        }),
      ),
    ).toEqual([])
    const issues = validateConfig(
      baseConfig({
        admin: { brand: { name: ' ', logo: 'javascript:alert(1)', color: 'teal' } },
        // @ts-expect-error unknown icon
        collections: [{ slug: 'posts', admin: { icon: 'rocket' }, fields: [] }],
        // @ts-expect-error unknown icon
        globals: [{ slug: 'site', admin: { icon: 'nope' }, fields: [] }],
      }),
    )
    expect(issues.map((i) => i.path)).toEqual([
      'admin.brand.name',
      'admin.brand.logo',
      'admin.brand.color',
      'collections.posts.admin.icon',
      'globals.site.admin.icon',
    ])
  })

  it('checks the site URL and side-panel fields', () => {
    const issues = validateConfig(
      baseConfig({
        admin: { siteURL: 'example.com' },
        collections: [
          {
            slug: 'posts',
            // @ts-expect-error only "page" or "drawer"
            admin: { editIn: 'modal' },
            fields: [
              { name: 'tags', type: 'text', admin: { position: 'sidebar' } },
              // @ts-expect-error only "sidebar"
              { name: 'x', type: 'text', admin: { position: 'left' } },
            ],
          },
        ],
      }),
    )
    expect(issues.map((i) => i.path)).toEqual([
      'admin.siteURL',
      'collections.posts.fields.x.admin.position',
      'collections.posts.admin.editIn',
    ])
  })

  it('names the options that changed in 0.60, and warns about unknown ones', () => {
    const issues = validateConfig(
      baseConfig({
        admin: { siteUrl: '/', menu: ['posts'] },
        auth: { allowSignUp: { domains: ['x.co'] } },
        audit: { keep: 30 },
        backups: { every: 'day' },
        commands: [],
        collections: [
          {
            slug: 'posts',
            icon: 'newspaper',
            versions: { max: 5 },
            fields: [
              {
                name: 'title',
                type: 'text',
                position: 'sidebar',
                admin: { defaultValue: () => 'x' },
              },
              { name: 'author', type: 'relationship', relationTo: 'users' },
              { name: 'body', type: 'text', maxLenght: 10 },
            ],
          },
        ],
      } as never),
    )
    const byPath = Object.fromEntries(issues.map((i) => [i.path, i]))
    expect(byPath['admin.siteUrl']?.message).toBe('is now `siteURL`')
    expect(byPath['admin.menu']?.message).toContain('admin.order')
    expect(byPath['auth.allowSignUp']?.message).toBe('is now `providerSignUp`')
    expect(byPath['audit.keep']?.message).toBe('is now `keepDays`')
    expect(byPath['backups.every']?.message).toContain('frequency')
    expect(byPath.commands?.message).toBe('is now `cliCommands`')
    expect(byPath['collections.posts.icon']?.message).toBe('is now `admin.icon`')
    expect(byPath['collections.posts.versions.max']?.message).toBe('is now `keep`')
    expect(byPath['collections.posts.fields.title.position']?.message).toBe(
      'is now `admin.position`',
    )
    expect(byPath['collections.posts.fields.title.admin.defaultValue']?.message).toBe(
      'is now `initialValue`',
    )
    // Unknown options: a warning, with the name it probably is.
    expect(byPath['collections.posts.fields.author.relationTo']).toMatchObject({
      severity: 'warning',
    })
    expect(byPath['collections.posts.fields.body.maxLenght']?.message).toContain('`maxLength`')
    expect(byPath['collections.posts.fields.title.position']?.severity).toBeUndefined()
  })

  it('checks admin modules, components and endpoints', () => {
    const handler = () => ({ ok: true })
    const issues = validateConfig(
      baseConfig({
        admin: { modules: ['@easy-cms/plugin-seo/admin', './admin/x.js', 'https://cdn.test/x.js'] },
        collections: [
          {
            slug: 'posts',
            admin: { sidebar: ['ecms-panel', { tag: 'div' }] },
            fields: [
              {
                name: 'a',
                type: 'text',
                admin: { component: 'ecms-color', after: ['ecms-meter'] },
              },
              { name: 'b', type: 'text', admin: { component: { tag: 'ecms-x', props: { n: 1 } } } },
              { name: 'c', type: 'text', admin: { component: 'color-picker' } },
              // @ts-expect-error props is an object
              { name: 'd', type: 'text', admin: { after: [{ tag: 'ecms-y', props: [1] }] } },
            ],
          },
        ],
        globals: [
          { slug: 'site', admin: { sidebar: ['ecms-ok'] }, fields: [{ name: 'n', type: 'text' }] },
          // A path names a group of `admin.nav`.
          { slug: 'odd', admin: { group: 'shop.nope' }, fields: [{ name: 'n', type: 'text' }] },
        ],
        endpoints: [
          { path: '/seo/generate', method: 'post', handler },
          { path: '/stats/:collection', method: 'get', handler },
          { path: '/stats/:other', method: 'get', handler },
          { path: '/posts/count', method: 'get', handler },
          { path: '/users/x', method: 'get', handler },
          { path: '/:x', method: 'get', handler },
          { path: 'nope', method: 'get', handler },
          // @ts-expect-error unknown method
          { path: '/ok', method: 'fetch', handler },
          // @ts-expect-error handler is a function
          { path: '/ok2', method: 'get', handler: 'x' },
          // Root endpoints may reuse API names, but not the API's or the admin's paths.
          { path: '/users/robots.txt', method: 'get', handler, root: true },
          { path: '/api/cms/x', method: 'get', handler, root: true },
          { path: '/admin', method: 'get', handler, root: true },
          { path: '/healthz', method: 'get', handler, root: true },
          { path: '/seo/generate', method: 'post', handler, root: true },
        ],
      }),
    )
    expect(issues.map((i) => i.path)).toEqual([
      'admin.modules[2]',
      'endpoints[2].path',
      'endpoints[3].path',
      'endpoints[4].path',
      'endpoints[5].path',
      'endpoints[6].path',
      'endpoints[7].method',
      'endpoints[8].handler',
      'endpoints[10].path',
      'endpoints[11].path',
      'endpoints[12].path',
      'collections.posts.admin.sidebar[1]',
      'collections.posts.fields.c.admin.component',
      'collections.posts.fields.d.admin.after[0].props',
      'globals.odd.admin.group',
    ])
  })

  it('checks auth options', () => {
    const issues = validateConfig(
      baseConfig({
        auth: {
          roles: ['editor'],
          tokenExpiration: 0,
          maxLoginAttempts: 1.5,
          trustedOrigins: ['https://ok.test', 'https://bad.test/path'],
        },
      }),
    )
    expect(issues.map((i) => i.path)).toEqual([
      'auth.roles',
      'auth.tokenExpiration',
      'auth.maxLoginAttempts',
      'auth.trustedOrigins[1]',
    ])
  })

  it('checks roles from the admin (auth.rbac)', () => {
    expect(validateConfig(baseConfig({ auth: { rbac: true } }))).toEqual([])
    expect(
      validateConfig(baseConfig({ auth: { rbac: 'yes' as unknown as boolean } })).map(
        (i) => i.path,
      ),
    ).toEqual(['auth.rbac'])
    // Panels are given to roles by their tag, so each needs its own.
    const dashboard = [{ component: 'ecms-chart' }, { component: { tag: 'ecms-chart' }, label: 7 }]
    expect(
      validateConfig(baseConfig({ auth: { rbac: true }, admin: { dashboard } as never })).map(
        (i) => i.path,
      ),
    ).toEqual(['admin.dashboard[1].label', 'admin.dashboard[1].component'])
    expect(
      validateConfig(baseConfig({ admin: { dashboard: [{ component: 'ecms-chart' }] } })),
    ).toEqual([])
    expect(paths([{ slug: 'user-roles', fields: [] }])).toEqual(['collections[0].slug'])
    // The owner field: a relationship to users; createdBy is Easy CMS's.
    const owned = (fields: Field[], ownerField = 'author') =>
      validateConfig(
        baseConfig({
          auth: { rbac: true },
          collections: [{ slug: 'posts', admin: { ownerField }, fields }],
        }),
      ).map((i) => i.path)
    expect(owned([{ name: 'author', type: 'relationship', to: 'users' }])).toEqual([])
    expect(owned([{ name: 'author', type: 'text' }])).toEqual([
      'collections.posts.admin.ownerField',
    ])
    expect(owned([{ name: 'author', type: 'relationship', to: 'users', hasMany: true }])).toEqual([
      'collections.posts.admin.ownerField',
    ])
    expect(owned([{ name: 'createdBy', type: 'text' }], 'createdBy')).toEqual([
      'collections.posts.admin.ownerField',
      'collections.posts.fields.createdBy',
    ])
  })

  it('checks sign-in providers, sign-up and passwords', () => {
    const provider = (id: string) => ({
      id,
      name: 'Acme',
      authorizationURL: async () => new URL('https://idp.test'),
      callback: async () => ({ subject: '1', email: null, emailVerified: false }),
    })
    const auth = (value: object) =>
      validateConfig(baseConfig({ auth: value as never })).map((i) => i.path)
    expect(
      auth({
        providers: [provider('acme')],
        providerSignUp: { domains: ['acme.test'], role: 'editor' },
        password: false,
      }),
    ).toEqual([])
    expect(
      auth({ providers: [provider('acme'), provider('acme'), provider('Bad Id'), {}] }),
    ).toEqual(['auth.providers[1].id', 'auth.providers[2].id', 'auth.providers[3]'])
    expect(
      auth({
        providers: [provider('a')],
        providerSignUp: { domains: ['acme.test'], role: 'admin' },
      }),
    ).toEqual(['auth.providerSignUp.role'])
    expect(auth({ providerSignUp: { domains: ['not a domain'] }, password: false })).toEqual([
      'auth.providerSignUp.domains',
      'auth.providerSignUp',
      'auth.password',
    ])
  })

  it('keeps provider ids off the routes of /auth', () => {
    const login = { id: 'login', name: 'Login', authorizationURL: () => {}, callback: () => {} }
    const issues = validateConfig(baseConfig({ auth: { providers: [login as never] } }))
    expect(issues.map((i) => i.path)).toEqual(['auth.providers[0].id'])
  })

  it('checks the audit log options', () => {
    const audit = (value: unknown) =>
      validateConfig(baseConfig({ audit: value as never })).map((i) => i.path)
    expect(audit(true)).toEqual([])
    expect(audit({ keepDays: 0, values: false, failedLogins: 5 })).toEqual([])
    expect(audit({ keepDays: -1, values: 'no', failedLogins: 0 })).toEqual([
      'audit.keepDays',
      'audit.values',
      'audit.failedLogins',
    ])
    expect(audit('yes')).toEqual(['audit'])
  })

  it('checks cors origins', () => {
    expect(validateConfig(baseConfig({ cors: '*' }))).toEqual([])
    expect(validateConfig(baseConfig({ cors: ['https://ok.test'] }))).toEqual([])
    const issues = validateConfig(baseConfig({ cors: ['https://ok.test', 'ok.test'] }))
    expect(issues.map((i) => i.path)).toEqual(['cors[1]'])
    expect(
      validateConfig(baseConfig({ cors: 'yes' as unknown as '*' })).map((i) => i.path),
    ).toEqual(['cors'])
  })

  it('checks localization and localized fields', () => {
    const fields = [
      { name: 'title', type: 'text', localized: true },
      { name: 'seo', type: 'group', localized: true, fields: [{ name: 'd', type: 'text' }] },
      { name: 'tags', type: 'select', options: ['a'], hasMany: true, localized: true },
      { name: 'links', type: 'array', fields: [{ name: 'label', type: 'text', localized: true }] },
    ] as never
    const localization = { locales: ['th', 'en'], defaultLocale: 'th' }
    expect(
      validateConfig(baseConfig({ localization, collections: [{ slug: 'posts', fields }] })).map(
        (i) => i.path,
      ),
    ).toEqual(['collections[0].fields.seo.localized']) // hasMany and arrays can be localized
    // Without localization, localized fields are an error.
    expect(
      validateConfig(
        baseConfig({
          collections: [{ slug: 'p', fields: [{ name: 't', type: 'text', localized: true }] }],
        }),
      ).map((i) => i.path),
    ).toEqual(['collections[0].fields.t.localized'])
    expect(
      validateConfig(
        baseConfig({ localization: { locales: ['th', 'TH', 'th'], defaultLocale: 'fr' } }),
      ).map((i) => i.path),
    ).toEqual(['localization.locales[1]', 'localization.locales[2]', 'localization.defaultLocale'])
    expect(
      validateConfig(baseConfig({ localization: { locales: [] } })).map((i) => i.path),
    ).toEqual(['localization.locales'])
  })

  it('reserves slugs used internally', () => {
    expect(paths([{ slug: 'login-attempts', fields: [] }])).toEqual(['collections[0].slug'])
  })

  describe('slugs', () => {
    it('rejects bad, reserved and duplicate slugs', () => {
      expect(
        paths([
          { slug: 'Posts', fields: [] },
          { slug: 'globals', fields: [] },
          { slug: 'pages', fields: [] },
          { slug: 'pages', fields: [] },
        ]),
      ).toEqual(['collections[0].slug', 'collections[1].slug', 'collections[3].slug'])
    })

    it('allows a global and a collection to share a slug', () => {
      const issues = validateConfig(
        baseConfig({
          collections: [{ slug: 'menu', fields: [] }],
          globals: [{ slug: 'menu', fields: [] }],
        }),
      )
      expect(issues).toEqual([])
    })
  })

  describe('fields', () => {
    it('rejects invalid, duplicate and reserved names', () => {
      expect(
        withFields([
          { name: 'my field', type: 'text' },
          { name: 'title', type: 'text' },
          { name: 'title', type: 'text' },
          { name: 'id', type: 'text' },
        ]),
      ).toEqual([
        'collections.posts.fields[0].name',
        'collections.posts.fields.title',
        'collections.posts.fields.id',
      ])
    })

    it('reserves status only when drafts are on', () => {
      const status: Field[] = [{ name: 'status', type: 'text' }]
      expect(withFields(status)).toEqual([])
      expect(withFields(status, { drafts: true })).toEqual(['collections.posts.fields.status'])
    })

    it('rejects unknown field types', () => {
      const field = { name: 'x', type: 'color' } as unknown as Field
      const issues = validateConfig(
        baseConfig({ collections: [{ slug: 'posts', fields: [field] }] }),
      )
      expect(issues).toMatchObject([
        { path: 'collections.posts.fields.x.type', hint: expect.stringContaining('richText') },
      ])
    })

    it('checks min/max ranges', () => {
      expect(
        withFields([
          { name: 'a', type: 'text', minLength: 5, maxLength: 1 },
          { name: 'b', type: 'number', min: 10, max: 0 },
          {
            name: 'c',
            type: 'array',
            minRows: 3,
            maxRows: 1,
            fields: [{ name: 'x', type: 'text' }],
          },
        ]),
      ).toEqual([
        'collections.posts.fields.a',
        'collections.posts.fields.b',
        'collections.posts.fields.c',
      ])
    })

    it('checks select options and defaults', () => {
      expect(
        withFields([
          { name: 'a', type: 'select', options: [] },
          { name: 'b', type: 'select', options: ['x', 'x'] },
          { name: 'c', type: 'select', options: ['x'], defaultValue: 'y' },
          { name: 'd', type: 'select', options: ['x'], defaultValue: ['x'] },
        ]),
      ).toEqual([
        'collections.posts.fields.a.options',
        'collections.posts.fields.b.options',
        'collections.posts.fields.c.defaultValue',
        'collections.posts.fields.d.defaultValue',
      ])
    })

    it('checks slug sources', () => {
      expect(
        withFields([
          { name: 'count', type: 'number' },
          { name: 'a', type: 'slug', from: 'missing' },
          { name: 'b', type: 'slug', from: 'count' },
        ]),
      ).toEqual(['collections.posts.fields.a.from', 'collections.posts.fields.b.from'])
    })

    it('checks relationship targets, allowing built-in collections', () => {
      const issues = validateConfig(
        baseConfig({
          collections: [
            {
              slug: 'posts',
              fields: [
                { name: 'author', type: 'relationship', to: 'users' },
                { name: 'image', type: 'relationship', to: 'media' },
                { name: 'category', type: 'relationship', to: 'categories' },
              ],
            },
          ],
        }),
      )
      expect(issues).toMatchObject([
        {
          path: 'collections.posts.fields.category.to',
          hint: expect.stringContaining('users, media, posts'),
        },
      ])
    })

    it('validates nested fields in arrays and groups', () => {
      expect(
        withFields([
          { name: 'empty', type: 'group', fields: [] },
          { name: 'rows', type: 'array', fields: [{ name: 'id', type: 'text' }] },
          {
            name: 'seo',
            type: 'group',
            fields: [{ name: 'ref', type: 'relationship', to: 'nope' }],
          },
        ]),
      ).toEqual([
        'collections.posts.fields.empty.fields',
        'collections.posts.fields.rows.fields.id',
        'collections.posts.fields.seo.fields.ref.to',
      ])
    })
  })

  it('checks useAsTitle', () => {
    const fields: Field[] = [
      { name: 'title', type: 'text' },
      { name: 'body', type: 'richText' },
    ]
    expect(withFields(fields, { useAsTitle: 'title' })).toEqual([])
    expect(withFields(fields, { useAsTitle: 'missing' })).toEqual(['collections.posts.useAsTitle'])
    expect(withFields(fields, { useAsTitle: 'body' })).toEqual(['collections.posts.useAsTitle'])
  })

  it('reports every problem at once', () => {
    const issues = validateConfig({
      secret: '',
      // @ts-expect-error testing a JS user
      db: undefined,
      collections: [{ slug: 'posts', fields: [{ name: 'ref', type: 'relationship', to: 'nope' }] }],
    })
    expect(issues.map((i) => i.path)).toEqual(['secret', 'db', 'collections.posts.fields.ref.to'])
  })
})

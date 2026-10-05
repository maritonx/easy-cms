# Local API reference

Every method of the `cms` object you get from `useEasyCMS()` (Nuxt), `getEasyCMS(config)`
(Next.js) or `createEasyCMS(config)`. A test checks this list against the `EasyCMS` class. For
examples, see [Local API](/guide/local-api).

The Local API trusts its caller and skips access rules. Pass `{ user, overrideAccess: false }`
to apply them, as the REST API does.

## Options

| Option | On | |
|---|---|---|
| `overrideAccess` | every method | `false` applies access rules for `user`. Default `true`. |
| `user` | every method | The user to check access for; `null` = not logged in. |
| `depth` | reads and writes | Levels of relationships to populate. Default 1, at most 3. |
| `locale` | reads and writes | A content locale, or `'all'` for `{ [locale]: value }`. Default: the default locale. |
| `draft` | reads | Include drafts. Default: published documents only. |
| `fallbackLocale` | reads | Use the default locale's value when a value is empty. Default `localization.fallback`. |
| `where` | `find`, `count` | Filter: `{ field: { equals, not_equals, in, not_in, gt, gte, lt, lte, like, exists } }`, with `and` / `or`. |
| `sort` | `find` | Field path; `-` for descending. Default `-createdAt`. |
| `limit` | `find` | Default 10; `0` returns every match. |
| `page` | `find` | 1-based. Default 1. |

`find` returns `{ docs, totalDocs, limit, page, totalPages, hasNextPage, hasPrevPage }`.

<!-- api: EasyCMS -->
## Methods

### Documents

| Method | Returns | |
|---|---|---|
| `find(collection, options?)` | a page of documents | List with `where`, `sort`, `limit`, `page`. |
| `findById(collection, id, options?)` | document \| `null` | One document. |
| `count(collection, options?)` | `number` | How many match `where`. |
| `create(collection, data, options?)` | document | Validates, runs hooks, saves. |
| `update(collection, id, data, options?)` | document | Changes the given fields. |
| `delete(collection, id, options?)` | the deleted document | Also deletes its versions and scheduled jobs. |

### Media

| Method | Returns | |
|---|---|---|
| `upload({ data, name }, fields?, options?)` | media document | Stores a file; images get dimensions and resized copies. |
| `uploadFromURL(url, fields?, options?)` | media document | Downloads a file from a link, then as `upload`. [From a link](/guide/uploads#from-a-link) |
| `mediaURL(key)` | `string` | Public URL of a stored file. |

### Drafts and versions

| Method | Returns | |
|---|---|---|
| `unpublish(collection, id, options?)` | document | Takes a document off the site. |
| `discardDraft(collection, id, options?)` | document | Throws away the pending draft of a published document. |
| `findVersions(collection, id, options?)` | a page of versions | Newest first. Needs update access. |
| `findVersion(collection, id, versionId, options?)` | version \| `null` | One version with its `data`. |
| `restoreVersion(collection, id, versionId, options?)` | document | Makes an old version current (as a draft with drafts). |

### Globals

| Method | Returns | |
|---|---|---|
| `findGlobal(slug, options?)` | global | Read a global. |
| `updateGlobal(slug, data, options?)` | global | Change a global. |
| `unpublishGlobal(slug, options?)` | global | Take it off the site. |
| `discardGlobalDraft(slug, options?)` | global | Throw away its pending draft. |
| `findGlobalVersions(slug, options?)` | a page of versions | Newest first. |
| `findGlobalVersion(slug, versionId, options?)` | version \| `null` | One version. |
| `restoreGlobalVersion(slug, versionId, options?)` | global | Make an old version current. |

### Live preview

| Method | Returns | |
|---|---|---|
| `preview(collection, id \| null, data, options?)` | `{ doc, url }` | The document as if `data` were saved; nothing is written. |
| `previewGlobal(slug, data, options?)` | `{ doc, url }` | The same for a global. |
| `createPreviewToken(target, { expiresIn? })` | `string` | A token that opens one draft without a login (default one hour). |
| `verifyPreviewToken(token)` | target \| `null` | What a token opens, or `null` when invalid or expired. |

### Scheduling

| Method | Returns | |
|---|---|---|
| `schedule(collection, id, { action, at }, options?)` | job | Publish or unpublish at `at`. |
| `scheduled(collection, id, options?)` | jobs | Pending jobs of a document, soonest first. |
| `cancelSchedule(collection, id, jobId, options?)` | — | Cancel a pending job. |
| `scheduleGlobal(slug, { action, at }, options?)` | job | The same for a global. |
| `scheduledGlobal(slug, options?)` | jobs | |
| `cancelGlobalSchedule(slug, jobId, options?)` | — | |
| `upcomingJobs({ limit?, user?, overrideAccess? })` | jobs | The next pending jobs across everything. |

### Jobs and webhooks

| Method | Returns | |
|---|---|---|
| `runJobs(now?)` | `{ ran, failed, webhooks }` | Due scheduled jobs and webhook retries (what cron and the timer call). |
| `runScheduled(now?)` | `{ ran, failed }` | Only the due scheduled jobs. |
| `retryWebhooks(now?)` | `{ sent, failed }` | Only the due webhook retries. |
| `startScheduler(interval?)` | — | Runs `runJobs` every `interval` ms (default one minute). `createEasyCMS` starts it when something is scheduled or webhooks are set. |
| `flushWebhooks()` | — | Waits for deliveries in progress; call before a serverless function returns. |
| `sendEmail(message)` | — | Queues an email for the config's `email` adapter and sends it in the background. [Email](/guide/email) |
| `flushEmails()` | — | Waits for emails being sent; call before a serverless function returns. |

### Other

| Method | Returns | |
|---|---|---|
| `createApiKey({ name, permissions?, expiresAt?, user? }, options?)` | `{ key, doc }` | A new [API key](/guide/api-keys) (with `apiKeys: true`); the key is returned only here. |
| `documentPermissions(collection, id, user)` | `{ update, delete }` | What a user may do with one document. |
| `destroy()` | — | Stops the scheduler, waits for webhook deliveries and closes the database. |

The `cms` object also has `config` (the resolved config), `auth` (login and session checks),
`roles` (with `auth.rbac`: `roles.allows(user, { collection }, operation)` says what a user's role
allows), `db`, `storage`, `logger` and `cwd`.

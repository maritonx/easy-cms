---
"@easy-cms/core": minor
"@easy-cms/drizzle": minor
"@easy-cms/next": minor
"@easy-cms/nuxt": minor
"easy-cms": minor
---

Realtime: apps subscribe to changes in collections with `realtime: true` (ADR-0070). `GET <api>/realtime?s=posts` is a Server-Sent Events stream of `create`, `update`, `delete`, `publish` and `unpublish`, each with the document as the subscriber reads it over REST (access, field access, drafts), and `Last-Event-ID` resumes. `createClient()` gets `subscribe()` and `live()`, `@easy-cms/next/live` and `@easy-cms/nuxt` get `useLive()`, and the Local API gets `cms.subscribe()`. Saves on any instance reach every instance's subscribers within `realtime.pollMs`. Needs a migration for the `realtime-events` table. `easy-cms serve` no longer logs "Premature close" when a client leaves a stream.

# GraphQL

::: info What you'll learn
How to add a GraphQL API next to the REST API: the schema it makes from your config, queries,
mutations, limits, and how to add your own fields.

**Before this page:** [REST API](./rest-api) and [Plugins](./plugins).
:::

`@easy-cms/plugin-graphql` serves a GraphQL API made from your collections and globals. It reads
and writes through the [Local API](/reference/local-api), so access rules, field access, hooks,
validation, drafts and localization work as they do over REST. It suits frontends that already
use Apollo, urql or Relay, or that want one request with only the fields they need.

## Set it up

```bash [pm]
npm install @easy-cms/plugin-graphql
```

```ts
import { graphqlPlugin } from '@easy-cms/plugin-graphql'

export default defineConfig({
  // …
  plugins: [graphqlPlugin()],
})
```

The endpoint is `<routes.api>/graphql`, e.g. `https://example.com/api/cms/graphql`. It takes
`POST` with `{ "query", "variables", "operationName" }`, and `GET` with `?query=` for queries
(never mutations). Open it in a browser outside production to get **GraphiQL**: logged in to the
admin, it reads what you may read.

## The schema

Each collection and global gets a type and operations, named after its slug:

| Collection `posts` | Global `site-settings` |
|---|---|
| type `Post` | type `SiteSettings` |
| `post(id)`: one document | `siteSettings`: the global |
| `posts(where, sort, limit, page)`: a page of documents | |
| `createPost`, `updatePost`, `deletePost` | `updateSiteSettings` |

Plus `me`, the logged-in user (or the owner of the API key). The built-in collections are
`User` (`user`, `users`), `Media` (`mediaItem`, `media`) and, with folders, `MediaFolder`. API
keys and the collections Easy CMS uses internally are never in the schema.

```graphql
query Home($category: ID!) {
  posts(where: { category: { equals: $category } }, sort: [publishedAt_DESC], limit: 5, locale: en) {
    docs {
      id
      title
      cover { url alt sizes { thumbnail { url width height } } }
      category { name }
    }
    totalDocs
    hasNextPage
  }
  siteSettings { name }
}
```

How fields map:

| Field | GraphQL |
|---|---|
| text, textarea, email, slug | `String` |
| number | `Float` |
| boolean | `Boolean` |
| date | `DateTime` (ISO 8601 string) |
| select | an enum of its options (`String` when an option isn't a valid GraphQL name); a list with `hasMany` |
| relationship, upload | the related type, so you can select its fields; a list with `hasMany` |
| group | an object type |
| array | a list of row types, each with `id` |
| blocks | a list of a union of block types: `... on HeroBlock { heading }` |
| richText, json | `JSON` (rich text is a Tiptap document) |
| your own field types | the type they are built on |

Every field can be `null`, except `id`, `createdAt` and `updatedAt`: a field may be hidden by
[field access](./access-control) or empty in a locale even when it is required. Hidden fields
(`hidden: true`) are never in the schema. Collections with drafts have `status`.

### Filtering and sorting

`where` is typed for each collection, with the operators of [REST](./rest-api#collections):
`equals`, `not_equals`, `in`, `not_in`, `like`, `exists`, and `gt`, `gte`, `lt`, `lte` for
numbers and dates. Combine with `AND` and `OR`; fields in a group are nested.

```graphql
posts(where: {
  OR: [{ tags: { in: [news] } }, { views: { gte: 100 } }]
  seo: { noindex: { equals: false } }
}) { totalDocs }
```

`sort` takes a list such as `[publishedAt_DESC, title_ASC]` (default: newest first). `limit` is
1 to 100 (default 10), `page` starts at 1.

### Languages and drafts

With [localization](./localization), queries take `locale` and `fallbackLocale`; relationships
are read in the same locale. To read several languages at once, use aliases:

```graphql
{
  th: post(id: "1", locale: th) { title }
  en: post(id: "1", locale: en) { title }
}
```

`draft: true` includes drafts, for logged-in users and API keys only, as in REST.

## Mutations

```graphql
mutation {
  createPost(data: { title: "Hello", body: "First paragraph\n\nSecond", category: "3" }, draft: true) {
    id
    status
  }
}
```

- `create<Type>(data, locale, draft)`, `update<Type>(id, data, locale, draft)`,
  `delete<Type>(id)` return the document; `update<Global>(data, locale, draft)` for globals.
- `draft: true` saves a draft, `draft: false` publishes; left out, the collection does what it
  always does.
- Relationships and uploads take ids. Rich text takes a Tiptap document or plain text (blank
  lines start new paragraphs). Blocks take rows as JSON with `blockType`.
- Required fields are required in `create` inputs; `update` inputs change only what you send.
- Files are uploaded over [REST](./uploads), then used by id. Logging in, versions and
  scheduling are REST too.

## Who may do what

Requests are authenticated like REST: the admin's session cookie, `Authorization: Bearer` with a
session token, or an [API key](./api-keys), which may do only what it lists. Browser `POST`s pass
the same CSRF check as REST.

Errors come in `errors` with a code in `extensions.code`, the same codes as
[REST](./rest-api#errors):

| Code | When |
|---|---|
| `UNAUTHORIZED` | Not logged in where that is needed. |
| `FORBIDDEN` | Not allowed. |
| `NOT_FOUND` | No such document (updating or deleting). |
| `VALIDATION_ERROR` | Invalid data; `extensions.fields` lists each field's problem. |
| `BAD_USER_INPUT` | A wrong argument or a malformed request, e.g. `limit: 500`. |
| `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `TOO_MANY_REQUESTS` | As over REST. |
| `QUERY_TOO_DEEP`, `QUERY_TOO_LARGE` | Over a [limit](#limits). |
| `INTERNAL_SERVER_ERROR` | Something went wrong on the server. |

A document you may not see is `null`, as over REST; a collection you may not read at all gives
`UNAUTHORIZED` or `FORBIDDEN`. A malformed query is answered with status 400; everything else
with 200 and `errors`.

## Limits

GraphQL lets a client ask for a lot in one request, so the plugin caps it:

- **Depth:** at most 7 levels of fields (introspection is not counted).
- **Documents:** at most 2000 documents loaded per request, relationships included.
- **Lists:** `limit` at most 100.

Relationships are loaded in batches: a list of 100 posts and their categories takes one query
for the posts and one for the categories.

## Options

| Option | Default | |
|---|---|---|
| `path` | `/graphql` | Where under `routes.api` the endpoint is. |
| `names` | from the slug | Other names, by slug: `{ news: { type: 'NewsItem', one: 'newsItem', many: 'news' } }`. |
| `exclude` | `[]` | Collections and globals to leave out, by slug. |
| `limits` | `{ depth: 7, documents: 2000 }` | |
| `introspection` | `true` | Let clients read the schema, as codegen and GraphiQL do. |
| `graphiql` | outside production | Show GraphiQL to browsers. |
| `extend` | — | Your own queries, mutations and fields. |

Two names can clash, e.g. a collection `data`, whose singular is also `data`. The app then stops
at startup and says which names to choose.

## Your own fields

`extend` adds to the schema with [graphql-js](https://graphql.org/graphql-js/) objects. Resolvers
get a context with `cms` (the Local API), `user` and `load(collection, id)`, which batches like
the built-in relationships:

```ts
import { GraphQLInt, GraphQLList, GraphQLNonNull, GraphQLString } from 'graphql'

graphqlPlugin({
  extend: ({ type }) => ({
    query: {
      search: {
        type: new GraphQLList(new GraphQLNonNull(type('Post'))),
        args: { text: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: async (_root, { text }, { cms, user }) =>
          (await cms.find('posts', { user, overrideAccess: false, where: { title: { like: text } } })).docs,
      },
    },
    fields: {
      Post: {
        readingMinutes: {
          type: GraphQLInt,
          resolve: (post) => Math.ceil(JSON.stringify(post.body ?? '').length / 1500),
        },
      },
    },
  }),
})
```

Pass `{ user, overrideAccess: false }` so your resolvers apply the reader's access rules.

## Codegen and other servers

Write the schema to a file for [GraphQL Code Generator](https://the-guild.dev/graphql/codegen)
and similar tools:

```bash
npx easy-cms generate:graphql            # schema.graphql
npx easy-cms generate:graphql web/schema.graphql
```

It opens the database like other commands. Codegen can also read the schema from the running
endpoint.

To serve the schema from your own GraphQL server (Apollo Server, Yoga, a gateway), build it and
give each request a context:

```ts
import { buildGraphQLSchema, createContext } from '@easy-cms/plugin-graphql'

const cms = await getEasyCMS()
const schema = buildGraphQLSchema(cms.config)
// For each request:
const contextValue = createContext(cms, await cms.auth.userFromHeaders(request.headers))
```

## Next steps

- [REST API](./rest-api): uploads, logging in, versions and scheduling.
- [Access control](./access-control): rules that apply to GraphQL too.
- [API keys](./api-keys): keys for scripts and other servers.

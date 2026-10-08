# @easy-cms/plugin-graphql

## 0.43.0

### Minor Changes

- 425ce7c: New plugin: a GraphQL API at `/api/cms/graphql`. A type, queries and mutations for every collection and global, through the Local API with the same access rules as REST (sessions, Bearer tokens, API keys); typed `where` and `sort`, locales and drafts; relationships loaded in batches; limits on depth (7) and documents per request (2000); `extend` for your own queries, mutations and fields; `easy-cms generate:graphql` for codegen; GraphiQL outside production. New guide: GraphQL.

### Patch Changes

- @easy-cms/core@0.43.0

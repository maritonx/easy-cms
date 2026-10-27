---
"easy-cms": minor
---

Search adapters: `search: memorySearch()` in the config and `search: { fields }` on a collection index published documents as they change, for relevance-ranked search with `cms.search()`, `GET <api>/search` and the admin's command palette. Thai text without spaces is found by its words. `easy-cms search:reindex` builds the index again; adapters for search engines implement `SearchAdapter`.

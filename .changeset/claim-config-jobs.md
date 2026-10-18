---
"@easy-cms/core": minor
---

`jobs` (in the config or from a plugin, such as the shop's upkeep) run once per due time however many instances run jobs: each run is claimed in a new internal `job-runs` table instead of one shared record. Apps with `jobs` need a migration: run `easy-cms migrate:create`, commit it, and `easy-cms migrate` where you deploy. When each job last ran is carried over.

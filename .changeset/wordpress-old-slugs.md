---
'@easy-cms/plugin-redirects': patch
---

The WordPress recipe keeps more old links working: a post renamed in WordPress between two runs takes its redirects with it, `--old-slugs` adds a redirect for each slug WordPress kept in `_wp_old_slug` (exported with WP-CLI), and `scripts/check-redirects.ts` asks the new site for every address in the old sitemap before launch.

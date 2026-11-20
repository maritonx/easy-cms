---
'@easy-cms/plugin-seo': minor
---

`docMarkdownResponse(cms, { collection, doc })` serves a page's Markdown version (`/posts/hello.md`) as `text/markdown` with a `Link: <page>; rel="canonical"` header naming the HTML page, so search engines that find the Markdown copy count it as that page instead of a second one. The address comes from `url`, else the plugin's `generateURL`, made absolute with `admin.siteURL`, `serverURL` or the request's origin.

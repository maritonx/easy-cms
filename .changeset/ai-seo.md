---
"@easy-cms/plugin-seo": minor
"@easy-cms/core": patch
---

AI SEO (#358). With `@easy-cms/plugin-ai`, the SEO plugin's search result preview has **Write title and description with AI**: one request writes both from the document's title and text, within the plugin's good lengths and in the language being edited, into the meta fields for review with Undo; replacing values asks first. The plugin registers the `seo` AI feature, `aiSource` changes the text sent, and only users who may change the document can use it. Core's `cms.ai.languageOf(locale)` names the language to write in.

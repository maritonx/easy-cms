---
"@easy-cms/core": minor
"@easy-cms/admin": minor
---

AI translation (#358). With `@easy-cms/plugin-ai` and `localization`, a localized text, textarea or rich text field edited in another locale has **Translate from <default>**: the translation goes into the field for review, with Undo. Rich text is translated by its text pieces only, so marks, links, lists and blocks stay in place (blocks' text fields are translated too); an answer that loses the shape is refused. A document still missing translations in a locale offers to translate them all at once, one request per field, with Undo. Core registers the `translate` AI feature and serves `POST <api>/admin/ai/translate` for users who may change the document.

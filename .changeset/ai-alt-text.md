---
"@easy-cms/core": minor
"@easy-cms/admin": minor
---

AI alt text (#358). With `@easy-cms/plugin-ai`, an image's Alternative text in the media library has a **Write with AI** button: the model looks at the image and writes one sentence (at most 125 characters) in the language being edited, into the field for review, with Undo beside it. Upload fields mark images without alt text, opening the file to add it. Core registers the `alt-text` AI feature (on by default; admins can turn it off) and serves `GET <api>/admin/ai/status` and `POST <api>/admin/ai/alt-text`, for users who may change the file.

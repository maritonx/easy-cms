---
'@easy-cms/core': minor
'@easy-cms/admin': minor
---

AI usage tells more, still without prompts: each request records `attempts` (2 when a 429 or 5xx was tried again, which providers may bill), `imageBytes` (the images sent, after picking the smallest copy at least 1024 pixels wide) and `promptHash` (of the feature, the document and the text). Settings → Integrations → AI shows **Retries** and **Asked again** per feature. The daily limit still counts requests.

Schema: three columns in the `ai-usage` table, for sites with `ai` (the AI plugin). Create a migration with `easy-cms migrate:create` after upgrading.

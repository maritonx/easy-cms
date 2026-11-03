---
"@easy-cms/core": minor
"@easy-cms/admin": minor
---

Export a list to CSV (#89): "Export CSV" in the admin's list downloads every document matching its filters and search (or the ones selected), with the columns shown or every field the user may read. `GET <api>/:collection/export.csv` does the same for scripts (`where`, `sort`, `ids`, `columns`, `headers=names`, `lang`, `locale`): UTF-8 with a BOM for Excel, at most 100,000 rows, read by cursor and streamed. Relationships are titles, rich text plain text, dates ISO 8601 in `timeZone`; formulas are defused. Each export is recorded in the audit log; `admin.export: false` turns it off.

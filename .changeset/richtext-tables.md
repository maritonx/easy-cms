---
"@easy-cms/admin": minor
"@easy-cms/richtext": minor
---

Tables in rich text. The admin's editor inserts a table with a header row, and while the cursor is in one, adds and deletes rows and columns (cells can't be merged). `renderRichText` renders tables with their header rows in `<thead>`, `renderMarkdown` writes GFM tables (a cell's paragraphs joined with `<br>`), and `richTextToPlainText` puts each cell on a line of its own. Search adapters index the text in tables.

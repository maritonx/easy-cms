---
'@easy-cms/core': minor
'@easy-cms/admin': minor
---

Media: upload several files at once (three at a time, each with its progress; cancel or retry a file; files over `maxFileSize` refused before sending; the new files stay selected) — the Media page only uploaded the first of several dropped files before. New file types detected from their contents: Word, Excel, PowerPoint, OpenDocument, zip, MP3, WAV, Ogg, M4A, WebM, MOV and CSV, with `mimeTypes` groups `documents`, `office` and `archives`. Files show an icon in their type's color; the Media page has a grid view; a file's page previews it by type (players for audio and video, the browser's PDF viewer, the start of text and CSV files). PDFs are served without the sandbox CSP so browsers can show them.

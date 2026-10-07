---
'@easy-cms/core': minor
'@easy-cms/admin': minor
---

Private folders: admins tick Private on a media folder, and its files (and subfolders') are kept apart (`upload.privateStorage`, or the storage itself when it has no public URLs), served only at `<api>/media/private/<name>` to users who may see them or with `cms.signedMediaURL(doc, { expiresIn })` (at most 7 days), and hidden from requests that are not signed in. Files move between storages, renamed, when they or their folders change; the admin asks first, with how many documents use them. Upload fields take a folder by key (`folder: 'banners'`, made when first needed), with `folderOnly` to allow no other. API keys can be limited to some media folders.

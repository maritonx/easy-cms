---
'@easy-cms/core': minor
'@easy-cms/admin': minor
---

Media folders (`upload.folders: true`): nested folders in the media library (`media-folders`, each file in one `folder`), a folder tree, path and subfolders on the Media page, drag files onto folders or "Move to…", uploads into the open folder, and folders in upload fields' pickers. Deleting a folder moves what it holds up to its parent. With `auth.rbac`, admins choose which roles may view, edit or manage each folder (inherited by subfolders; it only narrows the role's Media permissions; recorded in the audit log). Files stay public: folders sort the team's work.

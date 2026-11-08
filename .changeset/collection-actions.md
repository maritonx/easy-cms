---
"@easy-cms/core": minor
"@easy-cms/admin": minor
---

Actions (#386): buttons that run your code on a document, declared on a collection (`actions`). They show on the edit page (an Actions menu, or a button of their own with `primary`), in a list row's menu and in the bar of selected documents, and in ⌘K. Easy CMS checks who may press them (whoever may update the document, `access`, and with `auth.rbac` a right of its own in Settings → Roles unless `default: 'editors'`), `when` they apply, and their form (`fields`), asks first with `confirm`, runs them in bulk through background operations, records each run in the audit log, and says what they did (`message`, `open`, or `ActionError`). Also `POST <api>/<collection>/<id>/actions/<name>`, `POST <api>/<collection>/actions/<name>` and `cms.runAction()`.

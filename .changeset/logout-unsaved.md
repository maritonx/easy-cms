---
"@easy-cms/admin": patch
---

Log out leaves the page first: on a page with unsaved changes the admin asks, and choosing to stay keeps you logged in with your changes. It used to end the session before asking, so staying left you on the page logged out.

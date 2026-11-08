---
"@easy-cms/core": patch
---

No more "collections.social-posts.admin.permissions is not an option Easy CMS knows" warning: `admin.permissions` on a collection (the publish right, which `@easy-cms/plugin-social` sets) is a known option. The known option lists of a collection's and global's `admin` are now checked against their types, so they can't fall behind again.

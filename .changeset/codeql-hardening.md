---
"@easy-cms/core": patch
"@easy-cms/drizzle": patch
"@easy-cms/admin": patch
---

Hardening from code scanning. A field can't be named `__proto__`; one named `constructor` or `prototype` warns (`EASY_CMS_DEP006`) and is refused from 2.0. Upload from URL refuses 6to4 (`2002::/16`) and Teredo (`2001::/32`) addresses, which tunnel to an IPv4 address. Outside production, a REST error that isn't an `Error` answers `Internal Server Error` instead of its text. The admin's edit form keeps a typed password out of its saved state.

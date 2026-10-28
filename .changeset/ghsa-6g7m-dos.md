---
"@easy-cms/core": patch
"@easy-cms/plugin-ecommerce": patch
---

Security: a crafted email address (in `email` fields, member sign-up, guest checkout and Settings → Email) or SVG upload could block the server for seconds to minutes. Email addresses and SVG files are now checked in linear time; what counts as valid is unchanged. See [GHSA-6g7m-68hw-qg85](https://github.com/maritonx/easy-cms/security/advisories/GHSA-6g7m-68hw-qg85).

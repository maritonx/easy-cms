---
'@easy-cms/plugin-multi-tenant': patch
---

Security fix: site members (`auth.members`, such as shop customers) never get the rights of users with access to all tenants, whatever `publicReads` is, and see only their own user record. Update now if you use the multi-tenant plugin together with members.

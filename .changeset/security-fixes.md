---
'@easy-cms/core': patch
'@easy-cms/plugin-ecommerce': patch
'@easy-cms/plugin-graphql': patch
'@easy-cms/plugin-multi-tenant': patch
---

Security fixes:

- Site members never read drafts, through any API (the Local API now applies the rule REST already had).
- A sign-up for an account still waiting for its email takes the new password and sends a new link; signing in with a provider confirms such an account and drops the password set before. Email confirmation links work once.
- Only system admins unlink someone else's single sign-on account.
- Request bodies sent without a length are refused once past the limit, instead of being read whole first. Endpoints get `req.text()` for raw bodies (at most 1 MB).
- Upload from URL also refuses IPv4 addresses inside IPv6 (NAT64, `::a.b.c.d`) that are private.
- Shop: changing an order's status (paid, sent, cancelled, refunded) needs update access to the order.
- Multi-tenant: a tenant's admins can't add site members or people with access to all tenants to it; adding someone who already has an account answers as for someone new and emails them.

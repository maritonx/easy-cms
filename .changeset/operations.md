---
"@easy-cms/core": minor
"@easy-cms/plugin-graphql": minor
"@easy-cms/email-smtp": minor
"@easy-cms/plugin-form-builder": minor
"@easy-cms/admin": minor
"easy-cms": minor
"create-easy-cms": minor
---

Operations (#101):

- GraphQL introspection is off in production by default (`introspection: true` to keep it); `easy-cms generate:graphql` still writes the schema.
- `backups.encryptionKey` encrypts backup files (AES-256-GCM, `.db.gz.enc`); admin downloads are decrypted and `easy-cms backup:decrypt <file>` decrypts one by hand. A backup storage with public URLs logs a warning; `create-easy-cms` adds `backups/` to `.gitignore`.
- SMTP on port 587 requires STARTTLS (`requireTLS`, shown in the admin's Email settings).
- Without the audit log, failed sign-ins are written to the server log; each audit check logs its last id there too.
- Forms without a client IP share one rate limit of ten times `max`, instead of none.

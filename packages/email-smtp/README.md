# @easy-cms/email-smtp

SMTP email for [Easy CMS](https://maritonx.github.io/easy-cms/) with nodemailer: Gmail, Amazon
SES, Resend, Mailgun, Postmark or your own server.

```ts
import { smtp } from '@easy-cms/email-smtp'

export default defineConfig({
  // …
  email: smtp({ from: 'My Site <no-reply@example.com>' }), // SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD
})
```

See [Email](https://maritonx.github.io/easy-cms/guide/email).

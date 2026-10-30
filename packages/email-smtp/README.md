# @easy-cms/email-smtp

SMTP email for Easy CMS, with nodemailer: Gmail, Amazon SES, Resend, Mailgun, Postmark or your own server. Part of [Easy CMS](https://github.com/maritonx/easy-cms), the embedded, code-first headless CMS for Nuxt and Next.js.

## Install

```bash
npm install @easy-cms/email-smtp
```

Or `pnpm add`, `yarn add` or `bun add`.

## Usage

```ts
import { smtp } from '@easy-cms/email-smtp'

export default defineConfig({
  // …
  email: smtp({ from: 'My Site <no-reply@example.com>' }), // SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD
})
```

## Links

[Email](https://easycms.dev/docs/email) · [Documentation](https://easycms.dev/docs) ([ภาษาไทย](https://easycms.dev/th/docs)) · [GitHub](https://github.com/maritonx/easy-cms)

MIT License

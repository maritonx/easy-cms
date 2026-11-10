# @easy-cms/plugin-email

Email providers for [Easy CMS](https://easycms.dev): **Resend**, **Postmark** and **Brevo** (and
**SMTP** with `@easy-cms/email-smtp`), connected and chosen in Settings → Integrations → Email.
The config's `email`, if any, stays the default. Webhooks say what happened to each email, and
bounces and spam reports keep an address off the suppression list.

```ts
import { emailPlugin, emailProviders } from '@easy-cms/plugin-email'
import { smtp, smtpProvider } from '@easy-cms/email-smtp'

export default defineConfig({
  email: smtp(), // the default until an admin chooses a provider (optional)
  plugins: [emailPlugin({ providers: [...emailProviders, smtpProvider] })],
})
```

See the [email guide](https://easycms.dev/docs/email#providers).

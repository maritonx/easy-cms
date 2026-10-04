# @easy-cms/plugin-form-builder

## 0.28.0

### Patch Changes

- Updated dependencies [479e17a]
  - @easy-cms/core@0.28.0
  - @easy-cms/richtext@0.28.0

## 0.27.0

### Minor Changes

- ffa2f84: Plugin pages and dashboard panels.
  
  - **`admin.pages`**: pages of their own at `<admin>/p/<path>`, with a Web Component as the body. The admin draws the header. `group` puts them under Content or Settings in the menu, or leaves them out (`false`).
  - **`admin.dashboard`**: panels on the dashboard after the built-in ones, `half` or `full` width.
  - **`access: ({ user }) => boolean`** on both is checked on the server; what a user may not see is left out of their admin.
  - Admin components now also get `user`, and on pages `route` (`subpath`, `query`). They can send a `navigate` event to open an admin path, e.g. to keep a tab or date range in the address.
  - New menu icons: `chart-column` and `chart-line`.
  - **Form builder:** a "Form overview" page with submissions per day and per form over 7 or 30 days, and a dashboard panel for the last 7 days. Both read the new `GET <api>/form/stats.json`, which counts days in the editor's time zone.

### Patch Changes

- Updated dependencies [ffa2f84]
  - @easy-cms/core@0.27.0
  - @easy-cms/richtext@0.27.0

## 0.26.0

### Patch Changes

- Updated dependencies [bcf3c0c]
  - @easy-cms/core@0.26.0
  - @easy-cms/richtext@0.26.0

## 0.25.0

### Minor Changes

- 434599a: Typed plugin fields.
  
  - **`definePlugin<T>(plugin)`** tells the inferred document types what a plugin adds: fields on collections and globals, and whole collections. `CollectionDocument`, `cms.find()` and the rest then know them, with no command to run.
  - **The official plugins declare theirs:** `post.meta` (SEO), `page.parent`, `page.path` and `page.breadcrumbs` (nested pages, with the names you give), the `redirects` collection with its `to_<collection>` fields, and the `forms` and `form-submissions` collections.
  - `findByPath()` returns the page typed from your config; `getTree()` and `rebuildNestedDocs()` take your typed `cms`.
  - New types in core: `PluginTypes`, `TypedPlugin`, `DocumentOf` and `SlugOf` for helpers that take an `EasyCMS<C>`.

### Patch Changes

- Updated dependencies [434599a]
  - @easy-cms/core@0.25.0
  - @easy-cms/richtext@0.25.0

## 0.24.0

### Patch Changes

- Updated dependencies [230a347]
  - @easy-cms/core@0.24.0
  - @easy-cms/richtext@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [0107902]
  - @easy-cms/core@0.23.0
  - @easy-cms/richtext@0.23.0

## 0.22.2

### Patch Changes

- @easy-cms/core@0.22.2
  - @easy-cms/richtext@0.22.2

## 0.22.1

### Patch Changes

- d742afc: Package READMEs: what each package does, how to install it with npm, pnpm, Yarn or Bun, a short example and links to its guide.
- Updated dependencies [d742afc]
  - @easy-cms/core@0.22.1
  - @easy-cms/richtext@0.22.1

## 0.22.0

### Patch Changes

- Updated dependencies [63995c6]
  - @easy-cms/core@0.22.0
  - @easy-cms/richtext@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies [0e69436]
  - @easy-cms/core@0.21.0
  - @easy-cms/richtext@0.21.0

## 0.20.1

### Patch Changes

- b48e524: `<easy-form>` takes `form`, `api` and `locale` as properties as well as attributes. Vue and React set properties on custom elements that have them, so `<easy-form :locale="locale">` in Vue (and `locale={locale}` in React) was ignored before.
- @easy-cms/core@0.20.1
  - @easy-cms/richtext@0.20.1

## 0.20.0

### Minor Changes

- b7564cb: Forms and email.
  
  - **Email:** `email` in the config sends email for plugins and your hooks: `smtp()` from the new `@easy-cms/email-smtp` (Gmail, SES, Resend, Mailgun or any SMTP server), `consoleEmail()` for development, or your own adapter. `cms.sendEmail()` queues each email in the database and retries it for about a day if sending fails (`runJobs`); `flushEmails()` waits for them on serverless hosts. Needs a migration for the `email-deliveries` table.
  - **New package `@easy-cms/plugin-form-builder`:** editors build forms in the admin from field blocks (text, long text, email, number, phone, choice, checkbox, date, message), with a confirmation message or redirect and notification emails (`{{name}}`, `{{*}}`, and confirmations to the sender). Submissions are validated on the server, stored without IP addresses and exported as CSV. A honeypot, a minimum time, a rate limit per visitor and optional Cloudflare Turnstile keep bots out. `<easy-form form="contact">` renders a form on any page (the CMS also serves it at `/api/cms/form/element.js`); `getForm()` and `submitForm()` are there for your own components. Needs a migration for the `forms` and `form-submissions` collections.
  - Requests without a session cookie from origins in `cors` now pass the CSRF check, so frontends on other origins can send forms without being trusted with cookies. Endpoints get the client's `ip`.
  - The admin's lists can be narrowed to one related document from the URL (`?f_form=3`).

### Patch Changes

- Updated dependencies [b7564cb]
  - @easy-cms/core@0.20.0
  - @easy-cms/richtext@0.20.0

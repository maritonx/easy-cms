# Easy CMS starter (Next.js)

A blog with its admin, ready to deploy: posts, categories, media, SEO, roles and an audit log, on
[Easy CMS](https://github.com/maritonx/easy-cms).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmaritonx%2Feasy-cms%2Ftree%2Fmain%2Ftemplates%2Fnext-starter&project-name=easy-cms&repository-name=easy-cms&env=EASY_CMS_SETUP_CODE&envDescription=A+code+you+choose%3A+you+type+it+to+create+the+first+admin+at+%2Fadmin&envLink=https%3A%2F%2Fmaritonx.github.io%2Feasy-cms%2Fguide%2Fone-click-deploy&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%2C%7B%22type%22%3A%22blob%22%2C%22access%22%3A%22public%22%7D%5D)
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/maritonx/easy-cms&create_from_path=templates/next-starter)

## After deploying

1. Open `/admin` on your new site.
2. Create the first admin, with the **setup code** you chose when deploying (`EASY_CMS_SETUP_CODE`).
3. Edit the sample posts, or delete them, and write your own.

The deploy creates a Postgres database (Neon) and a store for uploads (Vercel Blob or Netlify
Blobs). Set `EASY_CMS_SECRET` in the project's settings (`openssl rand -hex 32`) when you use it
for real; without it, one is made from the database URL.

## Developing

```bash
npm install
npm run dev # http://localhost:3000, with a local PGlite database in .pglite
```

Change collections and fields in `easy-cms.config.ts`, then `npm run migrate:create <name>` and
commit the migration: each deploy runs `easy-cms migrate` before building.

[Documentation](https://maritonx.github.io/easy-cms/) · [One-click deploy](https://maritonx.github.io/easy-cms/guide/one-click-deploy)

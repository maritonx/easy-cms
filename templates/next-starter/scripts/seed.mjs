// Sample content on the first deploy (run by `build`), only while there are no posts yet.
// Migrations ran just before (`easy-cms migrate`), so the schema is only checked here.
import { createEasyCMS, loadConfig } from '@easy-cms/core'

const cms = await createEasyCMS(await loadConfig(), { scheduler: false, schema: 'verify' })
try {
  if ((await cms.count('posts')) > 0) {
    console.log('Sample content: already there.')
  } else {
    const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
    const doc = (...texts) => ({ type: 'doc', content: texts.map(paragraph) })
    const guides = await cms.create('categories', { name: 'Guides' })
    const news = await cms.create('categories', { name: 'News' })
    await cms.create('posts', {
      title: 'Welcome to your new CMS',
      excerpt: 'This site and its admin were deployed with one click. Here is what to do next.',
      body: doc(
        'Open /admin and create the first admin with the setup code you chose when deploying.',
        'Then edit this post, add your own, upload images, and invite your team.',
      ),
      category: news.id,
      status: 'published',
      publishedAt: new Date(),
    })
    await cms.create('posts', {
      title: 'Content as code',
      excerpt:
        'Collections and fields are defined in easy-cms.config.ts, with full TypeScript types.',
      body: doc(
        'Add a field to a collection in easy-cms.config.ts, run `easy-cms migrate:create`, and push.',
        'The admin, the REST API and the typed Local API follow your config.',
      ),
      category: guides.id,
      status: 'published',
      publishedAt: new Date(Date.now() - 86_400_000),
    })
    await cms.create('posts', { title: 'A draft only editors can see', category: guides.id })
    await cms.updateGlobal('site', { tagline: 'Built with Easy CMS' })
    console.log('Sample content: added. Delete it from the admin when you are ready.')
  }
} finally {
  await cms.destroy()
}

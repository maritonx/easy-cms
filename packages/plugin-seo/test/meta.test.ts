import { describe, expect, it } from 'vitest'
import { jsonLdScript, seoMeta, siteJsonLd } from '../src/index.js'

const post = {
  title: 'Hello',
  slug: 'hello',
  excerpt: 'About hello',
  meta: {
    title: 'Hello | Blog',
    description: '',
    image: { id: 1, url: '/api/cms/media/file/cover.jpg', alt: 'Cover', width: 1200, height: 630 },
  },
}

describe('seoMeta', () => {
  it('uses meta values, falls back to the document and makes URLs absolute', () => {
    const meta = seoMeta(post, {
      config: { admin: { siteURL: 'https://blog.test/' } },
      url: (doc) => `/posts/${doc.slug}`,
      siteName: 'Blog',
    })
    expect(meta.title).toBe('Hello | Blog')
    expect(meta.description).toBe('About hello')
    expect(meta.canonical).toBe('https://blog.test/posts/hello')
    expect(meta.image).toEqual({
      url: 'https://blog.test/api/cms/media/file/cover.jpg',
      alt: 'Cover',
      width: 1200,
      height: 630,
    })
    expect(meta.nuxt).toEqual({
      title: 'Hello | Blog',
      description: 'About hello',
      ogTitle: 'Hello | Blog',
      ogDescription: 'About hello',
      ogUrl: 'https://blog.test/posts/hello',
      ogType: 'website',
      ogSiteName: 'Blog',
      ogImage: 'https://blog.test/api/cms/media/file/cover.jpg',
      ogImageAlt: 'Cover',
      ogImageWidth: 1200,
      ogImageHeight: 630,
      twitterCard: 'summary_large_image',
      twitterTitle: 'Hello | Blog',
      twitterDescription: 'About hello',
      twitterImage: 'https://blog.test/api/cms/media/file/cover.jpg',
    })
    expect(meta.next).toEqual({
      title: 'Hello | Blog',
      description: 'About hello',
      alternates: { canonical: 'https://blog.test/posts/hello' },
      openGraph: {
        title: 'Hello | Blog',
        description: 'About hello',
        url: 'https://blog.test/posts/hello',
        siteName: 'Blog',
        type: 'website',
        images: [meta.image],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Hello | Blog',
        description: 'About hello',
        images: ['https://blog.test/api/cms/media/file/cover.jpg'],
      },
    })
  })

  it('works without meta, a site URL or an image', () => {
    const meta = seoMeta({ title: 'Plain', meta: { image: 5 } }, { siteURL: '/', url: '/plain' })
    expect(meta).toMatchObject({
      title: 'Plain',
      description: undefined,
      canonical: '/plain',
      image: undefined,
    })
    expect(meta.nuxt).toEqual({
      title: 'Plain',
      ogTitle: 'Plain',
      ogUrl: '/plain',
      ogType: 'website',
      twitterCard: 'summary',
      twitterTitle: 'Plain',
    })
    expect(meta.next.alternates).toEqual({ canonical: '/plain' })
    expect(seoMeta({}, { title: () => 'Custom' }).title).toBe('Custom')
    expect(seoMeta({}).next).toEqual({
      openGraph: { type: 'website' },
      twitter: { card: 'summary' },
    })
  })

  it('adds hreflang links, article times, noindex and JSON-LD', () => {
    const doc = {
      ...post,
      meta: { ...post.meta, noindex: true },
      publishedAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    }
    const meta = seoMeta(doc, {
      config: {
        admin: { siteURL: 'https://blog.test' },
        localization: { locales: ['th', 'en'], defaultLocale: 'th' },
      },
      locale: 'en',
      url: (d, locale) => `/${locale}/posts/${d.slug}`,
      type: 'article',
      author: 'Kanawoot',
    })
    expect(meta.canonical).toBe('https://blog.test/en/posts/hello')
    expect(meta.alternates).toEqual({
      th: 'https://blog.test/th/posts/hello',
      en: 'https://blog.test/en/posts/hello',
      'x-default': 'https://blog.test/th/posts/hello',
    })
    expect(meta.noindex).toBe(true)
    expect(meta.nuxt).toMatchObject({
      robots: 'noindex',
      ogType: 'article',
      ogLocale: 'en',
      ogLocaleAlternate: ['th'],
      articlePublishedTime: '2026-09-01T00:00:00.000Z',
      articleModifiedTime: '2026-09-02T00:00:00.000Z',
      articleAuthor: ['Kanawoot'],
    })
    expect(meta.next).toMatchObject({
      robots: { index: false },
      alternates: { canonical: meta.canonical, languages: meta.alternates },
      openGraph: {
        type: 'article',
        locale: 'en',
        alternateLocale: ['th'],
        publishedTime: '2026-09-01T00:00:00.000Z',
        authors: ['Kanawoot'],
      },
    })
    expect(meta.jsonLd).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: 'Hello | Blog',
      description: 'About hello',
      image: ['https://blog.test/api/cms/media/file/cover.jpg'],
      datePublished: '2026-09-01T00:00:00.000Z',
      dateModified: '2026-09-02T00:00:00.000Z',
      author: { '@type': 'Person', name: 'Kanawoot' },
      mainEntityOfPage: 'https://blog.test/en/posts/hello',
      url: 'https://blog.test/en/posts/hello',
      inLanguage: 'en',
    })
    expect(meta.head.link).toEqual([
      { rel: 'canonical', href: 'https://blog.test/en/posts/hello' },
      { rel: 'alternate', hreflang: 'th', href: 'https://blog.test/th/posts/hello' },
      { rel: 'alternate', hreflang: 'en', href: 'https://blog.test/en/posts/hello' },
      { rel: 'alternate', hreflang: 'x-default', href: 'https://blog.test/th/posts/hello' },
    ])
    expect(JSON.parse(meta.head.script[0]?.innerHTML ?? '')).toEqual(meta.jsonLd)
    // Pages that aren't articles are WebPages, with no article times.
    const page = seoMeta({ title: 'About' }, { url: '/about' })
    expect(page.jsonLd).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'About',
      url: '/about',
    })
    expect(page.nuxt.articlePublishedTime).toBeUndefined()
    expect(page.alternates).toBeUndefined()
  })

  it('adds BreadcrumbList JSON-LD from breadcrumbs', () => {
    const meta = seoMeta(
      { title: 'Team' },
      {
        siteURL: 'https://site.test',
        url: '/p/about/team',
        breadcrumbs: [
          { name: 'About', url: '/p/about' },
          { name: '', url: '/skipped' },
          { name: 'Team', url: '/p/about/team' },
        ],
      },
    )
    expect(meta.breadcrumbList).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'About', item: 'https://site.test/p/about' },
        { '@type': 'ListItem', position: 2, name: 'Team', item: 'https://site.test/p/about/team' },
      ],
    })
    expect(meta.head.script.map((s) => JSON.parse(s.innerHTML)['@type'])).toEqual([
      'WebPage',
      'BreadcrumbList',
    ])
    expect(seoMeta({ title: 'x' }).breadcrumbList).toBeUndefined()
  })

  it('makes site JSON-LD and escapes it for a script tag', () => {
    expect(
      siteJsonLd({ name: 'Blog', url: 'https://blog.test/', logo: 'https://blog.test/l.png' }),
    ).toEqual({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': 'https://blog.test/#organization',
          name: 'Blog',
          url: 'https://blog.test/',
          logo: 'https://blog.test/l.png',
        },
        {
          '@type': 'WebSite',
          '@id': 'https://blog.test/#website',
          name: 'Blog',
          url: 'https://blog.test/',
          publisher: { '@id': 'https://blog.test/#organization' },
        },
      ],
    })
    const script = jsonLdScript({ headline: '</script><script>alert(1)</script>\u2028' })
    expect(script).not.toContain('<')
    expect(JSON.parse(script)).toEqual({ headline: '</script><script>alert(1)</script>\u2028' })
  })
})

import { describe, expect, it } from 'vitest'
import { seoMeta } from '../src/index.js'

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
      config: { admin: { siteUrl: 'https://blog.test/' } },
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
    const meta = seoMeta({ title: 'Plain', meta: { image: 5 } }, { siteUrl: '/', url: '/plain' })
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
})

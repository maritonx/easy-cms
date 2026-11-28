import { defineConfig } from '@easy-cms/core'
import { sqlite } from '@easy-cms/db-sqlite'

// Online courses: courses made of lessons, instructors, and students enrolled in courses.
export default defineConfig({
  secret: process.env.EASY_CMS_SECRET ?? '',
  db: sqlite({ url: 'file:./cms.db' }),
  collections: [
    {
      slug: 'instructors',
      useAsTitle: 'name',
      access: { read: () => true },
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'bio', type: 'textarea' },
      ],
    },
    {
      slug: 'courses',
      useAsTitle: 'title',
      drafts: true,
      access: { read: () => true },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'slug', type: 'slug', from: 'title', unique: true },
        { name: 'instructor', type: 'relationship', to: 'instructors' },
        { name: 'level', type: 'select', options: ['beginner', 'intermediate', 'advanced'] },
        { name: 'price', type: 'number', min: 0 },
        { name: 'summary', type: 'textarea' },
      ],
    },
    {
      slug: 'lessons',
      useAsTitle: 'title',
      access: { read: ({ user }) => !!user },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'course', type: 'relationship', to: 'courses', required: true },
        { name: 'order', type: 'number' },
        { name: 'minutes', type: 'number' },
        { name: 'content', type: 'richText' },
      ],
    },
    {
      slug: 'students',
      useAsTitle: 'name',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'email', type: 'email', required: true },
        { name: 'courses', type: 'relationship', to: 'courses', hasMany: true },
      ],
    },
  ],
})

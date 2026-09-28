# หน้า landing page จาก blocks {#a-landing-page-from-blocks}

::: info สิ่งที่จะได้
collection `pages` ที่เนื้อหาเป็นรายการ block (ส่วนหัว จุดเด่น ปุ่มชวนคลิก) ให้ผู้แก้เพิ่ม เรียงใหม่ และกรอกเอง
พร้อมหน้าเว็บที่แสดงผล **ใช้:** [blocks](../fields#blocks)
:::

## 1. Collection {#1-the-collection}

```ts
{
  slug: 'pages',
  useAsTitle: 'title',
  drafts: true,
  preview: ({ doc }) => `/${doc.slug ?? ''}`,
  access: { read: ({ user }) => (user ? true : { status: { equals: 'published' } }) },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'slug', from: 'title' },
    {
      name: 'layout',
      type: 'blocks',
      blocks: [
        {
          slug: 'hero',
          labels: { singular: { en: 'Hero', th: 'ส่วนหัว' } },
          fields: [
            { name: 'heading', type: 'text', required: true },
            { name: 'text', type: 'textarea' },
            { name: 'image', type: 'upload' },
          ],
        },
        {
          slug: 'features',
          labels: { singular: { en: 'Features', th: 'จุดเด่น' } },
          fields: [
            {
              name: 'items',
              type: 'array',
              maxRows: 6,
              fields: [
                { name: 'title', type: 'text', required: true },
                { name: 'text', type: 'textarea' },
              ],
            },
          ],
        },
        {
          slug: 'cta',
          labels: { singular: { en: 'Call to action', th: 'ปุ่มชวนคลิก' } },
          fields: [
            { name: 'text', type: 'text', required: true },
            { name: 'buttonLabel', type: 'text', required: true },
            { name: 'buttonUrl', type: 'text', required: true },
          ],
        },
      ],
    },
  ],
}
```

ในหน้า admin ปุ่ม **เพิ่มบล็อก** มีให้เลือกสามแบบ และลากแถวเพื่อเรียงลำดับได้

## 2. แสดงผล {#2-render-it}

แยกตาม `blockType` TypeScript จะจำกัด type ของแต่ละแถวให้ตรงกับ field ของ block นั้น

::: code-group

```vue [Nuxt]
<template>
  <template v-for="block in page.layout" :key="block.id">
    <section v-if="block.blockType === 'hero'" class="hero">
      <h1>{{ block.heading }}</h1>
      <p>{{ block.text }}</p>
    </section>
    <section v-else-if="block.blockType === 'features'" class="features">
      <div v-for="item in block.items" :key="item.id">
        <h3>{{ item.title }}</h3>
        <p>{{ item.text }}</p>
      </div>
    </section>
    <section v-else-if="block.blockType === 'cta'" class="cta">
      <p>{{ block.text }}</p>
      <a :href="block.buttonUrl">{{ block.buttonLabel }}</a>
    </section>
  </template>
</template>
```

```tsx [Next.js]
export function Blocks({ layout }: { layout: Page['layout'] }) {
  return layout?.map((block) => {
    switch (block.blockType) {
      case 'hero':
        return <section key={block.id}><h1>{block.heading}</h1><p>{block.text}</p></section>
      case 'features':
        return (
          <section key={block.id}>
            {block.items?.map((item) => <div key={item.id}><h3>{item.title}</h3><p>{item.text}</p></div>)}
          </section>
        )
      case 'cta':
        return <section key={block.id}><p>{block.text}</p><a href={block.buttonUrl}>{block.buttonLabel}</a></section>
    }
  })
}
```

:::

`Page` คือ `CollectionDocument<typeof config, 'pages'>` ดู [TypeScript](../typescript#naming-the-types)

## 3. ค้นหาข้างใน blocks {#3-query-inside-blocks}

```ts
// หน้าที่มีปุ่มชวนคลิก
await cms.find('pages', { where: { 'layout.blockType': { equals: 'cta' } } })
```

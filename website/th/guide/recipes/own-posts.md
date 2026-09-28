# ผู้เขียนแก้ได้เฉพาะบทความของตัวเอง {#authors-edit-only-their-own-posts}

::: info สิ่งที่จะได้
บทบาท `author` ที่เขียนบทความได้แต่แก้ได้เฉพาะของตัวเอง ขณะที่ editor และ admin จัดการได้ทุกบทความ
**ใช้:** [บทบาท](../auth#roles), [การควบคุมสิทธิ์](../access-control), [hooks](../hooks)
:::

## 1. เพิ่มบทบาท {#1-add-the-role}

```ts
auth: { roles: ['admin', 'editor', 'author'] },
```

กำหนดบทบาทให้แต่ละคนได้ที่ **ตั้งค่า → ผู้ใช้**

## 2. บันทึกว่าใครเขียนบทความ {#2-record-who-wrote-each-post}

```ts
{
  slug: 'posts',
  fields: [
    // …
    {
      name: 'author',
      type: 'relationship',
      to: 'users',
      position: 'sidebar',
      // เฉพาะ editor และ admin ที่เปลี่ยนผู้เขียนได้
      access: { update: ({ user }) => user?.role !== 'author' },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation, user }) =>
        operation === 'create' && user && !data.author ? { ...data, author: user.id } : data,
    ],
  },
}
```

## 3. จำกัดสิ่งที่ author แก้ได้ {#3-limit-what-authors-may-change}

```ts
access: {
  read: () => true,
  create: ({ user }) => !!user,
  // ผลลัพธ์แบบ `where` อนุญาตเฉพาะเอกสารที่ตรงเงื่อนไข
  update: ({ user }) =>
    user?.role === 'author' ? { author: { equals: user.id } } : !!user,
  delete: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
},
```

ในหน้า admin ผู้เขียนเปิดดูได้ทุกบทความแต่บันทึกได้เฉพาะของตัวเอง และจะไม่เห็นปุ่มลบ ถ้าต้องการซ่อนบทความของคนอื่น
จากรายการด้วย ให้ `read` คืน `where` เดียวกันสำหรับ author ที่ login:

```ts
read: ({ user }) =>
  user?.role === 'author'
    ? { author: { equals: user.id } }
    : user
      ? true
      : { status: { equals: 'published' } },
```

## ตรวจสอบ {#check-it}

login เป็น author: สร้างบทความ แล้วเปิดบทความของคนอื่น การบันทึกจะได้ **403 Forbidden** และหน้า admin จะบอกว่าดูได้อย่างเดียว

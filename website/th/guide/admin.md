# ระบบจัดการ (admin)

::: info สิ่งที่จะได้เรียนรู้
วิธีปรับระบบจัดการให้ทีมใช้ง่าย: กลุ่มเมนู badge และการปักหมุด, command palette (⌘K) และคีย์ลัด, หน้าแก้ไขที่มีแท็บ
ส่วนที่พับได้ แถว และ field ที่แสดงเฉพาะเมื่อเกี่ยวข้อง

**อ่านก่อนหน้านี้:** [การตั้งค่า](./configuration) และ [Fields](./fields)
:::

ทุกอย่างตั้งใน config ระบบจัดการไม่ต้องตั้งค่าแยก แต่ละคนยังพับกลุ่ม ปักหมุด และหุบเมนูได้เอง ค่าเหล่านี้เก็บไว้ในเบราว์เซอร์ของแต่ละคน

## เมนู {#the-menu}

<Screenshot name="dashboard" alt="ระบบจัดการที่เมนูเป็นกลุ่ม: เนื้อหา คลังสื่อ ฟอร์ม และตั้งค่า" />

เมนูเป็นกลุ่มที่พับได้ ลึก 2 ชั้น:

```
แดชบอร์ด
เนื้อหา            บทความ หน้า… (collection ที่ไม่ได้ระบุกลุ่ม)
คลังสื่อ
ร้านค้า             กลุ่มของ plugin เช่น ร้านค้า
  แคตตาล็อก          สินค้า สินค้าย่อย…
  การขาย            คำสั่งซื้อ การชำระเงิน…
ตั้งค่า
  เว็บไซต์           global, redirects
  ผู้ใช้และสิทธิ์      ผู้ใช้ บทบาท API keys SSO
  ระบบ              Backups อีเมล การส่ง Audit log
```

collection, global และหน้าระบุกลุ่มของตัวเองด้วย `admin.group` ส่วนกลุ่มของคุณเองประกาศใน `admin.nav`:

```ts
export default defineConfig({
  admin: {
    nav: [
      {
        id: 'library',
        label: { en: 'Library', th: 'ห้องสมุด' },
        icon: 'book-open',
        children: [{ id: 'authors', label: { en: 'Authors', th: 'ผู้เขียน' } }],
      },
    ],
  },
  collections: [
    { slug: 'books', admin: { group: 'library' }, fields: [/* … */] },
    { slug: 'people', admin: { group: 'library.authors' }, fields: [/* … */] },
  ],
  globals: [{ slug: 'footer', admin: { group: 'content' }, fields: [/* … */] }],
})
```

- ถ้าไม่ระบุ `group` collection อยู่ใต้ **เนื้อหา** และ global อยู่ใต้ **ตั้งค่า › เว็บไซต์** ส่วน `group: 'settings'` ก็คือ
  ตั้งค่า › เว็บไซต์
- ใส่ label แทน id (`group: 'Library'`) จะสร้างกลุ่มชื่อนั้นให้ เหมือนเดิม
- `group: false` เอา collection, global หรือหน้าออกจากเมนู แต่ยังเข้าถึงได้ผ่านลิงก์
- `order` กำหนดตำแหน่งของกลุ่ม: เนื้อหาคือ 0, คลังสื่อ 10, กลุ่มของ plugin ราว 100–200, ตั้งค่า 1000 ส่วนภายในกลุ่ม
  `admin.order` ของ collection, global หรือหน้ากำหนดลำดับ (ค่าน้อยมาก่อน) ที่ไม่ได้ตั้งจะตามมาตามลำดับใน config
- ประกาศ id ของกลุ่มที่ plugin หรือ Easy CMS มีอยู่แล้ว (`{ id: 'shop', label: 'Store' }` หรือ `content`) เพื่อเปลี่ยนชื่อ ไอคอน หรือลำดับ
- แต่ละคนเห็นเฉพาะสิ่งที่ตัวเองเปิดได้ และกลุ่มที่ว่างจะไม่แสดง

### ตัวเลขและ badge {#numbers-and-badges}

collection แสดงจำนวนเอกสาร ปิดได้ด้วย `admin.count: false` ส่วน **badge** แสดงสิ่งที่ต้องจัดการแทน นับตามสิ่งที่แต่ละคนอ่านได้:

```ts
{
  slug: 'orders',
  admin: {
    badge: { where: { status: { equals: 'paid' } }, label: { en: 'to send', th: 'รอจัดส่ง' } },
  },
}
```

กลุ่มที่พับอยู่แสดงผลรวมของ badge ในกลุ่ม `tone` คือ `accent` (ค่าเริ่มต้น), `warning` หรือ `danger`

### สิ่งที่แต่ละคนปรับเอง {#what-each-person-changes}

- **พับกลุ่ม**: กลุ่มจะคงสภาพตามที่พับไว้ ส่วนกลุ่มของหน้าที่เปิดอยู่จะกางเสมอ
- **ปักหมุด**: ปุ่มหมุดข้างชื่อ collection เอาไปไว้บนสุดของเมนู
- **หุบเมนู**: บนจอกว้าง เมนูหุบเหลือไอคอนได้ (ปุ่มด้านล่างเมนู หรือ `[`) กดไอคอนกลุ่มแล้วรายการจะแสดงข้างๆ
- **สร้าง**: ชี้ที่รายการ (หรือกด Tab ไปถึง) จะมีปุ่ม **+** สำหรับสร้างเอกสาร

ใช้ลูกศรขึ้นลงเลื่อนในเมนูได้ ซ้ายและขวาพับหรือกางกลุ่ม

## ค้นหาและคำสั่ง (⌘K) {#search-and-commands}

<Screenshot name="command-palette" alt="Command palette: หน้า เอกสาร และคำสั่งที่พบระหว่างพิมพ์" />

`⌘K` (`Ctrl+K`), `/` หรือช่องค้นหาด้านบนของเมนู เปิด command palette:

- **ไปที่** collection, global, หน้า หรือการตั้งค่าใดก็ได้ ตามชื่อหรือกลุ่ม
- **สร้าง** เอกสารของ collection ที่คุณสร้างได้
- **เอกสาร**: ค้นชื่อเรื่องในทุก collection ที่คุณอ่านได้ (`GET <api>/admin/search?q=`) และค้นด้วย id
- **เปิดล่าสุด**: เอกสารที่เปิดล่าสุด แสดงก่อนเริ่มพิมพ์
- **คำสั่ง**: เปลี่ยนธีม ภาษา หุบเมนู ดูคีย์ลัด ออกจากระบบ และคำสั่งของคุณเอง:

```ts
admin: {
  commands: [{ label: 'ร่างที่รอตรวจ', href: '/collections/posts?status=draft', icon: 'file-text' }],
}
```

| คีย์ลัด | |
|---|---|
| `⌘K`, `/` | ค้นหาและคำสั่ง |
| `⌘S` | บันทึก (ไม่เผยแพร่ร่าง และไม่เอาหน้าออกจากเว็บ) |
| `⌘⇧P` | เผยแพร่ |
| `[` | หุบหรือขยายเมนู |
| `g` แล้ว `d` | แดชบอร์ด |
| `?` | คีย์ลัดทั้งหมด |

## หน้าแก้ไข {#edit-pages}

`admin.layout` จัดหน้าแก้ไขตามชื่อ field เป็นแท็บ ส่วนที่พับได้ และแถว เปลี่ยนแค่หน้าตา ข้อมูลยังเป็นตาม field เหมือนเดิม:

```ts
{
  slug: 'products',
  admin: {
    layout: [
      { tab: 'ข้อมูล', fields: ['title', 'slug', { row: ['brand', 'category'] }, 'description'] },
      {
        tab: 'การจัดส่ง',
        fields: [
          { row: ['weight', 'width', 'height'] },
          { collapsible: 'ศุลกากร', collapsed: true, fields: ['hsCode', 'origin'] },
        ],
      },
    ],
  },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'brand', type: 'text', admin: { width: '1/3' } },
    { name: 'category', type: 'relationship', to: 'categories', admin: { width: '2/3' } },
    { name: 'hsCode', type: 'text', admin: { description: 'รหัสพิกัดศุลกากร' } },
    // …
  ],
}
```

- ใช้กับ field ชั้นบนสุด แต่ละ field วางได้ครั้งเดียว field ที่ไม่ได้วางจะต่อท้าย (ในแท็บแรก) ส่วน field ที่ `admin: { position: 'sidebar' }`
  ยังอยู่ในแถบข้าง
- ถ้ามีแท็บ ทุกรายการชั้นบนสุดต้องเป็นแท็บ แท็บแสดงจำนวน field ที่ผิดในแท็บนั้น
- `row` วาง field ข้างกัน แบ่งเท่ากันหรือตาม `admin.width` (`'1/4'`…`'full'`) บนจอแคบจะเรียงลงมา
- `collapsible` คือส่วนที่พับได้ `collapsed: true` เริ่มแบบพับไว้
- `admin.description` ของ field เพิ่มคำอธิบายใต้ field
- [plugin SEO](./seo) ย้าย field ของตัวเองไปที่แท็บ **SEO** (ตั้ง `tab: false` ถ้าอยากให้อยู่ใต้ field อื่นเหมือนเดิม)

### เงื่อนไข {#conditions}

`admin.condition` แสดง field เฉพาะเมื่อ field ข้างเคียงตรงเงื่อนไข:

```ts
fields: [
  { name: 'linkType', type: 'select', options: ['internal', 'external'] },
  { name: 'page', type: 'relationship', to: 'pages', admin: { condition: { field: 'linkType', equals: 'internal' } } },
  {
    name: 'url',
    type: 'text',
    required: true,
    admin: { condition: { field: 'linkType', equals: 'external' } },
  },
]
```

มี `equals`, `not_equals`, `in: [...]`, `not_in: [...]` และ `exists: true | false` (ชื่อเดียวกับใน `where`) รวมกันได้ด้วย `and`, `or` และ `not` ส่วน `field` คือ field
ข้างเคียง (ใน group หรือแถวของ array คือ field ที่อยู่ด้วยกัน) หรือ path เข้าไปข้างใน (`link.type`) server ใช้เงื่อนไขเดียวกัน: field ที่ถูกซ่อน
ไม่ถูกบังคับกรอก และค่าเดิมยังอยู่

### การบันทึก {#saving}

- บันทึกไม่ผ่าน: ด้านบนของฟอร์มสรุปทุกช่องที่ต้องแก้ เปิดแท็บหรือส่วนของช่องแรก และย้ายโฟกัสไปที่นั่น
- การแก้ไขที่ยังไม่บันทึกเก็บไว้ในเบราว์เซอร์ระหว่างพิมพ์ เปิดเอกสารนั้นอีกครั้งจะถามว่าจะกู้คืนไหม
- `⌘S` บันทึก `⌘⇧P` เผยแพร่

### แถบข้าง {#the-side-column}

กล่องของ plugin (`admin.sidebar`) อยู่ใต้ field ของแถบข้าง ตั้ง `position: 'top'` เพื่อวางไว้ใต้ส่วนเผยแพร่ เช่น ปุ่มของคำสั่งซื้อ:

```ts
admin: { sidebar: [{ tag: 'ecms-order-actions', position: 'top' }] }
```

## หน้ารายการ {#lists}

- กลับจากหน้าเอกสารแล้วรายการเหมือนเดิม ทั้งคำค้น ตัวกรอง หน้า และตำแหน่ง scroll
- `admin.empty` บอกว่า collection นี้ใช้ทำอะไรเมื่อยังไม่มีเอกสาร:

```ts
admin: {
  empty: {
    description: 'เพิ่มสินค้าแรก: ตั้งชื่อ ใส่ราคา แล้วเผยแพร่',
    link: { label: 'คู่มือร้านค้า', href: 'https://example.com/docs/shop' },
  },
}
```

## ขั้นต่อไป {#next-steps}

- [Plugins](./plugins): ให้ collection และหน้าของ plugin มีกลุ่มของตัวเอง
- [Fields](./fields): field ที่ layout เหล่านี้จัดวาง
- [บทบาทและสิทธิ์](./roles): สิ่งที่แต่ละคนเห็นในเมนู

# GraphQL {#graphql}

::: info หน้านี้สอนอะไร
การเพิ่ม GraphQL API ข้าง REST API: schema ที่สร้างจาก config, query, mutation, ขีดจำกัด และการเพิ่ม field ของคุณเอง

**ควรอ่านก่อน:** [REST API](./rest-api) และ [Plugins](./plugins)
:::

`@easy-cms/plugin-graphql` ให้บริการ GraphQL API ที่สร้างจาก collection และ global ของคุณ อ่านและเขียนผ่าน
[Local API](/th/reference/local-api) กฎสิทธิ์ สิทธิ์ระดับ field, hook, การตรวจข้อมูล, draft และหลายภาษาจึงทำงานเหมือน REST
ทุกอย่าง เหมาะกับ frontend ที่ใช้ Apollo, urql หรือ Relay อยู่แล้ว หรืออยากขอเฉพาะ field ที่ต้องใช้ใน request เดียว

## ติดตั้ง {#set-it-up}

```bash [pm]
npm install @easy-cms/plugin-graphql
```

```ts
import { graphqlPlugin } from '@easy-cms/plugin-graphql'

export default defineConfig({
  // …
  plugins: [graphqlPlugin()],
})
```

endpoint อยู่ที่ `<routes.api>/graphql` เช่น `https://example.com/api/cms/graphql` รับ `POST` พร้อม
`{ "query", "variables", "operationName" }` และ `GET` พร้อม `?query=` สำหรับ query (ไม่รับ mutation) เปิดใน browser
นอก production จะได้ **GraphiQL** ถ้าล็อกอิน admin อยู่ จะอ่านได้ตามสิทธิ์ของคุณ

## Schema {#the-schema}

แต่ละ collection และ global ได้ type และ operation ตั้งชื่อตาม slug:

| Collection `posts` | Global `site-settings` |
|---|---|
| type `Post` | type `SiteSettings` |
| `post(id)`: เอกสารเดียว | `siteSettings`: ตัว global |
| `posts(where, sort, limit, page)`: เอกสารหนึ่งหน้า | |
| `createPost`, `updatePost`, `deletePost` | `updateSiteSettings` |

และ `me` คือผู้ใช้ที่ล็อกอินอยู่ (หรือเจ้าของ API key) collection ในตัวคือ `User` (`user`, `users`), `Media` (`mediaItem`, `media`)
และ `MediaFolder` เมื่อเปิดโฟลเดอร์ API key และ collection ที่ Easy CMS ใช้ภายในไม่อยู่ใน schema

```graphql
query Home($category: ID!) {
  posts(where: { category: { equals: $category } }, sort: [publishedAt_DESC], limit: 5, locale: en) {
    docs {
      id
      title
      cover { url alt sizes { thumbnail { url width height } } }
      category { name }
    }
    totalDocs
    hasNextPage
  }
  siteSettings { name }
}
```

field แปลงเป็น:

| Field | GraphQL |
|---|---|
| text, textarea, email, slug | `String` |
| number | `Float` |
| boolean | `Boolean` |
| date | `DateTime` (ข้อความ ISO 8601) |
| select | enum ของตัวเลือก (เป็น `String` เมื่อมีตัวเลือกที่ไม่ใช่ชื่อที่ GraphQL ใช้ได้) เป็น list เมื่อ `hasMany` |
| relationship, upload | type ของเอกสารปลายทาง เลือก field ของมันได้ เป็น list เมื่อ `hasMany` |
| group | object type |
| array | list ของ type ของแถว แต่ละแถวมี `id` |
| blocks | list ของ union ของ block: `... on HeroBlock { heading }` |
| richText, json | `JSON` (rich text เป็นเอกสาร Tiptap) |
| field type ของคุณเอง | type ที่มันสร้างทับ |

ทุก field เป็น `null` ได้ ยกเว้น `id`, `createdAt` และ `updatedAt` เพราะ field อาจถูกซ่อนด้วย
[สิทธิ์ระดับ field](./access-control) หรือว่างในบางภาษาแม้จะ required field ที่ `hidden: true` ไม่อยู่ใน schema
collection ที่มี draft มี `status`

### กรองและเรียง {#filtering-and-sorting}

`where` มี type ของแต่ละ collection ใช้ operator เดียวกับ [REST](./rest-api#collections): `equals`, `not_equals`, `in`,
`not_in`, `like`, `exists` และ `gt`, `gte`, `lt`, `lte` สำหรับตัวเลขและวันที่ รวมเงื่อนไขด้วย `AND` และ `OR` field ใน group
ซ้อนเข้าไปตามโครง

```graphql
posts(where: {
  OR: [{ tags: { in: [news] } }, { views: { gte: 100 } }]
  seo: { noindex: { equals: false } }
}) { totalDocs }
```

`sort` รับ list เช่น `[publishedAt_DESC, title_ASC]` (ค่าเริ่มต้น: ใหม่สุดก่อน) `limit` 1 ถึง 100 (ค่าเริ่มต้น 10) `page` เริ่มที่ 1

### ภาษาและ draft {#languages-and-drafts}

เมื่อเปิด [หลายภาษา](./localization) query รับ `locale` และ `fallbackLocale` ความสัมพันธ์อ่านในภาษาเดียวกัน ถ้าต้องการหลายภาษาพร้อมกัน
ใช้ alias:

```graphql
{
  th: post(id: "1", locale: th) { title }
  en: post(id: "1", locale: en) { title }
}
```

`draft: true` รวม draft ด้วย เฉพาะผู้ใช้ที่ล็อกอินและ API key เหมือน REST

## Mutation {#mutations}

```graphql
mutation {
  createPost(data: { title: "Hello", body: "First paragraph\n\nSecond", category: "3" }, draft: true) {
    id
    status
  }
}
```

- `create<Type>(data, locale, draft)`, `update<Type>(id, data, locale, draft)` และ `delete<Type>(id)` คืนเอกสาร
  global ใช้ `update<Global>(data, locale, draft)`
- `draft: true` บันทึกเป็น draft, `draft: false` เผยแพร่ ถ้าไม่ส่ง collection ทำตามปกติของมัน
- relationship และ upload รับ id, rich text รับเอกสาร Tiptap หรือข้อความธรรมดา (บรรทัดว่างขึ้นย่อหน้าใหม่), blocks รับแถวเป็น JSON
  ที่มี `blockType`
- field ที่ required ต้องส่งใน input ของ `create` ส่วน input ของ `update` เปลี่ยนเฉพาะที่ส่งมา
- ไฟล์อัปโหลดผ่าน [REST](./uploads) แล้วใช้ id ส่วนการล็อกอิน, version และการตั้งเวลาก็ใช้ REST

## ใครทำอะไรได้ {#who-may-do-what}

ยืนยันตัวตนเหมือน REST: cookie session ของ admin, `Authorization: Bearer` กับ session token หรือ [API key](./api-keys)
ซึ่งทำได้เฉพาะที่ระบุไว้ `POST` จาก browser ผ่าน CSRF check เดียวกับ REST

error อยู่ใน `errors` พร้อมรหัสใน `extensions.code` แยกแบบเดียวกับ REST:

| รหัส | เมื่อไร |
|---|---|
| `UNAUTHORIZED` | ยังไม่ล็อกอินในที่ที่ต้องล็อกอิน |
| `FORBIDDEN` | ไม่มีสิทธิ์ |
| `NOT_FOUND` | ไม่มีเอกสารนั้น (ตอนแก้หรือลบ) |
| `VALIDATION_ERROR` | ข้อมูลไม่ถูกต้อง `extensions.fields` บอกปัญหาของแต่ละ field |
| `BAD_USER_INPUT` | argument ผิดหรือ request ผิดรูป เช่น `limit: 500` |
| `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `TOO_MANY_REQUESTS` | เหมือน REST |
| `QUERY_TOO_DEEP`, `QUERY_TOO_LARGE` | เกิน[ขีดจำกัด](#limits) |
| `INTERNAL_SERVER_ERROR` | server มีปัญหา |

เอกสารที่คุณไม่มีสิทธิ์เห็นเป็น `null` เหมือน REST ส่วน collection ที่อ่านไม่ได้เลยได้ `UNAUTHORIZED` หรือ `FORBIDDEN`
query ที่ผิดรูปตอบ status 400 นอกนั้นตอบ 200 พร้อม `errors`

## ขีดจำกัด {#limits}

GraphQL ให้ client ขอได้มากใน request เดียว plugin จึงจำกัดไว้:

- **ความลึก:** field ซ้อนกันได้ไม่เกิน 7 ชั้น (ไม่นับ introspection)
- **จำนวนเอกสาร:** โหลดได้ไม่เกิน 2000 เอกสารต่อ request รวมความสัมพันธ์
- **list:** `limit` ไม่เกิน 100

ความสัมพันธ์โหลดเป็นชุด: บทความ 100 ชิ้นกับหมวดหมู่ของมันใช้ query เดียวสำหรับบทความ และอีกหนึ่งสำหรับหมวดหมู่

## ตัวเลือก {#options}

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `path` | `/graphql` | ตำแหน่งของ endpoint ใต้ `routes.api` |
| `names` | จาก slug | ชื่ออื่นตาม slug: `{ news: { type: 'NewsItem', one: 'newsItem', many: 'news' } }` |
| `exclude` | `[]` | collection และ global ที่ไม่ใส่ใน schema ตาม slug |
| `limits` | `{ depth: 7, documents: 2000 }` | |
| `introspection` | `true` | ให้ client อ่าน schema ได้ อย่างที่ codegen และ GraphiQL ใช้ |
| `graphiql` | นอก production | แสดง GraphiQL ให้ browser |
| `extend` | — | query, mutation และ field ของคุณเอง |

ชื่ออาจชนกันได้ เช่น collection `data` ที่เอกพจน์ก็คือ `data` แอปจะหยุดตอนเริ่มทำงานและบอกว่าต้องตั้งชื่ออะไร

## Field ของคุณเอง {#your-own-fields}

`extend` เพิ่มเข้า schema ด้วย object ของ [graphql-js](https://graphql.org/graphql-js/) resolver ได้ context ที่มี `cms`
(Local API), `user` และ `load(collection, id)` ซึ่งโหลดเป็นชุดเหมือนความสัมพันธ์ในตัว:

```ts
import { GraphQLInt, GraphQLList, GraphQLNonNull, GraphQLString } from 'graphql'

graphqlPlugin({
  extend: ({ type }) => ({
    query: {
      search: {
        type: new GraphQLList(new GraphQLNonNull(type('Post'))),
        args: { text: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: async (_root, { text }, { cms, user }) =>
          (await cms.find('posts', { user, overrideAccess: false, where: { title: { like: text } } })).docs,
      },
    },
    fields: {
      Post: {
        readingMinutes: {
          type: GraphQLInt,
          resolve: (post) => Math.ceil(JSON.stringify(post.body ?? '').length / 1500),
        },
      },
    },
  }),
})
```

ส่ง `{ user, overrideAccess: false }` เพื่อให้ resolver ใช้กฎสิทธิ์ของผู้อ่าน

## Codegen และ server อื่น {#codegen-and-other-servers}

เขียน schema ลงไฟล์ให้ [GraphQL Code Generator](https://the-guild.dev/graphql/codegen) และเครื่องมืออื่นๆ:

```bash
npx easy-cms generate:graphql            # schema.graphql
npx easy-cms generate:graphql web/schema.graphql
```

คำสั่งนี้เปิดฐานข้อมูลเหมือนคำสั่งอื่น codegen อ่าน schema จาก endpoint ที่รันอยู่ก็ได้

ถ้าจะให้บริการ schema จาก GraphQL server ของคุณเอง (Apollo Server, Yoga, gateway) ให้สร้าง schema แล้วให้ context ต่อ request:

```ts
import { buildGraphQLSchema, createContext } from '@easy-cms/plugin-graphql'

const cms = await getEasyCMS()
const schema = buildGraphQLSchema(cms.config)
// ต่อ request:
const contextValue = createContext(cms, await cms.auth.userFromHeaders(request.headers))
```

## ขั้นต่อไป {#next-steps}

- [REST API](./rest-api): อัปโหลด ล็อกอิน version และการตั้งเวลา
- [Access control](./access-control): กฎที่ใช้กับ GraphQL ด้วย
- [API keys](./api-keys): key สำหรับ script และ server อื่น

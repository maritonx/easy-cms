# MCP {#mcp}

::: info หน้านี้สอนอะไร
การให้ผู้ช่วย AI เช่น Claude, Cursor หรือ VS Code อ่านและเขียนเนื้อหาผ่าน Model Context Protocol
โดยใช้ API key ที่จำกัดว่าทำอะไรได้บ้าง

**ควรอ่านก่อน:** [API keys](./api-keys) และ [Plugins](./plugins)
:::

`@easy-cms/plugin-mcp` ทำให้ CMS ของคุณเป็น MCP server ผู้ช่วยที่เชื่อมต่อจะค้นหาบทความ ร่างบทความใหม่
แก้คำผิดหลายหน้า หรืออัปโหลดรูปได้ แต่ทำได้เฉพาะ collection และการกระทำที่ API key อนุญาต ทุกอย่างที่เขียนผ่านการตรวจข้อมูล
hook และกฎสิทธิ์ชุดเดียวกับหน้า admin

## ติดตั้ง {#set-it-up}

```bash
npm install @easy-cms/plugin-mcp
```

```ts
import { mcpPlugin } from '@easy-cms/plugin-mcp'

export default defineConfig({
  // …
  apiKeys: true,
  plugins: [mcpPlugin()],
})
```

server อยู่ที่ `<routes.api>/mcp` เช่น `https://example.com/api/cms/mcp` ใช้ Streamable HTTP แบบไม่เก็บ session
จึงใช้บน hosting แบบ serverless ได้

จากนั้นสร้าง [API key](./api-keys) ให้ผู้ช่วยที่ **ตั้งค่า → API keys** และติ๊กเท่าที่จำเป็น เช่น ผู้ช่วยเขียนบทความ:
อ่าน สร้าง และแก้ไขบทความได้ แต่เผยแพร่และลบไม่ได้

## เชื่อมต่อผู้ช่วย {#connect-an-assistant}

เปลี่ยน URL และ key เป็นของคุณ

::: code-group

```bash [Claude Code]
claude mcp add --transport http easy-cms https://example.com/api/cms/mcp \
  --header "Authorization: Bearer ecms_…"
```

```json [Cursor: .cursor/mcp.json]
{
  "mcpServers": {
    "easy-cms": {
      "url": "https://example.com/api/cms/mcp",
      "headers": { "Authorization": "Bearer ecms_…" }
    }
  }
}
```

```json [VS Code: .vscode/mcp.json]
{
  "servers": {
    "easy-cms": {
      "type": "http",
      "url": "https://example.com/api/cms/mcp",
      "headers": { "Authorization": "Bearer ${input:easy-cms-key}" }
    }
  },
  "inputs": [{ "id": "easy-cms-key", "type": "promptString", "description": "Easy CMS API key", "password": true }]
}
```

```json [Claude Desktop: claude_desktop_config.json]
{
  "mcpServers": {
    "easy-cms": {
      "command": "npx",
      "args": ["mcp-remote", "https://example.com/api/cms/mcp", "--header", "Authorization: Bearer ${EASY_CMS_KEY}"],
      "env": { "EASY_CMS_KEY": "ecms_…" }
    }
  }
}
```

:::

ผู้ช่วยแต่ละตัวเปลี่ยนวิธีตั้งค่าบ่อย ให้ดูเอกสารของโปรแกรมว่าเพิ่ม MCP server แบบ remote พร้อม header อย่างไร

## Tool {#the-tools}

tool ถูกสร้างตาม collection และ global และมีเฉพาะที่ key อนุญาต:

| Tool | ต้องมีสิทธิ์ | |
|---|---|---|
| `find_<collection>` | อ่าน | ดูรายการด้วย `where`, `sort`, `limit` (≤ 100), `page`, `locale` รวมฉบับร่าง |
| `get_<collection>` | อ่าน | เอกสารเดียวตาม id พร้อม relationship |
| `create_<collection>` | สร้าง | สร้างเอกสาร schema ของ input มาจาก field ของคุณ |
| `update_<collection>` | แก้ไข | แก้ field ที่ส่งมา |
| `delete_<collection>` | ลบ | ลบเอกสาร |
| `publish_<collection>`, `unpublish_<collection>` | เผยแพร่ | collection ที่มี drafts |
| `schedule_<collection>` | เผยแพร่ | เผยแพร่หรือยกเลิกภายหลัง (collection ที่มี `schedule`) |
| `upload_media` | สร้างใน Media | ไฟล์แบบ base64 พร้อมข้อความแทนรูป |
| `get_global_<slug>`, `update_global_<slug>`, `publish_global_<slug>` | อ่าน แก้ไข เผยแพร่ | Global |

- **ฉบับร่างยังเป็นฉบับร่าง** ใน collection ที่มี drafts `create_` และ `update_` จะบันทึกเป็นฉบับร่างเสมอ ไม่ว่าผู้ช่วยจะส่งอะไรมา
  มีแต่ `publish_` ที่ทำให้ขึ้นเว็บ ถ้ามี `versions` ด้วย หน้าที่เผยแพร่อยู่จะไม่เปลี่ยนจนกว่าจะเผยแพร่ (ถ้าไม่มี versions
  การแก้เอกสารที่เผยแพร่แล้วเป็นฉบับร่างจะทำให้หน้านั้นออฟไลน์จนกว่าจะเผยแพร่อีกครั้ง เหมือนในหน้า admin)
- **Rich text** รับข้อความธรรมดา (บรรทัดว่างคือย่อหน้าใหม่) หรือ JSON ของ Tiptap
- **Relationship และ upload** รับ id ผู้ช่วยหา id ได้ด้วย `find_` หรือ `upload_media`
- **field หลายภาษา** อ่านและเขียนตาม `locale` (ถ้าไม่ระบุคือภาษาเริ่มต้น)
- ไม่มี tool สำหรับผู้ใช้และ API key ไม่ว่า key จะติ๊กอะไรไว้
- error จะกลับมาเป็นข้อความที่ผู้ช่วยนำไปแก้ได้ เช่น `Invalid data: title: is required`

## ตัวเลือก {#options}

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `path` | `/mcp` | ตำแหน่งของ server ใต้ `routes.api` |
| `name` | `easy-cms` | ชื่อ server ที่ผู้ช่วยเห็น |
| `instructions` | — | คำแนะนำเพิ่มสำหรับผู้ช่วย เช่น สไตล์การเขียนของคุณ ต่อท้ายคำแนะนำในตัว |
| `collections` | ทั้งหมด | collection ที่เปิดให้เลย (key ยังเป็นคนตัดสิน) |
| `globals` | ทั้งหมด | global ที่เปิดให้เลย |

```ts
mcpPlugin({
  name: 'acme-blog',
  instructions: 'เขียนด้วยภาษาทางการ บทความต้องมีคำโปรยหนึ่งประโยค',
  collections: ['posts', 'categories', 'media'],
})
```

## ความปลอดภัย {#safety}

- ให้ผู้ช่วยแต่ละตัวมี key ของตัวเอง ที่มีสิทธิ์น้อยที่สุดและมีวันหมดอายุ อย่าให้สิทธิ์เผยแพร่และลบ เว้นแต่ต้องการให้ผู้ช่วยทำเอง
- อ่านสิ่งที่ผู้ช่วยร่างไว้ในหน้า admin ก่อนเผยแพร่ ประวัติเก็บทุกเวอร์ชันไว้
- server ไม่ดาวน์โหลด URL ที่ผู้ช่วยส่งมา การอัปโหลดต้องส่งเนื้อไฟล์มาเอง
- เพิกถอน key ที่ **ตั้งค่า → API keys** เพื่อตัดการเข้าถึงของผู้ช่วยทันที

## ขั้นต่อไป {#next-steps}

- [API keys](./api-keys): สิทธิ์ วันหมดอายุ และการเพิกถอน
- [การควบคุมสิทธิ์](./access-control): กฎที่ใช้กับผู้ช่วยด้วย

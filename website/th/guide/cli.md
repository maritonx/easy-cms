# CLI {#cli}

## create-easy-cms {#create-easy-cms}

```bash
npx create-easy-cms [dir] [--db sqlite|postgres] [--standalone] [--yes] [--skip-install]
```

เพิ่ม Easy CMS ลงในโปรเจกต์ Nuxt หรือ Next.js ในไดเรกทอรีใหม่หรือว่างเปล่า (หรือเมื่อใช้
`--standalone`) จะตั้งค่า [standalone server](./standalone) ให้ ดู
[เริ่มต้นใช้งาน](./getting-started)

## easy-cms {#easy-cms}

ติดตั้งเป็น dev dependency (เป็น dependency สำหรับ standalone server) ทุกคำสั่งโหลด `.env`
จาก root ของโปรเจกต์

```bash
npx easy-cms <command> [--config <file>] [--cwd <dir>]
```

| คำสั่ง | |
|---|---|
| `migrate` | ใช้ migration ที่ค้างอยู่ |
| `migrate:create <name>` | เขียน migration สำหรับการเปลี่ยนแปลงของ config |
| `migrate:status` | แสดงรายการ migration และสถานะว่าใช้แล้วหรือยัง |
| `generate:types [--out <file>]` | เขียน TypeScript types (ค่าเริ่มต้น `easy-cms-types.ts`) |
| `create-admin [--email] [--name] [--role]` | สร้างผู้ใช้ โดยถามรหัสผ่าน หรืออ่านจาก `EASY_CMS_ADMIN_PASSWORD` |
| `serve [--port] [--host] [--watch] [--trust-proxy]` | รัน CMS เป็น server แยกของตัวเอง ดู [Standalone server](./standalone) |

ทุกคำสั่งมี `--help` และจบด้วย exit code ที่ไม่ใช่ศูนย์เมื่อล้มเหลว

# ADR-0025: รองรับ npm, pnpm, Yarn และ Bun

- **สถานะ:** Accepted
- **วันที่:** 2026-10-01

## บริบท

`create-easy-cms` ตรวจหา package manager และติดตั้งด้วย npm, pnpm, Yarn หรือ Bun ได้อยู่แล้ว แต่ยังมีช่องว่างหลายจุด
- ขั้นต่อไปที่แสดงหลัง scaffold และข้อความใน core กับ Nuxt เขียนตายตัวเป็น `npx easy-cms …` และ `npm start`
- เลือก package manager เองไม่ได้ และไม่ได้อ่านช่อง `packageManager` (Corepack)
- เอกสารมีแต่คำสั่ง npm
- CI ใช้ pnpm อย่างเดียว ไม่เคยลอง scaffold แล้ว install จริง

## การตัดสินใจ

**ขอบเขต:** Bun รองรับในฐานะ package manager (`bun add`, `bunx`) ตัว CMS ยังรันบน Node ตาม shebang
Bun runtime (`bun --bun`) เป็นงานแยก เพราะต้องตรวจ `node:http`, `fs.watch` แบบ recursive, libsql, sharp และ PGlite บน Bun

**คำสั่งของแต่ละตัว:** อยู่ที่ `packages/create-easy-cms/src/commands.ts` ซึ่งไม่ใช้ Node API
CLI และเว็บ docs ใช้ไฟล์เดียวกัน คำสั่งในเอกสารจึงตรงกับที่ CLI แสดงเสมอ

| | npm | pnpm | yarn | bun |
|---|---|---|---|---|
| bin ในโปรเจกต์ | `npx easy-cms` | `pnpm exec easy-cms` | `yarn easy-cms` | `bunx easy-cms` |
| script | `npm run dev` | `pnpm dev` | `yarn dev` | `bun run dev` (กันชนกับคำสั่งของ bun) |
| สร้างโปรเจกต์ | `npm create easy-cms@latest` | `pnpm create easy-cms` | `yarn create easy-cms` | `bun create easy-cms` |

**ลำดับการเลือก:** `--pm` → `packageManager` ใน package.json → lockfile → `npm_config_user_agent` → npm
ถ้าไม่พบตัวที่เลือก (ENOENT) จะบอกวิธีติดตั้ง (`corepack enable` หรือ bun.sh) และแสดงคำสั่ง install ให้รันเอง

**Yarn 2 ขึ้นไป:** ถ้ายังไม่มี `.yarnrc.yml` จะเขียน `nodeLinker: node-modules` ให้ เพราะ Plug'n'Play
ใช้กับ native binary (libsql) และ framework ได้ไม่ครบ การแยก Yarn 1 กับ 2 ดูจาก `packageManager`, `.yarnrc.yml`,
`__metadata` ใน yarn.lock หรือผลของ `yarn --version`

**Build script ที่ถูกบล็อก (pnpm 10, Bun):** ไม่เพิ่ม config ล่วงหน้า แพ็กเกจของเราไม่มี postinstall
ส่วน esbuild (มาจาก drizzle-kit) ใช้ binary จาก optional dependency ได้ smoke test ยืนยันว่าทุกตัวทำงานได้โดยไม่ต้องตั้งค่าเพิ่ม

**เอกสาร:** ` ```sh [pm] ` เขียนคำสั่ง npm ครั้งเดียว markdown-it plugin แปลงเป็น code group สี่แท็บ
ถ้ามีคำสั่งที่แปลงไม่ได้ build จะล้ม แท็บที่เลือกตรงกันทุกบล็อกและจำไว้ใน localStorage
ต้องสลับบล็อกเองหลัง hydration เพราะ VitePress ยังไม่ได้ฟัง click ตอนที่หน้าเพิ่งโหลด

**CI smoke:** Verdaccio ใน job โดย publish ทุกแพ็กเกจของ commit นั้นลงไป (Easy CMS ไม่ proxy ส่วนแพ็กเกจอื่นมาจาก npmjs)
จากนั้นทำแบบผู้ใช้จริง:
1. `<pm> create easy-cms my-cms --yes` ซึ่งทดสอบการตรวจจาก user agent ไปด้วย
2. ตรวจ lockfile
3. `migrate:create`, `migrate`, `create-admin`
4. `start` แล้วเรียก `/healthz` และ `users/init`

ใช้ทั้ง 4 ตัวบน ubuntu และ npm กับ pnpm บน windows ส่วน registry ใช้ env (`npm_config_registry`,
`BUN_CONFIG_REGISTRY`, `YARN_NPM_REGISTRY_SERVER`) โดยไม่เขียน `.yarnrc.yml` เอง เพื่อทดสอบว่า scaffold เขียนให้จริง

## ผลที่ตามมา

- ✅ ผู้ใช้ทั้ง 4 ตัวได้คำสั่งในรูปแบบที่คุ้น ทั้งใน terminal และเอกสาร
- ✅ ทุก PR ทดสอบเส้นทางของผู้ใช้จริง ตั้งแต่ registry จนถึง server
- ❌ ยังไม่รองรับ Yarn PnP และ Bun runtime
- ❌ คำสั่งที่อยู่ในเนื้อความ (inline code) ยังเป็นรูปแบบของ npm มีแท็บเฉพาะในบล็อกคำสั่ง

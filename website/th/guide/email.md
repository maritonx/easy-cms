# อีเมล {#email}

::: info หน้านี้สอนอะไร
Easy CMS ส่งอีเมลอย่างไร (สำหรับ[ฟอร์ม](./forms)และ hook ของคุณเอง) วิธีเชื่อม SMTP และจะเกิดอะไรขึ้นเมื่อส่งไม่สำเร็จ

**ควรอ่านก่อน:** [การตั้งค่า](./configuration)
:::

Easy CMS ไม่ส่งอีเมลจนกว่าคุณจะใส่ **email adapter** ใน config จากนั้น plugin อย่าง form builder จะใช้ adapter นั้น
และโค้ดของคุณก็ใช้ได้ผ่าน `cms.sendEmail()`

## SMTP {#smtp}

`@easy-cms/email-smtp` ส่งผ่าน SMTP server ใดก็ได้: Gmail หรือ Google Workspace, Amazon SES, Resend, Mailgun,
Postmark หรือ server ของคุณเอง

```bash [pm]
npm install @easy-cms/email-smtp
```

```ts
import { smtp } from '@easy-cms/email-smtp'

export default defineConfig({
  // …
  email: smtp({ from: 'My Site <no-reply@example.com>' }),
})
```

```bash [.env]
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASSWORD=re_…
```

| ตัวเลือก | ค่าเริ่มต้น | |
|---|---|---|
| `host` | `SMTP_HOST` | SMTP server |
| `port` | `SMTP_PORT` หรือ `587` | |
| `secure` | `true` เมื่อใช้ port 465 | ใช้ TLS ตั้งแต่ต้น port อื่นจะอัปเกรดด้วย STARTTLS |
| `user`, `password` | `SMTP_USER`, `SMTP_PASSWORD` | |
| `from` | `SMTP_FROM` | ผู้ส่งเมื่อข้อความไม่ได้ระบุ |
| `transport` | — | ตัวเลือกอื่นของ [nodemailer](https://nodemailer.com/smtp/) (pooling, DKIM…) |

ค่าเหล่านี้ถูกอ่านตอนส่งอีเมลฉบับแรก config จึงโหลดได้แม้ยังไม่มีค่า เช่น ตอน build

::: tip ไม่ให้เข้ากล่องสแปม
ส่งจากที่อยู่อีเมลบนโดเมนของคุณเอง และตั้ง SPF, DKIM และ DMARC กับผู้ให้บริการ อีเมลจาก `@gmail.com`
ที่ส่งผ่าน server อื่นมักเข้ากล่องสแปม
:::

## ตอนพัฒนา {#in-development}

`consoleEmail()` พิมพ์อีเมลแต่ละฉบับลง log ของ server แทนการส่งจริง:

```ts
import { consoleEmail, defineConfig } from '@easy-cms/core'
import { smtp } from '@easy-cms/email-smtp'

export default defineConfig({
  email: process.env.SMTP_HOST ? smtp() : consoleEmail(),
})
```

## ส่งจากโค้ดของคุณ {#sending-from-your-code}

```ts
await cms.sendEmail({
  to: 'editor@example.com',
  subject: `มีความคิดเห็นใหม่ใน ${post.title}`,
  text: comment.body,
  html: `<p>${escapeHtml(comment.body)}</p>`, // escapeHtml จาก @easy-cms/richtext
})
```

`to`, `cc` และ `bcc` รับที่อยู่เดียวหรือเป็นรายการ ส่วน `from` และ `replyTo` ไม่บังคับ อะไรที่มาจากผู้เข้าชมต้อง escape
ก่อนใส่ใน `html`

## เข้าคิวและส่งซ้ำ {#queued-and-retried}

`sendEmail` จบเมื่ออีเมลถูกบันทึกลงฐานข้อมูลแล้ว (collection ภายใน `email-deliveries`) แล้วส่งเบื้องหลัง ถ้าส่งไม่สำเร็จ
(SMTP ล่ม หรือเกินโควตา) จะลองใหม่หลัง 1 นาที, 5 นาที, 30 นาที, 2, 6 และ 12 ชั่วโมง แล้วจึงบันทึกว่าล้มเหลว
การลองใหม่ทำงานพร้อม[งานที่ตั้งเวลาไว้](./drafts#scheduled-publishing): ทุกนาทีบน server ที่รันต่อเนื่อง หรือจาก cron
ของคุณ (`GET <api>/jobs/run`)

บน serverless ให้เรียก `await cms.flushEmails()` ก่อนฟังก์ชันจะจบ หรือปล่อยให้ cron ส่งฉบับที่ยังค้างอยู่

ตารางนี้ถูกสร้างเฉพาะเมื่อตั้ง `email` ให้สร้าง migration ด้วย (`easy-cms migrate:create email`)

## เขียน adapter เอง {#your-own-adapter}

adapter คือ object ที่มี `send()` เช่น ใช้ HTTP API แทน SMTP:

```ts
import type { EmailAdapter } from '@easy-cms/core'

const resend: EmailAdapter = {
  from: 'My Site <no-reply@example.com>',
  async send(message) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: message.from,
        to: message.to,
        cc: message.cc,
        bcc: message.bcc,
        reply_to: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    })
    // throw เพื่อให้อีเมลถูกส่งซ้ำภายหลัง
    if (!response.ok) throw new Error(`Resend answered ${response.status}`)
  },
}
```

## ขั้นต่อไป {#next-steps}

- [ฟอร์ม](./forms): แจ้งเตือนเมื่อมีคนส่งฟอร์ม
- [การ deploy](./deployment): ตั้งค่าตัวแปร SMTP บน host

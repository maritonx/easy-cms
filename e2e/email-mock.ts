// Resend's API, as far as @easy-cms/plugin-email uses it, on its own port (#404). `GET /sent`
// lists what was sent, for the suite.
import { createServer } from 'node:http'

const port = Number(process.argv[2] ?? 3116)
const sent: { id: string; to: string[]; subject: string; from: string }[] = []

createServer((req, res) => {
  const chunks: Buffer[] = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`)
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(data))
    }
    if (url.pathname === '/') return send(200, { ok: true })
    if (url.pathname === '/sent') return send(200, sent)
    if (url.pathname === '/domains') return send(200, { data: [{ name: 'e2e.test' }] })
    if (url.pathname === '/emails' && req.method === 'POST') {
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
      const id = `re-e2e-${sent.length + 1}`
      sent.push({ id, to: body.to, subject: body.subject, from: body.from })
      return send(200, { id })
    }
    send(404, { message: `Unknown ${url.pathname}` })
  })
}).listen(port, () => console.log(`Mock Resend on http://localhost:${port}`))

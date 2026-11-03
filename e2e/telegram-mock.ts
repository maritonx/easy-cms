// Telegram's Bot API as far as the notify plugin uses it, on its own port: the Next.js example
// points the plugin here through TELEGRAM_API_URL. `GET /sent` lists the messages sent, for the
// suite to check.
import { createServer } from 'node:http'

const port = Number(process.argv[2] ?? 3112)
const sent: Record<string, unknown>[] = []

createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => {
    body += chunk
  })
  req.on('end', () => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(data))
    }
    // For the suite to see that it is up.
    if (path === '/') return send(200, { ok: true })
    if (path === '/sent') return send(200, sent)
    const [, , method] = path.split('/')
    if (method === 'getMe') return send(200, { ok: true, result: { username: 'easy_cms_e2e_bot' } })
    if (method === 'getUpdates')
      return send(200, {
        ok: true,
        result: [{ message: { chat: { id: -1001, type: 'group', title: 'Site team' } } }],
      })
    if (method === 'sendMessage') {
      sent.push(JSON.parse(body || '{}'))
      return send(200, { ok: true, result: { message_id: sent.length } })
    }
    send(404, { ok: false, error_code: 404, description: 'Not Found' })
  })
}).listen(port, () => console.log(`Mock Telegram API on http://localhost:${port}`))

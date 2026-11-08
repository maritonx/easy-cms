// A Make or n8n scenario as far as the social plugin uses it, on its own port: `/ok` posts and
// answers with the post's URL, `/down` fails. `GET /sent` lists what came, for the suite to check.
import { createServer } from 'node:http'

const port = Number(process.argv[2] ?? 3114)
const sent: { path: string; body: unknown }[] = []

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
    const json = JSON.parse(body || '{}') as { test?: boolean }
    // Connecting tests the URL: both answer that.
    if (json.test) return send(200, { ok: true })
    sent.push({ path, body: json })
    if (path === '/down') return send(503, { error: 'scenario is off' })
    send(200, { url: `https://x.example/status/${sent.length}` })
  })
}).listen(port, () => console.log(`Mock social webhooks on http://localhost:${port}`))

// Google's sign-in, token and Drive API, as far as @easy-cms/plugin-backups uses them, on its own
// port. The sign-in page says yes at once. `GET /files` lists what was uploaded, for the suite.
import { createServer } from 'node:http'

const port = Number(process.argv[2] ?? 3115)
const base = `http://localhost:${port}`
const files = new Map<string, { name: string; size: number }>()
const sessions = new Map<string, string>()

createServer((req, res) => {
  const chunks: Buffer[] = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const url = new URL(req.url ?? '/', base)
    const body = Buffer.concat(chunks)
    const send = (status: number, data: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers })
      res.end(JSON.stringify(data))
    }
    if (url.pathname === '/') return send(200, { ok: true })
    if (url.pathname === '/files') return send(200, [...files.values()])
    if (url.pathname === '/auth') {
      const back = new URL(url.searchParams.get('redirect_uri') ?? '')
      back.searchParams.set('code', 'e2e-code')
      back.searchParams.set('state', url.searchParams.get('state') ?? '')
      res.writeHead(302, { location: String(back) })
      return res.end()
    }
    if (url.pathname === '/token')
      return send(200, {
        access_token: 'e2e-access',
        refresh_token: 'e2e-refresh',
        expires_in: 3599,
      })
    if (url.pathname === '/drive/v3/about')
      return send(200, { user: { emailAddress: 'owner@e2e.test' } })
    if (url.pathname === '/drive/v3/files' && req.method === 'POST')
      return send(200, { id: 'e2e-folder' })
    if (url.pathname === '/drive/v3/files/e2e-folder')
      return send(200, { name: 'Easy CMS backups – e2e', trashed: false })
    if (url.pathname === '/upload/drive/v3/files') {
      const id = `s${sessions.size + 1}`
      sessions.set(id, String(JSON.parse(body.toString() || '{}').name))
      return send(200, {}, { location: `${base}/upload/session/${id}` })
    }
    const session = /^\/upload\/session\/(\w+)$/.exec(url.pathname)?.[1]
    if (session) {
      const id = `file-${files.size + 1}`
      files.set(id, { name: sessions.get(session) ?? '', size: body.length })
      return send(200, { id, webViewLink: `https://drive.e2e.test/${id}` })
    }
    if (url.pathname === '/drive/v3/files' && req.method === 'GET') return send(200, { files: [] })
    send(404, { error: { message: `Unknown ${url.pathname}` } })
  })
}).listen(port, () => console.log(`Mock Google Drive on ${base}`))

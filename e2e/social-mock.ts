// A Make or n8n scenario as far as the social plugin uses it, on its own port: `/ok` posts and
// answers with the post's URL, `/down` fails. Under `/graph` and `/dialog`, Facebook's Graph API
// and its login dialog; under `/line`, LINE's Messaging API (#313). `GET /sent` lists what came,
// for the suite to check.
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
    const url = new URL(req.url ?? '/', 'http://localhost')
    // Facebook's login dialog: the user says yes at once.
    if (path.endsWith('/dialog/oauth')) {
      const back = new URL(url.searchParams.get('redirect_uri') ?? '')
      back.searchParams.set('code', 'e2e-code')
      back.searchParams.set('state', url.searchParams.get('state') ?? '')
      res.writeHead(302, { location: String(back) })
      return res.end()
    }
    if (path.startsWith('/graph/')) {
      const params = req.method === 'GET' ? url.searchParams : new URLSearchParams(body)
      const route = path.replace(/^\/graph\/v[\d.]+/, '')
      if (route === '/oauth/access_token') return send(200, { access_token: 'e2e-user-token' })
      if (route === '/me/accounts')
        return send(200, {
          data: [
            { id: '101', name: 'Easy CMS Page', access_token: 'e2e-page-token' },
            { id: '102', name: 'Another Page', access_token: 'e2e-other-token' },
          ],
        })
      if (route === '/me') return send(200, { name: 'Easy CMS Page' })
      const post = route.match(/^\/(\d+)\/(feed|photos)$/)
      if (post) {
        sent.push({ path, body: Object.fromEntries(params) })
        return send(200, { id: `${post[1]}_${sent.length}` })
      }
      return send(404, { error: { message: `Unknown ${route}`, code: 100 } })
    }
    if (path.startsWith('/line/')) {
      const route = path.slice('/line'.length)
      if (route === '/v2/bot/info')
        return send(200, { displayName: 'Easy CMS', basicId: '@easycms' })
      if (route === '/v2/bot/insight/followers')
        return send(200, { status: 'ready', followers: 42, targetedReaches: 40 })
      if (route === '/v2/bot/message/quota') return send(200, { type: 'limited', value: 200 })
      if (route === '/v2/bot/message/quota/consumption') return send(200, { totalUsage: 10 })
      if (route === '/v2/bot/message/broadcast') {
        sent.push({ path, body: JSON.parse(body || '{}') })
        return send(200, {})
      }
      return send(404, { message: `Unknown ${route}` })
    }
    const json = JSON.parse(body || '{}') as { test?: boolean }
    // Connecting tests the URL: both answer that.
    if (json.test) return send(200, { ok: true })
    sent.push({ path, body: json })
    if (path === '/down') return send(503, { error: 'scenario is off' })
    send(200, { url: `https://x.example/status/${sent.length}` })
  })
}).listen(port, () => console.log(`Mock social webhooks on http://localhost:${port}`))

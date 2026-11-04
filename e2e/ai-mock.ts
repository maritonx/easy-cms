// Anthropic's API as far as the AI plugin uses it, on its own port: the Next.js example points the
// plugin here through ANTHROPIC_API_URL.
import { createServer } from 'node:http'

const port = Number(process.argv[2] ?? 3113)

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
    if (req.headers['x-api-key'] !== 'sk-ant-e2e')
      return send(401, {
        type: 'error',
        error: { type: 'authentication_error', message: 'invalid x-api-key' },
      })
    if (path === '/v1/models')
      return send(200, { data: [{ id: 'claude-e2e-1', display_name: 'Claude E2E' }] })
    if (path === '/v1/messages') {
      const request = JSON.parse(body || '{}') as { model?: string }
      return send(200, {
        model: request.model,
        content: [{ type: 'text', text: 'OK' }],
        usage: { input_tokens: 12, output_tokens: 1 },
      })
    }
    send(404, { type: 'error', error: { type: 'not_found_error', message: `Unknown ${path}` } })
  })
}).listen(port, () => console.log(`Mock Anthropic API on http://localhost:${port}`))

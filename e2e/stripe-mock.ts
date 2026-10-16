// Stripe's API as far as the shop's Stripe adapter uses it, on its own port: the shop example
// points its Stripe client here through STRIPE_API_URL. Payments are then confirmed by sending
// the shop a signed webhook, as Stripe would.
import { createServer } from 'node:http'

const port = Number(process.argv[2] ?? 3111)
const intents = new Map<string, Record<string, unknown>>()

createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => {
    body += chunk
  })
  req.on('end', () => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json', 'request-id': 'req_mock' })
      res.end(JSON.stringify(data))
    }
    // For the suite to see that it is up.
    if (path === '/') return send(200, { ok: true })
    if (req.method === 'POST' && path === '/v1/payment_intents') {
      const params = new URLSearchParams(body)
      const id = `pi_mock_${intents.size + 1}`
      const intent = {
        id,
        object: 'payment_intent',
        client_secret: `${id}_secret_mock`,
        status: 'requires_payment_method',
        amount: Number(params.get('amount')),
        currency: params.get('currency'),
      }
      intents.set(id, intent)
      return send(200, intent)
    }
    const intent = path.match(/^\/v1\/payment_intents\/([\w]+)$/)
    if (req.method === 'GET' && intent) {
      const found = intents.get(intent[1] as string)
      return found
        ? send(200, found)
        : send(404, { error: { type: 'invalid_request_error', message: 'No such payment_intent' } })
    }
    if (req.method === 'POST' && path === '/v1/refunds')
      return send(200, { id: 're_mock', object: 'refund' })
    send(404, {
      error: { type: 'invalid_request_error', message: `Unknown ${req.method} ${path}` },
    })
  })
}).listen(port, () => console.log(`Mock Stripe API on http://localhost:${port}`))

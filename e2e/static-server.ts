// Serves the standalone example's frontend on another origin, so the e2e suite checks CORS
// from a real browser. Usage: node static-server.ts <dir> <port>
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join, normalize } from 'node:path'

const [dir = '.', port = '5173'] = process.argv.slice(2)
createServer(async (req, res) => {
  const path = normalize(new URL(req.url ?? '/', 'http://x').pathname).replace(/^(\.\.[/\\])+/, '')
  try {
    const body = await readFile(join(dir, path.endsWith('/') ? `${path}index.html` : path))
    res.setHeader(
      'content-type',
      path.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8',
    )
    res.end(body)
  } catch {
    res.statusCode = 404
    res.end('Not found')
  }
}).listen(Number(port))

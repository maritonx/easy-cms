import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  fetchRemoteFile,
  hostAllowed,
  isPrivateAddress,
  remoteFileName,
} from '../src/remote-file.js'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

let server: Server
let base: string
beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    if (url.pathname === '/logo.png') {
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(PNG)
    } else if (url.pathname === '/named') {
      res.writeHead(200, {
        'content-disposition': `attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf`,
      })
      res.end('x')
    } else if (url.pathname === '/hop') {
      const n = Number(url.searchParams.get('n'))
      res.writeHead(302, { location: n > 0 ? `/hop?n=${n - 1}` : '/logo.png' })
      res.end()
    } else if (url.pathname === '/to-metadata') {
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' })
      res.end()
    } else if (url.pathname === '/big') {
      // No Content-Length: the limit applies while reading.
      res.writeHead(200)
      res.write(new Uint8Array(600))
      res.end(new Uint8Array(600))
    } else if (url.pathname === '/slow') {
      setTimeout(() => res.end('late'), 2_000)
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

const local = { allowPrivate: true, maxBytes: 1_000 }

describe('downloading a file from a link', () => {
  it('follows redirects and names the file', async () => {
    const file = await fetchRemoteFile(`${base}/hop?n=2`, local)
    expect(file.data).toEqual(PNG)
    expect(file.name).toBe('logo.png')
    expect(file.contentType).toBe('image/png')
    expect((await fetchRemoteFile(`${base}/named`, local)).name).toBe('résumé.pdf')
  })

  it('stops after three redirects, large files and slow servers', async () => {
    await expect(fetchRemoteFile(`${base}/hop?n=3`, local)).rejects.toThrow(
      'redirects too many times',
    )
    await expect(fetchRemoteFile(`${base}/big`, local)).rejects.toMatchObject({
      message: 'is larger than 1000 bytes',
      status: 413,
    })
    await expect(fetchRemoteFile(`${base}/slow`, { ...local, timeout: 200 })).rejects.toThrow(
      'took too long to download',
    )
    await expect(fetchRemoteFile(`${base}/missing`, local)).rejects.toThrow(
      'could not be downloaded (HTTP 404)',
    )
  })

  it('refuses private addresses, other schemes and hosts not allowed', async () => {
    const strict = { maxBytes: 1_000 }
    await expect(fetchRemoteFile(`${base}/logo.png`, strict)).rejects.toThrow(
      '127.0.0.1 is a private network address',
    )
    // By name: checked after DNS, so a public-looking name can't point inside.
    await expect(
      fetchRemoteFile(`${base.replace('127.0.0.1', 'localhost')}/logo.png`, strict),
    ).rejects.toThrow('localhost points to a private network address')
    await expect(fetchRemoteFile('http://[::1]/', strict)).rejects.toThrow('private network')
    await expect(fetchRemoteFile('http://[::ffff:10.0.0.1]/', strict)).rejects.toThrow('private')
    // A redirect from an allowed host to a private one.
    await expect(
      fetchRemoteFile(`${base}/to-metadata`, {
        ...local,
        allowedHosts: ['127.0.0.1', '169.254.169.254'],
        allowPrivate: false,
      }),
    ).rejects.toThrow('private network address')
    await expect(
      fetchRemoteFile(`${base}/to-metadata`, { ...local, allowedHosts: ['127.0.0.1'] }),
    ).rejects.toThrow('169.254.169.254 is not an allowed host')
    for (const link of ['file:///etc/passwd', 'ftp://x.example/a', 'not a link'])
      await expect(fetchRemoteFile(link, strict)).rejects.toThrow('must be an http(s) link')
    await expect(fetchRemoteFile('https://u:p@example.com/a', strict)).rejects.toThrow(
      'must not contain a password',
    )
  })
})

describe('helpers', () => {
  it('matches allowed hosts', () => {
    const rules = ['images.example.com', '*.cdn.example.net']
    expect(hostAllowed('images.example.com', rules)).toBe(true)
    expect(hostAllowed('IMAGES.example.com.', rules)).toBe(true)
    expect(hostAllowed('evil-images.example.com', rules)).toBe(false)
    expect(hostAllowed('a.b.cdn.example.net', rules)).toBe(true)
    // `*.domain` is its subdomains, not the domain itself.
    expect(hostAllowed('cdn.example.net', rules)).toBe(false)
    expect(hostAllowed('notcdn.example.net', rules)).toBe(false)
    expect(hostAllowed('anything.test', ['*'])).toBe(true)
  })

  it('knows private addresses', () => {
    for (const ip of [
      '10.1.2.3',
      '127.0.0.1',
      '169.254.169.254',
      '172.20.0.1',
      '192.168.1.1',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:192.168.0.1',
      // IPv4 inside IPv6: NAT64 and the old IPv4-compatible form.
      '64:ff9b::a9fe:a9fe',
      '64:ff9b::127.0.0.1',
      '::127.0.0.1',
    ])
      expect(isPrivateAddress(ip), ip).toBe(true)
    for (const ip of [
      '8.8.8.8',
      '1.1.1.1',
      '172.32.0.1',
      '2606:4700:4700::1111',
      '64:ff9b::808:808',
    ])
      expect(isPrivateAddress(ip), ip).toBe(false)
  })

  it('names files', () => {
    expect(remoteFileName(new URL('https://x.test/a/photo%20one.jpg?w=2'), undefined)).toBe(
      'photo one.jpg',
    )
    expect(remoteFileName(new URL('https://x.test/'), undefined)).toBe('download')
    expect(remoteFileName(new URL('https://x.test/a'), 'inline; filename="b.png"')).toBe('b.png')
  })
})

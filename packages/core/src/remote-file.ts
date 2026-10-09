import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import { request as httpRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'

/** Why a link could not be downloaded; the message is safe to show to the user. */
export class RemoteFileError extends Error {
  /** `413` when the file is too large, otherwise `400`. */
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'RemoteFileError'
    this.status = status
  }
}

export interface RemoteFileOptions {
  /** Hosts files may come from (see `upload.fromURL.allowedHosts`); `undefined`: any host. */
  readonly allowedHosts?: readonly string[] | undefined
  /** Also private network addresses. */
  readonly allowPrivate?: boolean | undefined
  readonly maxBytes: number
  /** Milliseconds for the whole download, redirects included. Default 15 s. */
  readonly timeout?: number
  /** Default 3. */
  readonly maxRedirects?: number
  readonly userAgent?: string
}

/**
 * Addresses a link must not reach unless `allowPrivate`: this machine, private networks,
 * link-local (cloud metadata at 169.254.169.254), carrier-grade NAT, multicast and reserved ranges.
 */
const PRIVATE = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  PRIVATE.addSubnet(net, prefix, 'ipv4')
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  PRIVATE.addSubnet(net, prefix, 'ipv6')

const EMBEDS_IPV4 = new BlockList()
EMBEDS_IPV4.addSubnet('64:ff9b::', 96, 'ipv6')
EMBEDS_IPV4.addSubnet('::', 96, 'ipv6')

/** The IPv4 address in the last 32 bits of an IPv6 address that carries one. */
function embeddedIPv4(address: string): string | undefined {
  if (address === '::' || address === '::1' || !EMBEDS_IPV4.check(address, 'ipv6')) return undefined
  const bytes = ipv6Bytes(address)
  return bytes ? bytes.slice(12).join('.') : undefined
}

/** The 16 bytes of an IPv6 address (dotted IPv4 tails included). */
function ipv6Bytes(address: string): number[] | undefined {
  let text = address
  const tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text)
  if (tail) {
    const [a, b, c, d] = tail.slice(1).map(Number) as [number, number, number, number]
    text = `${text.slice(0, tail.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }
  const [head = '', rest] = text.split('::')
  const left = head ? head.split(':') : []
  const right = rest === undefined ? [] : rest ? rest.split(':') : []
  const groups =
    rest === undefined
      ? left
      : [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
  if (groups.length !== 8) return undefined
  return groups.flatMap((g) => {
    const n = Number.parseInt(g, 16)
    return [n >> 8, n & 0xff]
  })
}

/** Whether an IP address is on a private network (IPv4-mapped IPv6 counts as its IPv4). */
export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
  if (mapped?.[1]) return PRIVATE.check(mapped[1], 'ipv4')
  const family = isIP(address)
  if (family === 4) return PRIVATE.check(address, 'ipv4')
  if (family === 6) {
    // IPv4 inside IPv6 (NAT64's 64:ff9b::/96, the old ::/96 form) counts as that IPv4.
    const embedded = embeddedIPv4(address)
    if (embedded) return PRIVATE.check(embedded, 'ipv4')
    return PRIVATE.check(address, 'ipv6')
  }
  return true
}

/** Whether `host` is in `allowedHosts`: exact, `*.domain` for its subdomains, or `*`. */
export function hostAllowed(host: string, allowedHosts: readonly string[]): boolean {
  const name = host.toLowerCase().replace(/\.$/, '')
  return allowedHosts.some((rule) => {
    const pattern = rule.toLowerCase()
    if (pattern === '*') return true
    if (pattern.startsWith('*.')) return name.endsWith(pattern.slice(1))
    return name === pattern
  })
}

/** A DNS lookup that refuses private addresses, so a public name can't point inside. */
function guardedLookup(allowPrivate: boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
      if (error) return callback(error, '', 4)
      const usable = allowPrivate
        ? addresses
        : addresses.filter((a) => !isPrivateAddress(a.address))
      if (usable.length === 0) {
        const blocked = new Error(`${hostname} points to a private network address`)
        ;(blocked as NodeJS.ErrnoException).code = 'ECMS_PRIVATE'
        return callback(blocked, '', 4)
      }
      if ((options as { all?: boolean }).all) return callback(null, usable as never, 4)
      const first = usable[0] as LookupAddress
      callback(null, first.address, first.family)
    })
  }
}

/** The file name from `Content-Disposition`, else the URL's last path segment, else `download`. */
export function remoteFileName(url: URL, disposition: string | undefined): string {
  if (disposition) {
    const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(disposition)
    if (star?.[1]) {
      try {
        return clean(decodeURIComponent(star[1].trim()))
      } catch {
        // fall through
      }
    }
    const plain = /filename\s*=\s*"?([^";]+)"?/.exec(disposition)
    if (plain?.[1]) return clean(plain[1].trim())
  }
  const last = url.pathname.split('/').filter(Boolean).pop()
  if (last) {
    try {
      return clean(decodeURIComponent(last))
    } catch {
      return clean(last)
    }
  }
  return 'download'
}
const clean = (name: string) => name.replace(/[\\/]/g, '_').slice(0, 200) || 'download'

/**
 * Downloads a file from an `http(s)` link for an upload. Checks the host against
 * `allowedHosts` and refuses private network addresses after DNS resolution, at every redirect;
 * stops reading once the file is larger than `maxBytes`.
 */
export async function fetchRemoteFile(
  link: string,
  options: RemoteFileOptions,
): Promise<{ data: Uint8Array; name: string; contentType?: string }> {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    throw new RemoteFileError('must be an http(s) link')
  }
  const deadline = Date.now() + (options.timeout ?? 15_000)
  const maxRedirects = options.maxRedirects ?? 3
  for (let redirects = 0; ; redirects++) {
    check(url, options)
    const response = await get(url, options, deadline)
    const status = response.statusCode ?? 0
    if (status >= 300 && status < 400 && response.headers.location) {
      response.resume()
      if (redirects >= maxRedirects) throw new RemoteFileError('redirects too many times')
      url = new URL(response.headers.location, url)
      continue
    }
    if (status < 200 || status >= 300) {
      response.resume()
      throw new RemoteFileError(`could not be downloaded (HTTP ${status})`)
    }
    const data = await read(response, options.maxBytes, deadline)
    const contentType = response.headers['content-type']
    return {
      data,
      name: remoteFileName(url, response.headers['content-disposition']),
      ...(contentType ? { contentType } : {}),
    }
  }
}

function check(url: URL, options: RemoteFileOptions) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new RemoteFileError('must be an http(s) link')
  if (url.username || url.password) throw new RemoteFileError('must not contain a password')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (options.allowedHosts && !hostAllowed(host, options.allowedHosts))
    throw new RemoteFileError(`${host} is not an allowed host`)
  // IP literals skip DNS: check them here.
  if (!options.allowPrivate && isIP(host) && isPrivateAddress(host))
    throw new RemoteFileError(`${host} is a private network address`)
}

function get(url: URL, options: RemoteFileOptions, deadline: number): Promise<IncomingMessage> {
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: 'GET',
      lookup: guardedLookup(options.allowPrivate === true),
      headers: {
        'user-agent': options.userAgent ?? 'EasyCMS',
        accept: '*/*',
      },
    })
    const timer = setTimeout(
      () => req.destroy(new RemoteFileError('took too long to download')),
      Math.max(0, deadline - Date.now()),
    )
    req.on('response', (response) => {
      clearTimeout(timer)
      resolve(response)
    })
    req.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      if (error instanceof RemoteFileError) reject(error)
      else if (error.code === 'ECMS_PRIVATE')
        reject(new RemoteFileError(`${url.hostname} points to a private network address`))
      else if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN')
        reject(new RemoteFileError(`${url.hostname} was not found`))
      else reject(new RemoteFileError('could not be downloaded'))
    })
    req.end()
  })
}

function read(response: IncomingMessage, maxBytes: number, deadline: number): Promise<Uint8Array> {
  const declared = Number(response.headers['content-length'])
  if (Number.isFinite(declared) && declared > maxBytes) {
    response.destroy()
    return Promise.reject(new RemoteFileError(`is larger than ${maxBytes} bytes`, 413))
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    const timer = setTimeout(
      () => response.destroy(new RemoteFileError('took too long to download')),
      Math.max(0, deadline - Date.now()),
    )
    response.on('data', (chunk: Buffer) => {
      size += chunk.byteLength
      if (size > maxBytes) {
        response.destroy(new RemoteFileError(`is larger than ${maxBytes} bytes`, 413))
        return
      }
      chunks.push(chunk)
    })
    response.on('end', () => {
      clearTimeout(timer)
      resolve(new Uint8Array(Buffer.concat(chunks)))
    })
    response.on('error', (error) => {
      clearTimeout(timer)
      reject(
        error instanceof RemoteFileError ? error : new RemoteFileError('could not be downloaded'),
      )
    })
  })
}

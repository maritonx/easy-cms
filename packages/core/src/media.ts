/** File types Easy CMS recognizes from their contents (FR-UPL-03). */
export const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/zip': 'zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/vnd.oasis.opendocument.presentation': 'odp',
}

const OFFICE = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]

/**
 * Names for several types at once, usable in `upload.mimeTypes` and an upload field's
 * `mimeTypes`: `documents` (PDF, Word, Excel, PowerPoint, OpenDocument, CSV, text), `office`
 * (docx, xlsx, pptx) and `archives` (zip).
 */
export const MIME_GROUPS: Readonly<Record<string, readonly string[]>> = {
  office: OFFICE,
  documents: [
    'application/pdf',
    ...OFFICE,
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
    'text/csv',
    'text/plain',
  ],
  archives: ['application/zip'],
}

/** Patterns with group names (`documents`…) replaced by their types. */
export function expandMimeTypes(patterns: readonly string[]): string[] {
  return [...new Set(patterns.flatMap((p) => MIME_GROUPS[p.toLowerCase()] ?? [p]))]
}

const startsWith = (data: Uint8Array, bytes: number[], offset = 0) =>
  bytes.every((b, i) => data[offset + i] === b)
const ascii = (data: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...data.subarray(start, end))

const contains = (data: Uint8Array, text: string) =>
  Buffer.from(data.buffer, data.byteOffset, data.byteLength).includes(text, 0, 'latin1')

/**
 * A zip's type: Office (OOXML) by the part every such file has, OpenDocument by its `mimetype`
 * entry (stored first and uncompressed, as the format requires), otherwise a plain zip. Entry
 * names are stored uncompressed, so they can be found without unzipping.
 */
function zipType(data: Uint8Array): string {
  if (ascii(data, 30, 38) === 'mimetype') {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const start = 30 + view.getUint16(26, true) + view.getUint16(28, true)
    const type = ascii(data, start, start + Math.min(view.getUint32(18, true), 80))
    if (EXTENSIONS[type]?.startsWith('od')) return type
  }
  if (contains(data, 'word/document.xml')) return OFFICE[0] as string
  if (contains(data, 'xl/workbook.xml')) return OFFICE[1] as string
  if (contains(data, 'ppt/presentation.xml')) return OFFICE[2] as string
  return 'application/zip'
}

/**
 * Detects the MIME type from file contents, ignoring the type the client sent. The name only
 * tells CSV from plain text, which have the same contents.
 */
export function sniffMimeType(data: Uint8Array, name = ''): string | undefined {
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(data, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (ascii(data, 0, 6) === 'GIF87a' || ascii(data, 0, 6) === 'GIF89a') return 'image/gif'
  if (ascii(data, 0, 4) === 'RIFF' && ascii(data, 8, 12) === 'WEBP') return 'image/webp'
  if (ascii(data, 0, 4) === 'RIFF' && ascii(data, 8, 12) === 'WAVE') return 'audio/wav'
  if (ascii(data, 4, 8) === 'ftyp') {
    const brand = ascii(data, 8, 12)
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
    if (['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V '].includes(brand)) return 'video/mp4'
    if (brand === 'M4A ') return 'audio/mp4'
    if (brand === 'qt  ') return 'video/quicktime'
  }
  if (ascii(data, 0, 5) === '%PDF-') return 'application/pdf'
  if (startsWith(data, [0x50, 0x4b, 0x03, 0x04])) return zipType(data)
  if (ascii(data, 0, 4) === 'OggS') return 'audio/ogg'
  if (startsWith(data, [0x1a, 0x45, 0xdf, 0xa3]) && ascii(data, 0, 64).includes('webm'))
    return 'video/webm'
  // MP3: an ID3 tag, or an MPEG audio layer III frame.
  if (ascii(data, 0, 3) === 'ID3' || (data[0] === 0xff && ((data[1] ?? 0) & 0xe6) === 0xe2))
    return 'audio/mpeg'

  // Text formats: must decode as UTF-8 without NUL bytes.
  const head = data.subarray(0, 4096)
  if (head.includes(0)) return undefined
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(head)
  } catch {
    return undefined
  }
  const trimmed = text.replace(/^﻿/, '').trimStart()
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(trimmed))
    return 'image/svg+xml'
  return /\.csv$/i.test(name) ? 'text/csv' : 'text/plain'
}

/**
 * `image/*` style matching; group names (`documents`…) stand for their types. A wildcard leaves
 * out SVG, which can carry scripts: it is allowed only when listed as `image/svg+xml`.
 */
export function mimeAllowed(type: string, allowed: readonly string[]): boolean {
  return expandMimeTypes(allowed).some((pattern) =>
    pattern.endsWith('/*')
      ? type.startsWith(pattern.slice(0, -1)) && type !== 'image/svg+xml'
      : pattern === type,
  )
}

/** Width and height of PNG, GIF, JPEG and WebP images without decoding them. */
export function imageDimensions(
  data: Uint8Array,
  type: string,
): { width: number; height: number } | undefined {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  try {
    switch (type) {
      case 'image/png':
        return { width: view.getUint32(16), height: view.getUint32(20) }
      case 'image/gif':
        return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
      case 'image/webp': {
        const chunk = ascii(data, 12, 16)
        if (chunk === 'VP8 ')
          return {
            width: view.getUint16(26, true) & 0x3fff,
            height: view.getUint16(28, true) & 0x3fff,
          }
        if (chunk === 'VP8L') {
          const bits = view.getUint32(21, true)
          return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
        }
        if (chunk === 'VP8X') {
          const w = view.getUint16(24, true) | (view.getUint8(26) << 16)
          const h = view.getUint16(27, true) | (view.getUint8(29) << 16)
          return { width: w + 1, height: h + 1 }
        }
        return undefined
      }
      case 'image/jpeg': {
        let offset = 2
        while (offset + 9 < data.length) {
          if (data[offset] !== 0xff) return undefined
          const marker = data[offset + 1] as number
          const length = view.getUint16(offset + 2)
          // SOF0..SOF15, except DHT (C4), JPG (C8) and DAC (CC)
          if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
            return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) }
          }
          offset += 2 + length
        }
        return undefined
      }
    }
  } catch {
    return undefined
  }
  return undefined
}

/** The type a file name says, from its extension (`report.docx`); `undefined` when unknown. */
export function typeFromName(name: string): string | undefined {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase()
  if (!extension) return undefined
  if (extension === 'jpeg') return 'image/jpeg'
  return Object.entries(EXTENSIONS).find(([, ext]) => ext === extension)?.[0]
}

/** A safe, unique storage key: `hello-world-3f9a2c1b.png`. */
export function storageKey(originalName: string, type: string, random: string): string {
  // Only the file name counts: clients may send paths like "C:\\photos\\a.png" or "../a.png".
  const name = originalName.split(/[\\/]/).pop() ?? ''
  const base =
    name
      .replace(/(?<=.)\.[^.]*$/, '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'file'
  return `${base}-${random}.${EXTENSIONS[type] ?? 'bin'}`
}

/**
 * Files in private folders have `.private` before the extension (`photo-3f9a2c1b.private.jpg`;
 * resized copies `photo-3f9a2c1b.private-thumbnail.jpg`). The public file route never serves
 * such names, whatever storage holds them.
 */
export function isPrivateKey(key: string): boolean {
  return /\.private[.-]/.test(key)
}

/** The name of a file once it is private, or public again. */
export function withPrivacy(key: string, isPrivate: boolean): string {
  const plain = key.replace(/\.private(?=\.[^.]+$)/, '')
  return isPrivate ? plain.replace(/\.([^.]+)$/, '.private.$1') : plain
}

/** The name of a resized copy: `photo-3f9a2c1b-thumbnail.jpg`. */
export function sizeKey(filename: string, size: string): string {
  return filename.replace(/\.([^.]+)$/, `-${size}.$1`)
}

/** What a private file name may look like in a URL. */
export const PRIVATE_KEY = /^[\p{L}\p{M}\p{N}-]+\.private(-[\p{L}\p{N}_-]+)?\.[a-z0-9]+$/u

/**
 * A content type with `charset=utf-8` for text (`text/*`, JSON, XML, JavaScript), so browsers
 * don't guess the encoding of an uploaded file. Others as they are.
 */
export function withCharset(type: string): string {
  if (/;\s*charset=/i.test(type)) return type
  const base = type.split(';')[0]?.trim().toLowerCase() ?? ''
  const text =
    base.startsWith('text/') ||
    /^application\/(json|xml|javascript|ecmascript)$/.test(base) ||
    /\+(json|xml)$/.test(base)
  return text ? `${type}; charset=utf-8` : type
}

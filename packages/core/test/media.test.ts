import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { imageDimensions, localStorage, mimeAllowed, sniffMimeType } from '../src/index.js'
import { storageKey } from '../src/media.js'

const image = async (format: 'png' | 'jpeg' | 'webp' | 'gif' | 'avif', width = 37, height = 21) =>
  new Uint8Array(
    await sharp({ create: { width, height, channels: 3, background: 'red' } })
      [format]()
      .toBuffer(),
  )
const text = (value: string) => new TextEncoder().encode(value)

describe('sniffMimeType', () => {
  it.each(['png', 'jpeg', 'webp', 'gif', 'avif'] as const)(
    'detects %s from its bytes',
    async (format) => {
      expect(sniffMimeType(await image(format))).toBe(`image/${format}`)
    },
  )

  it('detects PDF, SVG and plain text; rejects binary junk', () => {
    expect(sniffMimeType(text('%PDF-1.7\n...'))).toBe('application/pdf')
    expect(sniffMimeType(text('<?xml version="1.0"?>\n<!-- c --><svg xmlns="x"></svg>'))).toBe(
      'image/svg+xml',
    )
    expect(sniffMimeType(text('﻿  <svg width="1">'))).toBe('image/svg+xml')
    expect(sniffMimeType(text('<html><svg></svg></html>'))).toBe('text/plain')
    expect(sniffMimeType(text('สวัสดี'))).toBe('text/plain')
    expect(sniffMimeType(new Uint8Array([0, 1, 2, 3, 255]))).toBeUndefined()
  })

  it('tells CSV from plain text by the name only', () => {
    expect(sniffMimeType(text('name,price\nชา,30\n'), 'prices.CSV')).toBe('text/csv')
    expect(sniffMimeType(text('name,price\n'), 'notes.txt')).toBe('text/plain')
    // A binary file named .csv is still not text.
    expect(sniffMimeType(new Uint8Array([0, 1, 2]), 'a.csv')).toBeUndefined()
  })

  it('detects Office, OpenDocument and zip files from their entries', () => {
    const office = 'application/vnd.openxmlformats-officedocument'
    expect(sniffMimeType(zip({ '[Content_Types].xml': '<x/>', 'word/document.xml': '<w/>' }))).toBe(
      `${office}.wordprocessingml.document`,
    )
    expect(sniffMimeType(zip({ '[Content_Types].xml': '', 'xl/workbook.xml': '' }))).toBe(
      `${office}.spreadsheetml.sheet`,
    )
    expect(sniffMimeType(zip({ '[Content_Types].xml': '', 'ppt/presentation.xml': '' }))).toBe(
      `${office}.presentationml.presentation`,
    )
    expect(
      sniffMimeType(
        zip({ mimetype: 'application/vnd.oasis.opendocument.text', 'content.xml': '<x/>' }),
      ),
    ).toBe('application/vnd.oasis.opendocument.text')
    expect(sniffMimeType(zip({ 'readme.txt': 'hi' }))).toBe('application/zip')
    // An odd "mimetype" entry makes a plain zip, not whatever it claims.
    expect(sniffMimeType(zip({ mimetype: 'text/html' }))).toBe('application/zip')
  })

  it('detects audio and video', () => {
    const bytes = (...parts: (number[] | string)[]) =>
      new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...Buffer.from(p)] : p)))
    expect(sniffMimeType(bytes('ID3', [4, 0, 0, 0, 0, 0, 0]))).toBe('audio/mpeg')
    expect(sniffMimeType(bytes([0xff, 0xfb, 0x90, 0x64, 0, 0]))).toBe('audio/mpeg')
    expect(sniffMimeType(bytes('RIFF', [0, 0, 0, 0], 'WAVEfmt '))).toBe('audio/wav')
    expect(sniffMimeType(bytes('OggS', [0, 2, 0, 0]))).toBe('audio/ogg')
    expect(sniffMimeType(bytes([0, 0, 0, 0x20], 'ftypM4A ', [0, 0, 0, 0]))).toBe('audio/mp4')
    expect(sniffMimeType(bytes([0, 0, 0, 0x14], 'ftypqt  ', [0, 0, 0, 0]))).toBe('video/quicktime')
    expect(
      sniffMimeType(bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84], 'webm', [0x42, 0x87])),
    ).toBe('video/webm')
  })
})

/** A zip with stored (uncompressed) entries: local headers only, enough for detection. */
function zip(entries: Record<string, string>): Uint8Array {
  const parts: Buffer[] = []
  for (const [name, content] of Object.entries(entries)) {
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt32LE(Buffer.byteLength(content), 18)
    header.writeUInt32LE(Buffer.byteLength(content), 22)
    header.writeUInt16LE(Buffer.byteLength(name), 26)
    parts.push(header, Buffer.from(name), Buffer.from(content))
  }
  return new Uint8Array(Buffer.concat(parts))
}

describe('imageDimensions', () => {
  it.each(['png', 'jpeg', 'webp', 'gif'] as const)(
    'reads %s dimensions without decoding',
    async (format) => {
      const data = await image(format)
      expect(imageDimensions(data, `image/${format}`)).toEqual({ width: 37, height: 21 })
    },
  )

  it('handles lossless and extended WebP', async () => {
    const lossless = new Uint8Array(
      await sharp({ create: { width: 300, height: 5, channels: 4, background: 'red' } })
        .webp({ lossless: true })
        .toBuffer(),
    )
    expect(imageDimensions(lossless, 'image/webp')).toEqual({ width: 300, height: 5 })
  })

  it('returns undefined for truncated data', () => {
    expect(imageDimensions(new Uint8Array([0x89, 0x50]), 'image/png')).toBeUndefined()
    expect(imageDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg')).toBeUndefined()
  })
})

describe('mimeAllowed', () => {
  it('knows groups of types', () => {
    const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    expect(mimeAllowed(docx, ['documents'])).toBe(true)
    expect(mimeAllowed(docx, ['office'])).toBe(true)
    expect(mimeAllowed('text/csv', ['documents'])).toBe(true)
    expect(mimeAllowed('application/zip', ['documents'])).toBe(false)
    expect(mimeAllowed('application/zip', ['archives'])).toBe(true)
    expect(mimeAllowed('image/png', ['documents'])).toBe(false)
  })

  it('matches exact types and wildcards', () => {
    expect(mimeAllowed('image/png', ['image/*'])).toBe(true)
    expect(mimeAllowed('application/pdf', ['image/*', 'application/pdf'])).toBe(true)
    expect(mimeAllowed('text/plain', ['image/*', 'application/pdf'])).toBe(false)
  })
})

describe('storageKey', () => {
  it('keeps readable names in any script and uses the detected extension', () => {
    expect(storageKey('My Photo (1).JPG', 'image/png', 'abcd1234')).toBe('my-photo-1-abcd1234.png')
    expect(storageKey('รูปภาพ สวย.png', 'image/png', 'abcd1234')).toBe('รูปภาพ-สวย-abcd1234.png')
    expect(storageKey('../../etc/passwd', 'text/plain', 'abcd1234')).toBe('passwd-abcd1234.txt')
    expect(storageKey('C:\\photos\\cat.jpeg', 'image/jpeg', 'abcd1234')).toBe('cat-abcd1234.jpg')
    expect(storageKey('.env', 'text/plain', 'abcd1234')).toBe('env-abcd1234.txt')
    expect(storageKey('...', 'image/gif', 'abcd1234')).toBe('file-abcd1234.gif')
  })
})

describe('localStorage', () => {
  it('writes, reads and deletes inside its directory only', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'easy-cms-storage-'))
    const storage = localStorage({ dir: 'files' })
    storage.init?.({ cwd })
    await storage.put('a-1.txt', text('hello'), { contentType: 'text/plain' })
    expect(readdirSync(join(cwd, 'files'))).toEqual(['a-1.txt'])
    expect(new TextDecoder().decode((await storage.get('a-1.txt'))?.body)).toBe('hello')
    await expect(
      storage.put('a-1.txt', text('again'), { contentType: 'text/plain' }),
    ).rejects.toThrow()
    await expect(storage.get('../escape.txt')).rejects.toThrow('Invalid storage key')
    await storage.delete('a-1.txt')
    expect(await storage.get('a-1.txt')).toBeNull()
  })
})

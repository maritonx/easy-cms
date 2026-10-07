/** How much of a text file a preview reads. */
const LIMIT = 64 * 1024

/**
 * Decodes text: by its byte order mark (UTF-8, UTF-16), else UTF-8, else Windows-874 (Thai text
 * from Excel and older Windows programs).
 */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  try {
    // A character cut at the end of what was read is not an error.
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: true })
  } catch {
    return new TextDecoder('windows-874').decode(bytes)
  }
}

/** The start of a text file: at most 64 KB, without its last, maybe cut, line when there's more. */
export async function readTextStart(url: string): Promise<{ text: string; more: boolean }> {
  const response = await fetch(url, { credentials: 'same-origin' })
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let more = false
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.byteLength
    if (size >= LIMIT) {
      more = true
      await reader.cancel()
      break
    }
  }
  const bytes = new Uint8Array(Math.min(size, LIMIT))
  let offset = 0
  for (const chunk of chunks) {
    const part = chunk.subarray(0, bytes.length - offset)
    bytes.set(part, offset)
    offset += part.byteLength
    if (offset >= bytes.length) break
  }
  let text = decodeText(bytes)
  if (more) text = text.slice(0, Math.max(0, text.lastIndexOf('\n')))
  return { text, more }
}

/** Rows of CSV (quoted fields, `""` escapes); `;` when the first line has more of them than `,`. */
export function parseCsv(text: string): string[][] {
  const first = text.split('\n', 1)[0] ?? ''
  const count = (c: string) => first.split(c).length
  const separator = count(';') > count(',') ? ';' : count('\t') > count(',') ? '\t' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === separator) {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

// Turns the failing lines of a test run's output into GitHub annotations. Anyone can read
// annotations through the public API, while job logs need a login.
// Usage: node annotate-failures.mjs <output.log> [title]
import { readFileSync } from 'node:fs'

const [file, title = 'Test failure'] = process.argv.slice(2)
let text = ''
try {
  text = readFileSync(file, 'utf8')
} catch {
  console.log(`::error title=${title}::No test output at ${file}`)
  process.exit(0)
}
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping terminal colors
const lines = text.replace(/\u001b\[[0-9;]*m/g, '').split(/\r?\n/)
const failing =
  /(\bFAIL\b|×|✗|AssertionError|Error:|Unhandled|exited unexpectedly|Timed out|timeout)/i

const blocks = []
for (let i = 0; i < lines.length && blocks.length < 10; i++) {
  if (!failing.test(lines[i])) continue
  // The failing line and what follows it: the expected/received values or the stack.
  const block = lines
    .slice(i, i + 12)
    .join('\n')
    .trim()
  if (!blocks.some((b) => b.includes(lines[i].trim()))) blocks.push(block)
  i += 11
}
if (blocks.length === 0) blocks.push(lines.slice(-40).join('\n'))

const encode = (value) => value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
for (const block of blocks) console.log(`::error title=${title}::${encode(block.slice(0, 3000))}`)

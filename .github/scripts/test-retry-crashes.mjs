// Runs `pnpm turbo run test …`, and once more for the packages whose test worker crashed with
// 0xC0000005 (exit code 3221225477). libsql's Windows build crashes that way as a process exits,
// after the tests passed (https://github.com/tursodatabase/libsql-js/issues/231). A real
// failure fails again on the rerun, so it is still reported. Output goes to the terminal and is
// appended to the log for annotate-failures.mjs.
// Usage: node test-retry-crashes.mjs <output.log> [turbo arguments…]
import { spawn } from 'node:child_process'
import { appendFileSync } from 'node:fs'

const [log, ...args] = process.argv.slice(2)
const CRASH = '3221225477'

/** Runs turbo with these arguments; resolves to its exit code and output. */
function turbo(turboArgs) {
  return new Promise((resolve) => {
    const child = spawn('pnpm', ['turbo', 'run', 'test', ...turboArgs], {
      shell: process.platform === 'win32',
    })
    let output = ''
    const take = (chunk) => {
      const text = chunk.toString()
      output += text
      process.stdout.write(text)
      appendFileSync(log, text)
    }
    child.stdout.on('data', take)
    child.stderr.on('data', take)
    child.on('close', (code) => resolve({ code: code ?? 1, output }))
  })
}

const first = await turbo(args)
if (first.code === 0 || !first.output.includes(CRASH)) process.exit(first.code)

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping terminal colors
const plain = first.output.replace(/\u001b\[[0-9;]*m/g, '')
const failed = [...new Set([...plain.matchAll(/Failed:\s+(\S+)#test/g)].map((m) => m[1]))]
if (failed.length === 0) process.exit(first.code)

console.log(
  `::warning title=Test worker crashed (libsql-js#231)::Running the tests of ${failed.join(', ')} again`,
)
const kept = args.filter((a) => !a.startsWith('--filter'))
const again = await turbo([...kept, ...failed.map((name) => `--filter=${name}`)])
process.exit(again.code)

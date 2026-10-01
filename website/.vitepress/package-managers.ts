import type MarkdownIt from 'markdown-it'
import { PACKAGE_MANAGERS, translateCommands } from '../../packages/create-easy-cms/src/commands.ts'

/**
 * ```sh [pm]
 * npx easy-cms migrate
 * ```
 * becomes a code group with the command for npm, pnpm, Yarn and Bun, translated the way
 * create-easy-cms prints them. The theme keeps the chosen tab the same on every block.
 */
export function packageManagerTabs(source: string, file = 'page'): string {
  return source.replace(
    /^([ \t]*)(`{3,})(\w+) \[pm\]\n([\s\S]*?)\n\1\2[ \t]*$/gm,
    (_, indent: string, fence: string, lang: string, body: string) => {
      const code = body
        .split('\n')
        .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
        .join('\n')
      const blocks = PACKAGE_MANAGERS.map((pm) => {
        const translated = translateCommands(code, pm)
        if (translated === null)
          throw new Error(`${file}: a [pm] block has a command for npm only:\n${code}`)
        return `${fence}${lang} [${pm}]\n${translated}\n${fence}`
      })
      return [`::: code-group`, ...blocks, ':::']
        .join('\n\n')
        .split('\n')
        .map((line) => (line ? indent + line : line))
        .join('\n')
    },
  )
}

/** The markdown-it side: rewrites the source before it is parsed. */
export function packageManagerPlugin(md: MarkdownIt) {
  const parse = md.parse.bind(md)
  md.parse = (source, env: { relativePath?: string }) =>
    parse(packageManagerTabs(source, env?.relativePath), env)
}

/**
 * Prints Studio's Caddy site blocks, with its headers (`headers.ts`), for the server that hosts
 * easycms.dev: its Caddyfile imports them (`import studio.caddy`). The release workflow runs it.
 *
 *   node deploy/caddy.ts > studio.caddy   (Node 23.6+; on 22, add --experimental-strip-types)
 *
 * STUDIO_ORIGIN, SANDBOX_ORIGIN and ANALYTICS_ORIGINS (optional, comma-separated) say where;
 * the files are in /srv/studio.
 */
import { editorHeaders, type Origins, sandboxHeaders } from './headers.ts'

const origins: Origins = {
  studio: process.env.STUDIO_ORIGIN ?? 'https://studio.easycms.dev',
  sandbox: process.env.SANDBOX_ORIGIN ?? 'https://sandbox.easycms.dev',
  ...(process.env.ANALYTICS_ORIGINS
    ? { analytics: process.env.ANALYTICS_ORIGINS.split(',').map((o) => o.trim()) }
    : {}),
}

const header = (headers: Record<string, string>) =>
  Object.entries(headers)
    .map(([name, value]) => `\t\t${name} ${JSON.stringify(value)}`)
    .join('\n')

const site = (origin: string, headers: Record<string, string>) => `${new URL(origin).host} {
\tencode zstd gzip
\troot * /srv/studio
\theader {
${header(headers)}
\t\tcache-control "no-cache"
\t}
\t@assets path /assets/* /admin/assets/*
\theader @assets cache-control "public, max-age=31536000, immutable"
\tfile_server
}
`

process.stdout.write(
  `# Studio (Easy CMS repo, studio/deploy/caddy.ts), written by its release workflow.\n${site(
    origins.studio,
    editorHeaders(origins),
  )}\n${site(origins.sandbox, sandboxHeaders(origins))}`,
)

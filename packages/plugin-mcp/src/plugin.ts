import {
  type Config,
  EasyCMSError,
  type Endpoint,
  type Plugin,
  ValidationError,
} from '@easy-cms/core'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { buildTools, type ToolOptions } from './tools.js'

export interface McpPluginOptions extends ToolOptions {
  /** Path under the REST API. Default `/mcp`, so the server is at `/api/cms/mcp`. */
  readonly path?: string
  /** Name the assistant sees for this server. Default `easy-cms`. */
  readonly name?: string
  /** Extra guidance for the assistant, e.g. your house style. Added to the built-in notes. */
  readonly instructions?: string
}

const DEFAULT_INSTRUCTIONS = `Tools read and change the content of an Easy CMS site. Each collection has its own tools, named after it (find_posts, create_posts…), and only what this API key allows is listed.
- Collections with drafts: create and update save drafts that visitors don't see. Only publish_<collection> puts a document live; ask before publishing unless you were told to.
- Relationship and upload fields take document ids: find the related document first, or upload a file with upload_media.
- Rich text fields accept plain text (blank lines separate paragraphs).
- Deleting cannot be undone.`

/**
 * An MCP server (Streamable HTTP, stateless) for AI assistants such as Claude, Cursor or
 * ChatGPT. Clients authenticate with an Easy CMS API key and get tools for exactly what the
 * key allows. Needs `apiKeys: true`.
 */
export function mcpPlugin(options: McpPluginOptions = {}): Plugin {
  return (config: Config): Config => {
    if (!config.apiKeys)
      throw new Error('mcpPlugin: set `apiKeys: true`; assistants connect with an API key')
    const endpoint: Endpoint = {
      path: options.path ?? '/mcp',
      method: 'post',
      handler: async ({ request, user, cms }) => {
        if (!user?.apiKey) {
          return Response.json(
            { errors: [{ message: 'Connect with an API key: Authorization: Bearer ecms_…' }] },
            { status: 401, headers: { 'www-authenticate': 'Bearer' } },
          )
        }
        const tools = buildTools(cms, user, options)
        const server = new Server(
          { name: options.name ?? 'easy-cms', version: '1.0.0' },
          {
            capabilities: { tools: {} },
            instructions: options.instructions
              ? `${DEFAULT_INSTRUCTIONS}\n\n${options.instructions}`
              : DEFAULT_INSTRUCTIONS,
          },
        )
        server.setRequestHandler(ListToolsRequestSchema, async () => ({
          tools: tools.map(({ name, description, inputSchema }) => ({
            name,
            description,
            inputSchema: inputSchema as { type: 'object' },
          })),
        }))
        server.setRequestHandler(CallToolRequestSchema, async (call) => {
          const tool = tools.find((t) => t.name === call.params.name)
          if (!tool)
            return failure(`Unknown tool "${call.params.name}", or this API key may not use it`)
          try {
            const result = await tool.run((call.params.arguments ?? {}) as Record<string, unknown>)
            return { content: [{ type: 'text', text: JSON.stringify(result ?? null, null, 2) }] }
          } catch (error) {
            return failure(describe(error))
          }
        })
        // Stateless (no session id generator): a new server and transport per request, answered
        // with plain JSON.
        const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
        await server.connect(transport)
        try {
          return await transport.handleRequest(request)
        } finally {
          await server.close()
        }
      },
    }
    return { ...config, endpoints: [...(config.endpoints ?? []), endpoint] }
  }
}

function failure(text: string) {
  return { isError: true, content: [{ type: 'text' as const, text }] }
}

/** Messages the assistant can act on: field errors in full, other errors by message. */
function describe(error: unknown): string {
  if (error instanceof ValidationError)
    return `Invalid data: ${error.errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`
  if (error instanceof EasyCMSError) return error.message
  return `Failed: ${(error as Error).message ?? String(error)}`
}

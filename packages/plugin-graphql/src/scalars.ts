import { type ConstValueNode, GraphQLError, GraphQLScalarType, Kind, type ValueNode } from 'graphql'

/** A literal in a query as a plain value (objects and lists included). */
function literal(
  node: ValueNode | ConstValueNode,
  variables?: Record<string, unknown> | null,
): unknown {
  switch (node.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
    case Kind.ENUM:
      return node.value
    case Kind.INT:
    case Kind.FLOAT:
      return Number(node.value)
    case Kind.NULL:
      return null
    case Kind.LIST:
      return node.values.map((v) => literal(v, variables))
    case Kind.OBJECT:
      return Object.fromEntries(node.fields.map((f) => [f.name.value, literal(f.value, variables)]))
    case Kind.VARIABLE:
      return variables?.[node.name.value]
  }
}

/** Any JSON value: rich text documents, `json` fields, rows of blocks when writing. */
export const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Any JSON value: rich text documents (Tiptap JSON), json fields, block rows.',
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: (node, variables) => literal(node, variables),
})

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/

function isoDate(value: unknown): string {
  if (typeof value === 'string' && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value)))
    return value
  throw new GraphQLError(`Not an ISO 8601 date: ${JSON.stringify(value)}`)
}

/** A date and time as an ISO 8601 string, as Easy CMS stores them. */
export const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'A date and time as an ISO 8601 string, e.g. 2026-10-08T09:30:00.000Z.',
  serialize: (value) => (value instanceof Date ? value.toISOString() : value),
  parseValue: isoDate,
  parseLiteral: (node) => {
    if (node.kind !== Kind.STRING) throw new GraphQLError('DateTime must be a string')
    return isoDate(node.value)
  },
})

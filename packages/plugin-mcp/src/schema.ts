import type { Field } from '@easy-cms/core'

/** A JSON Schema, as MCP tools describe their input. */
export type JsonSchema = Record<string, unknown>

const text = (label: string | undefined, extra: JsonSchema = {}): JsonSchema => ({
  type: 'string',
  ...(label ? { description: label } : {}),
  ...extra,
})

/** English label of a field, as a hint for the model. */
function describe(field: Field): string | undefined {
  const label = field.label
  if (typeof label === 'string') return label
  return label?.en ?? Object.values(label ?? {})[0]
}

const RICH_TEXT_HINT =
  'Rich text: plain text (blank lines start new paragraphs) or a Tiptap JSON document { "type": "doc", "content": [...] }'

/** The JSON Schema of one field's value. */
export function fieldSchema(field: Field): JsonSchema {
  const label = describe(field)
  const hint = (extra: string) => (label ? `${label}. ${extra}` : extra)
  switch (field.type) {
    case 'text':
    case 'textarea':
      return text(label, {
        ...(field.minLength !== undefined ? { minLength: field.minLength } : {}),
        ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}),
      })
    case 'email':
      return text(label, { format: 'email' })
    case 'slug':
      return text(hint('URL slug; made from the title when left out'))
    case 'date':
      return text(hint('ISO 8601 date and time'), { format: 'date-time' })
    case 'number':
      return {
        type: 'number',
        ...(label ? { description: label } : {}),
        ...(field.min !== undefined ? { minimum: field.min } : {}),
        ...(field.max !== undefined ? { maximum: field.max } : {}),
      }
    case 'boolean':
      return { type: 'boolean', ...(label ? { description: label } : {}) }
    case 'select': {
      const values = field.options.map((o) => (typeof o === 'string' ? o : o.value))
      const one = { type: 'string', enum: values }
      return field.hasMany
        ? { type: 'array', items: one, ...(label ? { description: label } : {}) }
        : { ...one, ...(label ? { description: label } : {}) }
    }
    case 'json':
      return { ...(label ? { description: label } : {}) }
    case 'richText':
      return { description: hint(RICH_TEXT_HINT) }
    case 'upload': {
      const types = field.mimeTypes ? ` (${field.mimeTypes.join(', ')})` : ''
      const id = { type: ['integer', 'string'] }
      return field.hasMany
        ? {
            type: 'array',
            items: id,
            description: hint(`ids of media documents${types}, in order (see upload_media)`),
            ...(field.minRows !== undefined ? { minItems: field.minRows } : {}),
            ...(field.maxRows !== undefined ? { maxItems: field.maxRows } : {}),
          }
        : { ...id, description: hint(`id of a media document${types} (see upload_media)`) }
    }
    case 'relationship': {
      const id = { type: ['integer', 'string'] }
      const about = hint(`id of a document in "${field.to}"`)
      return field.hasMany
        ? {
            type: 'array',
            items: id,
            description: about,
            ...(field.minRows !== undefined ? { minItems: field.minRows } : {}),
            ...(field.maxRows !== undefined ? { maxItems: field.maxRows } : {}),
          }
        : { ...id, description: about }
    }
    case 'group':
      return { ...objectSchema(field.fields, false), ...(label ? { description: label } : {}) }
    case 'array':
      return {
        type: 'array',
        items: withRowId(objectSchema(field.fields, false)),
        ...(field.minRows !== undefined ? { minItems: field.minRows } : {}),
        ...(field.maxRows !== undefined ? { maxItems: field.maxRows } : {}),
        ...(label ? { description: label } : {}),
      }
    case 'blocks':
      return {
        type: 'array',
        description: hint('Rows of these kinds; set blockType on each'),
        items: {
          anyOf: field.blocks.map((block) => {
            const schema = withRowId(objectSchema(block.fields, false))
            return {
              ...schema,
              properties: { blockType: { const: block.slug }, ...(schema.properties as object) },
              required: ['blockType', ...((schema.required as string[] | undefined) ?? [])],
            }
          }),
        },
      }
  }
}

/** An object of fields. `required` lists required fields when `strict` (creating). */
export function objectSchema(fields: readonly Field[], strict: boolean): JsonSchema {
  const visible = fields.filter((f) => !f.hidden)
  const required = strict
    ? visible
        .filter((f) => f.required && f.defaultValue === undefined && f.type !== 'slug')
        .map((f) => f.name)
    : []
  return {
    type: 'object',
    properties: Object.fromEntries(visible.map((f) => [f.name, fieldSchema(f)])),
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  }
}

/** Rows keep their `id` when sent back (updating a list keeps the rows it had). */
function withRowId(schema: JsonSchema): JsonSchema {
  return {
    ...schema,
    properties: {
      id: { type: 'string', description: 'Row id; leave out for new rows' },
      ...(schema.properties as object),
    },
  }
}

type Data = Record<string, unknown>

/** Plain text for rich text fields becomes a Tiptap document; everything else stays as it is. */
export function prepareInput(fields: readonly Field[], data: Data): Data {
  const out: Data = { ...data }
  for (const field of fields) {
    const value = out[field.name]
    if (value === undefined || value === null) continue
    if (field.type === 'richText' && typeof value === 'string') out[field.name] = toDoc(value)
    else if (field.type === 'group' && typeof value === 'object')
      out[field.name] = prepareInput(field.fields, value as Data)
    else if (field.type === 'array' && Array.isArray(value))
      out[field.name] = value.map((row) =>
        typeof row === 'object' && row !== null ? prepareInput(field.fields, row as Data) : row,
      )
    else if (field.type === 'blocks' && Array.isArray(value))
      out[field.name] = value.map((row) => {
        const block = field.blocks.find((b) => b.slug === (row as Data)?.blockType)
        return block && typeof row === 'object' ? prepareInput(block.fields, row as Data) : row
      })
  }
  return out
}

/** Paragraphs split on blank lines; single line breaks become hard breaks. */
function toDoc(text: string) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  return {
    type: 'doc',
    content: paragraphs.map((paragraph) => {
      const lines = paragraph.split('\n')
      return {
        type: 'paragraph',
        content: lines.flatMap((line, i) => [
          ...(i > 0 ? [{ type: 'hardBreak' }] : []),
          ...(line ? [{ type: 'text', text: line }] : []),
        ]),
      }
    }),
  }
}

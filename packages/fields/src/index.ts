// Types only: field definitions are plain objects, so pages that import them stay light.
import type { FieldTypeDefinition } from '@easy-cms/core'

declare module '@easy-cms/core' {
  interface CustomFieldTypes {
    /** A color: `#rrggbb`, or `#rrggbbaa` with `alpha`. */
    color: {
      value: string
      options: {
        /** Colors offered as swatches, e.g. your brand's. */
        readonly presets?: readonly string[]
        /** Allow transparency (`#rrggbbaa`). Default false. */
        readonly alpha?: boolean
      }
    }
  }
}

const HEX = /^#[0-9a-f]{6}$/i
const HEX_ALPHA = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i

/**
 * `type: 'color'`: a color as `#rrggbb` (or `#rrggbbaa` with `alpha: true`), picked in the admin
 * with a color picker and swatches (`presets`), and shown as a swatch in lists.
 *
 * ```ts
 * import { color } from '@easy-cms/fields'
 *
 * fieldTypes: [color],
 * // fields: [{ name: 'brandColor', type: 'color', presets: ['#2f6f5e', '#e8a33d'] }]
 * ```
 */
export const color: FieldTypeDefinition = {
  name: 'color',
  base: 'text',
  validate: (value, { field }) => {
    const alpha = field.alpha === true
    if ((alpha ? HEX_ALPHA : HEX).test(String(value))) return true
    return alpha ? 'must be a color like #2f6f5e or #2f6f5e80' : 'must be a color like #2f6f5e'
  },
  checkOptions: (field) => {
    const presets = field.presets
    if (presets === undefined) return undefined
    const alpha = field.alpha === true
    if (!Array.isArray(presets) || presets.some((p) => !(alpha ? HEX_ALPHA : HEX).test(String(p))))
      return 'presets must be colors like #2f6f5e'
    return undefined
  },
  admin: {
    component: 'ecms-color-field',
    cell: 'ecms-color-cell',
    module: '@easy-cms/fields/admin',
    props: ['presets', 'alpha'],
  },
  typescript: 'string',
}

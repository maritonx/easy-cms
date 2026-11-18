// Below the excerpt: how long it is, and a button that fills it with the title.
// Built into admin/dist/components.js by `easy-cms build:admin` (see easy-cms.config.ts).
import type { AdminComponentProps } from '@easy-cms/core'
import './example-excerpt-tools.css'

export default function ExcerptTools({
  value,
  doc,
  options,
  readOnly,
  uiLocale,
  setField,
}: AdminComponentProps<string | null, { max: number }>) {
  return (
    <div className="tools">
      <span>
        {(value ?? '').length} / {options.max}
      </span>
      <button
        type="button"
        disabled={readOnly || !doc.title}
        onClick={() => setField('excerpt', String(doc.title ?? ''))}
      >
        {uiLocale === 'th' ? 'ใช้ชื่อเรื่อง' : 'Use the title'}
      </button>
    </div>
  )
}

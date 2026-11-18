import type { AdminComponentProps } from '@easy-cms/core'
import './acme-react-count.css'

export default function Count({ value, readOnly, change, setField }: AdminComponentProps<string>) {
  return (
    <label className="react-count">
      <input value={value ?? ''} disabled={readOnly} onChange={(e) => change(e.target.value)} />
      <button type="button" onClick={() => setField('meta.title', value)}>
        Copy
      </button>
      <span>{(value ?? '').length}</span>
    </label>
  )
}

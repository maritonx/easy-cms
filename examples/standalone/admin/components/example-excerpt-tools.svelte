<!--
  Below the excerpt: how long it is, and a button that fills it with the title.
  Built into admin/dist/components.js by `easy-cms build:admin` (see easy-cms.config.ts).
-->
<script lang="ts">
import type { AdminComponentProps } from '@easy-cms/core'

let {
  value,
  doc,
  options,
  readOnly,
  uiLocale,
  setField,
}: AdminComponentProps<string | null, { max: number }> = $props()
</script>

<div class="tools">
  <span>{(value ?? '').length} / {options.max}</span>
  <button
    type="button"
    disabled={readOnly || !doc.title}
    onclick={() => setField('excerpt', String(doc.title ?? ''))}
  >
    {uiLocale === 'th' ? 'ใช้ชื่อเรื่อง' : 'Use the title'}
  </button>
</div>

<style>
  .tools {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
  button {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    padding: 0.15rem 0.6rem;
    cursor: pointer;
  }
</style>

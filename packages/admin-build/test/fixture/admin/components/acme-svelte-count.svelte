<script lang="ts">
import type { AdminComponentProps } from '@easy-cms/core'

let { value, readOnly, change, navigate }: AdminComponentProps<string> = $props()
</script>

<label class="svelte-count">
  <input value={value ?? ''} disabled={readOnly} oninput={(e) => change(e.currentTarget.value)} />
  <a href="#posts" onclick={(e) => { e.preventDefault(); navigate('/collections/posts') }}>Posts</a>
  <span>{(value ?? '').length}</span>
</label>

<style>
  .svelte-count { text-decoration: underline; }
</style>

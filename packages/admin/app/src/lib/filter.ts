import { inject } from 'vue'
import { FORM } from './plugins'

/**
 * Query parameters that make the server apply a field's `filterOptions` for the document being
 * edited (`&filterFor=posts.category&filterId=3`), or `''` when the field has none.
 */
export function useFilterQuery(path: () => string | undefined): () => string {
  const form = inject(FORM, null)
  return () => {
    const fieldPath = path()
    if (!fieldPath || !form) return ''
    const params = new URLSearchParams(
      form.collection
        ? { filterFor: `${form.collection}.${fieldPath}` }
        : { filterForGlobal: `${form.global}.${fieldPath}` },
    )
    const id = form.id.value
    if (id !== null && id !== undefined) params.set('filterId', String(id))
    return `&${params}`
  }
}

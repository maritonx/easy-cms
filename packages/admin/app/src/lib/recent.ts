import { reactive, watch } from 'vue'

/** A document opened lately, for the command palette. */
export interface RecentDoc {
  to: string
  title: string
  /** Its collection's or global's name. */
  kind: string
}

const STORAGE = 'easy-cms-recent'
const MAX = 8

function load(): RecentDoc[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) ?? '[]')
    return Array.isArray(saved) ? saved.slice(0, MAX) : []
  } catch {
    return []
  }
}

export const recent = reactive<RecentDoc[]>(load())
watch(recent, (list) => {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(list))
  } catch {
    // Private mode: forgotten on reload.
  }
})

/** Puts a document first among the recent ones. */
export function remember(doc: RecentDoc) {
  const at = recent.findIndex((d) => d.to === doc.to)
  if (at !== -1) recent.splice(at, 1)
  recent.unshift(doc)
  if (recent.length > MAX) recent.splice(MAX)
}

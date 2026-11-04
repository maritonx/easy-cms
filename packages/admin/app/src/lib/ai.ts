import { ref } from 'vue'
import { api } from './api'

/** What the AI buttons need (#358): `GET /admin/ai/status`; `null` without an AI plugin. */
export interface AiStatus {
  connected: boolean
  features: string[]
  used: number
  limit: number
}

export const aiStatus = ref<AiStatus | null>(null)
let loading: Promise<void> | null = null

/** Reads the status once (again with `fresh`, e.g. after a request used one up). */
export function loadAiStatus(fresh = false): Promise<void> {
  if (loading && !fresh) return loading
  loading = api<AiStatus>('GET', '/admin/ai/status')
    .then((status) => {
      aiStatus.value = status
    })
    .catch(() => {
      // No AI plugin (404), or not signed in: no AI buttons.
      aiStatus.value = null
    })
  return loading
}

/** A feature's button shows: the feature is on and a provider is connected. */
export const aiFeature = (id: string) =>
  !!aiStatus.value?.connected && aiStatus.value.features.includes(id)

/** The user used today's requests up. */
export const aiSpent = () => !!aiStatus.value && aiStatus.value.used >= aiStatus.value.limit

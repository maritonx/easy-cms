import type { ScheduledPublish } from '@easy-cms/core'
import { api, type Doc, type Paginated, toQuery } from './api'

/**
 * What a document's status means to people (#303), worked out from what is stored: `draft` or
 * `published`, a pending draft of a published document, and pending scheduled jobs.
 */
export type ShownStatus =
  | { kind: 'draft' }
  | { kind: 'scheduled'; at: string }
  | { kind: 'published'; changed: boolean; publishAt?: string; unpublishAt?: string }

export type Job = ScheduledPublish & { collection?: string; doc: string | number }

/**
 * `live`: the document is published (on the site), even when what the admin shows is a pending
 * draft (`changed`). `jobs`: its pending scheduled publishes and unpublishes.
 */
export function shownStatus(
  live: boolean,
  changed: boolean,
  jobs: readonly Job[] = [],
): ShownStatus {
  const next = (action: Job['action']) =>
    jobs
      .filter((j) => j.action === action && j.state === 'pending')
      .map((j) => j.runAt)
      .sort()[0]
  if (!live) {
    const at = next('publish')
    return at ? { kind: 'scheduled', at } : { kind: 'draft' }
  }
  // A publish scheduled on a live document publishes its pending changes then.
  const publishAt = next('publish')
  const unpublishAt = next('unpublish')
  return {
    kind: 'published',
    changed,
    ...(publishAt ? { publishAt } : {}),
    ...(unpublishAt ? { unpublishAt } : {}),
  }
}

/**
 * Of these documents as the admin reads them (drafts included), the ids of drafts that also have
 * a live, published version: a pending draft of a published document.
 */
export async function liveIdsOf(collection: string, docs: readonly Doc[]): Promise<Set<string>> {
  const drafts = docs.filter((d) => d.status === 'draft').map((d) => d.id)
  if (drafts.length === 0) return new Set()
  const live = await api<Paginated<Doc>>(
    'GET',
    `/${collection}${toQuery({ where: { id: { in: drafts.join(',') } }, limit: drafts.length, depth: 0 })}`,
  )
  return new Set(live.docs.map((d) => String(d.id)))
}

/** The pending jobs of some documents of a collection (a list page), by id; `{}` without any. */
export async function loadSchedules(
  collection: string,
  ids: readonly (string | number)[],
): Promise<Map<string, Job[]>> {
  const out = new Map<string, Job[]>()
  if (ids.length === 0) return out
  const jobs = await api<Job[]>(
    'GET',
    `/admin/ui/scheduled?collection=${encodeURIComponent(collection)}&docs=${ids.map((id) => encodeURIComponent(String(id))).join(',')}`,
  ).catch(() => [] as Job[])
  for (const job of jobs) out.set(String(job.doc), [...(out.get(String(job.doc)) ?? []), job])
  return out
}

/** The ids of a collection's documents waiting to be published (the Scheduled filter), at most 500. */
export async function scheduledIds(collection: string): Promise<string[]> {
  const jobs = await api<Job[]>(
    'GET',
    `/admin/ui/scheduled?collection=${encodeURIComponent(collection)}`,
  )
  return [...new Set(jobs.filter((j) => j.action === 'publish').map((j) => String(j.doc)))]
}

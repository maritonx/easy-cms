<script setup lang="ts">
import type { AdminCollection } from '@easy-cms/core'
import { ArrowUpRight, CalendarClock, Plus } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { api, type Doc, type Paginated, toQuery } from '../lib/api'
import { counts, refreshCounts } from '../lib/counts'
import { titleOf } from '../lib/fields'
import { formatDate, label, locale, singularize, t } from '../lib/i18n'
import { collectionIcon } from '../lib/icons'
import { menuOrder } from '../lib/menu'
import { session } from '../lib/session'
import { settings } from '../lib/settings'

const collections = menuOrder(
  (session.schema?.collections ?? []).filter((c) => c.permissions.read),
  session.schema?.menu,
)
const hour = new Date().getHours()
const greeting = t(
  hour < 12 ? 'dashboard.morning' : hour < 18 ? 'dashboard.afternoon' : 'dashboard.evening',
)
const name = session.user?.name || session.user?.email || ''
/** Content people write: not the settings (users, API keys…) or the media library. */
const content = collections.filter((c) => c.group !== 'settings' && c.slug !== 'media')
// The shortcut creates in the main content collection: one with drafts, else the first.
const creatable =
  content.find((c) => c.permissions.create && c.drafts) ?? content.find((c) => c.permissions.create)

interface Entry {
  collection: AdminCollection
  doc: Doc
}
const recent = ref<Entry[] | null>(null)
const drafts = ref<Entry[] | null>(null)
interface Job {
  id: string | number
  action: 'publish' | 'unpublish'
  runAt: string
  collection?: string
  global?: string
  doc: string | number
  title?: string
}
const scheduled = ref<Job[] | null>(null)

const byUpdated = (a: Entry, b: Entry) =>
  String(b.doc.updatedAt ?? '').localeCompare(String(a.doc.updatedAt ?? ''))

async function latest(collection: AdminCollection, where?: unknown): Promise<Entry[]> {
  try {
    const result = await api<Paginated<Doc>>(
      'GET',
      `/${collection.slug}${toQuery({ where, sort: '-updatedAt', limit: 6, depth: 0, draft: true })}`,
    )
    return result.docs.map((doc) => ({ collection, doc }))
  } catch {
    return []
  }
}

async function loadScheduled() {
  try {
    const jobs = await api<Job[]>('GET', '/admin/scheduled')
    // Titles of the documents, so the list says what will be published.
    await Promise.all(
      jobs.map(async (job) => {
        if (job.global) {
          const g = session.schema?.globals.find((x) => x.slug === job.global)
          job.title = label(g?.label, job.global)
          return
        }
        const c = collections.find((x) => x.slug === job.collection)
        try {
          const doc = await api<Doc>('GET', `/${job.collection}/${job.doc}?depth=0&draft=true`)
          job.title = titleOf(c, doc)
        } catch {
          job.title = `#${job.doc}`
        }
      }),
    )
    scheduled.value = jobs
  } catch {
    scheduled.value = []
  }
}

onMounted(() => {
  void refreshCounts(true)
  void Promise.all(content.map((c) => latest(c))).then((lists) => {
    recent.value = lists.flat().sort(byUpdated).slice(0, 6)
  })
  const withDrafts = content.filter((c) => c.drafts)
  void Promise.all(withDrafts.map((c) => latest(c, { status: { equals: 'draft' } }))).then(
    (lists) => {
      drafts.value = lists.flat().sort(byUpdated).slice(0, 5)
    },
  )
  if (collections.some((c) => c.schedule) || session.schema?.globals.some((g) => g.schedule))
    void loadScheduled()
  else scheduled.value = []
})

const showScheduled = computed(() => scheduled.value !== null && scheduled.value.length > 0)
const day = (value: string) =>
  new Intl.DateTimeFormat(locale.value === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric' }).format(
    new Date(value),
  )
const month = (value: string) =>
  new Intl.DateTimeFormat(locale.value === 'th' ? 'th-TH' : 'en-GB', { month: 'short' }).format(
    new Date(value),
  )
const time = (value: string) =>
  new Intl.DateTimeFormat(locale.value === 'th' ? 'th-TH' : 'en-GB', { timeStyle: 'short' }).format(
    new Date(value),
  )
const statusOf = (doc: Doc) => (doc.status === 'published' ? 'published' : 'draft')
</script>

<template>
  <header class="page-header">
    <div>
      <h1>{{ greeting }}<template v-if="name">, {{ name }}</template></h1>
      <p class="muted">{{ t('dashboard.subtitle') }}</p>
    </div>
    <div class="header-actions">
      <a v-if="settings.siteUrl" :href="settings.siteUrl" class="btn" target="_blank" rel="noopener">
        <ArrowUpRight :size="16" aria-hidden="true" />
        {{ t('dashboard.viewSite') }}
      </a>
      <RouterLink v-if="creatable" :to="`/collections/${creatable.slug}/new`" class="btn btn-primary">
        <Plus :size="16" aria-hidden="true" />
        {{ t('edit.create', { label: label(creatable.labels?.singular, singularize(creatable.slug)) }) }}
      </RouterLink>
    </div>
  </header>

  <div class="tiles">
    <RouterLink v-for="c in collections" :key="c.slug" :to="`/collections/${c.slug}`" class="card tile">
      <span class="tile-label">
        <component :is="collectionIcon(c.icon)" :size="16" aria-hidden="true" />
        {{ label(c.labels?.plural, c.slug) }}
      </span>
      <span class="tile-row">
        <span class="tile-count">{{ counts[c.slug] ?? '…' }}</span>
        <span class="tile-more">{{ t('dashboard.viewAll') }}</span>
      </span>
      <span class="visually-hidden">{{ t('dashboard.documents', { count: counts[c.slug] ?? 0 }) }}</span>
    </RouterLink>
  </div>

  <div class="panels">
    <section class="card panel">
      <h2>{{ t('dashboard.recent') }}</h2>
      <p v-if="recent && recent.length === 0" class="empty muted">{{ t('dashboard.noRecent') }}</p>
      <ul v-else class="entries">
        <li v-for="entry in recent ?? []" :key="`${entry.collection.slug}-${entry.doc.id}`">
          <RouterLink :to="`/collections/${entry.collection.slug}/${entry.doc.id}`" class="entry">
            <span class="entry-icon" aria-hidden="true"><component :is="collectionIcon(entry.collection.icon)" :size="17" /></span>
            <span class="entry-text">
              <span class="entry-title">{{ titleOf(entry.collection, entry.doc) }}</span>
              <span class="entry-meta">
                {{ t('dashboard.editedAt', { label: label(entry.collection.labels?.singular, entry.collection.slug), date: formatDate(entry.doc.updatedAt) }) }}
              </span>
            </span>
            <span v-if="entry.collection.drafts" :class="['badge', `badge-${statusOf(entry.doc)}`]">
              {{ t(statusOf(entry.doc) === 'published' ? 'status.published' : 'status.draft') }}
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <div class="side">
      <section v-if="content.some((c) => c.drafts)" class="card panel">
        <h2>
          {{ t('dashboard.drafts') }}
          <span v-if="drafts?.length" class="count-badge">{{ drafts.length }}</span>
        </h2>
        <p v-if="drafts && drafts.length === 0" class="empty muted">{{ t('dashboard.noDrafts') }}</p>
        <ul v-else class="entries compact">
          <li v-for="entry in drafts ?? []" :key="`${entry.collection.slug}-${entry.doc.id}`" class="row">
            <span class="entry-text">
              <span class="entry-title">{{ titleOf(entry.collection, entry.doc) }}</span>
              <span class="entry-meta">{{ formatDate(entry.doc.updatedAt) }}</span>
            </span>
            <RouterLink :to="`/collections/${entry.collection.slug}/${entry.doc.id}`" class="btn btn-sm">
              {{ t('dashboard.review') }}
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="showScheduled" class="card panel">
        <h2>
          {{ t('dashboard.scheduled') }}
          <CalendarClock :size="16" class="faint" aria-hidden="true" />
        </h2>
        <ul class="entries compact">
          <li v-for="job in scheduled ?? []" :key="String(job.id)" class="row">
            <span class="date-chip" aria-hidden="true">
              <strong>{{ day(job.runAt) }}</strong>
              <span>{{ month(job.runAt) }}</span>
            </span>
            <RouterLink :to="job.global ? `/globals/${job.global}` : `/collections/${job.collection}/${job.doc}`" class="entry-text plain">
              <span class="entry-title">{{ job.title }}</span>
              <span class="entry-meta">
                {{ t(job.action === 'publish' ? 'schedule.publishOn' : 'schedule.unpublishOn', { date: time(job.runAt) }) }}
              </span>
            </RouterLink>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.page-header p {
  margin: 0.3rem 0 0;
}
.header-actions {
  display: flex;
  gap: 0.6rem;
}
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
}
.tile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.tile-more {
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 500;
}
.tile:hover .tile-more {
  background: var(--accent-soft);
  color: var(--accent-ink);
}
.tile {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 1.25rem;
  color: var(--text);
  text-decoration: none;
  transition: border-color 0.12s;
}
.tile:hover {
  border-color: var(--border-strong);
}
.tile-label {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--text-muted);
  font-size: 0.9rem;
}
.tile-count {
  font-size: 2rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.2;
}
.panels {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}
.side {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}
.panel {
  padding: 1rem 0 0.25rem;
  overflow: hidden;
}
.panel h2 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0 1.1rem 0.5rem;
  font-size: 0.95rem;
  font-weight: 600;
}
.empty {
  margin: 0;
  padding: 0.75rem 1.1rem 1rem;
  font-size: 0.9rem;
}
.entries {
  list-style: none;
  margin: 0;
  padding: 0;
}
.entries li {
  border-top: 1px solid var(--border);
}
.entry {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.7rem 1.1rem;
  color: var(--text);
  text-decoration: none;
}
.entry:hover {
  background: var(--surface-2);
}
.entry-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 9px;
  background: var(--surface-2);
  color: var(--text-muted);
}
.entry-text {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-width: 0;
  line-height: 1.35;
}
.entry-text.plain {
  color: var(--text);
  text-decoration: none;
}
.entry-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.entry-meta {
  color: var(--faint);
  font-size: 0.82rem;
}
.compact .row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 1.1rem;
}
.date-chip {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 10px;
  background: var(--info-soft);
  color: var(--info);
  font-size: 0.72rem;
  line-height: 1.1;
}
.date-chip strong {
  font-size: 1rem;
}
.faint {
  color: var(--faint);
}
.count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  height: 1.5rem;
  padding: 0 0.4rem;
  border-radius: 999px;
  background: var(--warning-soft);
  color: var(--warning-text);
  font-size: 0.8rem;
  font-weight: 600;
}
@media (max-width: 1000px) {
  .panels {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

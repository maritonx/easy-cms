<script setup lang="ts">
import type { AdminAttention, AdminCollection, AdminStatus } from '@easy-cms/core'
import { ArrowUpRight, CalendarClock, Plus, TriangleAlert } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import PluginElement from '../components/PluginElement.vue'
import { api, type Doc, type Paginated, toQuery } from '../lib/api'
import { counts, refreshCounts } from '../lib/counts'
import { titleOf } from '../lib/fields'
import { formatDate, label, locale, singularize, t } from '../lib/i18n'
import { collectionIcon } from '../lib/icons'
import { listed, menuOrder } from '../lib/menu'
import { session } from '../lib/session'
import { settings } from '../lib/settings'

const collections = menuOrder(
  (session.schema?.collections ?? []).filter((c) => c.permissions.read && listed(c)),
  session.schema?.menu,
)
/** Number tiles: content only, in menu order (users and other settings are in the menu). */
const tiles = collections.filter((c) => c.group !== 'settings')
/** Panels from `admin.dashboard`, e.g. a plugin's numbers: half width in the side column. */
const widgets = session.schema?.dashboard ?? []
const sideWidgets = widgets.filter((w) => w.width !== 'full')
const fullWidgets = widgets.filter((w) => w.width === 'full')
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
/** All drafts waiting, and where to see them: the collection with the most. */
const draftTotal = ref(0)
const draftsLink = ref('')
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

interface Latest {
  collection: AdminCollection
  entries: Entry[]
  total: number
}
async function latest(collection: AdminCollection, where?: unknown): Promise<Latest> {
  try {
    const result = await api<Paginated<Doc>>(
      'GET',
      `/${collection.slug}${toQuery({ where, sort: '-updatedAt', limit: 6, depth: 0, draft: true })}`,
    )
    return {
      collection,
      entries: result.docs.map((doc) => ({ collection, doc })),
      total: result.totalDocs,
    }
  } catch {
    return { collection, entries: [], total: 0 }
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

/** For admins and roles given it: the system and what needs attention (`GET <api>/admin/status`). */
const status = ref<AdminStatus | null>(null)
const views = session.schema?.views
async function loadStatus() {
  try {
    status.value = await api<AdminStatus>('GET', '/admin/status')
  } catch {
    status.value = null
  }
}

const DOCS = 'https://maritonx.github.io/easy-cms'
const ANCHORS: Record<AdminAttention['id'], string> = {
  webhooks: 'failed-webhooks',
  emails: 'emails-not-sent',
  scheduled: 'late-scheduled-publishing',
  'no-email': 'no-email',
  'no-server-url': 'no-serverurl',
  backups: 'backups',
  'failed-logins': 'failed-logins',
  'audit-failures': 'audit-log',
  'audit-tampered': 'audit-log',
}
/** An attention item as text, with where the docs explain the fix. */
function describe(item: AdminAttention) {
  const href = `${DOCS}${locale.value === 'th' ? '/th' : ''}/guide/health-checks#${ANCHORS[item.id]}`
  switch (item.id) {
    case 'webhooks':
      return {
        title: t('status.webhooks', { count: item.count }),
        detail: t('status.webhooksDetail', { url: item.url }),
        href,
        // In the admin: the deliveries page, with retry.
        ...(views?.deliveries ? { to: '/deliveries?kind=webhook' } : {}),
      }
    case 'emails':
      return {
        title: t('status.emails', { count: item.count }),
        detail: t('status.emailsDetail'),
        href,
        ...(views?.deliveries ? { to: '/deliveries?kind=email' } : {}),
      }
    case 'scheduled':
      return {
        title: t('status.scheduled', { count: item.count }),
        detail: t('status.scheduledDetail'),
        href,
      }
    case 'backups':
      return {
        title: t(item.failed ? 'status.backupFailed' : 'status.backupOverdue'),
        detail: item.lastDone
          ? t('status.backupLast', { date: formatDate(item.lastDone) })
          : t('status.backupNone'),
        href,
        ...(views?.backups ? { to: '/backups' } : {}),
      }
    case 'no-email':
      return { title: t('status.noEmail'), detail: t('status.noEmailDetail'), href }
    case 'no-server-url':
      return { title: t('status.noServerUrl'), detail: t('status.noServerUrlDetail'), href }
    case 'failed-logins':
      return {
        title: t('status.failedLogins', { count: item.count }),
        detail: t('status.failedLoginsDetail'),
        href,
        ...(views?.audit ? { to: '/audit?action=login' } : {}),
      }
    case 'audit-failures':
      return {
        title: t('status.auditFailures', { count: item.count }),
        detail: t('status.auditFailuresDetail'),
        href,
      }
    case 'audit-tampered':
      return {
        title: t('status.auditTampered', { count: item.invalid }),
        detail: t('status.auditTamperedDetail', { date: formatDate(item.at) }),
        href,
        ...(views?.audit ? { to: '/audit' } : {}),
      }
  }
}
const attention = computed(() => (status.value?.attention ?? []).map(describe))
const DATABASES: Record<string, string> = { sqlite: 'SQLite', postgres: 'PostgreSQL' }
const system = computed(() => {
  const s = status.value?.system
  if (!s) return null
  const named = s.plugins.filter((p) => p.name)
  return {
    version: s.version,
    database: DATABASES[s.database] ?? s.database,
    storage:
      s.storage === 'local' ? t('status.storageLocal') : s.storage === 's3' ? 'S3' : s.storage,
    email:
      s.email === null
        ? t('status.emailNone')
        : s.email === 'smtp'
          ? 'SMTP'
          : s.email === 'console'
            ? t('status.emailConsole')
            : s.email,
    plugins: named,
    unnamed: s.plugins.length - named.length,
    fieldTypes: s.fieldTypes,
  }
})

onMounted(() => {
  if (views?.status) void loadStatus()
  void refreshCounts(true)
  void Promise.all(content.map((c) => latest(c))).then((lists) => {
    recent.value = lists
      .flatMap((l) => l.entries)
      .sort(byUpdated)
      .slice(0, 6)
  })
  const withDrafts = content.filter((c) => c.drafts)
  void Promise.all(withDrafts.map((c) => latest(c, { status: { equals: 'draft' } }))).then(
    (lists) => {
      drafts.value = lists
        .flatMap((l) => l.entries)
        .sort(byUpdated)
        .slice(0, 5)
      draftTotal.value = lists.reduce((sum, l) => sum + l.total, 0)
      const most = lists.reduce<Latest | undefined>(
        (a, b) => (!a || b.total > a.total ? b : a),
        undefined,
      )
      draftsLink.value = most?.total ? `/collections/${most.collection.slug}?status=draft` : ''
    },
  )
  if (collections.some((c) => c.schedule) || session.schema?.globals.some((g) => g.schedule))
    void loadScheduled()
  else scheduled.value = []
})

const showScheduled = computed(() => scheduled.value !== null && scheduled.value.length > 0)
/** Without scheduled jobs or plugin panels, the main column takes the whole width. */
const sideEmpty = computed(() => !showScheduled.value && sideWidgets.length === 0 && !system.value)
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

  <!-- Content only, in menu order: the whole tile opens the list, + creates. -->
  <!-- Admins only, and only when something is wrong. -->
  <section v-if="attention.length" class="attention" aria-labelledby="attention-heading">
    <h2 id="attention-heading">
      <TriangleAlert :size="18" aria-hidden="true" />
      {{ t('status.attention') }}
    </h2>
    <ul>
      <li v-for="item in attention" :key="item.href">
        <strong>{{ item.title }}</strong>
        <span class="attention-detail">{{ item.detail }}</span>
        <RouterLink v-if="item.to" :to="item.to">{{ t('status.review') }}</RouterLink>
        <a v-else :href="item.href" target="_blank" rel="noopener">{{ t('status.howToFix') }}</a>
      </li>
    </ul>
  </section>

  <section class="tiles-section" aria-labelledby="tiles-heading">
    <h2 id="tiles-heading" class="section-label">{{ t('nav.collections') }}</h2>
    <div class="tiles">
      <div v-for="c in tiles" :key="c.slug" class="card tile">
        <RouterLink :to="`/collections/${c.slug}`" class="tile-link">
          <span class="tile-label">
            <component :is="collectionIcon(c.icon)" :size="16" aria-hidden="true" />
            {{ label(c.labels?.plural, c.slug) }}
          </span>
          <span class="tile-count" aria-hidden="true">{{ counts[c.slug] ?? '…' }}</span>
          <span class="visually-hidden">{{ t('dashboard.documents', { count: counts[c.slug] ?? 0 }) }}</span>
        </RouterLink>
        <!-- Media is created by uploading, in its list. -->
        <RouterLink
          v-if="c.permissions.create && c.slug !== 'media'"
          :to="`/collections/${c.slug}/new`"
          class="tile-add btn btn-ghost btn-icon btn-sm"
          :aria-label="t('edit.create', { label: label(c.labels?.singular, singularize(c.slug)) })"
        >
          <Plus :size="16" aria-hidden="true" />
        </RouterLink>
      </div>
    </div>
  </section>

  <!-- Left: what needs doing, then what changed. Right: schedule and plugin panels. -->
  <div :class="['panels', { single: sideEmpty }]">
    <div class="main-col">
      <section v-if="content.some((c) => c.drafts)" class="card panel">
        <h2>
          {{ t('dashboard.drafts') }}
          <span v-if="draftTotal" class="count-badge">{{ draftTotal }}</span>
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
        <RouterLink v-if="draftsLink && draftTotal > (drafts?.length ?? 0)" :to="draftsLink" class="panel-more">
          {{ t('dashboard.viewAllCount', { count: draftTotal }) }}
        </RouterLink>
      </section>


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
    </div>

    <div v-if="!sideEmpty" class="side">
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

      <section
        v-for="(widget, i) in sideWidgets"
        :key="`${i}-${widget.component.tag}`"
        class="card widget"
      >
        <PluginElement :component="widget.component" />
      </section>

      <!-- Admins only. -->
      <section v-if="system" class="card panel system" aria-labelledby="system-heading">
        <h2 id="system-heading">{{ t('status.system') }}</h2>
        <dl>
          <dt>Easy CMS</dt>
          <dd>{{ system.version }}</dd>
          <dt>{{ t('status.database') }}</dt>
          <dd>{{ system.database }}</dd>
          <dt>{{ t('status.files') }}</dt>
          <dd>{{ system.storage }}</dd>
          <dt>{{ t('status.email') }}</dt>
          <dd>{{ system.email }}</dd>
        </dl>
        <template v-if="system.plugins.length || system.unnamed">
          <h3>{{ t('status.plugins') }}</h3>
          <ul class="plugins">
            <li v-for="plugin in system.plugins" :key="plugin.name">
              <code>{{ plugin.name }}</code>
              <span v-if="plugin.version" class="muted">{{ plugin.version }}</span>
            </li>
            <li v-if="system.unnamed" class="muted">{{ t('status.unnamed', { count: system.unnamed }) }}</li>
          </ul>
        </template>
        <p v-if="system.fieldTypes.length" class="field-types">
          {{ t('status.fieldTypes') }}: <code v-for="name in system.fieldTypes" :key="name">{{ name }}</code>
        </p>
      </section>
    </div>
  </div>

  <div v-if="fullWidgets.length" class="widgets">
    <section
      v-for="(widget, i) in fullWidgets"
      :key="`${i}-${widget.component.tag}`"
      class="card widget"
    >
      <PluginElement :component="widget.component" />
    </section>
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
.tiles-section {
  margin-bottom: 1.25rem;
}
.section-label {
  margin: 0 0 0.6rem;
  color: var(--faint);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 0.75rem;
}
.tile {
  position: relative;
  transition: border-color 0.12s;
}
/* The whole tile opens the list; the + button sits above that. */
.tile-link {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-sizing: border-box;
  height: 100%;
  gap: 0.45rem;
  padding: 1rem 1.1rem 1.1rem;
  color: var(--text);
  text-decoration: none;
  border-radius: inherit;
}
.tile-link::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
}
.tile-link:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.tile-add {
  position: absolute;
  top: 0.55rem;
  right: 0.55rem;
  z-index: 1;
}
.tile:hover {
  border-color: var(--border-strong);
}
.tile-label {
  /* Room for the + button. */
  padding-right: 1.75rem;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--text-muted);
  font-size: 0.9rem;
}
.tile-count {
  font-size: 1.75rem;
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
.panels.single {
  grid-template-columns: minmax(0, 1fr);
}
.main-col {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
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
.widgets {
  display: grid;
  gap: 1rem;
  margin-top: 1rem;
}
.widget {
  padding: 1rem 1.1rem;
  min-width: 0;
}
.panel-more {
  display: block;
  padding: 0.65rem 1.1rem 0.75rem;
  border-top: 1px solid var(--border);
  color: var(--accent-ink);
  font-size: 0.875rem;
  font-weight: 500;
  text-decoration: none;
}
.panel-more:hover {
  text-decoration: underline;
}
.attention {
  margin-bottom: 1.25rem;
  padding: 0.9rem 1.1rem;
  border: 1px solid color-mix(in srgb, var(--warning-text) 30%, transparent);
  border-radius: var(--radius);
  background: var(--warning-soft);
}
.attention h2 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.6rem;
  color: var(--warning-text);
  font-size: 0.95rem;
  font-weight: 600;
}
.attention ul {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.attention li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.75rem;
  font-size: 0.9rem;
}
.attention strong {
  font-weight: 600;
}
.attention-detail {
  color: var(--text-muted);
  overflow-wrap: anywhere;
}
.attention a {
  margin-left: auto;
  color: var(--warning-text);
  font-weight: 500;
}
.system dl {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.35rem 1rem;
  margin: 0;
  padding: 0 1.1rem 0.75rem;
  font-size: 0.875rem;
}
.system dt {
  color: var(--faint);
}
.system dd {
  margin: 0;
}
.system h3 {
  margin: 0.25rem 1.1rem 0.4rem;
  color: var(--faint);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.plugins {
  margin: 0;
  padding: 0 1.1rem 0.75rem;
  list-style: none;
  font-size: 0.85rem;
}
.plugins li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.15rem 0;
}
.plugins code,
.field-types code {
  overflow-wrap: anywhere;
}
.field-types {
  margin: 0;
  padding: 0 1.1rem 0.9rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.field-types code + code::before {
  content: ', ';
}
@media (max-width: 1000px) {
  .panels {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

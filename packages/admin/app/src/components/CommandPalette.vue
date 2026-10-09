<script setup lang="ts">
import type { SearchHit } from '@easy-cms/core'
import {
  Clock,
  FileText,
  Keyboard,
  Languages,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeft,
  Plus,
  Search,
  Sun,
  User,
} from '@lucide/vue'
import { type Component, computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../lib/api'
import { label, locale, setLocale, t } from '../lib/i18n'
import { collectionIcon } from '../lib/icons'
import { crumbsFor, entryOf, flatten, navState } from '../lib/nav'
import { recent } from '../lib/recent'
import { logout, session } from '../lib/session'
import { modKey, overlays } from '../lib/shortcuts'
import { setTheme, themeMode } from '../lib/theme'

/**
 * ⌘K: go anywhere, create, find documents by title, reopen recent ones and run commands, all from
 * the keyboard (a combobox over a list of options).
 */
interface Option {
  id: string
  section: 'goto' | 'create' | 'docs' | 'recent' | 'commands'
  label: string
  hint?: string
  icon: Component
  to?: string
  run?: () => void | Promise<void>
}

const router = useRouter()
const query = ref('')
const active = ref(0)
const input = ref<HTMLInputElement>()
const hits = ref<SearchHit[]>([])
const searching = ref(false)
let returnFocus: HTMLElement | null = null

const SECTIONS: Record<Option['section'], Parameters<typeof t>[0]> = {
  goto: 'palette.goto',
  create: 'palette.create',
  docs: 'palette.docs',
  recent: 'palette.recent',
  commands: 'palette.commands',
}

const match = (text: string, q: string) => text.toLocaleLowerCase().includes(q.toLocaleLowerCase())

const options = computed<Option[]>(() => {
  const q = query.value.trim()
  const schema = session.schema
  const out: Option[] = []
  // Go to: every menu entry, the dashboard and the account.
  const places: Option[] = [
    { id: 'go:/', section: 'goto', label: t('nav.dashboard'), icon: LayoutDashboard, to: '/' },
    ...flatten().flatMap(({ item }) => {
      const entry = entryOf(item)
      if (!entry) return []
      const crumbs = crumbsFor(entry.to).join(' › ')
      return [
        {
          id: `go:${entry.to}`,
          section: 'goto' as const,
          label: entry.label,
          hint: crumbs,
          icon: entry.icon,
          to: entry.to,
        },
      ]
    }),
    { id: 'go:/account', section: 'goto', label: t('nav.account'), icon: User, to: '/account' },
  ]
  if (!q) {
    out.push(
      ...recent.map((r, i) => ({
        id: `recent:${i}`,
        section: 'recent' as const,
        label: r.title,
        hint: r.kind,
        icon: Clock,
        to: r.to,
      })),
    )
    out.push(...places.slice(0, 6))
  } else {
    out.push(...places.filter((p) => match(p.label, q) || (p.hint && match(p.hint, q))))
    for (const c of schema?.collections ?? []) {
      if (!c.permissions.create || c.slug === 'media-folders') continue
      const name = label(c.labels?.singular, c.slug)
      if (match(name, q) || match(label(c.labels?.plural, c.slug), q) || match(t('palette.new'), q))
        out.push({
          id: `new:${c.slug}`,
          section: 'create',
          label: t('nav.create', { name }),
          icon: Plus,
          to: `/collections/${c.slug}/new`,
        })
    }
    for (const hit of hits.value) {
      const c = schema?.collections.find((x) => x.slug === hit.collection)
      out.push({
        id: `doc:${hit.collection}:${hit.id}`,
        section: 'docs',
        label: hit.title,
        hint: [
          label(c?.labels?.singular, hit.collection),
          hit.status === 'draft' || hit.status === 'published' ? t(`status.${hit.status}`) : '',
        ]
          .filter(Boolean)
          .join(' · '),
        icon: c ? collectionIcon(c.icon) : FileText,
        to: `/collections/${hit.collection}/${hit.id}`,
      })
    }
  }
  const commands: Option[] = [
    ...(schema?.commands ?? []).map((c, i) => ({
      id: `cmd:${i}`,
      section: 'commands' as const,
      label: label(c.label, c.href),
      icon: collectionIcon(c.icon),
      to: c.href,
      keywords: c.keywords,
    })),
    {
      id: 'cmd:theme',
      section: 'commands',
      label: themeMode.value === 'dark' ? t('palette.light') : t('palette.dark'),
      icon: themeMode.value === 'dark' ? Sun : Moon,
      run: () => setTheme(themeMode.value === 'dark' ? 'light' : 'dark'),
    },
    {
      id: 'cmd:language',
      section: 'commands',
      label: t('palette.language'),
      icon: Languages,
      run: () => setLocale(locale.value === 'th' ? 'en' : 'th'),
    },
    {
      id: 'cmd:rail',
      section: 'commands',
      label: navState.rail ? t('nav.expand') : t('nav.collapse'),
      icon: PanelLeft,
      run: () => {
        navState.rail = !navState.rail
      },
    },
    {
      id: 'cmd:help',
      section: 'commands',
      label: t('shortcuts.title'),
      icon: Keyboard,
      run: () => {
        overlays.help = true
      },
    },
    {
      id: 'cmd:logout',
      section: 'commands',
      label: t('nav.logout'),
      icon: LogOut,
      run: async () => {
        await logout()
        await router.push({ name: 'login' })
      },
    },
  ]
  out.push(
    ...commands.filter(
      (c) =>
        !q ||
        match(c.label, q) ||
        ((c as { keywords?: readonly string[] }).keywords ?? []).some((k) => match(k, q)),
    ),
  )
  return out
})

/** Options grouped by section, in the order they are listed. */
const sections = computed(() => {
  const list: { section: Option['section']; options: { option: Option; index: number }[] }[] = []
  options.value.forEach((option, index) => {
    let group = list.find((s) => s.section === option.section)
    if (!group) {
      group = { section: option.section, options: [] }
      list.push(group)
    }
    group.options.push({ option, index })
  })
  return list
})

// Documents by title, a moment after typing stops.
let timer: ReturnType<typeof setTimeout> | undefined
let asked = 0
watch(query, (q) => {
  active.value = 0
  clearTimeout(timer)
  const text = q.trim()
  if (text.length < 2 && !/^\d+$/.test(text)) {
    hits.value = []
    searching.value = false
    return
  }
  searching.value = true
  timer = setTimeout(async () => {
    const ask = ++asked
    try {
      const result = await api<{ docs: SearchHit[] }>(
        'GET',
        `/admin/search?q=${encodeURIComponent(text)}`,
      )
      if (ask === asked) hits.value = result.docs
    } catch {
      if (ask === asked) hits.value = []
    } finally {
      if (ask === asked) searching.value = false
    }
  }, 180)
})

watch(
  () => overlays.palette,
  async (open) => {
    if (open) {
      returnFocus = document.activeElement as HTMLElement | null
      query.value = ''
      hits.value = []
      active.value = 0
      await nextTick()
      input.value?.focus()
    } else returnFocus?.focus?.()
  },
)
onBeforeUnmount(() => clearTimeout(timer))

function close() {
  overlays.palette = false
}

async function choose(option: Option | undefined, newTab = false) {
  if (!option) return
  if (option.to && newTab) {
    window.open(router.resolve(option.to).href, '_blank', 'noopener')
    return
  }
  close()
  if (option.run) await option.run()
  else if (option.to) await router.push(option.to)
}

function onKey(event: KeyboardEvent) {
  const count = options.value.length
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = count ? (active.value + 1) % count : 0
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = count ? (active.value - 1 + count) % count : 0
  } else if (event.key === 'Home') {
    active.value = 0
  } else if (event.key === 'End') {
    active.value = Math.max(0, count - 1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    void choose(options.value[active.value], event.metaKey || event.ctrlKey)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    close()
  } else if (event.key === 'Tab') {
    // The dialog has one control: keep focus in it.
    event.preventDefault()
  }
}

watch(active, async () => {
  await nextTick()
  document.getElementById(`palette-${active.value}`)?.scrollIntoView({ block: 'nearest' })
})

/** The query in a label, marked. */
function parts(text: string): { text: string; mark: boolean }[] {
  const q = query.value.trim()
  if (!q) return [{ text, mark: false }]
  const at = text.toLocaleLowerCase().indexOf(q.toLocaleLowerCase())
  if (at === -1) return [{ text, mark: false }]
  return [
    { text: text.slice(0, at), mark: false },
    { text: text.slice(at, at + q.length), mark: true },
    { text: text.slice(at + q.length), mark: false },
  ].filter((p) => p.text)
}
</script>

<template>
  <div v-if="overlays.palette" class="palette-layer" @pointerdown.self="close">
    <div class="palette" role="dialog" aria-modal="true" :aria-label="t('palette.title')">
      <label class="palette-input">
        <Search :size="20" aria-hidden="true" />
        <input
          ref="input"
          v-model="query"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="options.length > 0"
          aria-controls="palette-list"
          :aria-activedescendant="options.length ? `palette-${active}` : undefined"
          :placeholder="t('palette.placeholder')"
          :aria-label="t('palette.title')"
          autocomplete="off"
          spellcheck="false"
          @keydown="onKey"
        />
        <button type="button" class="palette-close" @click="close">
          <kbd>Esc</kbd>
          <span class="sr">{{ t('nav.close') }}</span>
        </button>
      </label>
      <div id="palette-list" role="listbox" class="palette-list" :aria-label="t('palette.title')">
        <template v-for="group in sections" :key="group.section">
          <div class="palette-section" role="presentation">{{ t(SECTIONS[group.section]) }}</div>
          <div
            v-for="{ option, index } in group.options"
            :id="`palette-${index}`"
            :key="option.id"
            role="option"
            class="palette-option"
            :class="{ active: index === active }"
            :aria-selected="index === active"
            @pointermove="active = index"
            @click="choose(option, $event.metaKey || $event.ctrlKey)"
          >
            <component :is="option.icon" :size="18" aria-hidden="true" class="palette-icon" />
            <span class="palette-label">
              <template v-for="(p, i) in parts(option.label)" :key="i"><mark v-if="p.mark">{{ p.text }}</mark><template v-else>{{ p.text }}</template></template>
            </span>
            <span v-if="option.hint" class="palette-hint">{{ option.hint }}</span>
          </div>
        </template>
        <p v-if="!options.length && !searching" class="palette-empty">{{ t('palette.none') }}</p>
        <p v-if="searching" class="palette-empty" aria-live="polite">{{ t('palette.searching') }}</p>
      </div>
      <div class="palette-foot" aria-hidden="true">
        <span><kbd>↑</kbd> <kbd>↓</kbd> {{ t('palette.move') }}</span>
        <span><kbd>↵</kbd> {{ t('palette.open') }}</span>
        <span><kbd>{{ modKey() }} ↵</kbd> {{ t('palette.newTab') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.palette-layer {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12vh 1rem 1rem;
  background: rgb(24 24 27 / 45%);
}
.palette {
  width: min(40rem, 100%);
  max-height: 76vh;
  display: flex;
  flex-direction: column;
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
  overflow: hidden;
}
.palette-input {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0 0.75rem 0 1rem;
  min-height: 3.5rem;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
}
.palette-input input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: none;
  color: var(--text);
  font: inherit;
  font-size: 1.05rem;
}
.palette-close {
  border: 0;
  background: none;
  padding: 0.25rem;
  cursor: pointer;
}
kbd {
  font: inherit;
  font-size: 0.75rem;
  padding: 0.05rem 0.4rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--text-muted);
}
.palette-list {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 0.5rem;
}
.palette-section {
  padding: 0.7rem 1rem 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--faint);
}
.palette-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 2.75rem;
  padding: 0 1rem;
  color: var(--text);
  cursor: pointer;
}
.palette-option.active {
  background: var(--accent-soft);
  box-shadow: inset 3px 0 0 var(--accent);
}
.palette-icon {
  flex-shrink: 0;
  color: var(--text-muted);
}
.palette-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.palette-label mark {
  background: none;
  color: var(--accent-ink);
  font-weight: 700;
}
.palette-hint {
  margin-left: auto;
  flex-shrink: 0;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.palette-empty {
  margin: 0;
  padding: 1rem;
  color: var(--text-muted);
}
.palette-foot {
  display: flex;
  gap: 1rem;
  padding: 0.6rem 1rem;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
  font-size: 0.75rem;
  color: var(--text-muted);
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
@media (max-width: 640px) {
  .palette-layer {
    padding: 0;
  }
  .palette {
    width: 100%;
    max-height: none;
    height: 100%;
    border-radius: 0;
  }
  .palette-foot {
    display: none;
  }
}
</style>

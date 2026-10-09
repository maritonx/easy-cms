<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api, type Doc, type Paginated, toQuery } from '../lib/api'
import { label, t } from '../lib/i18n'
import { session } from '../lib/session'

/**
 * Deleting users who own documents (`auth.rbac`): what they own, and who gets it. Confirms with
 * the query to add to the DELETE: `?transferTo=<id>`, or `?transferTo=none` for nobody.
 */
const props = defineProps<{
  open: boolean
  userIds: readonly (number | string)[]
  message: string
}>()
const emit = defineEmits<{ confirm: [query: string]; cancel: [] }>()
const dialog = ref<HTMLDialogElement>()

const owned = ref<{ collection: string; count: number }[]>([])
const users = ref<Doc[]>([])
const to = ref('')
const loading = ref(false)

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      dialog.value?.close()
      return
    }
    to.value = ''
    loading.value = true
    dialog.value?.showModal()
    try {
      const totals = new Map<string, number>()
      for (const id of props.userIds) {
        const list = await api<{ collection: string; count: number }[]>(
          'GET',
          `/admin/ui/owned/${id}`,
        )
        for (const row of list)
          totals.set(row.collection, (totals.get(row.collection) ?? 0) + row.count)
      }
      owned.value = [...totals].map(([collection, count]) => ({ collection, count }))
      if (owned.value.length > 0) {
        const leaving = new Set(props.userIds.map(String))
        const result = await api<Paginated<Doc>>(
          'GET',
          `/users${toQuery({ limit: 100, depth: 0, sort: 'email', where: { active: { not_equals: false } } })}`,
        )
        users.value = result.docs.filter((u) => !leaving.has(String(u.id)))
      }
    } finally {
      loading.value = false
    }
  },
)

const total = computed(() => owned.value.reduce((n, row) => n + row.count, 0))
const summary = computed(() =>
  owned.value
    .map((row) => {
      const c = session.schema?.collections.find((x) => x.slug === row.collection)
      return `${label(c?.labels?.plural, row.collection)} ${row.count}`
    })
    .join(', '),
)
function confirm() {
  if (owned.value.length === 0) emit('confirm', '')
  else emit('confirm', `?transferTo=${to.value ? encodeURIComponent(to.value) : 'none'}`)
}
</script>

<template>
  <dialog ref="dialog" class="dialog card" :aria-label="t('users.transferTitle')" @cancel.prevent="emit('cancel')">
    <p>{{ message }}</p>
    <template v-if="!loading && owned.length">
      <h2>{{ t('users.transferTitle') }}</h2>
      <p class="muted">
        {{
          userIds.length === 1
            ? t('users.transferText', { who: t('users.thisUser'), list: summary })
            : t('users.transferBulk', { count: total })
        }}
      </p>
      <div class="field">
        <label class="field-label" for="transfer-to">{{ t('users.transferTo') }}</label>
        <select id="transfer-to" v-model="to" class="input">
          <option value="">{{ t('users.transferNone') }}</option>
          <option v-for="u in users" :key="String(u.id)" :value="String(u.id)">
            {{ u.name ? `${u.name} (${u.email})` : u.email }}
          </option>
        </select>
      </div>
    </template>
    <div class="actions">
      <button type="button" class="btn" @click="emit('cancel')">{{ t('common.cancel') }}</button>
      <button type="button" class="btn btn-danger" :disabled="loading" @click="confirm">
        {{ t('edit.delete') }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.dialog {
  width: min(28rem, calc(100vw - 2rem));
  padding: 1.25rem;
  color: var(--text);
  box-shadow: var(--shadow);
}
.dialog::backdrop {
  background: rgb(0 0 0 / 35%);
}
.dialog p {
  margin: 0 0 1rem;
}
h2 {
  margin: 0 0 0.35rem;
  font-size: 1rem;
}
.field {
  margin-bottom: 1.25rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>

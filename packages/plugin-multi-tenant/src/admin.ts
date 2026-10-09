/**
 * Members (`ecms-tenant-members`, from `admin.pages`): the people in the chosen tenant and their
 * role there; add someone by email, change a role, remove. Reads and writes
 * `<api>/tenant-members`. Plain DOM, no framework; styles use the admin's CSS variables.
 */

type Api = (method: string, path: string, body?: unknown) => Promise<unknown>

interface Member {
  id: string | number
  email: string
  name: string | null
  role: string
}
interface Members {
  members: Member[]
  roles: { key: string; name: string }[]
  invites: boolean
}

const MESSAGES = {
  en: {
    lead: 'People who work in this tenant, and their role here. An account can belong to several tenants.',
    email: 'Email',
    name: 'Name',
    role: 'Role',
    actions: 'Actions',
    remove: 'Remove',
    removeConfirm: 'Remove {email} from this tenant? Their account stays.',
    add: 'Add member',
    adding: 'Adding…',
    added: '{email} was added.',
    invited: '{email} was added and emailed a link to set a password.',
    addedNoEmail:
      '{email} was added. Email is not set up, so send them a password link from Users.',
    none: 'No members yet.',
    loading: 'Loading…',
    failed: "Couldn't load the members.",
    choose: 'Choose a tenant at the top of the menu to see its members.',
    you: 'you',
  },
  th: {
    lead: 'คนที่ทำงานใน tenant นี้และบทบาทของแต่ละคน บัญชีหนึ่งอยู่ได้หลาย tenant',
    email: 'อีเมล',
    name: 'ชื่อ',
    role: 'บทบาท',
    actions: 'การทำงาน',
    remove: 'นำออก',
    removeConfirm: 'นำ {email} ออกจาก tenant นี้ไหม บัญชีของเขายังอยู่',
    add: 'เพิ่มสมาชิก',
    adding: 'กำลังเพิ่ม…',
    added: 'เพิ่ม {email} แล้ว',
    invited: 'เพิ่ม {email} แล้ว และส่งลิงก์ตั้งรหัสผ่านทางอีเมลแล้ว',
    addedNoEmail: 'เพิ่ม {email} แล้ว ยังไม่ได้ตั้งค่าอีเมล ส่งลิงก์ตั้งรหัสผ่านจากหน้าผู้ใช้แทน',
    none: 'ยังไม่มีสมาชิก',
    loading: 'กำลังโหลด…',
    failed: 'โหลดรายชื่อสมาชิกไม่สำเร็จ',
    choose: 'เลือก tenant ที่ด้านบนของเมนูเพื่อดูสมาชิก',
    you: 'คุณ',
  },
} as const
type Key = keyof (typeof MESSAGES)['en']

const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )

const STYLE = `
  :host { display: block; font: inherit; color: var(--text); }
  [hidden] { display: none !important; }
  p { margin: 0 0 1rem; }
  .muted { color: var(--text-muted); }
  .card { border: 1px solid var(--border); border-radius: var(--radius, 12px); background: var(--surface); overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th { text-align: left; font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.02em; }
  th, td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tr:last-child td { border-bottom: 0; }
  form { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: flex-end; margin: 1.25rem 0 0.5rem; }
  label { display: grid; gap: 0.25rem; font-size: 0.8rem; color: var(--text-muted); }
  input, select {
    min-height: 2.25rem; padding: 0 0.6rem; border: 1px solid var(--border-strong); border-radius: var(--radius-sm, 8px);
    background: var(--surface); color: var(--text); font: inherit; font-size: 0.9rem;
  }
  input { min-width: 16rem; }
  button {
    min-height: 2.25rem; padding: 0 0.9rem; border: 1px solid var(--border-strong); border-radius: var(--radius-sm, 8px);
    background: var(--surface); color: var(--text); font: inherit; font-size: 0.875rem; cursor: pointer;
  }
  button.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-contrast, #fff); font-weight: 600; }
  button:disabled { opacity: 0.6; cursor: default; }
  button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .status { min-height: 1.25rem; font-size: 0.875rem; }
  .error { color: var(--danger, #b42318); }
`

class TenantMembers extends HTMLElement {
  // Set by the admin on the element (see `ElementContext`).
  api: Api | undefined
  uiLocale: string | undefined
  user: { id?: unknown } | null | undefined
  data: Members | null = null
  state: 'loading' | 'ready' | 'failed' | 'choose' = 'loading'
  message = ''
  error = ''
  busy = false
  #started = false

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
  }

  connectedCallback() {
    this.render()
    if (!this.#started) {
      this.#started = true
      void this.load()
    }
  }

  get uiLang(): 'en' | 'th' {
    return this.uiLocale === 'th' ? 'th' : 'en'
  }
  get me(): string | undefined {
    return this.user?.id === undefined ? undefined : String(this.user.id)
  }
  t(key: Key, values: Record<string, string> = {}) {
    return MESSAGES[this.uiLang][key].replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '')
  }

  async load() {
    if (!this.api) return
    try {
      this.data = (await this.api('GET', '/tenant-members')) as Members
      this.state = 'ready'
    } catch (error) {
      this.state = (error as { status?: number }).status === 403 ? 'choose' : 'failed'
    }
    this.render()
  }

  /** Runs a change, then shows what `action` returns and the members again. */
  async run(action: () => Promise<string | undefined>) {
    this.busy = true
    this.error = ''
    this.message = ''
    this.render()
    try {
      this.message = (await action()) ?? ''
      await this.load()
    } catch (error) {
      this.error = (error as Error).message
    } finally {
      this.busy = false
      this.render()
    }
  }

  roleOptions(selected: string) {
    return (this.data?.roles ?? [])
      .map(
        (r) =>
          `<option value="${esc(r.key)}"${r.key === selected ? ' selected' : ''}>${esc(r.name || r.key)}</option>`,
      )
      .join('')
  }

  render() {
    const root = this.shadowRoot as ShadowRoot
    if (this.state !== 'ready' || !this.data) {
      const text =
        this.state === 'loading'
          ? this.t('loading')
          : this.state === 'choose'
            ? this.t('choose')
            : this.t('failed')
      root.innerHTML = `<style>${STYLE}</style><p class="muted">${esc(text)}</p>`
      return
    }
    const rows = this.data.members
      .map(
        (m) => `<tr data-id="${esc(String(m.id))}">
          <td>${esc(m.email)}${String(m.id) === this.me ? ` <span class="muted">(${esc(this.t('you'))})</span>` : ''}</td>
          <td>${esc(m.name ?? '')}</td>
          <td><select data-role aria-label="${esc(`${this.t('role')}: ${m.email}`)}"${this.busy ? ' disabled' : ''}>${this.roleOptions(m.role)}</select></td>
          <td>${String(m.id) === this.me ? '' : `<button type="button" data-remove${this.busy ? ' disabled' : ''}>${esc(this.t('remove'))}</button>`}</td>
        </tr>`,
      )
      .join('')
    root.innerHTML = `<style>${STYLE}</style>
      <p class="muted">${esc(this.t('lead'))}</p>
      <div class="card">
        ${
          rows
            ? `<table><thead><tr><th>${esc(this.t('email'))}</th><th>${esc(this.t('name'))}</th><th>${esc(this.t('role'))}</th><th><span class="muted">${esc(this.t('actions'))}</span></th></tr></thead><tbody>${rows}</tbody></table>`
            : `<p class="muted" style="padding:1rem;margin:0">${esc(this.t('none'))}</p>`
        }
      </div>
      <form>
        <label>${esc(this.t('email'))}<input type="email" name="email" required autocomplete="off"></label>
        <label>${esc(this.t('role'))}<select name="role">${this.roleOptions('editor')}</select></label>
        <button type="submit" class="primary"${this.busy ? ' disabled' : ''}>${esc(this.busy ? this.t('adding') : this.t('add'))}</button>
      </form>
      <p class="status ${this.error ? 'error' : ''}" role="status">${esc(this.error || this.message)}</p>`

    root.querySelector('form')?.addEventListener('submit', (event) => {
      event.preventDefault()
      const form = event.target as HTMLFormElement
      const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim()
      const role = (form.elements.namedItem('role') as HTMLSelectElement).value
      void this.run(async () => {
        const result = (await this.api?.('POST', '/tenant-members', { email, role })) as {
          invited: boolean
        }
        return this.t(
          result.invited ? 'invited' : this.data?.invites === false ? 'addedNoEmail' : 'added',
          { email },
        )
      })
    })
    for (const row of root.querySelectorAll('tr[data-id]')) {
      const id = (row as HTMLElement).dataset.id as string
      const email = row.querySelector('td')?.textContent?.trim() ?? ''
      row.querySelector('[data-role]')?.addEventListener('change', (event) => {
        const role = (event.target as HTMLSelectElement).value
        void this.run(async () => {
          await this.api?.('PATCH', `/tenant-members/${encodeURIComponent(id)}`, { role })
          return undefined
        })
      })
      row.querySelector('[data-remove]')?.addEventListener('click', () => {
        if (!window.confirm(this.t('removeConfirm', { email }))) return
        void this.run(async () => {
          await this.api?.('DELETE', `/tenant-members/${encodeURIComponent(id)}`)
          return undefined
        })
      })
    }
  }
}

if (!customElements.get('ecms-tenant-members'))
  customElements.define('ecms-tenant-members', TenantMembers)

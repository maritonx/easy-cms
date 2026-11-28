/**
 * The editor (ADR-0074): the config's code on the left, the sandbox with the admin on the right.
 * Every edit (after a pause) goes to the sandbox, which starts the CMS again; its errors come back
 * as a bar and a mark on the line, and the last working admin stays.
 */

import types from 'virtual:studio-types'
import { VERSION } from '@easy-cms/core'
import { decodeStudioLink, encodeStudioHash } from 'create-easy-cms/studio-link'
import { createElement, LayoutTemplate, X } from 'lucide'
import * as monaco from 'monaco-editor'
import { SANDBOX_PAGE, sandboxOrigin, type ToEditor, type ToSandbox } from '../protocol'
import { TEMPLATES, type Template, templateById } from '../templates'
import { startAnalytics, track } from './analytics'

self.MonacoEnvironment = {
  getWorker: (_id, label) =>
    label === 'typescript' || label === 'javascript'
      ? new Worker(new URL('./ts.worker.ts', import.meta.url), { type: 'module' })
      : new Worker(new URL('./editor.worker.ts', import.meta.url), { type: 'module' }),
}

startAnalytics()

const DRAFT_KEY = 'easy-cms-studio:draft'
/** The template the draft came from, for its sample documents. */
const TEMPLATE_KEY = 'easy-cms-studio:template'
const BLOG = templateById('blog') as Template
const PAUSE_MS = 300
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const ts = monaco.typescript
ts.typescriptDefaults.setCompilerOptions({
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  strict: true,
  noEmit: true,
  allowNonTsExtensions: true,
  types: [],
})
for (const [path, content] of Object.entries(types))
  ts.typescriptDefaults.addExtraLib(content, path)
// What a config sees in Studio (runtime/compile.ts): `process.env`, empty.
ts.typescriptDefaults.addExtraLib(
  'declare const process: { env: Record<string, string | undefined> }',
  'file:///node_modules/@types/studio-process/index.d.ts',
)

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function store(key: string, value: string | undefined) {
  try {
    if (value === undefined) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage may be blocked: the draft lives in the editor only.
  }
}

interface Start {
  code: string
  /** The template the code came from (its id), for sample documents. */
  template?: string | undefined
  note?: string
}

/** This browser's draft and the template it came from, else the Blog template. */
function draft(): Start {
  const code = stored(DRAFT_KEY)
  if (code === null) return { code: BLOG.code, template: BLOG.id }
  return { code, template: templateById(stored(TEMPLATE_KEY))?.id }
}

/**
 * A shared link's config (the hash, with its template as `t`), else a template the link names
 * (`?template=shop`), else this browser's draft, else the Blog template.
 */
async function startingCode(): Promise<Start> {
  if (location.hash.includes('c=')) {
    try {
      const shared = await decodeStudioLink(location.hash)
      track('studio-open-link')
      const template = templateById(new URLSearchParams(location.hash.slice(1)).get('t'))?.id
      const note =
        shared.version && shared.version !== VERSION
          ? `This link was made with Easy CMS ${shared.version}; Studio runs ${VERSION}.`
          : undefined
      return note ? { code: shared.code, template, note } : { code: shared.code, template }
    } catch (error) {
      return { ...draft(), note: (error as Error).message }
    }
  }
  const named = new URLSearchParams(location.search).get('template')
  if (named !== null) {
    const template = templateById(named)
    if (template) {
      track('studio-template', { data: { template: template.id, from: 'link' } })
      return { code: template.code, template: template.id }
    }
    return { ...draft(), note: `Studio has no template "${named}".` }
  }
  return draft()
}

const start = await startingCode()
/** The template the code came from; its sample documents fill an empty database. */
let template = start.template
const model = monaco.editor.createModel(
  start.code,
  'typescript',
  monaco.Uri.parse('file:///easy-cms.config.ts'),
)
const editor = monaco.editor.create($('editor'), {
  model,
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 13,
  tabSize: 2,
  scrollBeyondLastLine: false,
  theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'vs-dark' : 'vs',
})

const frame = $<HTMLIFrameElement>('sandbox')
const origin = sandboxOrigin()
frame.src = `${origin}${SANDBOX_PAGE}`
let sandboxReady = false

function send(code: string, fresh = false) {
  if (!sandboxReady) return
  const message: ToSandbox = {
    type: 'studio:config',
    code,
    ...(template ? { template } : {}),
    ...(fresh ? { fresh } : {}),
  }
  frame.contentWindow?.postMessage(message, origin)
}

/** The hash for the code: the config, and the template it came from (for its samples). */
async function hashFor(code: string): Promise<string> {
  const hash = await encodeStudioHash({ code, version: VERSION })
  return template ? `${hash}&t=${template}` : hash
}

/** The address holds the config, so it can be shared as it is (the hash never reaches a server). */
async function keepInAddress(code: string) {
  const hash = await hashFor(code)
  if (model.getValue() === code) history.replaceState(null, '', `#${hash}`)
}

let timer: ReturnType<typeof setTimeout> | undefined
model.onDidChangeContent(() => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    const code = model.getValue()
    store(DRAFT_KEY, code)
    store(TEMPLATE_KEY, template)
    send(code)
    track('studio-edit', { once: true })
    void keepInAddress(code)
  }, PAUSE_MS)
})
void keepInAddress(model.getValue())

const status = $('status')
const errorBar = $('error')
const consoleList = $('console-lines')

function setStatus(state: 'busy' | 'ok' | 'error', text: string) {
  status.dataset.state = state
  status.textContent = text
}

function showError(message: string, line?: number) {
  errorBar.hidden = false
  errorBar.textContent = line ? `Line ${line}: ${message}` : message
  monaco.editor.setModelMarkers(
    model,
    'studio',
    line
      ? [
          {
            severity: monaco.MarkerSeverity.Error,
            message,
            startLineNumber: line,
            endLineNumber: line,
            startColumn: 1,
            endColumn: model.getLineMaxColumn(line),
          },
        ]
      : [],
  )
}

function clearError() {
  errorBar.hidden = true
  errorBar.textContent = ''
  monaco.editor.setModelMarkers(model, 'studio', [])
}

function addConsoleLine(level: string, message: string) {
  const item = document.createElement('li')
  item.dataset.level = level
  item.textContent = message
  consoleList.append(item)
  item.scrollIntoView({ block: 'nearest' })
  $('console-count').textContent = String(consoleList.children.length)
}

window.addEventListener('message', (event: MessageEvent<ToEditor>) => {
  if (event.source !== frame.contentWindow || event.origin !== origin) return
  const message = event.data
  switch (message?.type) {
    case 'studio:ready':
      sandboxReady = true
      send(model.getValue())
      break
    case 'studio:status':
      if (message.state === 'busy') setStatus('busy', 'Starting…')
      else if (message.state === 'ok') {
        setStatus('ok', 'Up to date')
        clearError()
      } else {
        setStatus('error', 'Error: the admin shows the last config that worked')
        showError(message.message, message.line)
      }
      break
    case 'studio:console':
      addConsoleLine(message.level, message.message)
      break
  }
})

$('console-clear').addEventListener('click', () => {
  consoleList.replaceChildren()
  $('console-count').textContent = '0'
})
/** Full screen: the admin across the window, the code hidden; ⌘\ or Ctrl+\ outside the admin. */
const panes = $('panes')
const fullScreenButton = $('full-screen')
const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘\\' : 'Ctrl+\\'
fullScreenButton.title = `Show the admin across the window (${shortcut})`

function setFullScreen(on: boolean) {
  panes.toggleAttribute('data-full-screen', on)
  fullScreenButton.setAttribute('aria-pressed', String(on))
  fullScreenButton.textContent = on ? '⤡ Show code' : '⤢ Full screen'
  fullScreenButton.title = on
    ? `Show the code again (${shortcut})`
    : `Show the admin across the window (${shortcut})`
  if (on) track('studio-expand')
  else editor.layout()
}

fullScreenButton.addEventListener('click', () => {
  setFullScreen(!panes.hasAttribute('data-full-screen'))
})
// Capture: before Monaco, which keeps keys it knows. Keys pressed inside the admin never get
// here (another origin's frame), so the button stays the way out.
window.addEventListener(
  'keydown',
  (event) => {
    if (event.key !== '\\' || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey)
      return
    event.preventDefault()
    setFullScreen(!panes.hasAttribute('data-full-screen'))
  },
  true,
)

/** Templates: a dialog of cards; picking one replaces the code and starts from its samples. */
const templatesDialog = $<HTMLDialogElement>('templates')
const templateList = $('template-list')
const icon = (node: Parameters<typeof createElement>[0]) =>
  createElement(node, { 'aria-hidden': 'true', focusable: 'false' })
$('templates-open').prepend(icon(LayoutTemplate))
$('templates-close').append(icon(X))

/** Whether picking another template would lose work: the code is not a template's as it is. */
const edited = () => {
  const code = model.getValue().trim()
  return !TEMPLATES.some((t) => t.code.trim() === code)
}

function renderTemplates() {
  templateList.replaceChildren(
    ...TEMPLATES.map((t) => {
      const item = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.template = t.id
      const inUse = t.id === template
      button.setAttribute('aria-current', String(inUse))
      const box = document.createElement('span')
      box.className = 'icon'
      box.append(icon(t.icon))
      const name = document.createElement('span')
      name.className = 'name'
      name.textContent = t.name
      if (inUse) {
        const current = document.createElement('span')
        current.className = 'current'
        current.textContent = 'In use'
        name.append(current)
      }
      const description = document.createElement('span')
      description.className = 'description'
      description.textContent = t.description
      const features = document.createElement('span')
      features.className = 'features'
      features.append(
        ...t.features.map((feature) => {
          const chip = document.createElement('span')
          chip.textContent = feature
          return chip
        }),
      )
      button.append(box, name, description, features)
      button.addEventListener('click', () => useTemplate(t))
      item.append(button)
      return item
    }),
  )
}

function useTemplate(picked: Template) {
  if (
    edited() &&
    !confirm(`Replace your code with the ${picked.name} template? Your changes will be lost.`)
  )
    return
  templatesDialog.close()
  template = picked.id
  store(TEMPLATE_KEY, picked.id)
  model.setValue(picked.code)
  // Now, not after the pause: and with an empty database, for this template's samples.
  clearTimeout(timer)
  store(DRAFT_KEY, picked.code)
  send(picked.code, true)
  void keepInAddress(picked.code)
  track('studio-template', { data: { template: picked.id, from: 'dialog' } })
  editor.setScrollTop(0)
}

$('templates-open').addEventListener('click', () => {
  renderTemplates()
  templatesDialog.showModal()
  ;(
    templateList.querySelector<HTMLElement>('[aria-current="true"]') ??
    templateList.querySelector<HTMLElement>('button')
  )?.focus()
})

/** The link to this config, up to date even inside the pause after an edit. */
async function shareLink(): Promise<string> {
  return `${location.origin}${location.pathname}#${await hashFor(model.getValue())}`
}

async function copy(button: HTMLElement, text: string) {
  const label = button.textContent
  try {
    await navigator.clipboard.writeText(text)
    button.textContent = 'Copied'
  } catch {
    button.textContent = 'Copy failed: select and copy it'
  }
  setTimeout(() => {
    button.textContent = label
  }, 1500)
}

/** What a project runs to get this config (npm; pnpm, yarn and bun take the same link). */
const createCommand = (link: string) => `npm create easy-cms@latest -- --from "${link}"`

$('share').addEventListener('click', async () => {
  track('studio-share')
  await copy($('share'), await shareLink())
})
$('export').addEventListener('click', async () => {
  $('export-command').textContent = createCommand(await shareLink())
  $<HTMLDialogElement>('export-dialog').showModal()
})
$('copy-command').addEventListener('click', async () => {
  track('studio-copy-command')
  await copy($('copy-command'), createCommand(await shareLink()))
})
$('copy-config').addEventListener('click', async () => {
  track('studio-copy-config')
  await copy($('copy-config'), model.getValue())
})
if (start.note) addConsoleLine('warn', start.note)

/** For tests and the curious: the editor's code. */
Object.assign(window, {
  studio: {
    getCode: () => model.getValue(),
    setCode: (code: string) => model.setValue(code),
    template: () => template,
    shareLink,
    createCommand: async () => createCommand(await shareLink()),
  },
})
editor.focus()

/**
 * The editor (ADR-0074): the config's code on the left, the sandbox with the admin on the right.
 * Every edit (after a pause) goes to the sandbox, which starts the CMS again; its errors come back
 * as a bar and a mark on the line, and the last working admin stays.
 */

import types from 'virtual:studio-types'
import { VERSION } from '@easy-cms/core'
import { decodeStudioLink, encodeStudioHash } from 'create-easy-cms/studio-link'
import * as monaco from 'monaco-editor'
import { SANDBOX_PAGE, sandboxOrigin, type ToEditor, type ToSandbox } from '../protocol'
import blog from '../templates/blog.config.ts?raw'
import { startAnalytics, track } from './analytics'

self.MonacoEnvironment = {
  getWorker: (_id, label) =>
    label === 'typescript' || label === 'javascript'
      ? new Worker(new URL('./ts.worker.ts', import.meta.url), { type: 'module' })
      : new Worker(new URL('./editor.worker.ts', import.meta.url), { type: 'module' }),
}

startAnalytics()

const DRAFT_KEY = 'easy-cms-studio:draft'
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

function savedDraft(): string | null {
  try {
    return localStorage.getItem(DRAFT_KEY)
  } catch {
    return null
  }
}
function saveDraft(code: string) {
  try {
    localStorage.setItem(DRAFT_KEY, code)
  } catch {
    // Storage may be blocked: the draft lives in the editor only.
  }
}

/** A shared link's config (the hash), else this browser's draft, else the Blog template. */
async function startingCode(): Promise<{ code: string; note?: string }> {
  if (location.hash.includes('c=')) {
    try {
      const shared = await decodeStudioLink(location.hash)
      track('studio-open-link')
      const note =
        shared.version && shared.version !== VERSION
          ? `This link was made with Easy CMS ${shared.version}; Studio runs ${VERSION}.`
          : undefined
      return note ? { code: shared.code, note } : { code: shared.code }
    } catch (error) {
      return { code: savedDraft() ?? blog, note: (error as Error).message }
    }
  }
  return { code: savedDraft() ?? blog }
}

const start = await startingCode()
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

function send(code: string) {
  if (!sandboxReady) return
  const message: ToSandbox = { type: 'studio:config', code }
  frame.contentWindow?.postMessage(message, origin)
}

/** The address holds the config, so it can be shared as it is (the hash never reaches a server). */
async function keepInAddress(code: string) {
  const hash = await encodeStudioHash({ code, version: VERSION })
  if (model.getValue() === code) history.replaceState(null, '', `#${hash}`)
}

let timer: ReturnType<typeof setTimeout> | undefined
model.onDidChangeContent(() => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    const code = model.getValue()
    saveDraft(code)
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

$('reset').addEventListener('click', () => {
  model.setValue(blog)
})

/** The link to this config, up to date even inside the pause after an edit. */
async function shareLink(): Promise<string> {
  const hash = await encodeStudioHash({ code: model.getValue(), version: VERSION })
  return `${location.origin}${location.pathname}#${hash}`
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
    shareLink,
    createCommand: async () => createCommand(await shareLink()),
  },
})
editor.focus()

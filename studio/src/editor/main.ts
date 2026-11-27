/**
 * The editor (ADR-0074): the config's code on the left, the sandbox with the admin on the right.
 * Every edit (after a pause) goes to the sandbox, which starts the CMS again; its errors come back
 * as a bar and a mark on the line, and the last working admin stays.
 */

import types from 'virtual:studio-types'
import * as monaco from 'monaco-editor'
import { SANDBOX_PAGE, sandboxOrigin, type ToEditor, type ToSandbox } from '../protocol'
import blog from '../templates/blog.config.ts?raw'

self.MonacoEnvironment = {
  getWorker: (_id, label) =>
    label === 'typescript' || label === 'javascript'
      ? new Worker(new URL('./ts.worker.ts', import.meta.url), { type: 'module' })
      : new Worker(new URL('./editor.worker.ts', import.meta.url), { type: 'module' }),
}

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

const model = monaco.editor.createModel(
  savedDraft() ?? blog,
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

let timer: ReturnType<typeof setTimeout> | undefined
model.onDidChangeContent(() => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    const code = model.getValue()
    saveDraft(code)
    send(code)
  }, PAUSE_MS)
})

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
$('reset').addEventListener('click', () => {
  model.setValue(blog)
})

/** For tests and the curious: the editor's code. */
Object.assign(window, {
  studio: {
    getCode: () => model.getValue(),
    setCode: (code: string) => model.setValue(code),
  },
})
editor.focus()

import { EasyCMSClientError } from '@easy-cms/core/client'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import type { Doc } from '../app/src/lib/api'
import { type LiveDocument, useLiveDocument } from '../app/src/lib/live-document'
import { listReaction } from '../app/src/lib/live-list'
import { createLiveStream, type LiveChange, type LiveTarget } from '../app/src/lib/realtime'

type Handlers = {
  onEvent(e: unknown): void
  onReady?(): void
  onReset?(): void
  onError?(e: Error): void
}

/** A fake `subscribe()`: records each stream it opens. */
function fakeOpen() {
  const streams: {
    subscriptions: LiveTarget[]
    handlers: Handlers
    lastEventId: string | undefined
    closed: boolean
    position: string | undefined
  }[] = []
  const open = (subscriptions: unknown, handlers: unknown, options: { lastEventId?: string }) => {
    const stream = {
      subscriptions: subscriptions as LiveTarget[],
      handlers: handlers as Handlers,
      lastEventId: options.lastEventId,
      closed: false,
      position: options.lastEventId,
    }
    streams.push(stream)
    return {
      close: () => {
        stream.closed = true
      },
      get lastEventId() {
        return stream.position
      },
    }
  }
  return { open, streams }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('one live stream per tab (ADR-0070)', () => {
  it('opens one stream for every view, and moves to new subscriptions after its position', () => {
    const { open, streams } = fakeOpen()
    const live = createLiveStream(open as never, 10_000)
    const list: LiveChange[] = []
    const one: LiveChange[] = []
    const stopList = live.subscribe(
      { collection: 'posts', draft: true },
      { onEvent: (c) => list.push(c) },
    )
    live.flush()
    expect(streams).toHaveLength(1)
    expect(streams[0]?.subscriptions).toEqual([{ collection: 'posts', draft: true, depth: 0 }])
    expect(live.status.value).toBe('connecting')
    streams[0]?.handlers.onReady?.()
    expect(live.status.value).toBe('live')
    if (streams[0]) streams[0].position = '41'

    // A drawer opens: the same tab, one new stream with both, from where the first got to.
    const stopOne = live.subscribe({ collection: 'posts', id: 7 }, { onEvent: (c) => one.push(c) })
    live.flush()
    expect(streams[0]?.closed).toBe(true)
    expect(streams).toHaveLength(2)
    expect(streams[1]?.lastEventId).toBe('41')
    expect(streams[1]?.subscriptions).toHaveLength(2)

    // Before `ready`, the new subscription's events are replays; the list's are not.
    streams[1]?.handlers.onEvent({ event: 'update', collection: 'posts', id: 7, doc: { id: 7 } })
    expect(list.at(-1)?.replay).toBe(false)
    expect(one.at(-1)?.replay).toBe(true)
    streams[1]?.handlers.onReady?.()
    streams[1]?.handlers.onEvent({ event: 'delete', collection: 'posts', id: 7 })
    streams[1]?.handlers.onEvent({ event: 'create', collection: 'posts', id: 8, doc: { id: 8 } })
    // The document's subscription gets its own document only.
    expect(one.map((c) => [c.event, c.id, c.replay])).toEqual([
      ['update', 7, true],
      ['delete', 7, false],
    ])
    expect(list.map((c) => c.id)).toEqual([7, 7, 8])

    stopOne()
    stopList()
    live.flush()
    expect(streams[1]?.closed).toBe(true)
    expect(streams).toHaveLength(2)
    expect(live.status.value).toBe('off')
  })

  it('shares a subscription two views follow, and says when the stream is down or refused', () => {
    const { open, streams } = fakeOpen()
    const live = createLiveStream(open as never, 10_000)
    live.subscribe({ collection: 'posts' }, { onEvent: () => {} })
    live.flush()
    streams[0]?.handlers.onReady?.()
    live.subscribe({ collection: 'posts' }, { onEvent: () => {} })
    live.flush()
    expect(streams).toHaveLength(1)
    streams[0]?.handlers.onError?.(new TypeError('network'))
    expect(live.status.value).toBe('down')
    streams[0]?.handlers.onReady?.()
    expect(live.status.value).toBe('live')
    streams[0]?.handlers.onError?.(new EasyCMSClientError('Forbidden', 403, []))
    expect(live.status.value).toBe('off')
  })
})

describe('a live list', () => {
  const shown = (id: string) => id === '1'
  const change = (event: LiveChange['event'], id: number, replay = false): LiveChange => ({
    event,
    collection: 'posts',
    id,
    replay,
  })
  it('changes shown rows in place and counts the rest for Show', () => {
    expect(listReaction(change('update', 1), shown)).toBe('refresh')
    expect(listReaction(change('publish', 1), shown)).toBe('refresh')
    expect(listReaction(change('delete', 1), shown)).toBe('deleted')
    expect(listReaction(change('leave', 1), shown)).toBe('pending')
    expect(listReaction(change('create', 2), shown)).toBe('pending')
    expect(listReaction(change('update', 2), shown)).toBe('pending')
    expect(listReaction(change('update', 2, true), shown)).toBe('ignore')
    expect(listReaction(change('delete', 2), shown)).toBe('ignore')
    expect(listReaction(change('leave', 2), shown)).toBe('ignore')
  })
})

describe('a live document', () => {
  /** The edit page's state, around useLiveDocument with a fake stream. */
  async function page() {
    const { open, streams } = fakeOpen()
    const stream = createLiveStream(open as never, 10_000)
    const state = {
      saved: { id: 7, title: 'One', updatedAt: '2026-11-14T10:00:00.000Z' } as Doc,
      onServer: { id: 7, title: 'One', updatedAt: '2026-11-14T10:00:00.000Z' } as Doc,
      form: ref('One'),
      saving: ref(false),
      reloads: 0,
    }
    let live!: LiveDocument
    const wrapper = mount(
      defineComponent({
        setup() {
          live = useLiveDocument({
            slug: 'posts',
            id: () => 7,
            enabled: true,
            draft: true,
            dirty: () => state.form.value !== state.saved.title,
            busy: () => state.saving.value,
            baseline: () => String(state.saved.title),
            updatedAt: () => state.saved.updatedAt,
            read: async () => state.onServer,
            snapshotOf: (doc) => String(doc.title),
            reload: async () => {
              state.reloads++
              state.saved = state.onServer
              state.form.value = String(state.onServer.title)
            },
            stream,
          })
          return () => h('div')
        },
      }),
    )
    stream.flush()
    streams[0]?.handlers.onReady?.()
    const saveElsewhere = async (title: string, updatedAt: string) => {
      state.onServer = { id: 7, title, updatedAt }
      streams[0]?.handlers.onEvent({
        event: 'update',
        collection: 'posts',
        id: 7,
        doc: state.onServer,
      })
      await tick()
      await nextTick()
    }
    return { state, live: () => live, wrapper, streams, saveElsewhere }
  }

  it('loads another save silently while nothing is unsaved', async () => {
    const { state, live, saveElsewhere } = await page()
    await saveElsewhere('Two', '2026-11-14T10:01:00.000Z')
    expect(state.reloads).toBe(1)
    expect(state.form.value).toBe('Two')
    expect(live().updated.value).toBe(true)
    expect(live().conflict.value).toBeNull()
  })

  it('asks with unsaved changes, and saving after Keep mine confirms first', async () => {
    const { state, live, saveElsewhere } = await page()
    state.form.value = 'Mine'
    await saveElsewhere('Theirs', '2026-11-14T10:01:00.000Z')
    expect(state.reloads).toBe(0)
    expect(live().conflict.value).toMatchObject({ title: 'Theirs' })
    expect(live().confirmOverwrite.value).toBe(true)
    live().keepMine()
    expect(live().conflict.value).toBeNull()
    expect(live().confirmOverwrite.value).toBe(true)
    expect(state.form.value).toBe('Mine')
    live().saved()
    expect(live().confirmOverwrite.value).toBe(false)
  })

  it('loads the new version when asked', async () => {
    const { state, live, saveElsewhere } = await page()
    state.form.value = 'Mine'
    await saveElsewhere('Theirs', '2026-11-14T10:01:00.000Z')
    await live().loadNewer()
    expect(state.form.value).toBe('Theirs')
    expect(live().conflict.value).toBeNull()
    expect(live().confirmOverwrite.value).toBe(false)
  })

  it('ignores its own save, even when the change comes while saving', async () => {
    const { state, live, saveElsewhere } = await page()
    state.form.value = 'Mine'
    state.saving.value = true
    // The change arrives before the save's answer.
    await saveElsewhere('Mine', '2026-11-14T10:01:00.000Z')
    expect(live().conflict.value).toBeNull()
    state.saved = { id: 7, title: 'Mine', updatedAt: '2026-11-14T10:00:59.990Z' }
    state.saving.value = false
    await nextTick()
    await tick()
    expect(live().conflict.value).toBeNull()
    expect(live().updated.value).toBe(false)
    expect(state.reloads).toBe(0)
  })

  it('says when the document is deleted or no longer readable', async () => {
    const { live, streams } = await page()
    streams[0]?.handlers.onEvent({ event: 'leave', collection: 'posts', id: 7 })
    await tick()
    expect(live().gone.value).toBe('hidden')
    streams[0]?.handlers.onEvent({ event: 'delete', collection: 'posts', id: 7 })
    await tick()
    expect(live().gone.value).toBe('deleted')
  })
})

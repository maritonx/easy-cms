import { Window } from 'happy-dom'

// A DOM for React and Vue to render into, for tests that import this first. Not the happy-dom
// environment: its fetch, Request and Headers are a browser's, which drop the cookies the shop's
// session needs.
const dom = new Window({ url: 'http://shop.test/' })
for (const name of [
  'window',
  'document',
  'navigator',
  'Node',
  'Element',
  'HTMLElement',
  'SVGElement',
  'Text',
  'Comment',
])
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: name === 'window' ? dom : dom[name as keyof Window],
  })

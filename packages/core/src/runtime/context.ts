/**
 * Values that follow a request through `await`s. Uses `AsyncLocalStorage` (Node, Bun, Deno, and
 * Cloudflare Workers with `nodejs_compat`); the TC39 `AsyncContext` can replace it here (ADR-0067).
 */
import { AsyncLocalStorage } from 'node:async_hooks'

export interface AsyncContext<T> {
  /** Runs `fn` with `value` as the current value, through everything it awaits. */
  run<R>(value: T, fn: () => R): R
  /** The current value, or `undefined` outside `run`. */
  getStore(): T | undefined
}

/** A new context; its value is set with `run` and read with `getStore`. */
export function createContext<T>(): AsyncContext<T> {
  return new AsyncLocalStorage<T>()
}

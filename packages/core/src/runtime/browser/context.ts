/**
 * `../context.ts` for the browser build (ADR-0074), where there is no `AsyncLocalStorage`.
 *
 * A value set by `run` stays current until what `fn` returns settles, then the one before it
 * comes back. That follows a request through its `await`s only when requests run one at a time:
 * Studio queues them. Two `run`s in flight at once (say, in `Promise.all`) see each other's value.
 */
export interface AsyncContext<T> {
  /** Runs `fn` with `value` as the current value, through everything it awaits. */
  run<R>(value: T, fn: () => R): R
  /** The current value, or `undefined` outside `run`. */
  getStore(): T | undefined
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as PromiseLike<unknown> | null)?.then === 'function'

/** A new context; its value is set with `run` and read with `getStore`. */
export function createContext<T>(): AsyncContext<T> {
  let current: T | undefined
  return {
    run<R>(value: T, fn: () => R): R {
      const previous = current
      current = value
      let result: R
      try {
        result = fn()
      } catch (error) {
        current = previous
        throw error
      }
      if (!isThenable(result)) {
        current = previous
        return result
      }
      return Promise.resolve(result).finally(() => {
        current = previous
      }) as R
    },
    getStore: () => current,
  }
}

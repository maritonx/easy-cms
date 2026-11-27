/** Stands in for `jiti` in the browser build (ADR-0074): config files can't be loaded there. */
export function createJiti(): never {
  throw new Error(
    'Loading a config file needs Node.js; the browser build of Easy CMS takes the config object',
  )
}

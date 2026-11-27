/**
 * drizzle-kit's snapshot and migration functions. Built into `dist/kit.js` for browsers, with
 * Node's modules replaced by stand-ins (`tsup.config.ts`): these two never call them.
 */
export { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'

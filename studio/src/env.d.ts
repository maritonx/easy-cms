/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The sandbox's origin, its own in production (e.g. https://sandbox.studio.easycms.dev). */
  readonly VITE_SANDBOX_ORIGIN?: string
  /** The editor's origin, which the sandbox takes messages from. */
  readonly VITE_STUDIO_ORIGIN?: string
}

/** What a config sees in Studio: no environment variables (see runtime/compile.ts). */
declare const process: { env: Record<string, string | undefined> }

declare module 'virtual:studio-types' {
  /** Type declarations for the editor: file path → content. */
  const types: Record<string, string>
  export default types
}

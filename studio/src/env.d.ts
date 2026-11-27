/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The sandbox's origin, its own in production (e.g. https://sandbox.studio.easycms.dev). */
  readonly VITE_SANDBOX_ORIGIN?: string
  /** The editor's origin, which the sandbox takes messages from. */
  readonly VITE_STUDIO_ORIGIN?: string
  /** Umami's script (analytics/off when unset), e.g. https://cloud.umami.is/script.js. */
  readonly VITE_UMAMI_SRC?: string
  readonly VITE_UMAMI_WEBSITE_ID?: string
  /** The hosts that count, e.g. studio.easycms.dev. */
  readonly VITE_UMAMI_DOMAINS?: string
}

/** What a config sees in Studio: no environment variables (see runtime/compile.ts). */
declare const process: { env: Record<string, string | undefined> }

declare module 'virtual:studio-types' {
  /** Type declarations for the editor: file path → content. */
  const types: Record<string, string>
  export default types
}

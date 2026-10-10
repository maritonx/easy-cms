// Provided by the module as a Nitro virtual module.
declare module '#easy-cms-local-api' {
  export function useEasyCMS(): Promise<import('@easy-cms/core').EasyCMS>
}

declare module '#easy-cms-admin-shell' {
  export const basePath: string
  export const html: string
  export const headers: Record<string, string>
  /** The Easy CMS config, for what is only known when the server starts (storage origins). */
  export const config: import('@easy-cms/core').Config
  /** `Strict-Transport-Security`, sent in production. */
  export const hsts: string
  /** Development: read the shell again on each request. */
  export const reload: {
    file: string
    options: Omit<import('@easy-cms/admin').AdminHandlerOptions, 'appDir'>
  } | null
}

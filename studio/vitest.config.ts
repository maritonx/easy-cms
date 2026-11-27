import { defineConfig } from 'vitest/config'

// Studio's tests drive the built site in a browser: starting the CMS there takes seconds.
export default defineConfig({ test: { testTimeout: 120_000, hookTimeout: 180_000 } })

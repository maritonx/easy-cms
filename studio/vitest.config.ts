import { defineConfig } from 'vitest/config'

// Studio's tests build the site and drive it in Chrome: seconds each, and heavy. One file at a
// time, so two builds never compete for the CPU; CI runs them in a job of their own (ci.yml).
export default defineConfig({
  test: { testTimeout: 120_000, hookTimeout: 300_000, fileParallelism: false },
})

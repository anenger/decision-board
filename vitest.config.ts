import { URL, fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so unit tests don't boot the Cloudflare runtime.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
  },
})

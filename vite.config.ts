import { URL, fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

const WASM_URL_STUB = '\0wasm-url-stub'

/**
 * Browser code imports Automerge's wasm as `?url` to fetch it at runtime. In
 * the Worker build the Cloudflare plugin would treat that file as a Worker
 * module and fail, and the Worker never fetches it, so stub the URL there.
 */
function stubWasmUrlsOnServer(): Plugin {
  return {
    name: 'stub-wasm-urls-on-server',
    enforce: 'pre',
    applyToEnvironment: (environment) => environment.name === 'ssr',
    resolveId: (source) =>
      source.endsWith('.wasm?url') ? WASM_URL_STUB : undefined,
    load: (id) => (id === WASM_URL_STUB ? 'export default ""' : undefined),
  }
}

const config = defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    devtools(),
    stubWasmUrlsOnServer(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config

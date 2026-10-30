import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { buildServiceWorker } from './scripts/service-worker.mjs'
import packageJson from './package.json' with { type: 'json' }

function multiplifeServiceWorker(): Plugin {
  return {
    name: 'multiplife-service-worker',
    enforce: 'post',
    generateBundle(_, bundle) {
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: buildServiceWorker(packageJson.version, bundle) })
    },
  }
}

export default defineConfig({
  plugins: [react(), multiplifeServiceWorker()],
  base: './',
  define: { __APP_VERSION__: JSON.stringify(packageJson.version) },
})

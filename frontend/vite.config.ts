/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The frontend always calls relative /api/... so the same build works behind the
// Vite dev proxy and behind nginx in Docker; only the proxy target changes.
const apiTarget = process.env.STAKEFLOW_API_URL ?? 'http://localhost:8000';

export default defineConfig({
  // GitHub Pages serves the static demo from /<repo>/ (pnpm build:pages); everything else
  // from the root. The router and the static data URLs follow it via import.meta.env.BASE_URL.
  base: process.env.STAKEFLOW_BASE_PATH ?? '/',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    // maplibre-gl alone is ~800 kB minified; it is lazy-loaded with the map route.
    chunkSizeWarningLimit: 1100,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Tests never touch the network: every query goes through the mock layer.
    env: { VITE_USE_MOCKS: 'true', VITE_FEATURE_ASK: 'true' },
  },
});

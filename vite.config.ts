import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA: makes the web app installable on Mac/Windows/Android/iOS straight from the
    // browser — no native build needed. SW registration is gated at runtime so it never
    // runs inside the Tauri shell (see src/lib/pwa/registerPwa.ts).
    VitePWA({
      registerType: 'autoUpdate',
      // We register the SW ourselves (gated on !isTauri), so disable auto-injection.
      injectRegister: null,
      manifest: {
        name: 'PDF Editor',
        short_name: 'PDF Editor',
        description: 'Private, local-first PDF tools. Your files never leave your device.',
        theme_color: '#0A66FF',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The app bundles large wasm/worker assets (pdfjs, tesseract) — raise the cache limit.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,wasm}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Port 1420 to align with the standard Tauri dev-server convention (Tauri wraps this URL in M5).
  server: {
    port: 1420,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  // pdfjs-dist ships an ES module worker; Vite handles ?url + `new Worker(url, { type: 'module' })`.
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
});

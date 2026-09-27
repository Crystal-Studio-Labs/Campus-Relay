import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// The PWA is a first-class deliverable, not an afterthought: installability,
// standalone display, offline shell. Data-level offline behaviour lives in
// src/lib/offline.ts (IndexedDB + outbox), not in the service worker.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Campus Relay',
        short_name: 'Campus Relay',
        description: 'A resilient operating layer for everyday campus operations.',
        theme_color: '#111111',
        background_color: '#fdf6e3',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        categories: ['education', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/index.html',
        // API responses must never be served stale from the cache: the sync
        // engine and outbox own offline data, and a cached GET could show a
        // case status that no longer exists.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/catalog\/context$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'catalog-context',
              networkTimeoutSeconds: 4,
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2020',
    // Small bundles matter on a hostel connection: split the heavy role views
    // so a student on a low-end phone never downloads the admin command centre.
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
})

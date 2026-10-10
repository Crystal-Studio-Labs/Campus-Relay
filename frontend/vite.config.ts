import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// The PWA is a first-class deliverable, not an afterthought: installability,
// standalone display, offline shell. Data-level offline behaviour lives in
// src/lib/offline.ts (IndexedDB + outbox), not in the service worker.
//
// The service worker itself is handwritten (src/sw.ts) rather than generated:
// generateSW cannot serve a fallback document, and a navigation that cannot be
// answered should land on the app's own offline screen, not the browser's
// error page. See src/sw.ts for what it does and, more importantly, does not.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'offline.html'],
      manifest: {
        id: '/',
        name: 'Campus Relay',
        short_name: 'Campus Relay',
        description: 'A resilient operating layer for everyday campus operations.',
        lang: 'en',
        dir: 'ltr',
        // The app's own paper colour (the pastel light theme), in both themes'
        // light default: an installed window whose chrome is a different white
        // around the app is the kind of mismatch that reads as unfinished.
        theme_color: '#e9edf7',
        background_color: '#e9edf7',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui', 'browser'],
        // Not portrait-primary: a corridor tablet and a helpdesk counter are
        // landscape, and locking the orientation letterboxes the kiosk.
        orientation: 'any',
        start_url: '/',
        scope: '/',
        categories: ['education', 'productivity'],
        prefer_related_applications: false,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Long-press (Android) / right-click (desktop) on the installed app.
        // Each one is a real route; the guard decides whether the person may see
        // it, so a shortcut can never grant access.
        shortcuts: [
          {
            name: 'Sign in',
            short_name: 'Sign in',
            description: 'Open the app at the sign-in screen',
            url: '/login',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'File a request',
            short_name: 'New request',
            description: 'Report a maintenance or hostel problem',
            url: '/report',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'My cases',
            short_name: 'Cases',
            description: 'Track the requests you have filed',
            url: '/cases',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Campus notices',
            short_name: 'Notices',
            description: 'Read the notices published to your campus',
            url: '/notices',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        // Real screenshots of the running app, so the install dialog shows the
        // product rather than a placeholder.
        screenshots: [
          {
            src: 'screenshots/app-wide.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Your own screens: work, cases and notices in one place',
          },
          {
            src: 'screenshots/app-narrow.png',
            sizes: '720x1280',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Installed on a phone, with slide-out navigation',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
        globIgnores: [
          // Install-dialog art and tour images: they are fetched by the browser
          // when it builds the install sheet, never needed to run the app, and
          // they would otherwise sit in every device's precache.
          //
          // Careful: public/assets is copied to dist/assets, which is also
          // where Vite writes the bundle, so the ignore has to name file types
          // rather than the directory. Ignoring '**/assets/**' would quietly
          // drop the app's own JavaScript and CSS out of the precache.
          '**/screenshots/**',
          '**/social-preview.png',
          '**/*.{jpg,jpeg,webp,avif}',
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    // Vite refuses a request whose Host header it does not recognise, which is
    // what you want against DNS rebinding and what you do not want when the dev
    // server is being shown through a tunnel. A leading dot matches every
    // subdomain, so a demo survives the free tunnel's hostname changing between
    // runs. This is a development-server setting only; it ships no protection
    // change to a built deployment, which is served by nginx or the host.
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '.ngrok-free.app',
      '.ngrok-free.dev',
      '.ngrok.io',
      '.ngrok.app',
      '.trycloudflare.com',
      '.loca.lt',
    ],
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

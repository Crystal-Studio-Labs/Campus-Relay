/** The service worker.
 *
 *  Deliberately small and boring. It does four things and nothing else:
 *
 *    1. precaches the built shell, so a reload in a dead zone still opens;
 *    2. answers navigations from that shell, on any route, kiosk included;
 *    3. serves the app's own offline page when a navigation cannot be answered -
 *       a first run with no network, or a precache that was evicted;
 *    4. keeps the one API read that is genuinely useful offline on a short
 *       network-first leash.
 *
 *  It caches no case, notice or queue data. Everything stateful lives in
 *  IndexedDB (src/lib/offline.ts) because a service worker can hold a response
 *  but cannot resolve a conflict, and a cached case status that no longer exists
 *  is worse than no answer at all.
 *
 *  Built by vite-plugin-pwa with `strategies: 'injectManifest'`: the placeholder
 *  below is replaced with the hashed asset list at build time.
 */

/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute, setCatchHandler } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'

declare let self: ServiceWorkerGlobalScope

// Precache URLs are absolute under the deploy base, so workbox matches them
// exactly: 'index.html' would throw as a non-precached URL at runtime.
const SHELL_URL = '/index.html'
const OFFLINE_URL = '/offline.html'

// The build injects the manifest of hashed assets here.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

/** Navigations are answered from the cached shell. `/api/` is excluded so a
 *  deep link never answers an API request with HTML. */
registerRoute(
  new NavigationRoute(createHandlerBoundToURL(SHELL_URL), {
    denylist: [/^\/api\//],
  }),
)

/** The catalogue that labels forms is worth having offline; a case status is
 *  not - the sync engine owns that decision. */
registerRoute(
  ({ url }) => url.pathname === '/api/v1/catalog/context',
  new NetworkFirst({ cacheName: 'catalog-context', networkTimeoutSeconds: 4 }),
)

/** The last resort for a document request the shell cannot answer: the app's
 *  own offline screen rather than the browser's error page. Anything else
 *  fails as it normally would, so the app sees a network error it can queue. */
setCatchHandler(async ({ request }) => {
  if (request.destination !== 'document') return Response.error()
  // ignoreSearch matters: precached URLs are stored revisioned
  // ('/offline.html?__WB_REVISION__=…'), so an exact match would miss and the
  // person would get the browser's error page anyway.
  const offline = await caches.match(OFFLINE_URL, { ignoreSearch: true })
  return offline ?? Response.error()
})

// Take over as soon as a new build is precached: this app has no long-lived
// editor state to protect, and a half-updated shell is the worse outcome.
self.addEventListener('install', () => void self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

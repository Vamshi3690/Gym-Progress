/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<unknown> }
self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(({ url }) => url.origin === 'https://fonts.googleapis.com', new StaleWhileRevalidate({ cacheName: 'gym-font-styles', plugins: [new CacheableResponsePlugin({ statuses: [0, 200] }), new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 180 })] }))
registerRoute(({ url }) => url.origin === 'https://fonts.gstatic.com', new CacheFirst({ cacheName: 'gym-font-files', plugins: [new CacheableResponsePlugin({ statuses: [0, 200] }), new ExpirationPlugin({ maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 180 })] }))
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SYNC_OUTBOX') event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => clients.forEach((client) => client.postMessage({ type: 'SYNC_OUTBOX' }))))
})
self.addEventListener('sync', (event) => {
  const syncEvent = event as ExtendableEvent & { tag: string }
  if (syncEvent.tag === 'gym-progress-outbox') syncEvent.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => clients.forEach((client) => client.postMessage({ type: 'SYNC_OUTBOX' }))))
})

// One-time migration worker for installations of the previous single-file app.
self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key === 'gym-progress-v3') await caches.delete(key)
  await self.clients.claim()
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  await Promise.all(clients.map((client) => client.navigate(client.url)))
  await self.registration.unregister()
})()))

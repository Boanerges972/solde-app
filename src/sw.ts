/// <reference lib="webworker" />
import { PrecacheController, cleanupOutdatedCaches } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & typeof globalThis

// Registers activate handler to remove stale precaches
cleanupOutdatedCaches()

const controller = new PrecacheController()
controller.addToCacheList(self.__WB_MANIFEST)

self.addEventListener('install', (event) => {
  // Activate immediately, don't wait for old SW to finish
  self.skipWaiting()
  event.waitUntil(controller.install(event))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      controller.activate(event),
      self.clients.claim(),
      // Wipe all legacy caches (qdq-v4, etc.)
      caches.keys().then(keys =>
        Promise.all(
          keys.filter(k => !k.startsWith('workbox-')).map(k => caches.delete(k))
        )
      ),
    ])
  )
})

// ── Web Push ─────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; tag?: string; url?: string } = {}
  try { data = event.data ? event.data.json() : {} } catch { /* payload non-JSON */ }
  event.waitUntil(
    self.registration.showNotification(data.title || 'QDQ', {
      body: data.body || '',
      tag: data.tag || 'qdq',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string })?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => 'focus' in c)
      if (existing) { existing.navigate(url); return existing.focus() }
      return self.clients.openWindow(url)
    })
  )
})

self.addEventListener('fetch', (event) => {
  // Hard stop: never touch non-http schemes (chrome-extension://, etc.)
  if (!event.request.url.startsWith('http')) return

  // Serve from precache if available, else network
  event.respondWith(
    controller.matchPrecache(event.request).then(
      cached => cached ?? fetch(event.request)
    )
  )
})

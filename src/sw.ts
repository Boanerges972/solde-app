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

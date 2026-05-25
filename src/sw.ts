/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

self.skipWaiting()
cleanupOutdatedCaches()

// Filter out unsupported URL schemes (chrome-extension, moz-extension, etc.)
const manifest = (self as unknown as { __WB_MANIFEST: { url: string; revision: string | null }[] }).__WB_MANIFEST
const filteredManifest = manifest.filter(({ url }) => url.startsWith('/') || url.startsWith('https://') || url.startsWith('http://'))
precacheAndRoute(filteredManifest)

self.addEventListener('fetch', (event) => {
  // Skip non-http(s) schemes
  if (!event.request.url.startsWith('http')) return
  // Let workbox handle the rest via precacheAndRoute
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Delete all old caches (breaks the qdq-v4 legacy cache cycle)
      caches.keys().then(keys =>
        Promise.all(
          keys.filter(k => !k.startsWith('workbox-')).map(k => caches.delete(k))
        )
      ),
    ])
  )
})

const CACHE_NAME = 'pocketflow-v1'

// Recursos estáticos iniciales a cachear
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.png',
  './apple-touch-icon.png',
  './pwa-192x192.png',
  './pwa-512x512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // No interceptar peticiones ajenas o esquemas no http/https
  if (!request.url.startsWith('http')) return

  // Navegación (HTML): Network first con fallback a cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const cloned = networkResponse.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned))
          return networkResponse
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    )
    return
  }

  // Assets estáticos (JS, CSS, imágenes): Cache first con actualización en segundo plano
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Revalidación en segundo plano
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse))
            }
          })
          .catch(() => {
            // Offline silencioso
          })
        return cached
      }

      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const cloned = networkResponse.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned))
        }
        return networkResponse
      })
    })
  )
})

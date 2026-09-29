import { APP_BUILD, APP_VERSION } from '../version'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Genera el identificador único canónico de caché para el Service Worker.
 * Formato: pocketflow-v<APP_VERSION>-<APP_BUILD>
 */
export function getServiceWorkerCacheName(version: string = APP_VERSION, build: string = APP_BUILD): string {
  return `pocketflow-v${version}-${build}`
}

/**
 * Genera el código fuente JavaScript completo para el Service Worker.
 */
export function generateServiceWorkerCode(version: string = APP_VERSION, build: string = APP_BUILD): string {
  const cacheName = getServiceWorkerCacheName(version, build)

  return `// PocketFlow Service Worker v${version} (${build})
const CACHE_NAME = '${cacheName}'

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

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    if (typeof event.waitUntil === 'function') {
      event.waitUntil(self.skipWaiting())
    } else {
      self.skipWaiting()
    }
  }
})

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
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
            .map((name) => caches.delete(name).catch(() => false))
        )
      )
      .catch((err) => {
        console.warn('[SW] Error clearing old caches:', err)
      })
      .then(() => self.clients.claim())
  )
})

/**
 * Determina si una petición es apta para ser gestionada y cacheada por el Service Worker.
 * Solo se cachean assets locales (mismo origen) con método GET.
 * Las peticiones a Supabase (*.supabase.co, API REST, Auth, Realtime, Storage) quedan estrictamente excluidas.
 */
function shouldHandleFetch(request) {
  if (request.method !== 'GET') return false
  if (!request.url.startsWith('http')) return false

  try {
    const url = new URL(request.url)

    // Excluir de forma estricta cualquier llamada a Supabase o APIs externas
    if (url.hostname.includes('supabase.co') || url.hostname.includes('supabase.in')) {
      return false
    }

    // Excluir endpoints típicos de API y backend
    if (
      url.pathname.startsWith('/rest/v1') ||
      url.pathname.startsWith('/auth/v1') ||
      url.pathname.startsWith('/realtime/v1') ||
      url.pathname.startsWith('/storage/v1')
    ) {
      return false
    }

    // Solo gestionar peticiones del mismo origen (App Shell y Assets estáticos propios)
    return url.origin === self.location.origin
  } catch {
    return false
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (!shouldHandleFetch(request)) {
    return // Dejar pasar directamente a la red sin interceptar ni cachear
  }

  // Navegación (HTML): Network first con fallback a cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then((networkResponse) => {
          const cloned = networkResponse.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned))
          return networkResponse
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    )
    return
  }

  // Assets estáticos locales (JS, CSS, imágenes): Cache first con actualización en segundo plano
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
`
}

/**
 * Escribe el Service Worker con la versión y build actual en la ruta especificada (por defecto public/sw.js).
 */
export function writeServiceWorkerFile(
  targetPath = path.resolve(process.cwd(), 'public', 'sw.js'),
  version = APP_VERSION,
  build = APP_BUILD
): string {
  const code = generateServiceWorkerCode(version, build)
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, code, 'utf-8')
  return code
}

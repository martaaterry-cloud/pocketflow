/**
 * Utilidades para detección y activación automática de actualizaciones PWA en PocketFlow.
 * Adopta la estrategia simple y probada de Orbit (skipWaiting automático + reload en controllerchange).
 */

export type PwaUpdateCheckResult = 'available' | 'up-to-date' | 'error'

/**
 * Log helper exclusivo para entorno de desarrollo.
 */
export function devLog(...args: unknown[]): void {
  try {
    if (
      (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') ||
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV)
    ) {
      console.log(...args)
    }
  } catch {
    // Ignorar en entornos sin import.meta
  }
}

/**
 * Crea un manejador de recarga seguro que previene bucles de recarga ante múltiples eventos.
 */
export function createReloadHandler(reloadFn: () => void = () => window.location.reload()): () => void {
  let refreshing = false
  return () => {
    if (!refreshing) {
      refreshing = true
      reloadFn()
    }
  }
}

/**
 * Determina si debe comprobarse una actualización según el estado de visibilidad del documento.
 */
export function shouldCheckUpdateOnVisibility(visibilityState: string): boolean {
  return visibilityState === 'visible'
}

/**
 * Determina si hay una actualización disponible (compatibilidad de tests).
 */
export function isPwaUpdateAvailable(hasController: boolean, workerState?: string): boolean {
  return Boolean(hasController && workerState === 'installed')
}

/**
 * Envía un mensaje SKIP_WAITING a un worker (compatibilidad de tests).
 */
export function sendSkipWaiting(worker: ServiceWorker | null | undefined): boolean {
  if (worker && typeof worker.postMessage === 'function') {
    worker.postMessage({ type: 'SKIP_WAITING' })
    return true
  }
  return false
}

/**
 * Comprueba si hay una nueva versión del Service Worker mediante registration.update().
 * No requiere interacción del usuario: el nuevo worker se instala, llama skipWaiting()
 * automáticamente y controllerchange refresca la página una sola vez.
 */
export async function checkServiceWorkerUpdate(
  registration: ServiceWorkerRegistration | null | undefined,
  timeoutOrLegacyParam?: boolean | number,
  legacyTimeoutMs?: number
): Promise<PwaUpdateCheckResult> {
  const timeoutMs =
    typeof legacyTimeoutMs === 'number'
      ? legacyTimeoutMs
      : typeof timeoutOrLegacyParam === 'number'
      ? timeoutOrLegacyParam
      : 2500
  let activeReg = registration
  if (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof navigator.serviceWorker.getRegistration === 'function'
  ) {
    try {
      const freshReg = await navigator.serviceWorker.getRegistration()
      if (freshReg) {
        activeReg = freshReg
      }
    } catch {
      // Usar activeReg fallback
    }
  }

  if (!activeReg) {
    return typeof navigator !== 'undefined' && !navigator.onLine ? 'error' : 'up-to-date'
  }

  // Si ya hay un worker instalándose o esperando (que se auto-activará por skipWaiting)
  if (activeReg.installing || activeReg.waiting) {
    devLog('[PWA] new worker already installing/waiting')
    return 'available'
  }

  return new Promise<PwaUpdateCheckResult>((resolve) => {
    let resolved = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let updateFoundListener: (() => void) | null = null

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (updateFoundListener && activeReg && typeof activeReg.removeEventListener === 'function') {
        activeReg.removeEventListener('updatefound', updateFoundListener)
      }
    }

    const finish = (result: PwaUpdateCheckResult) => {
      if (!resolved) {
        resolved = true
        cleanup()
        devLog('[PWA] checkServiceWorkerUpdate result:', result)
        resolve(result)
      }
    }

    if (typeof activeReg.addEventListener === 'function') {
      updateFoundListener = () => {
        devLog('[PWA] updatefound fired during manual check')
        finish('available')
      }
      activeReg.addEventListener('updatefound', updateFoundListener)
    }

    timer = setTimeout(() => {
      if (activeReg?.installing || activeReg?.waiting) {
        finish('available')
      } else {
        finish('up-to-date')
      }
    }, timeoutMs)

    try {
      const updatePromise = activeReg.update()
      if (updatePromise && typeof updatePromise.then === 'function') {
        updatePromise
          .then(async () => {
            // Breve margen para propagación de updatefound
            setTimeout(async () => {
              if (resolved) return
              try {
                if (
                  typeof navigator !== 'undefined' &&
                  'serviceWorker' in navigator &&
                  typeof navigator.serviceWorker.getRegistration === 'function'
                ) {
                  const fresh = await navigator.serviceWorker.getRegistration()
                  if (fresh?.installing || fresh?.waiting) {
                    finish('available')
                    return
                  }
                }
              } catch {
                // Ignorar
              }
            }, 300)
          })
          .catch((err) => {
            devLog('[PWA] registration.update() rejected:', err)
            finish('error')
          })
      }
    } catch (err) {
      devLog('[PWA] registration.update() threw exception:', err)
      finish('error')
    }
  })
}


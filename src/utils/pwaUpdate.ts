/**
 * Utilidades para detección y activación de actualizaciones PWA en PocketFlow.
 */

export interface WorkerWithMessage {
  postMessage: (message: any) => void
  state?: string
  addEventListener?: (event: string, listener: () => void) => void
  removeEventListener?: (event: string, listener: () => void) => void
}

export type PwaUpdateCheckResult = 'available' | 'up-to-date' | 'error'

/**
 * Determina si una instalación de service worker corresponde a una actualización real
 * (existe un controlador previo activo) o si es la primera instalación (no hay controlador).
 */
export function isPwaUpdateAvailable(hasController: boolean, workerState?: string): boolean {
  return Boolean(hasController) && workerState === 'installed'
}

/**
 * Envía el mensaje SKIP_WAITING al worker en espera para que tome el control.
 */
export function sendSkipWaiting(worker: WorkerWithMessage | null | undefined): boolean {
  if (!worker || typeof worker.postMessage !== 'function') {
    return false
  }
  worker.postMessage({ type: 'SKIP_WAITING' })
  return true
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
 * Ejecuta una comprobación manual de actualización sobre el registro del Service Worker.
 */
export async function checkServiceWorkerUpdate(
  registration: ServiceWorkerRegistration | null | undefined,
  hasController: boolean = typeof navigator !== 'undefined' && Boolean(navigator?.serviceWorker?.controller),
  timeoutMs: number = 2000
): Promise<PwaUpdateCheckResult> {
  if (!registration) {
    // Si no hay soporte o registro activo
    return typeof navigator !== 'undefined' && !navigator.onLine ? 'error' : 'up-to-date'
  }

  // 1. Si ya existe un worker en espera instalado
  if (registration.waiting && isPwaUpdateAvailable(hasController, registration.waiting.state)) {
    return 'available'
  }

  return new Promise<PwaUpdateCheckResult>((resolve) => {
    let resolved = false
    let updateFoundListener: (() => void) | null = null
    let installingStateListener: (() => void) | null = null
    let installingWorkerRef: ServiceWorker | null = null

    const cleanup = () => {
      if (updateFoundListener && typeof registration.removeEventListener === 'function') {
        registration.removeEventListener('updatefound', updateFoundListener)
      }
      if (installingWorkerRef && installingStateListener && typeof installingWorkerRef.removeEventListener === 'function') {
        installingWorkerRef.removeEventListener('statechange', installingStateListener)
      }
    }

    const finish = (result: PwaUpdateCheckResult) => {
      if (!resolved) {
        resolved = true
        cleanup()
        resolve(result)
      }
    }

    const timer = setTimeout(() => {
      // Si ya hay un worker en espera al terminar el tiempo
      if (registration.waiting && isPwaUpdateAvailable(hasController, registration.waiting.state)) {
        finish('available')
      } else {
        finish('up-to-date')
      }
    }, timeoutMs)

    // 2. Si ya hay un worker instalándose en este momento
    if (registration.installing) {
      installingWorkerRef = registration.installing
      installingStateListener = () => {
        if (installingWorkerRef && isPwaUpdateAvailable(hasController, installingWorkerRef.state)) {
          clearTimeout(timer)
          finish('available')
        }
      }
      installingWorkerRef.addEventListener?.('statechange', installingStateListener)
    }

    // 3. Escuchar si update() descubre un nuevo worker
    if (typeof registration.addEventListener === 'function') {
      updateFoundListener = () => {
        const newWorker = registration.installing
        if (!newWorker) return
        installingWorkerRef = newWorker
        installingStateListener = () => {
          if (isPwaUpdateAvailable(hasController, newWorker.state)) {
            clearTimeout(timer)
            finish('available')
          }
        }
        newWorker.addEventListener?.('statechange', installingStateListener)
      }
      registration.addEventListener('updatefound', updateFoundListener)
    }

    // 4. Ejecutar registration.update()
    try {
      const updatePromise = registration.update()
      if (updatePromise && typeof updatePromise.then === 'function') {
        updatePromise
          .then(() => {
            // Dar un breve margen por si el evento updatefound o statechange está transicionando
            setTimeout(() => {
              if (!resolved) {
                if (registration.waiting && isPwaUpdateAvailable(hasController, registration.waiting.state)) {
                  clearTimeout(timer)
                  finish('available')
                } else if (!registration.installing) {
                  clearTimeout(timer)
                  finish('up-to-date')
                }
              }
            }, 400)
          })
          .catch(() => {
            clearTimeout(timer)
            finish('error')
          })
      }
    } catch {
      clearTimeout(timer)
      finish('error')
    }
  })
}


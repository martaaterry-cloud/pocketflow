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
 * Ejecuta una comprobación robusta de actualización sobre el registro del Service Worker.
 * Evita declarar "up-to-date" prematuramente y re-consulta el registro fresco.
 */
export async function checkServiceWorkerUpdate(
  registration: ServiceWorkerRegistration | null | undefined,
  hasController: boolean = typeof navigator !== 'undefined' && Boolean(navigator?.serviceWorker?.controller),
  timeoutMs: number = 3500
): Promise<PwaUpdateCheckResult> {
  // 1. Re-consultar el registro fresco si está disponible para evitar referencias obsoletas (Safari/iOS)
  let activeReg = registration
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistration === 'function') {
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

  devLog('[PWA] current controller:', hasController)
  devLog('[PWA] registration active:', Boolean(activeReg.active))
  devLog('[PWA] installing:', Boolean(activeReg.installing))
  devLog('[PWA] waiting:', Boolean(activeReg.waiting))

  // 2. Si ya existe un worker en espera instalado
  if (activeReg.waiting && isPwaUpdateAvailable(hasController, activeReg.waiting.state)) {
    devLog('[PWA] found waiting worker installed immediately')
    return 'available'
  }

  return new Promise<PwaUpdateCheckResult>((resolve) => {
    let resolved = false
    let isInstallingActive = Boolean(activeReg?.installing)
    let updateFoundListener: (() => void) | null = null
    let installingStateListener: (() => void) | null = null
    let installingWorkerRef: ServiceWorker | null = null
    let pollInterval: ReturnType<typeof setInterval> | null = null
    let mainTimer: ReturnType<typeof setTimeout> | null = null
    let maxWaitTimer: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      if (pollInterval) {
        clearInterval(pollInterval)
        pollInterval = null
      }
      if (mainTimer) {
        clearTimeout(mainTimer)
        mainTimer = null
      }
      if (maxWaitTimer) {
        clearTimeout(maxWaitTimer)
        maxWaitTimer = null
      }
      if (updateFoundListener && activeReg && typeof activeReg.removeEventListener === 'function') {
        activeReg.removeEventListener('updatefound', updateFoundListener)
      }
      if (installingWorkerRef && installingStateListener && typeof installingWorkerRef.removeEventListener === 'function') {
        installingWorkerRef.removeEventListener('statechange', installingStateListener)
      }
    }

    const finish = (result: PwaUpdateCheckResult) => {
      if (!resolved) {
        resolved = true
        cleanup()
        devLog('[PWA] checkServiceWorkerUpdate finished with:', result)
        resolve(result)
      }
    }

    const trackWorker = (worker: ServiceWorker | null) => {
      if (!worker) return
      installingWorkerRef = worker
      isInstallingActive = true
      devLog('[PWA] tracking installing worker:', worker.state)

      installingStateListener = () => {
        devLog('[PWA] statechange:', worker.state)
        if (isPwaUpdateAvailable(hasController, worker.state)) {
          finish('available')
        } else if (worker.state === 'redundant') {
          isInstallingActive = false
        }
      }
      worker.addEventListener?.('statechange', installingStateListener)
    }

    // 3. Si ya hay un worker instalándose
    if (activeReg.installing) {
      trackWorker(activeReg.installing)
    }

    // 4. Escuchar updatefound
    if (typeof activeReg.addEventListener === 'function') {
      updateFoundListener = () => {
        devLog('[PWA] updatefound event fired')
        const newWorker = activeReg?.installing
        if (newWorker) {
          trackWorker(newWorker)
        }
      }
      activeReg.addEventListener('updatefound', updateFoundListener)
    }

    // 5. Polling de respaldo para reconsultar navigator.serviceWorker.getRegistration()
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistration === 'function') {
      pollInterval = setInterval(async () => {
        if (resolved) return
        try {
          const fresh = await navigator.serviceWorker.getRegistration()
          if (fresh?.waiting && isPwaUpdateAvailable(hasController, fresh.waiting.state)) {
            devLog('[PWA] polling discovered waiting worker')
            finish('available')
          } else if (fresh?.installing && !installingWorkerRef) {
            trackWorker(fresh.installing)
          }
        } catch {
          // Continuar
        }
      }, 500)
    }

    // 6. Timer principal de espera razonable
    mainTimer = setTimeout(async () => {
      if (resolved) return

      // Re-verificar antes de concluir
      if (activeReg?.waiting && isPwaUpdateAvailable(hasController, activeReg.waiting.state)) {
        finish('available')
        return
      }

      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistration === 'function') {
        try {
          const fresh = await navigator.serviceWorker.getRegistration()
          if (fresh?.waiting && isPwaUpdateAvailable(hasController, fresh.waiting.state)) {
            finish('available')
            return
          }
        } catch {
          // Ignorar
        }
      }

      // Si un worker sigue en proceso de instalación, no declarar up-to-date prematuramente
      if (isInstallingActive && installingWorkerRef && installingWorkerRef.state === 'installing') {
        devLog('[PWA] worker still installing after main timeout, awaiting installation completion')
        return
      }

      finish('up-to-date')
    }, timeoutMs)

    // Timer de seguridad máxima si un worker se queda colgado instalando
    maxWaitTimer = setTimeout(() => {
      if (!resolved) {
        if (activeReg?.waiting && isPwaUpdateAvailable(hasController, activeReg.waiting.state)) {
          finish('available')
        } else {
          finish('up-to-date')
        }
      }
    }, Math.max(timeoutMs * 2, 8000))

    // 7. Ejecutar registration.update()
    try {
      const updatePromise = activeReg.update()
      if (updatePromise && typeof updatePromise.then === 'function') {
        updatePromise
          .then(async () => {
            devLog('[PWA] registration.update() promise resolved')
            // Re-consultar estado tras resolver la promesa de update
            try {
              if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistration === 'function') {
                const fresh = await navigator.serviceWorker.getRegistration()
                if (fresh?.waiting && isPwaUpdateAvailable(hasController, fresh.waiting.state)) {
                  finish('available')
                  return
                }
                if (fresh?.installing && !installingWorkerRef) {
                  trackWorker(fresh.installing)
                }
              }
            } catch {
              // Ignorar
            }
          })
          .catch((err) => {
            devLog('[PWA] registration.update() rejected with error:', err)
            // Si no hay conexión o falla la petición
            if (!resolved) {
              finish('error')
            }
          })
      }
    } catch (err) {
      devLog('[PWA] registration.update() threw exception:', err)
      finish('error')
    }
  })
}


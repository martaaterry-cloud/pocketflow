/**
 * Utilidades para detección y activación de actualizaciones PWA en PocketFlow.
 */

export interface WorkerWithMessage {
  postMessage: (message: any) => void
}

/**
 * Determina si una instalación de service worker corresponde a una actualización real
 * (existe un controlador previo activo) o si es la primera instalación (no hay controlador).
 */
export function isPwaUpdateAvailable(hasController: boolean, workerState: string): boolean {
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

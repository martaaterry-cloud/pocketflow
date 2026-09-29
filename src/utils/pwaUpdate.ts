/**
 * Utilidades para detección y activación automática de actualizaciones PWA en PocketFlow.
 * Arquitectura de doble capa:
 * 1. Capa remota: Comprobación de public/version.json con cache no-store.
 * 2. Capa Service Worker: skipWaiting automático en install + reload en controllerchange.
 */

import { APP_BUILD, APP_VERSION } from '../version'

export type PwaUpdateCheckResult = 'available' | 'up-to-date' | 'problem' | 'error'

export interface RemoteVersionInfo {
  version: string
  build: string
  name?: string
  generatedAt?: string
}

export interface PwaDiagnosticInfo {
  localVersion: string
  localBuild: string
  remoteVersion: string | null
  remoteBuild: string | null
  remoteCheckResult: 'newer' | 'same' | 'failed'
  registrationScope: string | null
  activeScriptURL: string | null
  activeState: string | null
  installingState: string | null
  waitingState: string | null
  controllerScriptURL: string | null
  hasController: boolean
  basePath: string
  lastCheckedAt: string
}

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
 * Obtiene la ruta base canónica de la aplicación (ej. '/pocketflow/' en GitHub Pages o './' en local/Capacitor).
 */
export function getAppBaseUrl(): string {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env?.BASE_URL) {
      const b = (import.meta as any).env.BASE_URL
      return b.endsWith('/') ? b : `${b}/`
    }
  } catch {
    // Fallback
  }
  return './'
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
 * Comprueba si la versión remota es diferente/más reciente que la local instalada.
 */
export function isRemoteVersionNewer(
  remote: RemoteVersionInfo | null | undefined,
  localVersion: string = APP_VERSION,
  localBuild: string = APP_BUILD
): boolean {
  if (!remote || !remote.version || !remote.build) return false
  return remote.version !== localVersion || remote.build !== localBuild
}

/**
 * Consulta el archivo version.json remoto garantizando bypass de caché HTTP y del Service Worker.
 */
export async function fetchRemoteVersion(
  basePath: string = getAppBaseUrl(),
  customFetch: typeof fetch = typeof fetch !== 'undefined' ? fetch : (null as any)
): Promise<RemoteVersionInfo | null> {
  if (typeof customFetch !== 'function') return null

  try {
    const cleanBase = basePath.endsWith('/') ? basePath : `${basePath}/`
    const url = `${cleanBase}version.json?ts=${Date.now()}`
    devLog('[PWA] fetching remote version from:', url)

    const response = await customFetch(url, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    })

    if (!response || !response.ok) {
      devLog('[PWA] fetchRemoteVersion failed with status:', response?.status)
      return null
    }

    const data = await response.json()
    if (data && typeof data.version === 'string' && typeof data.build === 'string') {
      devLog('[PWA] fetched remote version info:', data)
      return data as RemoteVersionInfo
    }
    return null
  } catch (err) {
    devLog('[PWA] fetchRemoteVersion exception:', err)
    return null
  }
}

/**
 * Recopila información detallada de diagnóstico de la PWA y el Service Worker.
 */
export async function collectPwaDiagnosticInfo(
  registration?: ServiceWorkerRegistration | null,
  basePath: string = getAppBaseUrl()
): Promise<PwaDiagnosticInfo> {
  let activeReg = registration
  if (
    !activeReg &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof navigator.serviceWorker.getRegistration === 'function'
  ) {
    try {
      activeReg = (await navigator.serviceWorker.getRegistration()) || null
    } catch {
      // Ignorar
    }
  }

  const remote = await fetchRemoteVersion(basePath)
  const isNewer = isRemoteVersionNewer(remote)

  return {
    localVersion: APP_VERSION,
    localBuild: APP_BUILD,
    remoteVersion: remote?.version || null,
    remoteBuild: remote?.build || null,
    remoteCheckResult: remote ? (isNewer ? 'newer' : 'same') : 'failed',
    registrationScope: activeReg?.scope || null,
    activeScriptURL: activeReg?.active?.scriptURL || null,
    activeState: activeReg?.active?.state || null,
    installingState: activeReg?.installing?.state || null,
    waitingState: activeReg?.waiting?.state || null,
    controllerScriptURL:
      typeof navigator !== 'undefined' && navigator.serviceWorker?.controller
        ? navigator.serviceWorker.controller.scriptURL
        : null,
    hasController: typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller),
    basePath,
    lastCheckedAt: new Date().toISOString(),
  }
}

/**
 * Comprueba si hay una nueva versión mediante verificación remota independiente + Service Worker.
 * Si remoto > local:
 *   - Llama a registration.update()
 *   - NUNCA declara 'up-to-date' por timeout si la versión remota es superior.
 *   - Si el SW no actualiza tras el margen, devuelve 'problem' o 'available'.
 * Si remoto == local:
 *   - Devuelve 'up-to-date'.
 */
export async function checkServiceWorkerUpdate(
  registration?: ServiceWorkerRegistration | null,
  timeoutOrLegacyParam?: boolean | number,
  legacyTimeoutMs?: number,
  customFetch?: typeof fetch,
  basePath: string = getAppBaseUrl()
): Promise<PwaUpdateCheckResult> {
  const timeoutMs =
    typeof legacyTimeoutMs === 'number'
      ? legacyTimeoutMs
      : typeof timeoutOrLegacyParam === 'number'
      ? timeoutOrLegacyParam
      : 2500

  let activeReg = registration ?? null
  if (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof navigator.serviceWorker?.getRegistration === 'function'
  ) {
    try {
      const freshReg = await navigator.serviceWorker.getRegistration()
      if (freshReg) {
        activeReg = freshReg
      }
    } catch {
      // Ignorar
    }
  }

  // 1. Si ya hay un worker en proceso de instalación o esperando
  if (activeReg?.installing || activeReg?.waiting) {
    devLog('[PWA] active worker already installing/waiting')
    return 'available'
  }

  // 2. Consultar versión remota real independiente
  const remote = await fetchRemoteVersion(basePath, customFetch)
  const remoteIsNewer = isRemoteVersionNewer(remote)

  // 3. Caso: Versión remota confirmada e IDÉNTICA a la versión local
  if (remote && !remoteIsNewer) {
    devLog('[PWA] remote version matches local installed version exactly:', remote.version, remote.build)
    // Mantener SW sincronizado en segundo plano
    activeReg?.update().catch(() => {})
    return 'up-to-date'
  }

  // 4. Caso: Sin registro de ServiceWorker
  if (!activeReg) {
    if (remoteIsNewer) return 'available'
    const isOffline = typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.onLine === false
    return isOffline ? 'error' : 'up-to-date'
  }

  // 5. Caso: Hay registration -> ejecutar registration.update() y escuchar eventos
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
        devLog('[PWA] updatefound fired during check')
        finish('available')
      }
      activeReg.addEventListener('updatefound', updateFoundListener)
    }

    timer = setTimeout(() => {
      if (activeReg?.installing || activeReg?.waiting) {
        finish('available')
      } else if (remoteIsNewer) {
        // La versión remota es nueva pero Safari/SW no ha disparado updatefound
        devLog('[PWA] remote is newer but SW updatefound has not fired within timeout')
        finish('problem')
      } else if (remote) {
        finish('up-to-date')
      } else {
        const isOffline = typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.onLine === false
        finish(isOffline ? 'error' : 'up-to-date')
      }
    }, timeoutMs)

    try {
      const updatePromise = activeReg.update()
      if (updatePromise && typeof updatePromise.then === 'function') {
        updatePromise
          .then(async () => {
            // Breve verificación tras resolución de update()
            setTimeout(async () => {
              if (resolved) return
              if (activeReg?.installing || activeReg?.waiting) {
                finish('available')
                return
              }
              if (remoteIsNewer) {
                finish('problem')
                return
              }
              if (remote) {
                finish('up-to-date')
              }
            }, 50)
          })
          .catch((err) => {
            devLog('[PWA] registration.update() rejected:', err)
            if (remoteIsNewer) {
              finish('problem')
            } else {
              finish('error')
            }
          })
      }
    } catch (err) {
      devLog('[PWA] registration.update() threw exception:', err)
      if (remoteIsNewer) {
        finish('problem')
      } else {
        finish('error')
      }
    }
  })
}

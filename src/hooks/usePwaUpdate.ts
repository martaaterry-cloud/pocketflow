import { useEffect, useRef, useState, useCallback } from 'react'
import { createReloadHandler, isPwaUpdateAvailable, sendSkipWaiting, checkServiceWorkerUpdate, type PwaUpdateCheckResult } from '../utils/pwaUpdate'

export interface PwaUpdateState {
  updateAvailable: boolean
  isUpdating: boolean
  updateApp: () => void
  checkForUpdate: () => Promise<PwaUpdateCheckResult>
}

export function usePwaUpdate(): PwaUpdateState {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const waitingWorkerRef = useRef<ServiceWorker | null>(null)

  const updateApp = useCallback(() => {
    setIsUpdating(true)

    // 1. Intentar activar el worker en espera que capturamos
    if (waitingWorkerRef.current) {
      sendSkipWaiting(waitingWorkerRef.current)
      return
    }

    // 2. Fallback: buscar worker en espera en el registro actual
    if (registrationRef.current?.waiting) {
      sendSkipWaiting(registrationRef.current.waiting)
      return
    }

    // 3. Fallback adicional: forzar update o recargar de forma segura
    if (registrationRef.current) {
      registrationRef.current.update().catch(() => {})
    }

    setTimeout(() => {
      window.location.reload()
    }, 350)
  }, [])

  const checkForUpdate = useCallback(async (): Promise<PwaUpdateCheckResult> => {
    const hasController = typeof navigator !== 'undefined' && Boolean(navigator?.serviceWorker?.controller)
    const result = await checkServiceWorkerUpdate(registrationRef.current, hasController)

    if (result === 'available') {
      if (registrationRef.current?.waiting) {
        waitingWorkerRef.current = registrationRef.current.waiting
      }
      setUpdateAvailable(true)
    }

    return result
  }, [])

  useEffect(() => {
    // No registrar ni ejecutar Service Worker dentro de Capacitor nativo
    const isCapacitor = typeof window !== 'undefined' && Boolean((window as any).Capacitor)
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || isCapacitor) {
      return
    }

    const reloadOnce = createReloadHandler(() => {
      window.location.reload()
    })

    const onControllerChange = () => {
      reloadOnce()
    }

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register('./sw.js')
        registrationRef.current = reg

        // Si ya hay un worker en espera (p. ej. pestaña abierta tras update previo)
        if (reg.waiting && isPwaUpdateAvailable(Boolean(navigator.serviceWorker.controller), reg.waiting.state)) {
          waitingWorkerRef.current = reg.waiting
          setUpdateAvailable(true)
        }

        // Escuchar cuando se descubre un nuevo worker
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            if (isPwaUpdateAvailable(Boolean(navigator.serviceWorker.controller), newWorker.state)) {
              waitingWorkerRef.current = newWorker
              setUpdateAvailable(true)
            }
          })
        })

        // Comprobación inicial de actualización
        reg.update().catch(() => {})
      } catch (err) {
        console.warn('[PWA] Error registrando o comprobando Service Worker:', err)
      }
    }

    registerSW()

    // Comprobar actualización automáticamente cuando la app vuelve a primer plano
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && registrationRef.current) {
        registrationRef.current.update().catch(() => {})
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return {
    updateAvailable,
    isUpdating,
    updateApp,
    checkForUpdate,
  }
}

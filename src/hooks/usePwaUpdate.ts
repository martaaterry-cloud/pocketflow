import { useEffect, useRef, useState, useCallback } from 'react'
import {
  createReloadHandler,
  isPwaUpdateAvailable,
  sendSkipWaiting,
  checkServiceWorkerUpdate,
  devLog,
  type PwaUpdateCheckResult,
} from '../utils/pwaUpdate'

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
  const activeCheckPromiseRef = useRef<Promise<PwaUpdateCheckResult> | null>(null)

  const updateApp = useCallback(async () => {
    setIsUpdating(true)
    devLog('[PWA] updateApp triggered')

    // 1. Obtener registro fresco y worker en espera
    let worker = waitingWorkerRef.current
    if (!worker && registrationRef.current?.waiting) {
      worker = registrationRef.current.waiting
    }
    if (!worker && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistration === 'function') {
      try {
        const reg = await navigator.serviceWorker.getRegistration()
        if (reg?.waiting) {
          worker = reg.waiting
        }
      } catch {
        // Ignorar
      }
    }

    if (worker) {
      devLog('[PWA] sending SKIP_WAITING to waiting worker')
      waitingWorkerRef.current = worker
      sendSkipWaiting(worker)
      // La recarga ocurrirá de forma segura cuando se dispare el evento 'controllerchange'
    } else {
      devLog('[PWA] no waiting worker found to activate, checking update')
      if (registrationRef.current) {
        registrationRef.current.update().catch(() => {})
      }
      setIsUpdating(false)
    }
  }, [])

  const checkForUpdate = useCallback(async (): Promise<PwaUpdateCheckResult> => {
    // Evitar comprobaciones concurrentes reutilizando la Promise activa
    if (activeCheckPromiseRef.current) {
      devLog('[PWA] reusing active checkForUpdate promise')
      return activeCheckPromiseRef.current
    }

    const checkPromise = (async (): Promise<PwaUpdateCheckResult> => {
      let currentReg = registrationRef.current
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistration === 'function') {
        try {
          const freshReg = await navigator.serviceWorker.getRegistration()
          if (freshReg) {
            currentReg = freshReg
            registrationRef.current = freshReg
          }
        } catch {
          // Usar registrationRef.current
        }
      }

      const hasController = typeof navigator !== 'undefined' && Boolean(navigator?.serviceWorker?.controller)
      const result = await checkServiceWorkerUpdate(currentReg, hasController)

      if (result === 'available') {
        // Re-verificar worker en espera
        if (currentReg?.waiting) {
          waitingWorkerRef.current = currentReg.waiting
        } else if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistration === 'function') {
          try {
            const fresh = await navigator.serviceWorker.getRegistration()
            if (fresh?.waiting) {
              waitingWorkerRef.current = fresh.waiting
            }
          } catch {
            // Ignorar
          }
        }
        setUpdateAvailable(true)
      }

      return result
    })()

    activeCheckPromiseRef.current = checkPromise
    try {
      return await checkPromise
    } finally {
      activeCheckPromiseRef.current = null
    }
  }, [])

  useEffect(() => {
    // No registrar ni ejecutar Service Worker dentro de Capacitor nativo
    const isCapacitor = typeof window !== 'undefined' && Boolean((window as any).Capacitor)
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || isCapacitor) {
      return
    }

    const reloadOnce = createReloadHandler(() => {
      devLog('[PWA] reloading window once after controllerchange')
      window.location.reload()
    })

    const onControllerChange = () => {
      devLog('[PWA] controllerchange event fired')
      reloadOnce()
    }

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    const registerSW = async () => {
      try {
        devLog('[PWA] registering Service Worker with updateViaCache: none')
        // Registrar con updateViaCache: 'none' para obligar a Safari/iOS y browsers a consultar la red
        const reg = await navigator.serviceWorker.register('./sw.js', {
          updateViaCache: 'none',
        })
        registrationRef.current = reg

        // Si ya hay un worker en espera instalado
        if (reg.waiting && isPwaUpdateAvailable(Boolean(navigator.serviceWorker.controller), reg.waiting.state)) {
          devLog('[PWA] active waiting worker detected on registration')
          waitingWorkerRef.current = reg.waiting
          setUpdateAvailable(true)
        }

        // Escuchar cuando se descubre un nuevo worker
        reg.addEventListener('updatefound', () => {
          devLog('[PWA] updatefound on initial registration')
          const newWorker = reg.installing
          if (!newWorker) return

          newWorker.addEventListener('statechange', () => {
            devLog('[PWA] statechange on registration worker:', newWorker.state)
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
    // (soporta visibilitychange, pageshow y focus para PWA standalone en iOS)
    let lastForegroundCheck = 0
    const triggerForegroundCheck = () => {
      const now = Date.now()
      // Limitar a máximo una comprobación cada 5 segundos al cambiar de foco
      if (now - lastForegroundCheck < 5000) return
      lastForegroundCheck = now

      if (document.visibilityState === 'visible') {
        devLog('[PWA] foreground event triggered update check')
        if (registrationRef.current) {
          registrationRef.current.update().catch(() => {})
        } else if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistration === 'function') {
          navigator.serviceWorker.getRegistration().then((reg) => {
            if (reg) {
              registrationRef.current = reg
              reg.update().catch(() => {})
            }
          }).catch(() => {})
        }
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerForegroundCheck()
      }
    }

    const onWindowFocus = () => {
      triggerForegroundCheck()
    }

    const onPageShow = () => {
      triggerForegroundCheck()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onWindowFocus)
    window.addEventListener('pageshow', onPageShow)

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onWindowFocus)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [])

  return {
    updateAvailable,
    isUpdating,
    updateApp,
    checkForUpdate,
  }
}

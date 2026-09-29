import { useEffect, useRef, useState, useCallback } from 'react'
import {
  createReloadHandler,
  checkServiceWorkerUpdate,
  devLog,
  type PwaUpdateCheckResult,
} from '../utils/pwaUpdate'

export interface PwaUpdateState {
  updateAvailable: boolean
  isUpdating: boolean
  updateApp: () => Promise<boolean>
  checkForUpdate: () => Promise<PwaUpdateCheckResult>
}

export function usePwaUpdate(): PwaUpdateState {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const activeCheckPromiseRef = useRef<Promise<PwaUpdateCheckResult> | null>(null)

  const checkForUpdate = useCallback(async (): Promise<PwaUpdateCheckResult> => {
    // Evitar comprobaciones concurrentes reutilizando la Promise activa
    if (activeCheckPromiseRef.current) {
      devLog('[PWA] reusing active checkForUpdate promise')
      return activeCheckPromiseRef.current
    }

    const checkPromise = (async (): Promise<PwaUpdateCheckResult> => {
      let currentReg = registrationRef.current
      if (
        typeof navigator !== 'undefined' &&
        'serviceWorker' in navigator &&
        typeof navigator.serviceWorker.getRegistration === 'function'
      ) {
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

      const result = await checkServiceWorkerUpdate(currentReg)

      if (result === 'available') {
        setUpdateAvailable(true)
        setIsUpdating(true)
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

  const updateApp = useCallback(async (): Promise<boolean> => {
    setIsUpdating(true)
    devLog('[PWA] updateApp triggered - requesting registration.update()')
    const result = await checkForUpdate()
    return result === 'available' || result === 'up-to-date'
  }, [checkForUpdate])

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
      setIsUpdating(true)
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

        // Si ya hay un worker instalándose o esperando (que se auto-activará por skipWaiting)
        if (reg.waiting || reg.installing) {
          devLog('[PWA] active worker detected on registration')
          setUpdateAvailable(true)
          setIsUpdating(true)
        }

        // Escuchar cuando se descubre un nuevo worker
        reg.addEventListener('updatefound', () => {
          devLog('[PWA] updatefound on registration')
          setUpdateAvailable(true)
          setIsUpdating(true)
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
        } else if (
          typeof navigator !== 'undefined' &&
          'serviceWorker' in navigator &&
          typeof navigator.serviceWorker.getRegistration === 'function'
        ) {
          navigator.serviceWorker
            .getRegistration()
            .then((reg) => {
              if (reg) {
                registrationRef.current = reg
                reg.update().catch(() => {})
              }
            })
            .catch(() => {})
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

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  createReloadHandler,
  checkServiceWorkerUpdate,
  fetchRemoteVersion,
  isRemoteVersionNewer,
  waitForServiceWorkerActivation,
  getAppBaseUrl,
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
  const reloadOnceRef = useRef<() => void>(
    createReloadHandler(() => {
      devLog('[PWA] reloading window once after service worker activation')
      window.location.reload()
    })
  )

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

      setIsUpdating(true)
      const result = await checkServiceWorkerUpdate(currentReg, 10000)

      if (result === 'available') {
        setUpdateAvailable(true)
        setIsUpdating(true)
        reloadOnceRef.current()
      } else if (result === 'problem') {
        setUpdateAvailable(true)
        setIsUpdating(false)
      } else if (result === 'up-to-date') {
        setUpdateAvailable(false)
        setIsUpdating(false)
      } else {
        setIsUpdating(false)
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
    devLog('[PWA] updateApp triggered - executing checkForUpdate')
    const result = await checkForUpdate()
    return result === 'available' || result === 'up-to-date'
  }, [checkForUpdate])

  useEffect(() => {
    // No registrar ni ejecutar Service Worker dentro de Capacitor nativo
    const isCapacitor = typeof window !== 'undefined' && Boolean((window as any).Capacitor)
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || isCapacitor) {
      return
    }

    const reloadOnce = reloadOnceRef.current

    const onControllerChange = () => {
      devLog('[PWA] controllerchange event fired')
      setIsUpdating(true)
      reloadOnce()
    }

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    const registerSW = async () => {
      try {
        const basePath = getAppBaseUrl()
        const swUrl = basePath.endsWith('/') ? `${basePath}sw.js` : `${basePath}/sw.js`
        const scope = basePath.endsWith('/') ? basePath : `${basePath}/`
        devLog(`[PWA] registering Service Worker at ${swUrl} with scope ${scope}`)

        // Registrar con updateViaCache: 'none' para obligar a Safari/iOS y browsers a consultar la red
        const reg = await navigator.serviceWorker.register(swUrl, {
          scope,
          updateViaCache: 'none',
        })
        registrationRef.current = reg

        const oldActive = reg.active
        const oldController = navigator.serviceWorker.controller

        // 1. Verificación remota inicial independiente
        fetchRemoteVersion(basePath).then(async (remote) => {
          if (isRemoteVersionNewer(remote)) {
            devLog('[PWA] remote version is newer on initial registration check')
            setUpdateAvailable(true)
            setIsUpdating(true)
            reg.update().catch(() => {})

            const activationRes = await waitForServiceWorkerActivation({
              registration: reg,
              oldActive,
              oldController,
              timeoutMs: 10000,
            })

            if (activationRes === 'activated') {
              reloadOnce()
            } else {
              setIsUpdating(false)
              setUpdateAvailable(true)
            }
          }
        }).catch(() => {})

        // 2. Si ya hay un worker instalándose o esperando (que se auto-activará por skipWaiting)
        if (reg.waiting || reg.installing) {
          devLog('[PWA] active worker detected on registration')
          setUpdateAvailable(true)
          setIsUpdating(true)
          waitForServiceWorkerActivation({
            registration: reg,
            oldActive,
            oldController,
            timeoutMs: 10000,
          }).then((res) => {
            if (res === 'activated') {
              reloadOnce()
            } else {
              setIsUpdating(false)
            }
          })
        }

        // 3. Escuchar cuando se descubre un nuevo worker
        reg.addEventListener('updatefound', () => {
          devLog('[PWA] updatefound on registration')
          const newWorker = reg.installing
          if (newWorker) {
            setUpdateAvailable(true)
            setIsUpdating(true)
            newWorker.addEventListener('statechange', () => {
              devLog(`[PWA] new worker statechange: ${newWorker.state}`)
              if (newWorker.state === 'activated') {
                reloadOnce()
              } else if (newWorker.state === 'redundant') {
                devLog('[PWA] new worker went redundant on updatefound')
                setIsUpdating(false)
                setUpdateAvailable(true)
              }
            })
          }
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
    const triggerForegroundCheck = async () => {
      const now = Date.now()
      if (now - lastForegroundCheck < 5000) return
      lastForegroundCheck = now

      if (document.visibilityState === 'visible') {
        devLog('[PWA] foreground event triggered update check')
        const remote = await fetchRemoteVersion(getAppBaseUrl())
        if (isRemoteVersionNewer(remote)) {
          devLog('[PWA] remote is newer during foreground check')
          setUpdateAvailable(true)
          setIsUpdating(true)

          const reg = registrationRef.current
          if (reg) {
            reg.update().catch(() => {})
            const activationRes = await waitForServiceWorkerActivation({
              registration: reg,
              oldActive: reg.active,
              oldController: navigator.serviceWorker.controller,
              timeoutMs: 10000,
            })
            if (activationRes === 'activated') {
              reloadOnce()
            } else {
              setIsUpdating(false)
              setUpdateAvailable(true)
            }
          }
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

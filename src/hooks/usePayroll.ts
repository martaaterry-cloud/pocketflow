import { useEffect, useState } from 'react'
import { isPayrollUserId, type PayrollValues } from '../models/payroll'
import { PayrollStore, type PayrollSnapshot } from '../services/payroll/payrollStore'
import { createSupabasePayrollGateway } from '../services/payroll/supabasePayroll'
import { getSupabase } from '../services/supabase/supabaseClient'

const empty = (userId: string | null): PayrollSnapshot => ({ userId: userId || '', ready: false, months: [], pending: 0,
  migrationIssues: 0, status: 'loading', error: null })

/** Se mantiene durante toda la sesión, aunque la pantalla Nóminas esté cerrada. */
export function usePayroll(userId: string | null) {
  const [state, setState] = useState<PayrollSnapshot>(() => empty(userId))
  const [store, setStore] = useState<PayrollStore | null>(null)
  useEffect(() => {
    setState(empty(userId)); setStore(null)
    if (!isPayrollUserId(userId)) return
    let active = true
    let controller: PayrollStore
    try {
      controller = new PayrollStore(userId, window.localStorage,
        createSupabasePayrollGateway(getSupabase(), userId, () => active), () => navigator.onLine)
    } catch {
      setState({ ...empty(userId), status: 'error', error: 'No se puede acceder al almacenamiento local. No se guardarán cambios hasta recuperarlo.' })
      return
    }
    setStore(controller)
    const unsubscribe = controller.subscribe(() => { if (active) setState(controller.getSnapshot()) })
    void controller.initialize()
    const sync = () => { if (active) void controller.sync() }
    const visibleSync = () => { if (document.visibilityState === 'visible') sync() }
    const storageChanged = (event: StorageEvent) => { if (event.key === controller.key) controller.refresh() }
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    window.addEventListener('focus', sync)
    window.addEventListener('storage', storageChanged)
    document.addEventListener('visibilitychange', visibleSync)
    const timer = setInterval(visibleSync, 30000)
    return () => {
      active = false; controller.dispose(); unsubscribe(); clearInterval(timer)
      window.removeEventListener('online', sync); window.removeEventListener('offline', sync)
      window.removeEventListener('focus', sync); window.removeEventListener('storage', storageChanged)
      document.removeEventListener('visibilitychange', visibleSync)
    }
  }, [userId])

  // Una transición de identidad nunca renderiza la caché del usuario anterior.
  const current = state.userId === userId ? state : empty(userId)
  const controller = () => {
    if (!store || store.userId !== userId || !current.ready) throw new Error('Inicia sesión y espera a que se carguen tus nóminas.')
    return store
  }
  return { ...current, save: (value: PayrollValues) => controller().save(value), remove: (month: string) => controller().remove(month),
    sync: () => controller().sync() }
}

export type PayrollState = ReturnType<typeof usePayroll>

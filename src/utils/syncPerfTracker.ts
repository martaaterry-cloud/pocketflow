/**
 * Tracker de rendimiento de sincronización Pocketflow [SYNC PERF].
 * Permite medir con precisión de milisegundos las fases del ciclo de sincronización.
 */

const isPerfEnabled = (): boolean => {
  if (typeof window === 'undefined') return false
  return (
    Boolean(typeof import.meta !== 'undefined' && import.meta.env?.DEV) ||
    window.localStorage?.getItem('POCKETFLOW_PERF_LOG') === '1'
  )
}

interface MutationTiming {
  correlationId: string
  entity: string
  action: string
  startTime: number
  uiUpdatedTime?: number
  cloudConfirmedTime?: number
  realtimeReceivedTime?: number
  cacheAppliedTime?: number
}

const activeTimings = new Map<string, MutationTiming>()

export function logPerfMutationStart(entity: string, action: string, correlationId: string): void {
  if (!isPerfEnabled()) return
  const now = performance.now()
  activeTimings.set(correlationId, {
    correlationId,
    entity,
    action,
    startTime: now,
  })
  console.log(`[SYNC PERF] local mutation start [${action} ${entity} id=${correlationId}] @ 0.0 ms`)
}

export function logPerfUiUpdated(correlationId: string): void {
  if (!isPerfEnabled()) return
  const t = activeTimings.get(correlationId)
  if (!t) return
  t.uiUpdatedTime = performance.now()
  const delta = (t.uiUpdatedTime - t.startTime).toFixed(1)
  console.log(`[SYNC PERF] UI state updated [${correlationId}]: +${delta} ms`)
}

export function logPerfCloudConfirmed(correlationId: string): void {
  if (!isPerfEnabled()) return
  const t = activeTimings.get(correlationId)
  const now = performance.now()
  if (t) {
    t.cloudConfirmedTime = now
    const delta = (now - t.startTime).toFixed(1)
    console.log(`[SYNC PERF] cloud mutation confirmed [${correlationId}]: +${delta} ms`)
  } else {
    console.log(`[SYNC PERF] cloud mutation confirmed [${correlationId}]`)
  }
}

export function logPerfRealtimeReceived(correlationId: string): void {
  if (!isPerfEnabled()) return
  const t = activeTimings.get(correlationId)
  const now = performance.now()
  if (t) {
    t.realtimeReceivedTime = now
    const delta = (now - t.startTime).toFixed(1)
    console.log(`[SYNC PERF] realtime received [${correlationId}]: +${delta} ms`)
  } else {
    console.log(`[SYNC PERF] realtime received (remoto) [${correlationId}]`)
  }
}

export function logPerfCacheApplied(correlationId: string): void {
  if (!isPerfEnabled()) return
  const t = activeTimings.get(correlationId)
  const now = performance.now()
  if (t) {
    t.cacheAppliedTime = now
    const delta = (now - t.startTime).toFixed(1)
    console.log(`[SYNC PERF] local cache applied [${correlationId}]: +${delta} ms`)
    activeTimings.delete(correlationId)
  }
}

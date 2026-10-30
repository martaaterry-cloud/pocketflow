import { canonicalPayroll, isPayrollEvent, isPayrollUserId, isPayrollValues, mergePayrollEvents, projectPayrollMonths, samePayrollEvent,
  type PayrollEvent, type PayrollValues } from '../../models/payroll'

export interface PayrollGateway {
  fetch(): Promise<PayrollEvent[]>
  append(event: PayrollEvent): Promise<PayrollEvent>
  subscribe?(onChange: () => void): () => void
}
export interface PayrollStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
interface PayrollCache { version: 1; userId: string; events: PayrollEvent[]; migrationIssues: number }
export const payrollKey = (userId: string) => `pocketflow:payroll:v1:${userId}`
export const legacyPayrollKey = (userId: string) => `pocketflow:payroll:local:${userId}`

export async function migrateLegacyPayroll(userId: string, raw: string | null): Promise<{ events: PayrollEvent[]; issues: number }> {
  if (!isPayrollUserId(userId)) throw new Error('Inicia sesión para acceder a tus nóminas.')
  if (raw === null) return { events: [], issues: 0 }
  let data: unknown
  try { data = JSON.parse(raw) } catch { return { events: [], issues: 1 } }
  if (!Array.isArray(data)) return { events: [], issues: 1 }
  const events: PayrollEvent[] = []
  let issues = 0
  for (const value of data) {
    if (!isPayrollValues(value)) { issues++; continue }
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId + ':' + canonicalPayroll(value)))
    const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    const values: PayrollValues = { month: value.month, gross: value.gross, socialSecurity: value.socialSecurity, irpf: value.irpf, net: value.net }
    events.push({ id: `legacy-${hash}`, userId, month: values.month, kind: 'legacy', values, clientCreatedAt: '1970-01-01T00:00:00.000Z' })
  }
  return { events: mergePayrollEvents(userId, events), issues }
}

export interface PayrollSnapshot {
  userId: string
  ready: boolean
  months: ReturnType<typeof projectPayrollMonths>
  pending: number
  migrationIssues: number
  status: 'loading' | 'syncing' | 'synced' | 'offline' | 'error'
  error: string | null
}

/** Caché durable y cola independientes: no importa ni modifica useFinance o sus adaptadores. */
export class PayrollStore {
  private cache: PayrollCache
  private snapshot: PayrollSnapshot
  private active = true
  private running: Promise<void> | null = null
  private requested = false
  private unsubscribe: (() => void) | undefined
  private listeners = new Set<() => void>()
  readonly key: string
  constructor(readonly userId: string, private storage: PayrollStorage, private gateway: PayrollGateway,
    private online = () => true, private now = () => Date.now(), private newId = () => crypto.randomUUID()) {
    if (!isPayrollUserId(userId)) throw new Error('Usuario de nóminas inválido.')
    this.key = payrollKey(userId)
    this.cache = { version: 1, userId, events: [], migrationIssues: 0 }
    this.snapshot = { userId, ready: false, months: [], pending: 0, migrationIssues: 0, status: 'loading', error: null }
  }
  getSnapshot = (): PayrollSnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private assertActive() { if (!this.active) throw new Error('La sesión de nóminas ha cambiado.') }
  private emit(status = this.snapshot.status, error: string | null = null, ready = this.snapshot.ready) {
    if (!this.active) return
    this.snapshot = { userId: this.userId, ready, status, error, months: projectPayrollMonths(this.cache.events),
      pending: this.cache.events.filter((e) => e.sequence === undefined).length, migrationIssues: this.cache.migrationIssues }
    this.listeners.forEach((listener) => listener())
  }
  private readCache(): PayrollCache {
    const raw = this.storage.getItem(this.key)
    if (!raw) return { version: 1, userId: this.userId, events: [], migrationIssues: 0 }
    const value = JSON.parse(raw) as PayrollCache
    if (value.version !== 1 || value.userId !== this.userId || !Array.isArray(value.events) ||
        !Number.isInteger(value.migrationIssues) || value.migrationIssues < 0 ||
        !value.events.every((e) => isPayrollEvent(e, this.userId))) throw new Error('La caché de nóminas no es válida; se ha conservado sin sobrescribirla.')
    return value
  }
  private persist(events: PayrollEvent[], issues = this.cache.migrationIssues) {
    this.assertActive()
    const latest = this.readCache()
    const next: PayrollCache = { version: 1, userId: this.userId,
      events: mergePayrollEvents(this.userId, latest.events, this.cache.events, events), migrationIssues: Math.max(issues, latest.migrationIssues) }
    const serialized = JSON.stringify(next)
    if (this.storage.getItem(this.key) !== serialized) {
      this.storage.setItem(this.key, serialized)
      if (this.storage.getItem(this.key) !== serialized) throw new Error('No se pudo confirmar el guardado local de las nóminas.')
    }
    this.cache = next
  }
  async initialize(): Promise<void> {
    try {
      this.cache = this.readCache()
      const migration = await migrateLegacyPayroll(this.userId, this.storage.getItem(legacyPayrollKey(this.userId)))
      this.assertActive()
      this.persist(migration.events, migration.issues)
      this.emit(this.online() ? 'syncing' : 'offline', null, true)
      this.unsubscribe = this.gateway.subscribe?.(() => { void this.sync() })
      await this.sync()
    } catch (error) {
      this.emit('error', error instanceof Error ? error.message : 'No se pudieron cargar las nóminas.')
    }
  }
  save(values: PayrollValues): void {
    if (!isPayrollValues(values)) throw new Error('Revisa el neto, o completa todos los campos del PDF con importes coherentes.')
    this.assertActive()
    if (!this.snapshot.ready) throw new Error('Espera a que se carguen tus nóminas.')
    const latest = this.readCache()
    const current = projectPayrollMonths(mergePayrollEvents(this.userId, this.cache.events, latest.events))
      .find((m) => m.month === values.month)?.current
    if (current?.kind === 'save' && current.values && canonicalPayroll(current.values) === canonicalPayroll(values)) return
    this.appendLocal(values.month, 'save', { ...values })
  }
  remove(month: string): void { this.appendLocal(month, 'delete', null) }
  private appendLocal(month: string, kind: 'save' | 'delete', values: PayrollValues | null) {
    this.assertActive()
    if (!this.snapshot.ready) throw new Error('Espera a que se carguen tus nóminas.')
    const latest = this.readCache()
    const time = Math.max(this.now(), ...latest.events.filter((e) => e.sequence === undefined && e.kind !== 'legacy')
      .map((e) => Date.parse(e.clientCreatedAt) + 1))
    const event: PayrollEvent = { id: this.newId(), userId: this.userId, month, kind, values, clientCreatedAt: new Date(time).toISOString() }
    this.persist([event])
    this.emit(this.online() ? 'syncing' : 'offline')
    void this.sync()
  }
  sync(): Promise<void> {
    if (!this.active || !this.snapshot.ready) return Promise.resolve()
    this.requested = true
    if (this.running) return this.running
    this.running = this.runSync().finally(() => {
      this.running = null
      // Una petición hecha justo al finalizar un ciclo offline no debe perderse.
      if (this.active && this.requested && this.online()) return this.sync()
    })
    return this.running
  }
  private async runSync(): Promise<void> {
    try {
      while (this.requested && this.active) {
        this.requested = false
        if (!this.online()) { this.emit('offline'); return }
        this.emit('syncing')
        const remote = await this.gateway.fetch()
        this.assertActive()
        this.persist(remote)
        this.emit('syncing')
        const pending = this.cache.events.filter((e) => e.sequence === undefined)
          .sort((a, b) => a.clientCreatedAt.localeCompare(b.clientCreatedAt) || a.id.localeCompare(b.id))
        for (const event of pending) {
          this.assertActive()
          const confirmed = await this.gateway.append(event)
          this.assertActive()
          if (!isPayrollEvent(confirmed, this.userId) || confirmed.sequence === undefined || !samePayrollEvent(event, confirmed)) {
            throw new Error('La nube no ha confirmado la misma versión de nómina; se conserva pendiente.')
          }
          this.persist([confirmed])
          this.emit('syncing')
        }
        const updated = await this.gateway.fetch()
        this.assertActive()
        this.persist(updated)
        if (this.cache.events.some((e) => e.sequence === undefined)) this.requested = true
        this.emit('synced')
      }
    } catch (error) {
      this.emit(this.online() ? 'error' : 'offline', error instanceof Error ? error.message : 'No se pudo sincronizar. Tus cambios siguen en este dispositivo.')
    }
  }
  refresh(): void {
    if (!this.active || !this.snapshot.ready) return
    try { this.persist([]); this.emit(); void this.sync() }
    catch { this.emit('error', 'No se pudo leer la caché local; no se ha sobrescrito.') }
  }
  dispose(): void { this.active = false; this.unsubscribe?.(); this.listeners.clear() }
}

export interface PayrollValues {
  month: string
  gross?: number
  socialSecurity?: number
  irpf?: number
  net: number
}

/** Historial independiente de movimientos, cuentas y cálculos financieros. */
export interface PayrollEvent {
  id: string
  userId: string
  month: string
  kind: 'save' | 'delete' | 'legacy'
  values: PayrollValues | null
  clientCreatedAt: string
  sequence?: number
  createdAt?: string
}

export const isPayrollUserId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)

export function isPayrollValues(value: unknown): value is PayrollValues {
  if (!value || typeof value !== 'object') return false
  const v = value as PayrollValues
  return typeof v.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v.month) &&
    typeof v.net === 'number' && Number.isFinite(v.net) && v.net >= 0 && v.net <= 1e12 &&
    ([v.gross, v.socialSecurity, v.irpf].every(n => n === undefined) ||
      ([v.gross, v.socialSecurity, v.irpf].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e12) &&
        v.irpf! <= 100 && Math.abs(v.gross! - v.socialSecurity! - v.gross! * v.irpf! / 100 - v.net) <= 0.1 + 1e-9))
}

export function canonicalPayroll(v: PayrollValues): string {
  return JSON.stringify([v.month, v.gross, v.socialSecurity, v.irpf, v.net])
}

export function isPayrollEvent(value: unknown, userId: string): value is PayrollEvent {
  if (!value || typeof value !== 'object') return false
  const e = value as PayrollEvent
  return e.userId === userId && isPayrollUserId(userId) && typeof e.id === 'string' &&
    (/^legacy-[a-f0-9]{64}$/.test(e.id) || isPayrollUserId(e.id)) &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(e.month) && ['save', 'delete', 'legacy'].includes(e.kind) &&
    typeof e.clientCreatedAt === 'string' && Number.isFinite(Date.parse(e.clientCreatedAt)) &&
    (e.kind === 'delete' ? e.values === null : isPayrollValues(e.values) && e.values.month === e.month) &&
    (e.sequence === undefined ? e.createdAt === undefined : Number.isSafeInteger(e.sequence) && e.sequence > 0 &&
      typeof e.createdAt === 'string' && Number.isFinite(Date.parse(e.createdAt)))
}

export function samePayrollEvent(a: PayrollEvent, b: PayrollEvent): boolean {
  return a.id === b.id && a.userId === b.userId && a.month === b.month && a.kind === b.kind &&
    a.clientCreatedAt === b.clientCreatedAt &&
    (a.values === null ? b.values === null : b.values !== null && canonicalPayroll(a.values) === canonicalPayroll(b.values))
}

/** Eventos inmutables por ID. La confirmación remota sustituye únicamente los metadatos pendientes. */
export function mergePayrollEvents(userId: string, ...groups: PayrollEvent[][]): PayrollEvent[] {
  const map = new Map<string, PayrollEvent>()
  for (const group of groups) for (const event of group) {
    if (!isPayrollEvent(event, userId)) throw new Error('Registro de nómina inválido o de otro usuario.')
    const existing = map.get(event.id)
    if (existing && !samePayrollEvent(existing, event)) throw new Error('Dos versiones diferentes comparten identificador.')
    if (!existing || event.sequence !== undefined) map.set(event.id, event)
  }
  return [...map.values()]
}

export interface PayrollMonth {
  month: string
  current: PayrollEvent
  versions: PayrollEvent[]
}

export function projectPayrollMonths(events: PayrollEvent[]): PayrollMonth[] {
  const byMonth = new Map<string, PayrollEvent[]>()
  events.forEach((e) => byMonth.set(e.month, [...(byMonth.get(e.month) || []), e]))
  const compare = (a: PayrollEvent, b: PayrollEvent): number => {
    if (a.kind === 'legacy' || b.kind === 'legacy') {
      if (a.kind !== b.kind) return a.kind === 'legacy' ? -1 : 1
      // Las migraciones no dependen de qué dispositivo llegó primero.
      return a.id.localeCompare(b.id)
    }
    if (a.sequence === undefined || b.sequence === undefined) {
      if ((a.sequence === undefined) !== (b.sequence === undefined)) return a.sequence === undefined ? 1 : -1
      return a.clientCreatedAt.localeCompare(b.clientCreatedAt) || a.id.localeCompare(b.id)
    }
    return a.sequence - b.sequence
  }
  return [...byMonth].map(([month, versions]) => {
    const sorted = [...versions].sort((a, b) => compare(b, a))
    return { month, current: sorted[0], versions: sorted }
  }).sort((a, b) => b.month.localeCompare(a.month))
}

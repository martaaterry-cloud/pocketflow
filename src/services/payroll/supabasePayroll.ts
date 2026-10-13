import type { SupabaseClient } from '@supabase/supabase-js'
import { isPayrollEvent, isPayrollUserId, type PayrollEvent } from '../../models/payroll'
import type { PayrollGateway } from './payrollStore'

export const PAYROLL_TABLE = 'payroll_events'
export function fromPayrollRow(row: Record<string, unknown>, userId: string): PayrollEvent {
  if (!row || (row.kind === 'delete' && [row.gross, row.social_security, row.irpf, row.net].some((v) => v !== null))) {
    throw new Error('Respuesta de nóminas inválida.')
  }
  const numeric = (value: unknown): number => typeof value === 'number' ? value :
    typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN
  const timestamp = (value: unknown): string => {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('Fecha de nómina inválida.')
    return new Date(value).toISOString()
  }
  const values = row.kind === 'delete' ? null : { month: row.month as string, gross: numeric(row.gross),
    socialSecurity: numeric(row.social_security), irpf: numeric(row.irpf), net: numeric(row.net) }
  const event: PayrollEvent = { id: row.id as string, userId: row.user_id as string, month: row.month as string,
    kind: row.kind as PayrollEvent['kind'], values, clientCreatedAt: timestamp(row.client_created_at),
    sequence: numeric(row.sequence), createdAt: timestamp(row.created_at) }
  if (!isPayrollEvent(event, userId)) throw new Error('Respuesta de nóminas inválida o de otro usuario.')
  return event
}

export function createSupabasePayrollGateway(client: SupabaseClient, userId: string, isActive = () => true): PayrollGateway {
  if (!isPayrollUserId(userId)) throw new Error('Inicia sesión para sincronizar tus nóminas.')
  async function authorize() {
    if (!isActive()) throw new Error('La sesión ha cambiado.')
    const { data, error } = await client.auth.getUser()
    if (error || data.user?.id !== userId || !isActive()) throw new Error('La sesión no corresponde al usuario de las nóminas.')
  }
  const queryError = (error: { code?: string; message?: string }) =>
    new Error(error.code === 'PGRST205' || error.code === '42P01'
      ? 'La sincronización de nóminas necesita activar la tabla en Supabase. Tus registros locales se conservan.'
      : 'No se pudo acceder a tus nóminas en la nube. Los cambios pendientes se conservan.')
  return {
    async fetch() {
      await authorize()
      const events: PayrollEvent[] = []
      for (let offset = 0; ; offset += 200) {
        const { data, error } = await client.from(PAYROLL_TABLE).select('*').eq('user_id', userId)
          .order('sequence', { ascending: true }).range(offset, offset + 199)
        if (error) throw queryError(error)
        if (!isActive()) throw new Error('La sesión ha cambiado.')
        for (const row of data || []) events.push(fromPayrollRow(row, userId))
        if (!data || data.length < 200) return events
      }
    },
    async append(event) {
      if (!isPayrollEvent(event, userId) || event.sequence !== undefined) throw new Error('No se puede enviar una nómina de otro usuario o ya confirmada.')
      await authorize()
      const { error } = await client.from(PAYROLL_TABLE).upsert({ id: event.id, user_id: userId, month: event.month,
        kind: event.kind, gross: event.values?.gross ?? null, social_security: event.values?.socialSecurity ?? null,
        irpf: event.values?.irpf ?? null, net: event.values?.net ?? null, client_created_at: event.clientCreatedAt },
        { onConflict: 'user_id,id', ignoreDuplicates: true })
      if (error) throw queryError(error)
      await authorize()
      const { data, error: readError } = await client.from(PAYROLL_TABLE).select('*').eq('user_id', userId).eq('id', event.id).single()
      if (readError) throw queryError(readError)
      if (!isActive()) throw new Error('La sesión ha cambiado.')
      return fromPayrollRow(data, userId)
    },
    subscribe(onChange) {
      const channel = client.channel(`payroll:${userId}:${crypto.randomUUID()}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: PAYROLL_TABLE, filter: `user_id=eq.${userId}` },
          (payload) => { if (isActive() && payload.new.user_id === userId) onChange() })
        .subscribe((status) => { if (isActive() && status === 'SUBSCRIBED') onChange() })
      return () => { void client.removeChannel(channel) }
    },
  }
}

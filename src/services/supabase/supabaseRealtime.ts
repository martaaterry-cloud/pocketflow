import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import {
  fromDbAccount,
  fromDbBudget,
  fromDbGoal,
  fromDbPlanSettings,
  fromDbProfile,
  fromDbRecurring,
  fromDbReserve,
  fromDbSpecialPeriod,
  fromDbTransaction,
  fromDbVariableExpenseEstimate,
} from './supabaseSync'
import type {
  Account,
  Budget,
  FinancialPlanSettings,
  RecurringPayment,
  Reserve,
  SavingsGoal,
  SpecialPeriod,
  Transaction,
  UserProfile,
  VariableExpenseEstimate,
} from '../../models/finance'

export interface RealtimeHandlers {
  onTransactionInsert: (tx: Transaction) => void
  onTransactionUpdate: (tx: Transaction) => void
  onTransactionDelete: (txId: string) => void

  onAccountUpdate: (acc: Account) => void

  onBudgetUpsert: (b: Budget) => void
  onBudgetDelete: (budgetId: string) => void

  onGoalUpsert: (g: SavingsGoal) => void
  onGoalDelete: (goalId: string) => void

  onReserveUpsert: (r: Reserve) => void
  onReserveDelete: (reserveId: string) => void

  onRecurringUpsert: (rec: RecurringPayment) => void
  onRecurringDelete: (recId: string) => void

  onSpecialPeriodUpsert: (sp: SpecialPeriod) => void
  onSpecialPeriodDelete: (periodId: string) => void

  onPlanSettingsUpdate: (ps: FinancialPlanSettings) => void
  onProfileUpdate: (p: UserProfile) => void
  onVariableExpenseEstimateUpsert?: (est: VariableExpenseEstimate) => void
  onVariableExpenseEstimateDelete?: (estimateId: string) => void
  onStatusChange?: (status: string) => void
}

// Registro anti-echo: evita reprocesar mutaciones generadas en este mismo cliente
const recentLocalMutations = new Map<string, number>()

export function markLocalMutation(entity: string, id: string): void {
  const key = `${entity}:${id}`
  recentLocalMutations.set(key, Date.now())
  setTimeout(() => {
    recentLocalMutations.delete(key)
  }, 3500)
}

export function isLocalMutation(entity: string, id: string): boolean {
  const key = `${entity}:${id}`
  const timestamp = recentLocalMutations.get(key)
  if (!timestamp) return false
  if (Date.now() - timestamp < 3500) {
    return true
  }
  recentLocalMutations.delete(key)
  return false
}

let activeChannel: RealtimeChannel | null = null
let currentHandlers: RealtimeHandlers | null = null
let currentUserId: string | null = null

export function initRealtimeSubscription(
  supabase: SupabaseClient,
  userId: string,
  handlers: RealtimeHandlers
): RealtimeChannel {
  currentHandlers = handlers
  currentUserId = userId

  if (activeChannel) {
    try {
      activeChannel.unsubscribe()
      supabase.removeChannel(activeChannel)
    } catch {
      // Ignorar errores en cleanup previo
    }
    activeChannel = null
  }

  const channel = supabase.channel(`pocketflow-realtime-${userId}`)

  // 1. Transacciones
  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` },
    (payload) => {
      const eventReceivedTime = new Date().toISOString()
      const row = payload.new as Record<string, unknown>
      if (!row || isLocalMutation('transactions', String(row.id))) return
      const dbCreatedAt = String(row.created_at || row.date || '')
      console.log(`[REALTIME PERF]
DB created_at: ${dbCreatedAt}
event received: ${eventReceivedTime}`)

      const tx = fromDbTransaction(row)
      const t0 = performance.now()
      handlers.onTransactionInsert(tx)
      const stateAppliedTime = new Date().toISOString()
      const deltaMs = (performance.now() - t0).toFixed(1)
      console.log(`state applied: ${stateAppliedTime} (+${deltaMs}ms)`)
    }
  )

  channel.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` },
    (payload) => {
      const row = payload.new as Record<string, unknown>
      if (!row || isLocalMutation('transactions', String(row.id))) return
      const tx = fromDbTransaction(row)
      handlers.onTransactionUpdate(tx)
    }
  )

  channel.on(
    'postgres_changes',
    { event: 'DELETE', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` },
    (payload) => {
      const oldRow = payload.old as Record<string, unknown>
      if (!oldRow || isLocalMutation('transactions', String(oldRow.id))) return
      handlers.onTransactionDelete(String(oldRow.id))
    }
  )

  // 2. Cuentas
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'accounts', filter: `user_id=eq.${userId}` },
    (payload) => {
      const row = payload.new as Record<string, unknown>
      if (!row || isLocalMutation('accounts', String(row.id))) return
      handlers.onAccountUpdate(fromDbAccount(row))
    }
  )

  // 3. Presupuestos
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'budgets', filter: `user_id=eq.${userId}` },
    (payload) => {
      if (payload.eventType === 'DELETE') {
        const oldRow = payload.old as Record<string, unknown>
        if (oldRow && !isLocalMutation('budgets', String(oldRow.id))) {
          handlers.onBudgetDelete(String(oldRow.id))
        }
      } else {
        const row = payload.new as Record<string, unknown>
        if (row && !isLocalMutation('budgets', String(row.id))) {
          handlers.onBudgetUpsert(fromDbBudget(row))
        }
      }
    }
  )

  // 4. Objetivos
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'savings_goals', filter: `user_id=eq.${userId}` },
    (payload) => {
      if (payload.eventType === 'DELETE') {
        const oldRow = payload.old as Record<string, unknown>
        if (oldRow && !isLocalMutation('savings_goals', String(oldRow.id))) {
          handlers.onGoalDelete(String(oldRow.id))
        }
      } else {
        const row = payload.new as Record<string, unknown>
        if (row && !isLocalMutation('savings_goals', String(row.id))) {
          handlers.onGoalUpsert(fromDbGoal(row))
        }
      }
    }
  )

  // 5. Reservas
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'reserves', filter: `user_id=eq.${userId}` },
    (payload) => {
      if (payload.eventType === 'DELETE') {
        const oldRow = payload.old as Record<string, unknown>
        if (oldRow && !isLocalMutation('reserves', String(oldRow.id))) {
          handlers.onReserveDelete(String(oldRow.id))
        }
      } else {
        const row = payload.new as Record<string, unknown>
        if (row && !isLocalMutation('reserves', String(row.id))) {
          handlers.onReserveUpsert(fromDbReserve(row))
        }
      }
    }
  )

  // 6. Pagos recurrentes
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'recurring_payments', filter: `user_id=eq.${userId}` },
    (payload) => {
      if (payload.eventType === 'DELETE') {
        const oldRow = payload.old as Record<string, unknown>
        if (oldRow && !isLocalMutation('recurring_payments', String(oldRow.id))) {
          handlers.onRecurringDelete(String(oldRow.id))
        }
      } else {
        const row = payload.new as Record<string, unknown>
        if (row && !isLocalMutation('recurring_payments', String(row.id))) {
          handlers.onRecurringUpsert(fromDbRecurring(row))
        }
      }
    }
  )

  // 7. Periodos especiales
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'special_periods', filter: `user_id=eq.${userId}` },
    (payload) => {
      if (payload.eventType === 'DELETE') {
        const oldRow = payload.old as Record<string, unknown>
        if (oldRow && !isLocalMutation('special_periods', String(oldRow.id))) {
          handlers.onSpecialPeriodDelete(String(oldRow.id))
        }
      } else {
        const row = payload.new as Record<string, unknown>
        if (row && !isLocalMutation('special_periods', String(row.id))) {
          handlers.onSpecialPeriodUpsert(fromDbSpecialPeriod(row))
        }
      }
    }
  )

  // 8. Plan financiero
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'financial_plan_settings', filter: `user_id=eq.${userId}` },
    (payload) => {
      const row = payload.new as Record<string, unknown>
      if (!row || isLocalMutation('financial_plan_settings', userId)) return
      handlers.onPlanSettingsUpdate(fromDbPlanSettings(row))
    }
  )

  // 9. Perfil de usuario
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'profiles', filter: `user_id=eq.${userId}` },
    (payload) => {
      const row = payload.new as Record<string, unknown>
      if (!row || isLocalMutation('profile', userId)) return
      handlers.onProfileUpdate(fromDbProfile(row))
    }
  )

  // 10. Gastos variables previstos
  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'variable_expense_estimates', filter: `user_id=eq.${userId}` },
    (payload) => {
      const row = payload.new as Record<string, unknown>
      if (!row || isLocalMutation('variable_expense_estimates', String(row.id))) return
      handlers.onVariableExpenseEstimateUpsert?.(fromDbVariableExpenseEstimate(row))
    }
  )

  channel.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'variable_expense_estimates', filter: `user_id=eq.${userId}` },
    (payload) => {
      const row = payload.new as Record<string, unknown>
      if (!row || isLocalMutation('variable_expense_estimates', String(row.id))) return
      handlers.onVariableExpenseEstimateUpsert?.(fromDbVariableExpenseEstimate(row))
    }
  )

  channel.on(
    'postgres_changes',
    { event: 'DELETE', schema: 'public', table: 'variable_expense_estimates', filter: `user_id=eq.${userId}` },
    (payload) => {
      const oldRow = payload.old as Record<string, unknown>
      if (!oldRow || isLocalMutation('variable_expense_estimates', String(oldRow.id))) return
      handlers.onVariableExpenseEstimateDelete?.(String(oldRow.id))
    }
  )

  activeChannel = channel
  currentStatus = 'SUBSCRIBING'

  channel.subscribe((status) => {
    currentStatus = status
    handlers.onStatusChange?.(status)
    if (status === 'SUBSCRIBED') {
      console.log(`[Supabase Realtime] Canal suscrito para usuario ${userId}`)
    }
  })

  return channel
}

let currentStatus: string = 'CLOSED'

export function getRealtimeChannelStatus(): string {
  return currentStatus
}

export function isRealtimeSubscribed(): boolean {
  return activeChannel !== null && currentStatus === 'SUBSCRIBED'
}

export function getActiveChannel(): RealtimeChannel | null {
  return activeChannel
}

export function unsubscribeRealtime(): void {
  if (activeChannel) {
    activeChannel.unsubscribe()
    activeChannel = null
    currentStatus = 'CLOSED'
  }
}

/**
 * Comprueba la salud del canal Realtime y reconecta limpiamente si está cerrado,
 * caído o en estado zombie por suspensión de iOS, sin duplicar canales.
 */
export function ensureRealtimeConnection(
  supabase: SupabaseClient,
  userId: string,
  handlers?: RealtimeHandlers
): RealtimeChannel {
  if (handlers) {
    currentHandlers = handlers
  }
  currentUserId = userId

  // Si ya tenemos un canal activo y en estado SUBSCRIBED, lo conservamos (no duplicar)
  if (activeChannel && currentStatus === 'SUBSCRIBED') {
    return activeChannel
  }

  const effectiveHandlers = handlers || currentHandlers
  if (!effectiveHandlers) {
    throw new Error('[Supabase Realtime] No hay handlers disponibles para reconectar el canal.')
  }

  console.log(`[Supabase Realtime] Comprobación de salud: canal en estado '${currentStatus}'. Reconectando...`)
  return initRealtimeSubscription(supabase, userId, effectiveHandlers)
}



import type { SupabaseClient } from '@supabase/supabase-js'
import {
  safeUpsertBudget,
  safeUpsertRecurring,
  safeUpsertTransaction,
  syncDeleteExpenseShare,
  syncDeleteSharedContact,
  syncUpsertExpenseShare,
  syncUpsertSharedContact,
  toDbAccount,
  toDbBudget,
  toDbExpenseShare,
  toDbGoal,
  toDbPlanSettings,
  toDbProfile,
  toDbRecurring,
  toDbReserve,
  toDbSharedContact,
  toDbSpecialPeriod,
  toDbTransaction,
  toDbVariableExpenseEstimate,
} from './supabaseSync'
import type {
  Account,
  Budget,
  ExpenseShare,
  FinancialPlanSettings,
  RecurringPayment,
  Reserve,
  SavingsGoal,
  SharedContact,
  SpecialPeriod,
  Transaction,
  UserProfile,
  VariableExpenseEstimate,
} from '../../models/finance'

export type OfflineEntity =
  | 'transaction'
  | 'account'
  | 'budget'
  | 'goal'
  | 'reserve'
  | 'recurring'
  | 'specialPeriod'
  | 'planSettings'
  | 'profile'
  | 'variable_expense_estimate'
  | 'shared_contact'
  | 'expense_share'

export interface OfflineMutation {
  id: string
  entity: OfflineEntity
  action: 'insert' | 'update' | 'delete'
  data: unknown
  timestamp: number
}

const QUEUE_STORAGE_KEY = 'pocketflow_offline_queue'
const memoryStorage = new Map<string, string>()

function getStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) return (globalThis as any).localStorage
  } catch {}
  return {
    getItem: (k: string) => memoryStorage.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memoryStorage.set(k, v)
    },
    removeItem: (k: string) => {
      memoryStorage.delete(k)
    },
  }
}

export function getOfflineQueue(): OfflineMutation[] {
  const storage = getStorage()
  if (!storage) return []
  try {
    const raw = storage.getItem(QUEUE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

type QueueListener = (count: number) => void
const queueListeners = new Set<QueueListener>()

export function subscribeOfflineQueue(listener: QueueListener): () => void {
  queueListeners.add(listener)
  return () => {
    queueListeners.delete(listener)
  }
}

function notifyQueueChanged(): void {
  const count = getPendingMutationsCount()
  for (const listener of queueListeners) {
    try {
      listener(count)
    } catch (err) {
      console.warn('[OfflineQueue] Error en listener:', err)
    }
  }
}

export function saveOfflineQueue(queue: OfflineMutation[]): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue))
    notifyQueueChanged()
  } catch (err) {
    console.warn('[OfflineQueue] Error guardando cola offline:', err)
  }
}

export function enqueueOfflineMutation(mutation: Omit<OfflineMutation, 'id' | 'timestamp'>): void {
  const queue = getOfflineQueue()
  const newEntry: OfflineMutation = {
    ...mutation,
    id: `mut_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  }
  queue.push(newEntry)
  saveOfflineQueue(queue)
}

export function isDemoMutation(item: OfflineMutation): boolean {
  if (item.entity === 'transaction') {
    const t = item.data as Partial<Transaction>
    if (t?.id && /^t[1-7]$/.test(t.id)) return true
    if (
      t?.description === 'Mercadona' ||
      t?.description === 'Gasolina' ||
      t?.description === 'Cena' ||
      t?.description === 'Spotify' ||
      t?.description === 'Gimnasio' ||
      t?.description === 'A ahorro' ||
      t?.description === 'Ropa'
    )
      return true
  }
  if (item.entity === 'budget') {
    const b = item.data as Partial<Budget>
    if (b?.id && /^b[1-3]$/.test(b.id)) return true
  }
  if (item.entity === 'goal') {
    const g = item.data as Partial<SavingsGoal>
    if (g?.id && /^g[1-2]$/.test(g.id)) return true
  }
  if (item.entity === 'reserve') {
    const r = item.data as Partial<Reserve>
    if (r?.id && /^res[1-2]$/.test(r.id)) return true
  }
  if (item.entity === 'recurring') {
    const rec = item.data as Partial<RecurringPayment>
    if (rec?.id && /^r[1-3]$/.test(rec.id)) return true
  }
  if (item.entity === 'specialPeriod') {
    const sp = item.data as Partial<SpecialPeriod>
    if (sp?.id && /^sp[1-2]$/.test(sp.id)) return true
  }
  return false
}

/**
 * Prioridad de entidades para asegurar que las dependencias foráneas
 * se inserten en el orden correcto:
 * 1. Contactos y cuentas (no dependen de nadie)
 * 2. Transacciones y modelos estándar
 * 3. Partes de gastos compartidos (dependen de transactions y shared_contacts)
 */
function getEntityPriority(entity: OfflineEntity, action: 'insert' | 'update' | 'delete'): number {
  if (action === 'delete') {
    // Al borrar, primero borrar cuotas dependientes, luego transacciones, luego contactos
    if (entity === 'expense_share') return 10
    if (entity === 'transaction') return 20
    if (entity === 'shared_contact') return 30
    return 20
  }
  // Al insertar o actualizar:
  if (entity === 'shared_contact' || entity === 'account') return 10
  if (entity === 'transaction') return 20
  if (entity === 'expense_share') return 30
  return 20
}

export async function flushOfflineQueue(
  supabase: SupabaseClient,
  userId: string
): Promise<{ successCount: number; failCount: number }> {
  const queue = getOfflineQueue()
  if (queue.length === 0) return { successCount: 0, failCount: 0 }

  // Ordenar mutaciones por prioridad de dependencias respetando el orden temporal relativo
  const sortedQueue = [...queue].sort((a, b) => {
    const prioA = getEntityPriority(a.entity, a.action)
    const prioB = getEntityPriority(b.entity, b.action)
    if (prioA !== prioB) return prioA - prioB
    return a.timestamp - b.timestamp
  })

  let successCount = 0
  let failCount = 0
  const remaining: OfflineMutation[] = []

  for (const item of sortedQueue) {
    if (isDemoMutation(item)) {
      // Descartar silenciosamente cualquier mutación de datos demo/antiguos
      successCount++
      continue
    }

    try {
      if (item.entity === 'shared_contact') {
        if (item.action === 'delete') {
          const id = (item.data as { id: string }).id
          await syncDeleteSharedContact(supabase, userId, id)
        } else {
          await syncUpsertSharedContact(supabase, userId, item.data as SharedContact)
        }
      } else if (item.entity === 'transaction') {
        if (item.action === 'delete') {
          const id = (item.data as { id: string }).id
          const { error } = await supabase
            .from('transactions')
            .delete()
            .eq('id', id)
            .eq('user_id', userId)
          if (error) throw error
        } else {
          const dbRow = toDbTransaction(item.data as Transaction, userId)
          await safeUpsertTransaction(supabase, dbRow, userId)
        }
      } else if (item.entity === 'expense_share') {
        if (item.action === 'delete') {
          const id = (item.data as { id: string }).id
          await syncDeleteExpenseShare(supabase, userId, id)
        } else {
          await syncUpsertExpenseShare(supabase, userId, item.data as ExpenseShare)
        }
      } else if (item.entity === 'account') {
        const dbRow = toDbAccount(item.data as Account, userId)
        const { error } = await supabase.from('accounts').upsert(dbRow)
        if (error) throw error
      } else if (item.entity === 'budget') {
        if (item.action === 'delete') {
          const id = (item.data as { id: string }).id
          const { error } = await supabase.from('budgets').delete().eq('id', id).eq('user_id', userId)
          if (error) throw error
        } else {
          const dbRow = toDbBudget(item.data as Budget, userId)
          await safeUpsertBudget(supabase, dbRow, userId)
        }
      } else if (item.entity === 'goal') {
        if (item.action === 'delete') {
          const id = (item.data as { id: string }).id
          const { error } = await supabase
            .from('savings_goals')
            .delete()
            .eq('id', id)
            .eq('user_id', userId)
          if (error) throw error
        } else {
          const dbRow = toDbGoal(item.data as SavingsGoal, userId)
          const { error } = await supabase.from('savings_goals').upsert(dbRow)
          if (error) throw error
        }
      } else if (item.entity === 'reserve') {
        if (item.action === 'delete') {
          const id = (item.data as { id: string }).id
          const { error } = await supabase.from('reserves').delete().eq('id', id).eq('user_id', userId)
          if (error) throw error
        } else {
          const dbRow = toDbReserve(item.data as Reserve, userId)
          const { error } = await supabase.from('reserves').upsert(dbRow)
          if (error) throw error
        }
      } else if (item.entity === 'recurring') {
        if (item.action === 'delete') {
          const id = (item.data as { id: string }).id
          const { error } = await supabase
            .from('recurring_payments')
            .delete()
            .eq('id', id)
            .eq('user_id', userId)
          if (error) throw error
        } else {
          const dbRow = toDbRecurring(item.data as RecurringPayment, userId)
          await safeUpsertRecurring(supabase, dbRow, userId)
        }
      } else if (item.entity === 'specialPeriod') {
        if (item.action === 'delete') {
          const id = (item.data as { id: string }).id
          const { error } = await supabase
            .from('special_periods')
            .delete()
            .eq('id', id)
            .eq('user_id', userId)
          if (error) throw error
        } else {
          const dbRow = toDbSpecialPeriod(item.data as SpecialPeriod, userId)
          const { error } = await supabase.from('special_periods').upsert(dbRow)
          if (error) throw error
        }
      } else if (item.entity === 'planSettings') {
        const dbRow = toDbPlanSettings(item.data as FinancialPlanSettings, userId)
        const { error } = await supabase.from('financial_plan_settings').upsert(dbRow)
        if (error) throw error
      } else if (item.entity === 'profile') {
        const dbRow = toDbProfile(item.data as UserProfile, userId)
        const { error } = await supabase.from('profiles').upsert(dbRow)
        if (error) throw error
      } else if (item.entity === 'variable_expense_estimate') {
        if (item.action === 'delete') {
          const id = (item.data as { id: string }).id
          const { error } = await supabase
            .from('variable_expense_estimates')
            .delete()
            .eq('id', id)
            .eq('user_id', userId)
          if (error) throw error
        } else {
          const dbRow = toDbVariableExpenseEstimate(item.data as VariableExpenseEstimate, userId)
          const { error } = await supabase.from('variable_expense_estimates').upsert(dbRow)
          if (error) throw error
        }
      }
      successCount++
    } catch (err: any) {
      console.warn('[OfflineQueue] Error sincronizando elemento:', item, err)
      remaining.push(item)
      failCount++
    }
  }

  saveOfflineQueue(remaining)
  return { successCount, failCount }
}

export function getPendingMutationsCount(): number {
  return getOfflineQueue().length
}

export function clearOfflineQueue(): void {
  saveOfflineQueue([])
}

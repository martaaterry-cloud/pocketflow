import type { SupabaseClient } from '@supabase/supabase-js'
import {
  safeUpsertBudget,
  safeUpsertCashTransaction,
  safeUpsertRecurring,
  safeUpsertTransaction,
  syncDeleteCashTransaction,
  syncDeleteExpenseShare,
  syncDeleteSharedContact,
  syncUpsertCashTransaction,
  syncUpsertExpenseShare,
  syncUpsertSharedContact,
  toDbAccount,
  toDbBudget,
  toDbCashTransaction,
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
  CashTransaction,
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
import { getUserStorageKey, isValidUserId, LEGACY_OFFLINE_QUEUE_KEY } from '../storage/userStorageKeys'

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
  | 'cash_transaction'

export interface OfflineMutation {
  id: string
  entity: OfflineEntity
  action: 'insert' | 'update' | 'delete'
  data: unknown
  timestamp: number
  userId?: string
}

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

export function getOfflineQueue(userId?: string | null): OfflineMutation[] {
  const storage = getStorage()
  if (!storage) return []
  try {
    if (isValidUserId(userId)) {
      const key = getUserStorageKey(userId, 'offline-queue')
      const raw = storage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parsed
      }
      return []
    }
    const raw = storage.getItem(LEGACY_OFFLINE_QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

type QueueListener = (count: number, userId?: string) => void
const queueListeners = new Set<QueueListener>()

export function subscribeOfflineQueue(listener: QueueListener): () => void {
  queueListeners.add(listener)
  return () => {
    queueListeners.delete(listener)
  }
}

function notifyQueueChanged(userId?: string): void {
  const count = getPendingMutationsCount(userId)
  for (const listener of queueListeners) {
    try {
      listener(count, userId)
    } catch (err) {
      console.warn('[OfflineQueue] Error en listener:', err)
    }
  }
}

export function saveOfflineQueue(
  userIdOrQueue: string | null | undefined | OfflineMutation[],
  maybeQueue?: OfflineMutation[]
): void {
  let userId: string | null | undefined
  let queue: OfflineMutation[]

  if (Array.isArray(userIdOrQueue)) {
    queue = userIdOrQueue
    userId = undefined
  } else {
    userId = userIdOrQueue
    queue = maybeQueue ?? []
  }

  const storage = getStorage()
  if (!storage) return
  try {
    if (isValidUserId(userId)) {
      const key = getUserStorageKey(userId, 'offline-queue')
      storage.setItem(key, JSON.stringify(queue))
      notifyQueueChanged(userId)
    } else {
      storage.setItem(LEGACY_OFFLINE_QUEUE_KEY, JSON.stringify(queue))
      notifyQueueChanged()
    }
  } catch (err) {
    console.warn('[OfflineQueue] Error guardando cola offline:', err)
  }
}

export function enqueueOfflineMutation(
  userIdOrMutation: string | null | undefined | (Omit<OfflineMutation, 'id' | 'timestamp' | 'userId'> & { userId?: string }),
  maybeMutation?: Omit<OfflineMutation, 'id' | 'timestamp' | 'userId'> & { userId?: string }
): void {
  let userId: string | null | undefined
  let mutation: (Omit<OfflineMutation, 'id' | 'timestamp' | 'userId'> & { userId?: string }) | undefined

  if (typeof userIdOrMutation === 'string' || userIdOrMutation === null || userIdOrMutation === undefined) {
    userId = userIdOrMutation
    mutation = maybeMutation
  } else {
    mutation = userIdOrMutation
    userId = mutation?.userId
  }

  if (!mutation) return

  const cleanUid = isValidUserId(userId) ? userId.trim() : (mutation.userId ?? undefined)

  const queue = getOfflineQueue(cleanUid)
  const newEntry: OfflineMutation = {
    ...mutation,
    id: `mut_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    userId: cleanUid,
  }
  queue.push(newEntry)
  saveOfflineQueue(cleanUid, queue)
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
  userId?: string
): Promise<{ successCount: number; failCount: number }> {
  const cleanUserId = isValidUserId(userId) ? userId.trim() : ''
  let queue = cleanUserId ? getOfflineQueue(cleanUserId) : []
  let isLegacyQueue = false

  if (queue.length === 0) {
    const legacyQueue = getOfflineQueue(null)
    if (legacyQueue.length > 0) {
      queue = legacyQueue
      isLegacyQueue = true
    }
  }

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
    // Defensa estricta PASO 6: no procesar mutaciones que pertenezcan a otro usuario
    if (cleanUserId && item.userId && item.userId !== cleanUserId) {
      console.warn(`[OfflineQueue] Mutación rechazada por pertenecer a otro usuario (${item.userId} !== ${cleanUserId})`)
      // No la ejecutamos para este usuario
      continue
    }

    if (isDemoMutation(item)) {
      // Descartar silenciosamente cualquier mutación de datos demo/antiguos
      successCount++
      continue
    }

    try {
      if (item.entity === 'shared_contact') {
        if (item.action === 'delete') {
          const id = (item.data as { id: string }).id
          await syncDeleteSharedContact(supabase, cleanUserId, id)
        } else {
          await syncUpsertSharedContact(supabase, cleanUserId, item.data as SharedContact)
        }
      } else if (item.entity === 'transaction') {
        if (item.action === 'delete') {
          const id = (item.data as { id: string }).id
          const { error } = await supabase
            .from('transactions')
            .delete()
            .eq('id', id)
            .eq('user_id', cleanUserId)
          if (error) throw error
        } else {
          const dbRow = toDbTransaction(item.data as Transaction, cleanUserId)
          await safeUpsertTransaction(supabase, dbRow, cleanUserId)
        }
      } else if (item.entity === 'expense_share') {
        if (item.action === 'delete') {
          const id = (item.data as { id: string }).id
          await syncDeleteExpenseShare(supabase, cleanUserId, id)
        } else {
          await syncUpsertExpenseShare(supabase, cleanUserId, item.data as ExpenseShare)
        }
      } else if (item.entity === 'account') {
        const dbRow = toDbAccount(item.data as Account, cleanUserId)
        const { error } = await supabase.from('accounts').upsert(dbRow)
        if (error) throw error
      } else if (item.entity === 'budget') {
        if (item.action === 'delete') {
          const id = (item.data as { id: string }).id
          const { error } = await supabase.from('budgets').delete().eq('id', id).eq('user_id', cleanUserId)
          if (error) throw error
        } else {
          const dbRow = toDbBudget(item.data as Budget, cleanUserId)
          await safeUpsertBudget(supabase, dbRow, cleanUserId)
        }
      } else if (item.entity === 'goal') {
        if (item.action === 'delete') {
          const id = (item.data as { id: string }).id
          const { error } = await supabase
            .from('savings_goals')
            .delete()
            .eq('id', id)
            .eq('user_id', cleanUserId)
          if (error) throw error
        } else {
          const dbRow = toDbGoal(item.data as SavingsGoal, cleanUserId)
          const { error } = await supabase.from('savings_goals').upsert(dbRow)
          if (error) throw error
        }
      } else if (item.entity === 'reserve') {
        if (item.action === 'delete') {
          const id = (item.data as { id: string }).id
          const { error } = await supabase.from('reserves').delete().eq('id', id).eq('user_id', cleanUserId)
          if (error) throw error
        } else {
          const dbRow = toDbReserve(item.data as Reserve, cleanUserId)
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
            .eq('user_id', cleanUserId)
          if (error) throw error
        } else {
          const dbRow = toDbRecurring(item.data as RecurringPayment, cleanUserId)
          await safeUpsertRecurring(supabase, dbRow, cleanUserId)
        }
      } else if (item.entity === 'specialPeriod') {
        if (item.action === 'delete') {
          const id = (item.data as { id: string }).id
          const { error } = await supabase
            .from('special_periods')
            .delete()
            .eq('id', id)
            .eq('user_id', cleanUserId)
          if (error) throw error
        } else {
          const dbRow = toDbSpecialPeriod(item.data as SpecialPeriod, cleanUserId)
          const { error } = await supabase.from('special_periods').upsert(dbRow)
          if (error) throw error
        }
      } else if (item.entity === 'planSettings') {
        const dbRow = toDbPlanSettings(item.data as FinancialPlanSettings, cleanUserId)
        const { error } = await supabase.from('financial_plan_settings').upsert(dbRow)
        if (error) throw error
      } else if (item.entity === 'profile') {
        const dbRow = toDbProfile(item.data as UserProfile, cleanUserId)
        const { error } = await supabase.from('profiles').upsert(dbRow)
        if (error) throw error
      } else if (item.entity === 'variable_expense_estimate') {
        if (item.action === 'delete') {
          const id = (item.data as { id: string }).id
          const { error } = await supabase
            .from('variable_expense_estimates')
            .delete()
            .eq('id', id)
            .eq('user_id', cleanUserId)
          if (error) throw error
        } else {
          const dbRow = toDbVariableExpenseEstimate(item.data as VariableExpenseEstimate, cleanUserId)
          const { error } = await supabase.from('variable_expense_estimates').upsert(dbRow)
          if (error) throw error
        }
      } else if (item.entity === 'cash_transaction') {
        if (item.action === 'delete') {
          const id = (item.data as { id: string }).id
          await syncDeleteCashTransaction(supabase, cleanUserId, id)
        } else {
          await syncUpsertCashTransaction(supabase, cleanUserId, item.data as CashTransaction)
        }
      }
      successCount++
    } catch (err: any) {
      console.warn('[OfflineQueue] Error sincronizando elemento:', item, err)
      remaining.push(item)
      failCount++
    }
  }

  if (isLegacyQueue) {
    saveOfflineQueue(null, remaining)
  } else {
    saveOfflineQueue(cleanUserId, remaining)
  }
  return { successCount, failCount }
}

export function getPendingMutationsCount(userId?: string | null): number {
  return getOfflineQueue(userId).length
}

export function clearOfflineQueue(userId?: string | null): void {
  if (isValidUserId(userId)) {
    saveOfflineQueue(userId, [])
  } else {
    saveOfflineQueue([])
  }
}

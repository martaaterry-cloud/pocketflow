import type { SupabaseClient } from '@supabase/supabase-js'
import {
  toDbAccount,
  toDbBudget,
  toDbGoal,
  toDbPlanSettings,
  toDbProfile,
  toDbRecurring,
  toDbReserve,
  toDbSpecialPeriod,
  toDbTransaction,
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
} from '../../models/finance'

export interface OfflineMutation {
  id: string
  entity:
    | 'transaction'
    | 'account'
    | 'budget'
    | 'goal'
    | 'reserve'
    | 'recurring'
    | 'specialPeriod'
    | 'planSettings'
    | 'profile'
  action: 'insert' | 'update' | 'delete'
  data: unknown
  timestamp: number
}

const QUEUE_STORAGE_KEY = 'pocketflow_offline_queue'

export function getOfflineQueue(): OfflineMutation[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY)
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
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue))
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

export async function flushOfflineQueue(
  supabase: SupabaseClient,
  userId: string
): Promise<{ successCount: number; failCount: number }> {
  const queue = getOfflineQueue()
  if (queue.length === 0) return { successCount: 0, failCount: 0 }

  let successCount = 0
  let failCount = 0
  const remaining: OfflineMutation[] = []

  for (const item of queue) {
    if (isDemoMutation(item)) {
      // Descartar silenciosamente cualquier mutación de datos demo/antiguos
      successCount++
      continue
    }

    try {
      if (item.entity === 'transaction') {
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
          const { error } = await supabase.from('transactions').upsert(dbRow)
          if (error) throw error
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
          const { error } = await supabase.from('budgets').upsert(dbRow)
          if (error) throw error
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
          const { error } = await supabase.from('recurring_payments').upsert(dbRow)
          if (error) throw error
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
      }
      successCount++
    } catch (err) {
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


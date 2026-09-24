import { resolveIconKey } from '../../ui/icons'
import {
  cleanPlanSettings,
  categories as defaultCategories,
} from '../../data/seed'
import type { PersistedState, StorageAdapter } from './storageAdapter'

const STORAGE_KEY = 'pocketflow:v1'

export function migratePersistedState(parsed: Partial<PersistedState>): PersistedState {
  // Migración de iconos de categorías y metas
  const rawCategories = parsed.categories ?? []
  const existingCategoryIds = new Set(rawCategories.map((c) => c.id))
  const missingDefaults = defaultCategories.filter((dc) => !existingCategoryIds.has(dc.id))

  const categories = [...rawCategories, ...missingDefaults].map((c) => ({
    ...c,
    iconKey: c.iconKey || resolveIconKey(c.icon, 'shopping-basket'),
    icon: resolveIconKey(c.icon, 'shopping-basket'),
  }))

  const goals = (parsed.goals ?? []).map((g) => ({
    ...g,
    iconKey: g.iconKey || resolveIconKey(g.icon, 'target'),
    icon: resolveIconKey(g.icon, 'target'),
  }))

  const reserves = (parsed.reserves ?? []).map((r) => ({
    ...r,
    iconKey: resolveIconKey(r.iconKey, 'target'),
  }))

  // Normalización de transacciones históricas (ej. Retirada de 110 € de cajero)
  const transactions = (parsed.transactions ?? []).map((t) => {
    const descLower = (t.description || '').toLowerCase()
    const isAtmDesc = descLower.includes('cajero') || descLower.includes('retirada')
    if (t.type === 'expense') {
      if (t.amount === 110 && (isAtmDesc || t.specialType === 'cash_withdrawal')) {
        return {
          ...t,
          specialType: 'cash_withdrawal' as const,
          categoryId: 'atm',
        }
      }
      if (t.specialType === 'cash_withdrawal' && (!t.categoryId || t.categoryId === 'other')) {
        return {
          ...t,
          categoryId: 'atm',
        }
      }
    }
    return t
  })

  return {
    accounts: parsed.accounts ?? [],
    transactions,
    goals,
    recurring: parsed.recurring ?? [],
    categories,
    budgets: parsed.budgets ?? [],
    reserves,
    specialPeriods: parsed.specialPeriods ?? [],
    planSettings: parsed.planSettings ?? cleanPlanSettings,
    profile: parsed.profile ? { displayName: String(parsed.profile.displayName ?? '') } : { displayName: '' },
    variableExpenseEstimates: parsed.variableExpenseEstimates ?? [],
    sharedContacts: parsed.sharedContacts ?? [],
    expenseShares: parsed.expenseShares ?? [],
    cashTransactions: parsed.cashTransactions ?? [],
  }
}

export class LocalStorageAdapter implements StorageAdapter {
  private key: string

  constructor(key: string = STORAGE_KEY) {
    this.key = key
  }

  async load(): Promise<PersistedState | null> {
    try {
      const raw = localStorage.getItem(this.key)
      if (!raw) return null
      const parsed = JSON.parse(raw) as Partial<PersistedState>
      if (!parsed || typeof parsed !== 'object') return null
      return migratePersistedState(parsed)
    } catch (error) {
      console.error('[LocalStorageAdapter] Error cargando datos de localStorage:', error)
      return null
    }
  }

  async save(state: PersistedState): Promise<void> {
    try {
      localStorage.setItem(this.key, JSON.stringify(state))
    } catch (error) {
      console.error('[LocalStorageAdapter] Error guardando datos en localStorage:', error)
    }
  }

  async clear(): Promise<void> {
    try {
      localStorage.removeItem(this.key)
    } catch (error) {
      console.error('[LocalStorageAdapter] Error limpiando datos en localStorage:', error)
    }
  }
}

export const defaultStorage = new LocalStorageAdapter()

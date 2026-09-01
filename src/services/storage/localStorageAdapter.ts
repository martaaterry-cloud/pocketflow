import { resolveIconKey } from '../../ui/icons'
import {
  planSettings as defaultPlanSettings,
  reserves as defaultReserves,
  specialPeriods as defaultSpecialPeriods,
} from '../../data/seed'
import type { PersistedState, StorageAdapter } from './storageAdapter'

const STORAGE_KEY = 'pocketflow:v1'

export function migratePersistedState(parsed: Partial<PersistedState>): PersistedState {
  // Migración de iconos de categorías y metas
  const categories = (parsed.categories ?? []).map((c) => ({
    ...c,
    iconKey: c.iconKey || resolveIconKey(c.icon, 'shopping-basket'),
    icon: resolveIconKey(c.icon, 'shopping-basket'),
  }))

  const goals = (parsed.goals ?? []).map((g) => ({
    ...g,
    iconKey: g.iconKey || resolveIconKey(g.icon, 'target'),
    icon: resolveIconKey(g.icon, 'target'),
  }))

  const reserves = (parsed.reserves ?? defaultReserves).map((r) => ({
    ...r,
    iconKey: resolveIconKey(r.iconKey, 'target'),
  }))

  return {
    accounts: parsed.accounts ?? [],
    transactions: parsed.transactions ?? [],
    goals,
    recurring: parsed.recurring ?? [],
    categories,
    budgets: parsed.budgets ?? [],
    reserves,
    specialPeriods: parsed.specialPeriods ?? defaultSpecialPeriods,
    planSettings: parsed.planSettings ?? defaultPlanSettings,
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

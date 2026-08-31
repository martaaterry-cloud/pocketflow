import type { PersistedState, StorageAdapter } from './storageAdapter'

const STORAGE_KEY = 'pocketflow:v1'

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
      return parsed as PersistedState
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

import type { PersistedState, StorageAdapter } from './storageAdapter'
import { LocalStorageAdapter, migratePersistedState } from './localStorageAdapter'
import {
  getUserDbName,
  getUserStorageKey,
  isValidUserId,
  migrateLegacyDataToUser,
  LEGACY_STORAGE_KEY,
} from './userStorageKeys'

const DB_VERSION = 1
const STORE_NAME = 'keyval'
const STATE_KEY = 'pocketflow_state'

export class IndexedDbAdapter implements StorageAdapter {
  private userId: string | null = null
  private dbName: string | null = null
  private fallback: LocalStorageAdapter
  private dbPromise: Promise<IDBDatabase | null> | null = null

  constructor(userId?: string | null) {
    if (isValidUserId(userId)) {
      this.userId = userId.trim()
      this.dbName = getUserDbName(this.userId)
      this.fallback = new LocalStorageAdapter(getUserStorageKey(this.userId, 'state'))
    } else {
      this.userId = null
      this.dbName = null
      // Si no se proporciona userId explícito, mantiene fallback a clave legacy
      this.fallback = new LocalStorageAdapter(LEGACY_STORAGE_KEY)
    }
  }

  getUserId(): string | null {
    return this.userId
  }

  getDbName(): string | null {
    return this.dbName
  }

  private isSupported(): boolean {
    return typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
  }

  private async getDb(): Promise<IDBDatabase | null> {
    if (!this.isSupported() || !this.dbName) return null
    if (this.dbPromise) return this.dbPromise

    const currentDbName = this.dbName
    this.dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(currentDbName, DB_VERSION)

        request.onupgradeneeded = () => {
          const db = request.result
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME)
          }
        }

        request.onsuccess = () => {
          resolve(request.result)
        }

        request.onerror = (event) => {
          console.warn('[IndexedDbAdapter] Error abriendo IndexedDB, usando fallback:', event)
          resolve(null)
        }
      } catch (err) {
        console.warn('[IndexedDbAdapter] Excepción abriendo IndexedDB, usando fallback:', err)
        resolve(null)
      }
    })

    return this.dbPromise
  }

  async load(): Promise<PersistedState | null> {
    // Si no hay base IndexedDB configurada (ej. sin userId o sin soporte), delegar en el fallback
    if (!this.userId || !this.dbName) {
      return this.fallback.load()
    }

    const db = await this.getDb()
    if (!db) {
      // Intento de migración legacy a nivel de localStorage si no existe aún
      migrateLegacyDataToUser(this.userId)
      return this.fallback.load()
    }

    try {
      const indexedData = await new Promise<PersistedState | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const getReq = store.get(STATE_KEY)

        getReq.onsuccess = () => {
          resolve(getReq.result ?? null)
        }
        getReq.onerror = () => reject(getReq.error)
      })

      if (indexedData) {
        return migratePersistedState(indexedData)
      }

      // Migración legacy para el usuario:
      // Si la base del usuario está vacía, migramos datos legacy existentes
      migrateLegacyDataToUser(this.userId)
      const fallbackState = await this.fallback.load()
      if (fallbackState) {
        // Guarda en IndexedDB de este usuario la copia migrada
        await this.save(fallbackState)
        return fallbackState
      }

      return null
    } catch (err) {
      console.warn('[IndexedDbAdapter] Error leyendo de IndexedDB, usando fallback:', err)
      return this.fallback.load()
    }
  }

  async save(state: PersistedState): Promise<void> {
    // Espejo de respaldo en localStorage
    try {
      await this.fallback.save(state)
    } catch (err) {
      console.warn('[IndexedDbAdapter] Error en guardado espejo de localStorage:', err)
    }

    if (!this.userId || !this.dbName) {
      return
    }

    const db = await this.getDb()
    if (!db) return

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const putReq = store.put(state, STATE_KEY)

        putReq.onsuccess = () => resolve()
        putReq.onerror = () => reject(putReq.error)
      })
    } catch (err) {
      console.warn('[IndexedDbAdapter] Error guardando en IndexedDB:', err)
    }
  }

  async clear(): Promise<void> {
    await this.fallback.clear()
    if (!this.userId || !this.dbName) {
      return
    }

    const db = await this.getDb()
    if (!db) return

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const delReq = store.delete(STATE_KEY)

        delReq.onsuccess = () => resolve()
        delReq.onerror = () => reject(delReq.error)
      })
    } catch (err) {
      console.warn('[IndexedDbAdapter] Error borrando de IndexedDB:', err)
    }
  }
}

export function createIndexedDbAdapter(userId?: string | null): IndexedDbAdapter {
  return new IndexedDbAdapter(userId)
}

export const defaultAppStorage = new IndexedDbAdapter(null)

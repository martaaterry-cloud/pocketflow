import type { PersistedState, StorageAdapter } from './storageAdapter'
import { LocalStorageAdapter, migratePersistedState } from './localStorageAdapter'

const DB_NAME = 'pocketflow_db'
const DB_VERSION = 1
const STORE_NAME = 'keyval'
const STATE_KEY = 'pocketflow_state'
const LEGACY_STORAGE_KEY = 'pocketflow:v1'

export class IndexedDbAdapter implements StorageAdapter {
  private fallback: LocalStorageAdapter
  private dbPromise: Promise<IDBDatabase | null> | null = null

  constructor() {
    this.fallback = new LocalStorageAdapter(LEGACY_STORAGE_KEY)
  }

  private isSupported(): boolean {
    return typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
  }

  private async getDb(): Promise<IDBDatabase | null> {
    if (!this.isSupported()) return null
    if (this.dbPromise) return this.dbPromise

    this.dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION)

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
    const db = await this.getDb()
    if (!db) {
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

      // Migración automática desde localStorage si IndexedDB está vacío
      const legacyState = await this.fallback.load()
      if (legacyState) {
        // Guarda en IndexedDB la copia migrada
        await this.save(legacyState)
        return legacyState
      }

      return null
    } catch (err) {
      console.warn('[IndexedDbAdapter] Error leyendo de IndexedDB, usando fallback:', err)
      return this.fallback.load()
    }
  }

  async save(state: PersistedState): Promise<void> {
    // Espejo de respaldo en localStorage para máxima durabilidad en PWA
    try {
      await this.fallback.save(state)
    } catch (err) {
      console.warn('[IndexedDbAdapter] Error en guardado espejo de localStorage:', err)
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

export const defaultAppStorage = new IndexedDbAdapter()

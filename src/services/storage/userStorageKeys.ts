/**
 * Utilidad centralizada para gestión de claves de almacenamiento local e IndexedDB
 * con aislamiento estricto por identificador único de usuario (user.id / UUID).
 */

export type UserStorageKeyType =
  | 'state'
  | 'offline-queue'
  | 'last-cloud-backup'
  | 'last-backup'
  | 'last-excel-export'

// Claves legacy (formato antiguo sin namespace)
export const LEGACY_STORAGE_KEY = 'pocketflow:v1'
export const LEGACY_DB_NAME = 'pocketflow_db'
export const LEGACY_STATE_KEY = 'pocketflow_state'
export const LEGACY_OFFLINE_QUEUE_KEY = 'pocketflow_offline_queue'
export const LEGACY_LAST_CLOUD_AUTO_BACKUP_KEY = 'pocketflow:lastCloudAutoBackupAt'
export const LEGACY_LAST_BACKUP_DATE_KEY = 'pocketflow:lastBackupAt'
export const LEGACY_LAST_EXCEL_EXPORT_DATE_KEY = 'pocketflow:lastExcelExportAt'
export const LEGACY_MIGRATION_MARKER_KEY = 'pocketflow:legacy-migrated-to'

const fallbackMemoryMap = new Map<string, string>()
const fallbackStorageInstance: Storage = {
  getItem: (key: string) => fallbackMemoryMap.get(key) ?? null,
  setItem: (key: string, value: string) => {
    fallbackMemoryMap.set(key, String(value))
  },
  removeItem: (key: string) => {
    fallbackMemoryMap.delete(key)
  },
  clear: () => {
    fallbackMemoryMap.clear()
  },
  get length() {
    return fallbackMemoryMap.size
  },
  key: (index: number) => Array.from(fallbackMemoryMap.keys())[index] ?? null,
}

/**
 * Acceso seguro y portable a localStorage tanto en navegadores, PWA, como en Node.js tests.
 * Siempre garantiza un Storage válido y persistente.
 */
export function getLocalStorage(): Storage {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) return (globalThis as any).localStorage
  } catch {}
  return fallbackStorageInstance
}

/**
 * Validador estricto de identificador de usuario.
 * Previene construcción de namespace con null, undefined, cadenas vacías o valores inválidos.
 */
export function isValidUserId(userId: unknown): userId is string {
  if (typeof userId !== 'string') return false
  const trimmed = userId.trim()
  if (trimmed.length === 0) return false
  if (trimmed === 'null' || trimmed === 'undefined') return false
  return true
}

/**
 * Genera la clave namespaced para localStorage.
 * Ejemplo: pocketflow:f47ac10b-58cc-4372-a567-0e02b2c3d479:state
 */
export function getUserStorageKey(userId: string | null | undefined, keyType: UserStorageKeyType): string {
  if (!isValidUserId(userId)) {
    throw new Error(`[userStorageKeys] Cannot generate storage key without a valid userId: "${String(userId)}"`)
  }
  return `pocketflow:${userId.trim()}:${keyType}`
}

/**
 * Genera el nombre de la base de datos IndexedDB aislada por usuario.
 * Ejemplo: pocketflow_db_f47ac10b-58cc-4372-a567-0e02b2c3d479
 */
export function getUserDbName(userId: string | null | undefined): string {
  if (!isValidUserId(userId)) {
    throw new Error(`[userStorageKeys] Cannot generate db name without a valid userId: "${String(userId)}"`)
  }
  return `pocketflow_db_${userId.trim()}`
}

/**
 * Obtiene el ID del usuario al que ya se migraron los datos legacy, si existe.
 */
export function getLegacyMigratedUserId(): string | null {
  const storage = getLocalStorage()
  try {
    return storage.getItem(LEGACY_MIGRATION_MARKER_KEY)
  } catch {
    return null
  }
}

/**
 * Comprueba si la migración legacy ya fue realizada para cualquier usuario.
 */
export function isLegacyMigrated(): boolean {
  return Boolean(getLegacyMigratedUserId())
}

/**
 * Comprueba si los datos legacy fueron migrados a un usuario específico.
 */
export function isLegacyMigratedTo(userId: string): boolean {
  if (!isValidUserId(userId)) return false
  return getLegacyMigratedUserId() === userId.trim()
}

/**
 * Comprueba si existen datos legacy en localStorage pendientes o existentes.
 */
export function hasLegacyLocalStorageData(): boolean {
  const storage = getLocalStorage()
  try {
    return Boolean(
      storage.getItem(LEGACY_STORAGE_KEY) ||
        storage.getItem(LEGACY_OFFLINE_QUEUE_KEY) ||
        storage.getItem(LEGACY_LAST_CLOUD_AUTO_BACKUP_KEY) ||
        storage.getItem(LEGACY_LAST_BACKUP_DATE_KEY) ||
        storage.getItem(LEGACY_LAST_EXCEL_EXPORT_DATE_KEY)
    )
  } catch {
    return false
  }
}

export interface LegacyMigrationResult {
  migrated: boolean
  reason: 'already_migrated_to_this_user' | 'migrated_to_different_user' | 'no_legacy_data' | 'success' | 'invalid_user_id'
}

/**
 * Ejecuta la migración segura y conservadora de los datos legacy de Marta al nuevo namespace.
 * - Solo se ejecuta una vez para el primer usuario autenticado.
 * - Si ya fue migrado a otro usuario, no mezcla ni sobreescribe datos.
 * - No borra inmediatamente las claves legacy para máxima seguridad.
 */
export function migrateLegacyDataToUser(userId: string | null | undefined): LegacyMigrationResult {
  if (!isValidUserId(userId)) {
    return { migrated: false, reason: 'invalid_user_id' }
  }

  const cleanUserId = userId.trim()
  const existingMigratedUser = getLegacyMigratedUserId()

  // Si ya fue migrado a otro usuario distinto, prohibir migración a esta cuenta
  if (existingMigratedUser && existingMigratedUser !== cleanUserId) {
    return { migrated: false, reason: 'migrated_to_different_user' }
  }

  const storage = getLocalStorage()

  try {
    const legacyState = storage.getItem(LEGACY_STORAGE_KEY)
    const legacyQueue = storage.getItem(LEGACY_OFFLINE_QUEUE_KEY)
    const legacyCloudBackup = storage.getItem(LEGACY_LAST_CLOUD_AUTO_BACKUP_KEY)
    const legacyBackup = storage.getItem(LEGACY_LAST_BACKUP_DATE_KEY)
    const legacyExcel = storage.getItem(LEGACY_LAST_EXCEL_EXPORT_DATE_KEY)

    const hasAnyLegacy = Boolean(legacyState || legacyQueue || legacyCloudBackup || legacyBackup || legacyExcel)

    if (!hasAnyLegacy && !existingMigratedUser) {
      return { migrated: false, reason: 'no_legacy_data' }
    }

    const stateKey = getUserStorageKey(cleanUserId, 'state')
    const queueKey = getUserStorageKey(cleanUserId, 'offline-queue')
    const cloudBackupKey = getUserStorageKey(cleanUserId, 'last-cloud-backup')
    const backupKey = getUserStorageKey(cleanUserId, 'last-backup')
    const excelKey = getUserStorageKey(cleanUserId, 'last-excel-export')

    // Copiar datos legacy a los namespaces nuevos si no existen aún
    if (legacyState && storage.getItem(stateKey) === null) {
      storage.setItem(stateKey, legacyState)
    }

    if (legacyQueue && storage.getItem(queueKey) === null) {
      storage.setItem(queueKey, legacyQueue)
    }

    if (legacyCloudBackup && storage.getItem(cloudBackupKey) === null) {
      storage.setItem(cloudBackupKey, legacyCloudBackup)
    }

    if (legacyBackup && storage.getItem(backupKey) === null) {
      storage.setItem(backupKey, legacyBackup)
    }

    if (legacyExcel && storage.getItem(excelKey) === null) {
      storage.setItem(excelKey, legacyExcel)
    }

    // Registrar marca permanente de migración
    storage.setItem(LEGACY_MIGRATION_MARKER_KEY, cleanUserId)
    storage.setItem(`pocketflow:legacy-migrated-to:${cleanUserId}`, new Date().toISOString())

    if (existingMigratedUser === cleanUserId) {
      return { migrated: true, reason: 'already_migrated_to_this_user' }
    }

    return { migrated: true, reason: 'success' }
  } catch (err) {
    console.warn('[userStorageKeys] Error durante la migración legacy:', err)
    return { migrated: false, reason: 'no_legacy_data' }
  }
}

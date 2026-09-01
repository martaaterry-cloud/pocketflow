import type { PersistedState } from '../services/storage/storageAdapter'
import { migratePersistedState } from '../services/storage/localStorageAdapter'

export const BACKUP_APP_IDENTIFIER = 'Pocketflow'
export const CURRENT_BACKUP_VERSION = 1
export const LAST_BACKUP_DATE_KEY = 'pocketflow:lastBackupAt'

export interface PocketflowBackup {
  app: string
  version: number
  exportedAt: string
  data: PersistedState
}

export interface BackupSummary {
  transactionCount: number
  accountCount: number
  goalCount: number
  reserveCount: number
  budgetCount: number
  recurringCount: number
}

export interface BackupValidationSuccess {
  valid: true
  state: PersistedState
  summary: BackupSummary
  exportedAt: string
  version: number
}

export interface BackupValidationError {
  valid: false
  error: string
}

export type BackupValidationResult = BackupValidationSuccess | BackupValidationError

/**
 * Genera la estructura JSON portable y versionada para la copia de seguridad.
 */
export function createBackupPayload(state: PersistedState, now = new Date()): PocketflowBackup {
  return {
    app: BACKUP_APP_IDENTIFIER,
    version: CURRENT_BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data: {
      accounts: state.accounts ?? [],
      transactions: state.transactions ?? [],
      goals: state.goals ?? [],
      recurring: state.recurring ?? [],
      categories: state.categories ?? [],
      budgets: state.budgets ?? [],
      reserves: state.reserves ?? [],
      specialPeriods: state.specialPeriods ?? [],
      planSettings: state.planSettings,
    },
  }
}

/**
 * Valida un JSON importado. Comprueba identificador de la app, versión y consistencia de datos.
 * No acepta JSON arbitrario o malformado.
 */
export function validateBackupPayload(raw: unknown): BackupValidationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, error: 'El archivo no contiene un objeto JSON válido.' }
  }

  const obj = raw as Record<string, unknown>

  if (obj.app !== BACKUP_APP_IDENTIFIER) {
    return {
      valid: false,
      error: `Archivo incompatible. Se esperaba una copia de seguridad de '${BACKUP_APP_IDENTIFIER}'.`,
    }
  }

  if (typeof obj.version !== 'number' || obj.version > CURRENT_BACKUP_VERSION || obj.version < 1) {
    return {
      valid: false,
      error: `Versión de copia de seguridad no soportada (v${String(obj.version)}).`,
    }
  }

  if (!obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data)) {
    return { valid: false, error: 'La copia de seguridad no contiene la sección de datos requerida.' }
  }

  const data = obj.data as Partial<PersistedState>

  if (!Array.isArray(data.accounts) || !Array.isArray(data.transactions)) {
    return { valid: false, error: 'Estructura de datos incompleta o corrupta (faltan cuentas o transacciones).' }
  }

  // Migración y saneamiento
  const migrated = migratePersistedState(data)

  const summary: BackupSummary = {
    transactionCount: migrated.transactions.length,
    accountCount: migrated.accounts.length,
    goalCount: migrated.goals.length,
    reserveCount: migrated.reserves.length,
    budgetCount: migrated.budgets.length,
    recurringCount: migrated.recurring.length,
  }

  return {
    valid: true,
    state: migrated,
    summary,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    version: obj.version,
  }
}

/**
 * Descarga o comparte el archivo de backup en iOS/Windows.
 * Usa Web Share API con File si está soportado (iPhone Archivos/iCloud) o descarga directa vía Blob.
 */
export async function shareOrDownloadBackup(backup: PocketflowBackup): Promise<boolean> {
  const jsonStr = JSON.stringify(backup, null, 2)
  const dateStr = backup.exportedAt.slice(0, 10)
  const fileName = `pocketflow-backup-${dateStr}.json`

  // Guardar fecha de última copia exportada en localStorage
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LAST_BACKUP_DATE_KEY, backup.exportedAt)
  }

  const blob = new Blob([jsonStr], { type: 'application/json' })

  // Intentar Web Share API con archivo (ideal para iPhone: "Guardar en Archivos")
  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], fileName, { type: 'application/json' })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Copia de seguridad Pocketflow',
          files: [file],
        })
        return true
      }
    } catch (err: unknown) {
      // Si el usuario cancela el diálogo nativo de compartir, no es un error
      if ((err as Error)?.name === 'AbortError') {
        return true
      }
      console.warn('[Backup] Error usando Web Share API, recurriendo a descarga:', err)
    }
  }

  // Descarga estándar vía anchor element
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return true
  } catch (err) {
    console.error('[Backup] Error en descarga de copia de seguridad:', err)
    return false
  }
}

/**
 * Lee la fecha de la última copia de seguridad exportada.
 */
export function getLastBackupDate(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(LAST_BACKUP_DATE_KEY)
}

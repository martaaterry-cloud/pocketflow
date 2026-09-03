import type { SupabaseClient } from '@supabase/supabase-js'
import type { PersistedState } from '../storage/storageAdapter'
import type { BackupSummary } from '../../utils/backup'
import { CURRENT_BACKUP_VERSION } from '../../utils/backup'
import { uploadStateToSupabase } from './supabaseSync'
import { migratePersistedState } from '../storage/localStorageAdapter'

export type CloudBackupReason = 'auto' | 'manual' | 'pre_restore'

export interface CloudBackupRecord {
  id: string
  user_id: string
  created_at: string
  reason: CloudBackupReason
  schema_version: number
  app_version: string
  payload: PersistedState
  summary?: BackupSummary
}

export const AUTO_BACKUP_INTERVAL_DAYS = 7
export const MAX_AUTO_BACKUPS_RETENTION = 8
export const APP_VERSION = '1.0.0'

export const LAST_CLOUD_AUTO_BACKUP_KEY = 'pocketflow:lastCloudAutoBackupAt'

/**
 * Desinfecta y estructura el estado financiero asegurando que no contenga
 * tokens, contraseñas, credenciales o secretos.
 */
export function sanitizeStateForBackup(state: PersistedState): PersistedState {
  return {
    accounts: state.accounts ?? [],
    transactions: state.transactions ?? [],
    goals: state.goals ?? [],
    recurring: state.recurring ?? [],
    categories: state.categories ?? [],
    budgets: state.budgets ?? [],
    reserves: state.reserves ?? [],
    specialPeriods: state.specialPeriods ?? [],
    planSettings: state.planSettings,
    profile: state.profile ? { displayName: state.profile.displayName } : undefined,
    variableExpenseEstimates: state.variableExpenseEstimates ?? [],
    sharedContacts: state.sharedContacts ?? [],
    expenseShares: state.expenseShares ?? [],
  }
}

/**
 * Calcula el resumen cuantitativo de entidades para visualización rápida.
 */
export function calculateBackupSummary(state: PersistedState): BackupSummary {
  return {
    transactionCount: state.transactions?.length ?? 0,
    accountCount: state.accounts?.length ?? 0,
    goalCount: state.goals?.length ?? 0,
    reserveCount: state.reserves?.length ?? 0,
    budgetCount: state.budgets?.length ?? 0,
    recurringCount: state.recurring?.length ?? 0,
  }
}

/**
 * Determina si han transcurrido al menos 7 días desde la última copia automática.
 */
export function shouldPerformAutoBackup(lastBackupIso: string | null, now = new Date()): boolean {
  if (!lastBackupIso) return true
  try {
    const lastDate = new Date(lastBackupIso)
    if (isNaN(lastDate.getTime())) return true
    const diffMs = now.getTime() - lastDate.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    return diffDays >= AUTO_BACKUP_INTERVAL_DAYS
  } catch {
    return true
  }
}

/**
 * Crea una copia de seguridad en la tabla `cloud_backups` de Supabase.
 */
export async function createCloudBackup(
  supabase: SupabaseClient,
  userId: string,
  state: PersistedState,
  reason: CloudBackupReason,
  appVersion = APP_VERSION,
  now = new Date()
): Promise<CloudBackupRecord | null> {
  const sanitized = sanitizeStateForBackup(state)
  const summary = calculateBackupSummary(sanitized)
  const backupId = crypto.randomUUID()
  const createdAt = now.toISOString()

  const row = {
    id: backupId,
    user_id: userId,
    created_at: createdAt,
    reason,
    schema_version: CURRENT_BACKUP_VERSION,
    app_version: appVersion,
    payload: sanitized,
    summary,
  }

  try {
    const { data, error } = await supabase
      .from('cloud_backups')
      .insert(row)
      .select()
      .single()

    if (error) {
      console.warn('[CloudBackup] Error insertando backup en Supabase:', error.message)
      return null
    }

    // Si es automático, actualizar marca de tiempo local y podar retención
    if (reason === 'auto') {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LAST_CLOUD_AUTO_BACKUP_KEY, createdAt)
      }
      await pruneOldAutoBackups(supabase, userId, MAX_AUTO_BACKUPS_RETENTION)
    }

    return (data as CloudBackupRecord) || (row as CloudBackupRecord)
  } catch (err) {
    console.warn('[CloudBackup] Excepción creando backup:', err)
    return null
  }
}

/**
 * Obtiene la lista de copias de seguridad de un usuario ordenadas de más reciente a más antigua.
 */
export async function listCloudBackups(
  supabase: SupabaseClient,
  userId: string
): Promise<CloudBackupRecord[]> {
  try {
    const { data, error } = await supabase
      .from('cloud_backups')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('[CloudBackup] Error listando backups:', error.message)
      return []
    }

    return (data as CloudBackupRecord[]) ?? []
  } catch (err) {
    console.warn('[CloudBackup] Excepción listando backups:', err)
    return []
  }
}

/**
 * Elimina las copias automáticas más antiguas cuando se supera el límite de retención (8 copias).
 */
export async function pruneOldAutoBackups(
  supabase: SupabaseClient,
  userId: string,
  maxRetention = MAX_AUTO_BACKUPS_RETENTION
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('cloud_backups')
      .select('id, created_at')
      .eq('user_id', userId)
      .eq('reason', 'auto')
      .order('created_at', { ascending: false })

    if (error || !data) return

    if (data.length > maxRetention) {
      const toDelete = data.slice(maxRetention).map((r) => r.id)
      if (toDelete.length > 0) {
        await supabase
          .from('cloud_backups')
          .delete()
          .in('id', toDelete)
          .eq('user_id', userId)
      }
    }
  } catch (err) {
    console.warn('[CloudBackup] Error podando backups antiguos:', err)
  }
}

/**
 * Ejecuta el backup automático si corresponde (online, autenticado, reconciliado y >= 7 días).
 */
export async function performAutoBackupIfNeeded(
  supabase: SupabaseClient,
  userId: string,
  state: PersistedState,
  isOnline: boolean,
  isHydratedAndReconciled: boolean
): Promise<CloudBackupRecord | null> {
  if (!isOnline || !isHydratedAndReconciled || !userId) {
    return null
  }

  try {
    // Buscar la fecha de la última copia automática
    const { data } = await supabase
      .from('cloud_backups')
      .select('created_at')
      .eq('user_id', userId)
      .eq('reason', 'auto')
      .order('created_at', { ascending: false })
      .limit(1)

    const lastAutoIso = data?.[0]?.created_at ?? (typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_CLOUD_AUTO_BACKUP_KEY) : null)

    if (shouldPerformAutoBackup(lastAutoIso)) {
      return await createCloudBackup(supabase, userId, state, 'auto')
    }

    return null
  } catch (err) {
    console.warn('[CloudBackup] Error verificando auto-backup:', err)
    return null
  }
}

/**
 * Restaura una copia de seguridad creando primero un backup 'pre_restore' de seguridad.
 * Sincroniza tanto Supabase como el estado local (IndexedDB) de forma consistente.
 */
export async function restoreCloudBackup(
  supabase: SupabaseClient,
  userId: string,
  backupToRestore: CloudBackupRecord,
  currentState: PersistedState,
  onRestoreLocal: (state: PersistedState) => Promise<void>
): Promise<{ success: boolean; error?: string }> {
  if (!backupToRestore || !backupToRestore.payload) {
    return { success: false, error: 'La copia seleccionada no contiene datos válidos.' }
  }

  if (
    typeof backupToRestore.schema_version !== 'number' ||
    backupToRestore.schema_version > CURRENT_BACKUP_VERSION ||
    backupToRestore.schema_version < 1
  ) {
    return {
      success: false,
      error: `Versión de esquema no soportada (v${String(backupToRestore.schema_version)}).`,
    }
  }

  try {
    // 1. Crear backup de seguridad pre_restore del estado actual
    await createCloudBackup(supabase, userId, currentState, 'pre_restore')

    // 2. Migrar y sanear datos a restaurar
    const cleanPayload = migratePersistedState(backupToRestore.payload)

    // 3. Subir el estado restaurado a Supabase
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      await uploadStateToSupabase(supabase, userId, cleanPayload)
    }

    // 4. Restaurar en almacén local / IndexedDB
    await onRestoreLocal(cleanPayload)

    return { success: true }
  } catch (err) {
    console.error('[CloudBackup] Error en restauración:', err)
    return {
      success: false,
      error: (err as Error)?.message || 'Fallo durante la restauración de la copia.',
    }
  }
}

import { useEffect, useState, useRef, type ChangeEvent } from 'react'
import type { FinanceStore } from '../store/useFinance'
import { AppIcon } from '../ui/icons'
import {
  createBackupPayload,
  getLastBackupDate,
  shareOrDownloadBackup,
  validateBackupPayload,
  type BackupValidationSuccess,
} from '../utils/backup'
import { getCurrentUser, getSupabase } from '../services/supabase/supabaseClient'
import {
  createCloudBackup,
  listCloudBackups,
  restoreCloudBackup,
  type CloudBackupRecord,
  LAST_CLOUD_AUTO_BACKUP_KEY,
} from '../services/supabase/cloudBackupService'
import { uploadStateToSupabase } from '../services/supabase/supabaseSync'

interface BackupPageProps {
  finance: FinanceStore
  onBack: () => void
  onToast: (message: string, type?: 'success' | 'error') => void
}

export function BackupPage({ finance, onBack, onToast }: BackupPageProps) {
  const [lastExternalBackup, setLastExternalBackup] = useState<string | null>(getLastBackupDate)
  const [cloudBackups, setCloudBackups] = useState<CloudBackupRecord[]>([])
  const [selectedCloudBackup, setSelectedCloudBackup] = useState<CloudBackupRecord | null>(null)
  const [pendingJsonRestore, setPendingJsonRestore] = useState<BackupValidationSuccess | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isCreatingCloud, setIsCreatingCloud] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [isLoadingCloudList, setIsLoadingCloudList] = useState(true)
  const [hasCloudError, setHasCloudError] = useState(false)
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true))
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const loadBackups = async () => {
    try {
      setIsLoadingCloudList(true)
      const user = await getCurrentUser()
      if (user && isOnline) {
        const supabase = getSupabase()
        const list = await listCloudBackups(supabase, user.id)
        setCloudBackups(list)
        setHasCloudError(false)
      }
    } catch (err) {
      console.error('[BackupPage] Error cargando backups:', err)
      setHasCloudError(true)
    } finally {
      setIsLoadingCloudList(false)
    }
  }

  useEffect(() => {
    void loadBackups()
  }, [isOnline])

  const latestAutoBackup = cloudBackups.find((b) => b.reason === 'auto')
  const lastAutoDate =
    latestAutoBackup?.created_at ??
    (typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_CLOUD_AUTO_BACKUP_KEY) : null)

  const getProtectionStatus = () => {
    if (hasCloudError) return { label: 'Error', badgeClass: 'error' }
    if (!isOnline) return { label: 'Sin conexión', badgeClass: 'offline' }
    if (lastAutoDate) return { label: 'Protegido', badgeClass: 'protected' }
    return { label: 'Pendiente', badgeClass: 'pending' }
  }

  const handleExportJson = async () => {
    try {
      setIsExporting(true)
      const fullState = finance.getFullState()
      const payload = createBackupPayload(fullState)
      const ok = await shareOrDownloadBackup(payload)
      if (ok) {
        setLastExternalBackup(payload.exportedAt)
        onToast('Copia de seguridad exportada correctamente', 'success')
      } else {
        onToast('No se pudo completar la exportación', 'error')
      }
    } catch (err) {
      console.error('[Backup] Error exportando:', err)
      onToast('Error al exportar la copia de seguridad', 'error')
    } finally {
      setIsExporting(false)
    }
  }

  const handleCreateManualCloudBackup = async () => {
    if (!isOnline) {
      onToast('Se requiere conexión para crear una copia en la nube', 'error')
      return
    }

    try {
      setIsCreatingCloud(true)
      const user = await getCurrentUser()
      if (!user) {
        onToast('No hay sesión activa', 'error')
        return
      }

      const supabase = getSupabase()
      const state = finance.getFullState()
      const record = await createCloudBackup(supabase, user.id, state, 'manual')

      if (record) {
        setCloudBackups((prev) => [record, ...prev])
        setHasCloudError(false)
        onToast('Copia de seguridad guardada en la nube', 'success')
      } else {
        setHasCloudError(true)
        onToast('Error al crear copia en la nube', 'error')
      }
    } catch (err) {
      console.error('[Backup] Error guardando copia en la nube:', err)
      setHasCloudError(true)
      onToast('Error al conectar con la nube', 'error')
    } finally {
      setIsCreatingCloud(false)
    }
  }

  const handleSelectFile = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(text)
      } catch {
        onToast('El archivo no tiene un formato JSON válido', 'error')
        return
      }

      const result = validateBackupPayload(parsedJson)
      if (!result.valid) {
        onToast(result.error, 'error')
        return
      }

      setPendingJsonRestore(result)
    } catch (err) {
      console.error('[Backup] Error leyendo archivo:', err)
      onToast('Error al procesar el archivo seleccionado', 'error')
    }
  }

  const handleConfirmCloudRestore = async () => {
    if (!selectedCloudBackup) return

    try {
      setIsRestoring(true)
      const user = await getCurrentUser()
      if (!user) {
        onToast('No hay sesión activa', 'error')
        return
      }

      const supabase = getSupabase()
      const currentState = finance.getFullState()

      const res = await restoreCloudBackup(
        supabase,
        user.id,
        selectedCloudBackup,
        currentState,
        async (state) => {
          await finance.restoreState(state)
        }
      )

      if (res.success) {
        setSelectedCloudBackup(null)
        await loadBackups()
        onToast('Copia en la nube restaurada con éxito', 'success')
      } else {
        onToast(res.error || 'Error al restaurar copia en la nube', 'error')
      }
    } catch (err) {
      console.error('[Backup] Error restaurando:', err)
      onToast('Error al procesar la restauración', 'error')
    } finally {
      setIsRestoring(false)
    }
  }

  const handleConfirmJsonRestore = async () => {
    if (!pendingJsonRestore) return

    try {
      setIsRestoring(true)
      const user = await getCurrentUser()
      const supabase = getSupabase()

      // Crear backup de seguridad pre_restore en la nube si está online
      if (user && isOnline) {
        await createCloudBackup(supabase, user.id, finance.getFullState(), 'pre_restore')
      }

      await finance.restoreState(pendingJsonRestore.state)

      if (user && isOnline) {
        await uploadStateToSupabase(supabase, user.id, pendingJsonRestore.state)
      }

      setPendingJsonRestore(null)
      await loadBackups()
      onToast('Datos restaurados con éxito desde archivo JSON', 'success')
    } catch (err) {
      console.error('[Backup] Error restaurando JSON:', err)
      onToast('Error al restaurar archivo JSON', 'error')
    } finally {
      setIsRestoring(false)
    }
  }

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso)
      if (isNaN(d.getTime())) return iso
      return d.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  const getReasonBadge = (reason: string) => {
    switch (reason) {
      case 'auto':
        return { label: 'Automática', color: 'badge-auto' }
      case 'pre_restore':
        return { label: 'Pre-restauración', color: 'badge-prerestore' }
      case 'manual':
      default:
        return { label: 'Manual', color: 'badge-manual' }
    }
  }

  const protection = getProtectionStatus()

  return (
    <div className="page backup-page">
      <header className="page-header">
        <div className="header-left">
          <button type="button" className="btn-icon" onClick={onBack} aria-label="Volver">
            <AppIcon name="chevron-left" size={22} />
          </button>
          <h2>Copias de seguridad</h2>
        </div>
      </header>

      {/* SECCIÓN 1: Protección en la nube */}
      <section className="card cloud-protection-card">
        <div className="protection-header-row">
          <div className="protection-icon">
            <AppIcon name="shield" size={24} />
          </div>
          <div className="protection-info">
            <div className="protection-title-row">
              <h3>Protección en la nube</h3>
              <span className={`status-pill ${protection.badgeClass}`}>{protection.label}</span>
            </div>
            <p className="protection-subtext">
              Última copia automática:{' '}
              <strong>{lastAutoDate ? formatDateTime(lastAutoDate) : 'Pendiente de inicio'}</strong>
            </p>
          </div>
        </div>

        <div className="protection-actions-row">
          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={handleCreateManualCloudBackup}
            disabled={isCreatingCloud || !isOnline}
          >
            <AppIcon name="cloud" size={16} />
            <span>{isCreatingCloud ? 'Guardando...' : 'Crear copia en la nube ahora'}</span>
          </button>
        </div>

        {/* Lista compacta de copias recientes */}
        <div className="recent-backups-section">
          <h4 className="recent-backups-title">Copias versionadas en Supabase</h4>
          {isLoadingCloudList ? (
            <p className="muted-text">Cargando copias disponibles...</p>
          ) : cloudBackups.length === 0 ? (
            <p className="muted-text">
              {isOnline
                ? 'No hay copias previas registradas. Se generará automáticamente una copia cada 7 días al usar Pocketflow.'
                : 'Conéctate a internet para ver y restaurar tus copias en la nube.'}
            </p>
          ) : (
            <div className="backup-items-list">
              {cloudBackups.slice(0, 8).map((backup) => {
                const badge = getReasonBadge(backup.reason)
                return (
                  <div
                    key={backup.id}
                    className="backup-item-row"
                    onClick={() => setSelectedCloudBackup(backup)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="backup-item-left">
                      <strong>{formatDateTime(backup.created_at)}</strong>
                      <span className={`backup-reason-badge ${badge.color}`}>{badge.label}</span>
                    </div>
                    <div className="backup-item-right">
                      <span className="backup-item-summary-hint">
                        {backup.summary?.transactionCount ?? 0} movs
                      </span>
                      <AppIcon name="chevron-right" size={16} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* SECCIÓN 2: Copia externa (JSON) */}
      <section className="card backup-action-card">
        <div className="backup-card-header">
          <div className="action-icon export-icon">
            <AppIcon name="download" size={20} />
          </div>
          <div>
            <h3>Copia externa (JSON)</h3>
            <p className="description">
              Exporta un archivo seguro fuera de la app para guardarlo en <strong>iCloud Drive, Archivos o tu PC</strong>.
            </p>
          </div>
        </div>

        <div className="button-group-stack">
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={handleExportJson}
            disabled={isExporting}
          >
            <AppIcon name="download" size={16} />
            <span>{isExporting ? 'Exportando...' : 'Exportar copia completa'}</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={handleSelectFile}
            disabled={isRestoring}
          >
            <AppIcon name="upload" size={16} />
            <span>Importar y restaurar JSON</span>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        {lastExternalBackup && (
          <small className="muted-text" style={{ marginTop: 8, display: 'block' }}>
            Última exportación externa: {formatDateTime(lastExternalBackup)}
          </small>
        )}
      </section>

      {/* SECCIÓN 3: Explicación de seguridad humana */}
      <section className="card backup-notice-card">
        <div className="notice-header">
          <AppIcon name="info" size={18} />
          <span>Diferencia de seguridad</span>
        </div>
        <ul className="backup-security-list">
          <li>
            <strong>Copia en la nube:</strong> Permite recuperar estados anteriores de Pocketflow ante borrados accidentales o cambios de dispositivo.
          </li>
          <li>
            <strong>Copia externa:</strong> Guarda una copia fuera de Pocketflow y de la nube como respaldo totalmente independiente.
          </li>
        </ul>
      </section>

      {/* Modal para restaurar copia de la nube */}
      {selectedCloudBackup && (
        <div className="modal-backdrop" onClick={() => setSelectedCloudBackup(null)} role="dialog" aria-modal="true">
          <div className="modal backup-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Detalle de copia en la nube</h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => setSelectedCloudBackup(null)}
                aria-label="Cerrar"
              >
                <AppIcon name="x" size={18} />
              </button>
            </div>

            <div className="restore-summary-box">
              <p className="summary-date">
                Copia del <strong>{formatDateTime(selectedCloudBackup.created_at)}</strong> (
                {getReasonBadge(selectedCloudBackup.reason).label})
              </p>

              <div className="summary-grid">
                <div className="summary-item">
                  <span className="count">
                    {selectedCloudBackup.summary?.transactionCount ?? selectedCloudBackup.payload.transactions?.length ?? 0}
                  </span>
                  <span className="type">Movimientos</span>
                </div>
                <div className="summary-item">
                  <span className="count">
                    {selectedCloudBackup.summary?.accountCount ?? selectedCloudBackup.payload.accounts?.length ?? 0}
                  </span>
                  <span className="type">Cuentas</span>
                </div>
                <div className="summary-item">
                  <span className="count">
                    {selectedCloudBackup.summary?.goalCount ?? selectedCloudBackup.payload.goals?.length ?? 0}
                  </span>
                  <span className="type">Objetivos</span>
                </div>
                <div className="summary-item">
                  <span className="count">
                    {selectedCloudBackup.summary?.reserveCount ?? selectedCloudBackup.payload.reserves?.length ?? 0}
                  </span>
                  <span className="type">Reservas</span>
                </div>
                <div className="summary-item">
                  <span className="count">
                    {selectedCloudBackup.summary?.budgetCount ?? selectedCloudBackup.payload.budgets?.length ?? 0}
                  </span>
                  <span className="type">Presupuestos</span>
                </div>
                <div className="summary-item">
                  <span className="count">
                    {selectedCloudBackup.summary?.recurringCount ?? selectedCloudBackup.payload.recurring?.length ?? 0}
                  </span>
                  <span className="type">Recurrentes</span>
                </div>
              </div>
            </div>

            <div className="info-safety-banner">
              <AppIcon name="shield" size={18} />
              <span>
                <strong>Protección automática:</strong> Antes de restaurar esta copia se guardará automáticamente un respaldo de tu estado actual (<em>pre-restauración</em>) para que siempre puedas revertir.
              </span>
            </div>

            <div className="warning-banner">
              <AppIcon name="circle-alert" size={18} />
              <span>
                <strong>Atención:</strong> Esta acción sustituirá todos los datos financieros actuales por el estado de esta copia.
              </span>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedCloudBackup(null)}
                disabled={isRestoring}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmCloudRestore}
                disabled={isRestoring}
              >
                {isRestoring ? 'Restaurando...' : 'Restaurar esta copia'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para restaurar copia JSON externa */}
      {pendingJsonRestore && (
        <div className="modal-backdrop" onClick={() => setPendingJsonRestore(null)} role="dialog" aria-modal="true">
          <div className="modal backup-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Confirmar restauración JSON</h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => setPendingJsonRestore(null)}
                aria-label="Cerrar"
              >
                <AppIcon name="x" size={18} />
              </button>
            </div>

            <div className="restore-summary-box">
              <p className="summary-date">
                Copia exportada el <strong>{formatDateTime(pendingJsonRestore.exportedAt)}</strong> (v{pendingJsonRestore.version})
              </p>

              <div className="summary-grid">
                <div className="summary-item">
                  <span className="count">{pendingJsonRestore.summary.transactionCount}</span>
                  <span className="type">Movimientos</span>
                </div>
                <div className="summary-item">
                  <span className="count">{pendingJsonRestore.summary.accountCount}</span>
                  <span className="type">Cuentas</span>
                </div>
                <div className="summary-item">
                  <span className="count">{pendingJsonRestore.summary.goalCount}</span>
                  <span className="type">Objetivos</span>
                </div>
                <div className="summary-item">
                  <span className="count">{pendingJsonRestore.summary.reserveCount}</span>
                  <span className="type">Reservas</span>
                </div>
                <div className="summary-item">
                  <span className="count">{pendingJsonRestore.summary.budgetCount}</span>
                  <span className="type">Presupuestos</span>
                </div>
                <div className="summary-item">
                  <span className="count">{pendingJsonRestore.summary.recurringCount}</span>
                  <span className="type">Recurrentes</span>
                </div>
              </div>
            </div>

            <div className="warning-banner">
              <AppIcon name="circle-alert" size={18} />
              <span>
                <strong>Atención:</strong> Esta acción reemplazará todos los datos actuales de Pocketflow con los datos del archivo JSON seleccionado.
              </span>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setPendingJsonRestore(null)}
                disabled={isRestoring}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmJsonRestore}
                disabled={isRestoring}
              >
                {isRestoring ? 'Restaurando...' : 'Sobrescribir y restaurar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

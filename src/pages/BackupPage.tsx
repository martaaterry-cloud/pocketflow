import { useState, useRef, type ChangeEvent } from 'react'
import type { FinanceStore } from '../store/useFinance'
import { AppIcon } from '../ui/icons'
import {
  createBackupPayload,
  getLastBackupDate,
  shareOrDownloadBackup,
  validateBackupPayload,
  type BackupValidationSuccess,
} from '../utils/backup'

interface BackupPageProps {
  finance: FinanceStore
  onBack: () => void
  onToast: (message: string, type?: 'success' | 'error') => void
}

export function BackupPage({ finance, onBack, onToast }: BackupPageProps) {
  const [lastBackup, setLastBackup] = useState<string | null>(getLastBackupDate)
  const [pendingRestore, setPendingRestore] = useState<BackupValidationSuccess | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    try {
      setIsExporting(true)
      const fullState = finance.getFullState()
      const payload = createBackupPayload(fullState)
      const ok = await shareOrDownloadBackup(payload)
      if (ok) {
        setLastBackup(payload.exportedAt)
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

      setPendingRestore(result)
    } catch (err) {
      console.error('[Backup] Error leyendo archivo:', err)
      onToast('Error al procesar el archivo seleccionado', 'error')
    }
  }

  const handleConfirmRestore = async () => {
    if (!pendingRestore) return

    try {
      setIsRestoring(true)
      await finance.restoreState(pendingRestore.state)
      setPendingRestore(null)
      onToast('Datos restaurados con éxito', 'success')
    } catch (err) {
      console.error('[Backup] Error restaurando estado:', err)
      onToast('Error crítico al restaurar la copia de seguridad', 'error')
    } finally {
      setIsRestoring(false)
    }
  }

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso)
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

      {/* Tarjeta de estado de última copia */}
      <section className="card backup-status-card">
        <div className="backup-status-icon">
          <AppIcon name="shield" size={24} />
        </div>
        <div className="backup-status-info">
          <span className="label">Última copia de seguridad</span>
          <strong className="value">
            {lastBackup ? formatDateTime(lastBackup) : 'Ninguna copia registrada'}
          </strong>
        </div>
      </section>

      {/* Sección Exportar */}
      <section className="card backup-action-card">
        <div className="backup-card-header">
          <div className="action-icon export-icon">
            <AppIcon name="download" size={20} />
          </div>
          <div>
            <h3>Exportar copia completa</h3>
            <p className="description">
              Genera un archivo JSON estructurado con todos tus movimientos, cuentas, presupuestos y objetivos. Puedes guardarlo directamente en <strong>Archivos / iCloud Drive</strong> desde tu iPhone o en tu PC.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={handleExport}
          disabled={isExporting}
        >
          <AppIcon name="download" size={18} />
          <span>{isExporting ? 'Exportando...' : 'Exportar copia ahora'}</span>
        </button>
      </section>

      {/* Sección Importar */}
      <section className="card backup-action-card">
        <div className="backup-card-header">
          <div className="action-icon import-icon">
            <AppIcon name="upload" size={20} />
          </div>
          <div>
            <h3>Importar y restaurar</h3>
            <p className="description">
              Restaura tu información financiera desde una copia previa de Pocketflow. Se validará la compatibilidad del archivo y podrás revisar el resumen antes de aplicar cambios.
            </p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <button
          type="button"
          className="btn btn-secondary btn-block"
          onClick={handleSelectFile}
          disabled={isRestoring}
        >
          <AppIcon name="folder" size={18} />
          <span>Seleccionar archivo .json</span>
        </button>
      </section>

      <section className="card backup-notice-card">
        <div className="notice-header">
          <AppIcon name="circle-alert" size={18} />
          <span>Privacidad y seguridad</span>
        </div>
        <p>
          Pocketflow es 100% offline y local-first. Tus copias de seguridad se generan íntegramente en tu dispositivo sin transmitirse a ningún servidor.
        </p>
      </section>

      {/* Modal de confirmación y resumen antes de restaurar */}
      {pendingRestore && (
        <div className="modal-backdrop">
          <div className="modal backup-confirm-modal">
            <div className="modal-header">
              <h3>Confirmar restauración</h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => setPendingRestore(null)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="restore-summary-box">
              <p className="summary-date">
                Copia exportada el <strong>{formatDateTime(pendingRestore.exportedAt)}</strong> (v{pendingRestore.version})
              </p>

              <div className="summary-grid">
                <div className="summary-item">
                  <span className="count">{pendingRestore.summary.transactionCount}</span>
                  <span className="type">Movimientos</span>
                </div>
                <div className="summary-item">
                  <span className="count">{pendingRestore.summary.accountCount}</span>
                  <span className="type">Cuentas</span>
                </div>
                <div className="summary-item">
                  <span className="count">{pendingRestore.summary.goalCount}</span>
                  <span className="type">Objetivos</span>
                </div>
                <div className="summary-item">
                  <span className="count">{pendingRestore.summary.reserveCount}</span>
                  <span className="type">Reservas</span>
                </div>
                <div className="summary-item">
                  <span className="count">{pendingRestore.summary.budgetCount}</span>
                  <span className="type">Presupuestos</span>
                </div>
                <div className="summary-item">
                  <span className="count">{pendingRestore.summary.recurringCount}</span>
                  <span className="type">Recurrentes</span>
                </div>
              </div>
            </div>

            <div className="warning-banner">
              <AppIcon name="circle-alert" size={18} />
              <span>
                <strong>Atención:</strong> Esta acción reemplazará todos los datos actuales de Pocketflow con los datos del archivo seleccionado. Esta operación no se puede deshacer.
              </span>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setPendingRestore(null)}
                disabled={isRestoring}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmRestore}
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

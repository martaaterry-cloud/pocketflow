import React, { useRef, useState } from 'react'
import type { AttachmentMetadata } from '../models/finance'
import { validateAndProcessAttachment } from '../utils/imageCompression'
import { AttachmentViewerModal } from './AttachmentViewerModal'
import { AppIcon } from '../ui/icons'

export interface StagedAttachment {
  file: File
  blob: Blob
  fileName: string
  mimeType: string
  fileSize: number
  localUrl: string
  isPdf: boolean
}

export interface AttachmentSectionProps {
  existingAttachments: AttachmentMetadata[]
  stagedAttachments: StagedAttachment[]
  onAddStaged: (staged: StagedAttachment[]) => void
  onRemoveStaged: (index: number) => void
  onRemoveExisting: (attachmentId: string) => void
  disabled?: boolean
  error?: string | null
}

export function AttachmentSection({
  existingAttachments = [],
  stagedAttachments = [],
  onAddStaged,
  onRemoveStaged,
  onRemoveExisting,
  disabled = false,
  error: parentError,
}: AttachmentSectionProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const documentInputRef = useRef<HTMLInputElement>(null)

  const [showMenu, setShowMenu] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [selectedViewerItem, setSelectedViewerItem] = useState<{
    attachment: AttachmentMetadata
    localBlobUrl?: string | null
  } | null>(null)

  const totalCount = existingAttachments.length + stagedAttachments.length

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setProcessing(true)
    setLocalError(null)

    const newlyProcessed: StagedAttachment[] = []
    const errors: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        const processed = await validateAndProcessAttachment(file)
        const localUrl = URL.createObjectURL(processed.blob)
        newlyProcessed.push({
          file,
          blob: processed.blob,
          fileName: processed.fileName,
          mimeType: processed.mimeType,
          fileSize: processed.fileSize,
          localUrl,
          isPdf: processed.isPdf,
        })
      } catch (err: any) {
        errors.push(err.message || `Error procesando ${file.name}`)
      }
    }

    if (newlyProcessed.length > 0) {
      onAddStaged(newlyProcessed)
    }

    if (errors.length > 0) {
      setLocalError(errors.join(' | '))
    }

    // Resetear valor de los inputs para permitir seleccionar el mismo archivo de nuevo
    e.target.value = ''
    setProcessing(false)
    setShowMenu(false)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="attachment-section-container">
      {/* Inputs ocultos estándar */}
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        className="hidden-file-input"
        onChange={handleFilesSelected}
        tabIndex={-1}
      />
      <input
        type="file"
        ref={galleryInputRef}
        accept="image/jpeg,image/png,image/webp,image/*"
        multiple
        className="hidden-file-input"
        onChange={handleFilesSelected}
        tabIndex={-1}
      />
      <input
        type="file"
        ref={documentInputRef}
        accept="application/pdf,image/jpeg,image/png,image/webp,image/*"
        multiple
        className="hidden-file-input"
        onChange={handleFilesSelected}
        tabIndex={-1}
      />

      <div className="attachment-section-header">
        <label className="attachment-section-label">
          <AppIcon name="paperclip" size={16} />
          <span>Justificantes {totalCount > 0 ? `(${totalCount})` : ''}</span>
        </label>

        <div className="attachment-actions-wrapper">
          <button
            type="button"
            className="btn-add-attachment"
            onClick={() => setShowMenu((prev) => !prev)}
            disabled={disabled || processing}
          >
            {processing ? (
              <>
                <span className="spinner-small" />
                <span>Procesando...</span>
              </>
            ) : (
              <>
                <AppIcon name="plus" size={14} />
                <span>Añadir justificante</span>
              </>
            )}
          </button>

          {/* Menú de selección de origen */}
          {showMenu && !disabled && (
            <div className="attachment-source-menu">
              <button
                type="button"
                className="attachment-source-item"
                onClick={() => {
                  cameraInputRef.current?.click()
                  setShowMenu(false)
                }}
              >
                <AppIcon name="camera" size={16} />
                <span>Hacer foto</span>
              </button>
              <button
                type="button"
                className="attachment-source-item"
                onClick={() => {
                  galleryInputRef.current?.click()
                  setShowMenu(false)
                }}
              >
                <AppIcon name="image" size={16} />
                <span>Elegir imagen</span>
              </button>
              <button
                type="button"
                className="attachment-source-item"
                onClick={() => {
                  documentInputRef.current?.click()
                  setShowMenu(false)
                }}
              >
                <AppIcon name="file-text" size={16} />
                <span>Elegir archivo / PDF</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {(localError || parentError) && (
        <div className="attachment-error-banner">
          <AppIcon name="alert-circle" size={14} color="#ef4444" />
          <span>{localError || parentError}</span>
        </div>
      )}

      {/* Grid de justificantes */}
      {totalCount > 0 && (
        <div className="attachment-thumbnails-grid">
          {/* 1. Existentes ya guardados */}
          {existingAttachments.map((att) => {
            const isPdf =
              att.mimeType === 'application/pdf' ||
              att.fileName.toLowerCase().endsWith('.pdf')

            return (
              <div
                key={att.id}
                className="attachment-thumb-card"
                onClick={() => setSelectedViewerItem({ attachment: att })}
              >
                <div className="attachment-thumb-preview">
                  {isPdf ? (
                    <div className="attachment-pdf-icon-badge">
                      <AppIcon name="file-text" size={24} color="#ef4444" />
                      <span>PDF</span>
                    </div>
                  ) : (
                    <div className="attachment-img-placeholder">
                      <AppIcon name="image" size={24} color="#3b82f6" />
                    </div>
                  )}
                </div>

                <div className="attachment-thumb-info">
                  <span className="attachment-thumb-name" title={att.fileName}>
                    {att.fileName}
                  </span>
                  <span className="attachment-thumb-size">
                    {formatSize(att.fileSize)}
                  </span>
                </div>

                <button
                  type="button"
                  className="attachment-thumb-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveExisting(att.id)
                  }}
                  title="Eliminar justificante"
                  aria-label="Eliminar justificante"
                >
                  <AppIcon name="x" size={12} color="#ffffff" />
                </button>
              </div>
            )
          })}

          {/* 2. Temporales pendientes de guardar (staged) */}
          {stagedAttachments.map((staged, idx) => {
            return (
              <div
                key={`staged-${idx}`}
                className="attachment-thumb-card staged"
                onClick={() =>
                  setSelectedViewerItem({
                    attachment: {
                      id: `temp-${idx}`,
                      fileName: staged.fileName,
                      mimeType: staged.mimeType,
                      fileSize: staged.fileSize,
                      storagePath: '',
                      createdAt: new Date().toISOString(),
                    },
                    localBlobUrl: staged.localUrl,
                  })
                }
              >
                <div className="attachment-thumb-preview">
                  {staged.isPdf ? (
                    <div className="attachment-pdf-icon-badge">
                      <AppIcon name="file-text" size={24} color="#ef4444" />
                      <span>PDF</span>
                    </div>
                  ) : (
                    <img
                      src={staged.localUrl}
                      alt={staged.fileName}
                      className="attachment-thumb-img"
                    />
                  )}
                </div>

                <div className="attachment-thumb-info">
                  <span className="attachment-thumb-name" title={staged.fileName}>
                    {staged.fileName}
                  </span>
                  <span className="attachment-thumb-size">
                    {formatSize(staged.fileSize)} · Nuevo
                  </span>
                </div>

                <button
                  type="button"
                  className="attachment-thumb-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveStaged(idx)
                  }}
                  title="Quitar justificante"
                  aria-label="Quitar justificante"
                >
                  <AppIcon name="x" size={12} color="#ffffff" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal visor a pantalla completa */}
      {selectedViewerItem && (
        <AttachmentViewerModal
          open={Boolean(selectedViewerItem)}
          onClose={() => setSelectedViewerItem(null)}
          attachment={selectedViewerItem.attachment}
          localBlobUrl={selectedViewerItem.localBlobUrl}
        />
      )}
    </div>
  )
}

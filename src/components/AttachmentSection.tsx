import React, { useRef, useState, useEffect } from 'react'
import type { AttachmentMetadata } from '../models/finance'
import { validateAndProcessAttachment } from '../utils/imageCompression'
import { createSignedAttachmentUrl } from '../services/supabase/attachmentService'
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

function ExistingAttachmentThumb({
  attachment,
  onClick,
  onRemove,
}: {
  attachment: AttachmentMetadata
  onClick: () => void
  onRemove: () => void
}) {
  const isPdf =
    attachment.mimeType === 'application/pdf' ||
    attachment.fileName.toLowerCase().endsWith('.pdf')

  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    if (isPdf) return
    let isMounted = true
    createSignedAttachmentUrl(attachment.storagePath, 600)
      .then((url) => {
        if (isMounted && url) setSignedUrl(url)
      })
      .catch(() => {
        if (isMounted) setImgError(true)
      })
    return () => {
      isMounted = false
    }
  }, [attachment.storagePath, isPdf])

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="attachment-thumb-card" onClick={onClick} role="button" tabIndex={0}>
      <div className="attachment-thumb-preview">
        {isPdf ? (
          <div className="attachment-pdf-card-badge">
            <AppIcon name="file-text" size={22} className="attachment-pdf-icon" />
            <span className="attachment-pdf-tag">PDF</span>
          </div>
        ) : signedUrl && !imgError ? (
          <img
            src={signedUrl}
            alt={attachment.fileName}
            className="attachment-thumb-img"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="attachment-img-placeholder">
            <AppIcon name="image" size={20} color="var(--primary, #3b82f6)" />
          </div>
        )}
      </div>

      <div className="attachment-thumb-info">
        <span className="attachment-thumb-name" title={attachment.fileName}>
          {attachment.fileName}
        </span>
        <span className="attachment-thumb-size">
          {formatSize(attachment.fileSize)}
        </span>
      </div>

      <button
        type="button"
        className="attachment-thumb-delete-btn"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        title="Eliminar justificante"
        aria-label="Eliminar justificante"
      >
        <AppIcon name="x" size={12} color="#ffffff" />
      </button>
    </div>
  )
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
  const [viewerState, setViewerState] = useState<{
    open: boolean
    initialIndex: number
  }>({ open: false, initialIndex: 0 })

  const totalCount = existingAttachments.length + stagedAttachments.length

  // Lista unificada para el visor
  const viewerAttachments = React.useMemo(() => {
    const fromExisting = existingAttachments.map((a) => ({ ...a }))
    const fromStaged = stagedAttachments.map((s, idx) => ({
      id: `temp-${idx}`,
      fileName: s.fileName,
      mimeType: s.mimeType,
      fileSize: s.fileSize,
      storagePath: '',
      createdAt: new Date().toISOString(),
    }))
    return [...fromExisting, ...fromStaged]
  }, [existingAttachments, stagedAttachments])

  const viewerLocalBlobUrls = React.useMemo(() => {
    const existingEmpty = existingAttachments.map(() => null)
    const stagedUrls = stagedAttachments.map((s) => s.localUrl)
    return [...existingEmpty, ...stagedUrls]
  }, [existingAttachments, stagedAttachments])

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
      {/* Inputs ocultos para captura directa de cámara, galería o archivo */}
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        className="hidden-file-input"
        onChange={handleFilesSelected}
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        type="file"
        ref={galleryInputRef}
        accept="image/jpeg,image/png,image/webp,image/*"
        multiple
        className="hidden-file-input"
        onChange={handleFilesSelected}
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        type="file"
        ref={documentInputRef}
        accept="application/pdf,image/jpeg,image/png,image/webp,image/*"
        multiple
        className="hidden-file-input"
        onChange={handleFilesSelected}
        tabIndex={-1}
        aria-hidden="true"
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
            aria-expanded={showMenu}
            aria-label="Añadir justificante"
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

          {/* Menú de selección de origen con iconos lineales */}
          {showMenu && !disabled && (
            <div className="attachment-source-menu" role="menu">
              <button
                type="button"
                className="attachment-source-item"
                onClick={() => {
                  cameraInputRef.current?.click()
                  setShowMenu(false)
                }}
                role="menuitem"
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
                role="menuitem"
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
                role="menuitem"
              >
                <AppIcon name="file-text" size={16} />
                <span>Elegir archivo / PDF</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {(localError || parentError) && (
        <div className="attachment-error-banner" role="alert">
          <AppIcon name="circle-alert" size={14} color="#ef4444" />
          <span>{localError || parentError}</span>
        </div>
      )}

      {/* Grid de justificantes */}
      {totalCount > 0 && (
        <div className="attachment-thumbnails-grid">
          {/* 1. Existentes ya guardados */}
          {existingAttachments.map((att, idx) => (
            <ExistingAttachmentThumb
              key={att.id}
              attachment={att}
              onClick={() => setViewerState({ open: true, initialIndex: idx })}
              onRemove={() => onRemoveExisting(att.id)}
            />
          ))}

          {/* 2. Temporales pendientes de guardar (staged) */}
          {stagedAttachments.map((staged, sIdx) => {
            const globalIdx = existingAttachments.length + sIdx
            return (
              <div
                key={`staged-${sIdx}`}
                className="attachment-thumb-card staged"
                onClick={() => setViewerState({ open: true, initialIndex: globalIdx })}
                role="button"
                tabIndex={0}
              >
                <div className="attachment-thumb-preview">
                  {staged.isPdf ? (
                    <div className="attachment-pdf-card-badge">
                      <AppIcon name="file-text" size={22} className="attachment-pdf-icon" />
                      <span className="attachment-pdf-tag">PDF</span>
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
                    onRemoveStaged(sIdx)
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

      {/* Modal visor a pantalla completa con navegación entre todos los adjuntos */}
      {viewerState.open && (
        <AttachmentViewerModal
          open={viewerState.open}
          onClose={() => setViewerState({ open: false, initialIndex: 0 })}
          attachments={viewerAttachments}
          initialIndex={viewerState.initialIndex}
          localBlobUrls={viewerLocalBlobUrls}
        />
      )}
    </div>
  )
}

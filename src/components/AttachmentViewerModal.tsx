import React, { useEffect, useState, useRef, useCallback } from 'react'
import type { AttachmentMetadata } from '../models/finance'
import { createSignedAttachmentUrl } from '../services/supabase/attachmentService'
import { AppIcon } from '../ui/icons'

export interface AttachmentViewerModalProps {
  open: boolean
  onClose: () => void
  attachment?: AttachmentMetadata | null
  attachments?: AttachmentMetadata[]
  initialIndex?: number
  localBlobUrl?: string | null
  localBlobUrls?: (string | null)[]
  onDelete?: (attachment: AttachmentMetadata) => void
}

export function AttachmentViewerModal({
  open,
  onClose,
  attachment,
  attachments: attachmentsProp,
  initialIndex = 0,
  localBlobUrl,
  localBlobUrls = [],
  onDelete,
}: AttachmentViewerModalProps) {
  // Consolidar lista de justificantes
  const allAttachments: AttachmentMetadata[] = React.useMemo(() => {
    if (attachmentsProp && attachmentsProp.length > 0) {
      return attachmentsProp
    }
    if (attachment) {
      return [attachment]
    }
    return []
  }, [attachmentsProp, attachment])

  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canShare, setCanShare] = useState(false)

  // Touch swipe support
  const touchStartXRef = useRef<number | null>(null)
  const touchStartYRef = useRef<number | null>(null)

  // Sincronizar índice inicial cuando se abre el modal
  useEffect(() => {
    if (open) {
      const safeIndex = Math.max(0, Math.min(initialIndex, allAttachments.length - 1))
      setCurrentIndex(safeIndex)
    }
  }, [open, initialIndex, allAttachments.length])

  const currentAttachment = allAttachments[currentIndex] ?? null
  const currentLocalBlobUrl =
    localBlobUrls[currentIndex] ?? (currentIndex === 0 ? localBlobUrl : null)

  const isPdf = Boolean(
    currentAttachment &&
      (currentAttachment.mimeType === 'application/pdf' ||
        currentAttachment.fileName.toLowerCase().endsWith('.pdf'))
  )

  // Cargar URL del adjunto actual (local o signed URL con caché)
  useEffect(() => {
    if (!open || !currentAttachment) {
      setUrl(null)
      setError(null)
      setLoading(false)
      return
    }

    if (currentLocalBlobUrl) {
      setUrl(currentLocalBlobUrl)
      setError(null)
      setLoading(false)
      return
    }

    let isMounted = true
    setLoading(true)
    setError(null)

    createSignedAttachmentUrl(currentAttachment.storagePath, 600)
      .then((signedUrl) => {
        if (!isMounted) return
        if (signedUrl) {
          setUrl(signedUrl)
        } else {
          setError('No se pudo generar el enlace seguro para este justificante.')
        }
      })
      .catch((err) => {
        if (!isMounted) return
        setError(`Error al cargar el archivo: ${err.message || 'Error de conexión'}`)
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [open, currentAttachment, currentLocalBlobUrl])

  useEffect(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      setCanShare(true)
    } else {
      setCanShare(false)
    }
  }, [])

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1)
    }
  }, [currentIndex])

  const handleNext = useCallback(() => {
    if (currentIndex < allAttachments.length - 1) {
      setCurrentIndex((prev) => prev + 1)
    }
  }, [currentIndex, allAttachments.length])

  // Accesibilidad por teclado: Escape para cerrar, Flechas para navegación
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowLeft') {
        handlePrev()
      } else if (e.key === 'ArrowRight') {
        handleNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, handlePrev, handleNext])

  // Navegación táctil (Swipe horizontal en móvil)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartXRef.current = e.touches[0].clientX
      touchStartYRef.current = e.touches[0].clientY
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return
    const touchEndX = e.changedTouches[0].clientX
    const touchEndY = e.changedTouches[0].clientY
    const deltaX = touchEndX - touchStartXRef.current
    const deltaY = touchEndY - touchStartYRef.current

    // Detectar swipe horizontal claro (mínimo 50px y más horizontal que vertical)
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0) {
        handleNext()
      } else {
        handlePrev()
      }
    }

    touchStartXRef.current = null
    touchStartYRef.current = null
  }

  if (!open || !currentAttachment) return null

  const handleShare = async () => {
    if (!url || !canShare) return
    try {
      if (currentLocalBlobUrl && typeof navigator.canShare === 'function') {
        await navigator.share({
          title: currentAttachment.fileName,
          text: `Justificante: ${currentAttachment.fileName}`,
          url: window.location.href,
        })
      } else {
        await navigator.share({
          title: currentAttachment.fileName,
          text: `Justificante: ${currentAttachment.fileName}`,
          url,
        })
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('[AttachmentViewer] Error al compartir:', err)
      }
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div
      className="modal-overlay attachment-viewer-overlay"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label={`Visor de justificante: ${currentAttachment.fileName}`}
    >
      <div
        className="modal-content attachment-viewer-content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del visor minimalista y compacta */}
        <div className="attachment-viewer-header">
          <div className="attachment-viewer-info">
            <div className="attachment-viewer-icon-title">
              <AppIcon
                name={isPdf ? 'file-text' : 'image'}
                size={18}
                className="attachment-viewer-type-icon"
              />
              <h3 className="attachment-viewer-title" title={currentAttachment.fileName}>
                {currentAttachment.fileName}
              </h3>
            </div>
            <div className="attachment-viewer-meta-row">
              <span className="attachment-viewer-meta">
                {formatFileSize(currentAttachment.fileSize)}
              </span>
              {allAttachments.length > 1 && (
                <span className="attachment-viewer-counter">
                  {currentIndex + 1} de {allAttachments.length}
                </span>
              )}
            </div>
          </div>

          <div className="attachment-viewer-actions">
            {canShare && url && (
              <button
                type="button"
                className="btn-icon-action"
                onClick={handleShare}
                title="Compartir justificante"
                aria-label="Compartir justificante"
              >
                <AppIcon name="share-2" size={18} />
              </button>
            )}

            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                download={currentAttachment.fileName}
                className="btn-icon-action"
                title="Descargar justificante"
                aria-label="Descargar justificante"
              >
                <AppIcon name="download" size={18} />
              </a>
            )}

            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-icon-action"
                title="Abrir en pestaña nueva"
                aria-label="Abrir en pestaña nueva"
              >
                <AppIcon name="external-link" size={18} />
              </a>
            )}

            {onDelete && (
              <button
                type="button"
                className="btn-icon-action danger"
                onClick={() => {
                  onDelete(currentAttachment)
                  onClose()
                }}
                title="Eliminar justificante"
                aria-label="Eliminar justificante"
              >
                <AppIcon name="trash-2" size={18} />
              </button>
            )}

            <button
              type="button"
              className="btn-icon-action close"
              onClick={onClose}
              title="Cerrar visor (Esc)"
              aria-label="Cerrar visor"
            >
              <AppIcon name="x" size={20} />
            </button>
          </div>
        </div>

        {/* Cuerpo del visor con soporte de dimensiones 100% en móvil */}
        <div className="attachment-viewer-body">
          {loading && (
            <div className="attachment-loading-state">
              <span className="spinner" />
              <p>Cargando justificante seguro...</p>
            </div>
          )}

          {error && (
            <div className="attachment-error-state">
              <AppIcon name="circle-alert" size={32} color="#ef4444" />
              <p>{error}</p>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary attachment-fallback-btn"
                >
                  <AppIcon name="external-link" size={16} />
                  <span>Abrir archivo externamente</span>
                </a>
              )}
            </div>
          )}

          {!loading && !error && url && (
            isPdf ? (
              <div className="attachment-pdf-container">
                <iframe
                  src={`${url}#toolbar=0&navpanes=0`}
                  title={currentAttachment.fileName}
                  className="attachment-pdf-iframe"
                />
                <div className="attachment-pdf-footer-bar">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-pdf-external"
                    title="Abrir PDF en visor del navegador"
                  >
                    <AppIcon name="external-link" size={15} />
                    <span>Abrir PDF</span>
                  </a>
                </div>
              </div>
            ) : (
              <div className="attachment-image-container">
                <img
                  src={url}
                  alt={currentAttachment.fileName}
                  className="attachment-viewer-image"
                />
              </div>
            )
          )}

          {/* Flechas de navegación entre varios justificantes */}
          {allAttachments.length > 1 && (
            <>
              <button
                type="button"
                className="attachment-nav-arrow prev"
                onClick={handlePrev}
                disabled={currentIndex === 0}
                aria-label="Justificante anterior"
                title="Justificante anterior (Flecha Izquierda)"
              >
                <AppIcon name="chevron-left" size={24} />
              </button>

              <button
                type="button"
                className="attachment-nav-arrow next"
                onClick={handleNext}
                disabled={currentIndex === allAttachments.length - 1}
                aria-label="Justificante siguiente"
                title="Justificante siguiente (Flecha Derecha)"
              >
                <AppIcon name="chevron-right" size={24} />
              </button>
            </>
          )}
        </div>

        {/* Barra inferior de navegación si hay múltiples justificantes */}
        {allAttachments.length > 1 && (
          <div className="attachment-viewer-bottom-nav">
            <button
              type="button"
              className="btn-viewer-step"
              onClick={handlePrev}
              disabled={currentIndex === 0}
            >
              <AppIcon name="chevron-left" size={16} />
              <span>Anterior</span>
            </button>
            <span className="viewer-step-label">
              {currentIndex + 1} de {allAttachments.length}
            </span>
            <button
              type="button"
              className="btn-viewer-step"
              onClick={handleNext}
              disabled={currentIndex === allAttachments.length - 1}
            >
              <span>Siguiente</span>
              <AppIcon name="chevron-right" size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

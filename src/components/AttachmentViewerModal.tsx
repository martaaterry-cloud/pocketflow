import { useEffect, useState } from 'react'
import type { AttachmentMetadata } from '../models/finance'
import { createSignedAttachmentUrl } from '../services/supabase/attachmentService'
import { AppIcon } from '../ui/icons'

export interface AttachmentViewerModalProps {
  open: boolean
  onClose: () => void
  attachment: AttachmentMetadata | null
  localBlobUrl?: string | null
  onDelete?: (attachment: AttachmentMetadata) => void
}

export function AttachmentViewerModal({
  open,
  onClose,
  attachment,
  localBlobUrl,
  onDelete,
}: AttachmentViewerModalProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canShare, setCanShare] = useState(false)

  useEffect(() => {
    if (!open || !attachment) {
      setUrl(null)
      setError(null)
      setLoading(false)
      return
    }

    // Si tenemos una URL local (blob:), usarla directamente
    if (localBlobUrl) {
      setUrl(localBlobUrl)
      return
    }

    // Si es un archivo persistido en Storage, solicitar signed URL
    let isMounted = true
    setLoading(true)
    setError(null)

    createSignedAttachmentUrl(attachment.storagePath, 600)
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
        setError(`Error al cargar el archivo: ${err.message || 'Error de red'}`)
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [open, attachment, localBlobUrl])

  useEffect(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      setCanShare(true)
    } else {
      setCanShare(false)
    }
  }, [])

  if (!open || !attachment) return null

  const isPdf =
    attachment.mimeType === 'application/pdf' ||
    attachment.fileName.toLowerCase().endsWith('.pdf')

  const handleShare = async () => {
    if (!url || !canShare) return
    try {
      if (localBlobUrl && typeof navigator.canShare === 'function') {
        // En caso de blob local, compartir como URL o texto
        await navigator.share({
          title: attachment.fileName,
          text: `Justificante: ${attachment.fileName}`,
          url: window.location.href,
        })
      } else {
        await navigator.share({
          title: attachment.fileName,
          text: `Justificante: ${attachment.fileName}`,
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
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="modal-overlay attachment-viewer-overlay" onClick={onClose}>
      <div
        className="modal-content attachment-viewer-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Cabecera del visor */}
        <div className="attachment-viewer-header">
          <div className="attachment-viewer-info">
            <h3 className="attachment-viewer-title">{attachment.fileName}</h3>
            <span className="attachment-viewer-meta">
              {formatFileSize(attachment.fileSize)}
            </span>
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
                <AppIcon name="share-2" size={18} color="#fff" />
              </button>
            )}
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                download={attachment.fileName}
                className="btn-icon-action"
                title="Descargar justificante"
                aria-label="Descargar justificante"
              >
                <AppIcon name="download" size={18} color="#fff" />
              </a>
            )}
            {onDelete && (
              <button
                type="button"
                className="btn-icon-action danger"
                onClick={() => {
                  onDelete(attachment)
                  onClose()
                }}
                title="Eliminar justificante"
                aria-label="Eliminar justificante"
              >
                <AppIcon name="trash-2" size={18} color="#ef4444" />
              </button>
            )}
            <button
              type="button"
              className="btn-icon-action close"
              onClick={onClose}
              title="Cerrar visor"
              aria-label="Cerrar visor"
            >
              <AppIcon name="x" size={20} color="#fff" />
            </button>
          </div>
        </div>

        {/* Cuerpo del visor */}
        <div className="attachment-viewer-body">
          {loading && (
            <div className="attachment-loading-state">
              <span className="spinner" />
              <p>Cargando justificante seguro...</p>
            </div>
          )}

          {error && (
            <div className="attachment-error-state">
              <AppIcon name="alert-triangle" size={32} color="#ef4444" />
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && url && (
            isPdf ? (
              <div className="attachment-pdf-container">
                <iframe
                  src={`${url}#toolbar=0`}
                  title={attachment.fileName}
                  className="attachment-pdf-iframe"
                />
                <div className="attachment-pdf-fallback">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                  >
                    <AppIcon name="external-link" size={16} />
                    Abrir PDF en pestaña nueva
                  </a>
                </div>
              </div>
            ) : (
              <div className="attachment-image-container">
                <img
                  src={url}
                  alt={attachment.fileName}
                  className="attachment-viewer-image"
                />
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}

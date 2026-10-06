import React, { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { AppIcon } from '../ui/icons'

// Configurar el worker de forma compatible con Vite y Node
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString()
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
  }
}

export interface PdfCanvasViewerProps {
  url: string
  fileName: string
}

interface PageState {
  pageNumber: number
  rendered: boolean
  error?: string
}

export function PdfCanvasViewer({ url, fileName }: PdfCanvasViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [numPages, setNumPages] = useState<number>(0)
  const [pagesState, setPagesState] = useState<PageState[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [containerWidth, setContainerWidth] = useState<number>(0)

  // Referencias a canvases y tareas activas para cleanup
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const renderTasksRef = useRef<Map<number, any>>(new Map())
  const pdfDocRef = useRef<any>(null)

  // Medir ancho del contenedor
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current

    const updateWidth = () => {
      const w = el.clientWidth
      if (w > 0) {
        setContainerWidth(w)
      }
    }

    updateWidth()

    const observer = new ResizeObserver(() => {
      updateWidth()
    })
    observer.observe(el)

    return () => {
      observer.disconnect()
    }
  }, [])

  // Cargar documento PDF
  useEffect(() => {
    let isCancelled = false
    setLoading(true)
    setError(null)
    setNumPages(0)
    setPagesState([])

    // Cancelar tareas previas
    renderTasksRef.current.forEach((task) => {
      try {
        task.cancel()
      } catch {}
    })
    renderTasksRef.current.clear()

    if (pdfDocRef.current) {
      try {
        pdfDocRef.current.destroy()
      } catch {}
      pdfDocRef.current = null
    }

    const loadingTask = pdfjsLib.getDocument({
      url,
      withCredentials: false,
    })

    loadingTask.promise
      .then((pdfDoc) => {
        if (isCancelled) {
          pdfDoc.destroy().catch(() => {})
          return
        }
        pdfDocRef.current = pdfDoc
        const total = pdfDoc.numPages
        setNumPages(total)
        setPagesState(
          Array.from({ length: total }, (_, i) => ({
            pageNumber: i + 1,
            rendered: false,
          }))
        )
        setLoading(false)
      })
      .catch((err) => {
        if (isCancelled) return
        console.warn('[PdfCanvasViewer] Error al cargar documento PDF:', err)
        setError('No se pudo procesar el documento PDF para visualización embebida.')
        setLoading(false)
      })

    return () => {
      isCancelled = true
      try {
        loadingTask.destroy()
      } catch {}
    }
  }, [url])

  // Renderizar páginas progresivamente cuando el ancho del contenedor esté disponible
  useEffect(() => {
    if (!pdfDocRef.current || numPages === 0 || containerWidth <= 0) return

    let isCancelled = false
    const pdf = pdfDocRef.current
    const effectiveWidth = Math.min(containerWidth, 860) // Ancho máximo legible

    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2.5) : 1

    const renderAllPages = async () => {
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        if (isCancelled) break

        const canvas = canvasRefs.current.get(pageNum)
        if (!canvas) continue

        try {
          // Cancelar render task anterior si existía para esta página
          const prevTask = renderTasksRef.current.get(pageNum)
          if (prevTask) {
            try {
              prevTask.cancel()
            } catch {}
          }

          const page = await pdf.getPage(pageNum)
          if (isCancelled) break

          // Calcular escala para fit-to-width
          const unscaledViewport = page.getViewport({ scale: 1.0 })
          // Dejar un pequeño margen lateral (12px por lado)
          const targetWidth = Math.max(200, effectiveWidth - 24)
          const scale = targetWidth / unscaledViewport.width
          const viewport = page.getViewport({ scale })

          const ctx = canvas.getContext('2d')
          if (!ctx) continue

          // Dimensiones de resolución real (Retina / DPR)
          canvas.width = Math.floor(viewport.width * dpr)
          canvas.height = Math.floor(viewport.height * dpr)

          // Dimensiones CSS visuales (ajuste exacto al ancho disponible)
          canvas.style.width = `${Math.floor(viewport.width)}px`
          canvas.style.height = `${Math.floor(viewport.height)}px`

          ctx.save()
          ctx.scale(dpr, dpr)

          const renderContext = {
            canvasContext: ctx,
            viewport,
          }

          const renderTask = page.render(renderContext)
          renderTasksRef.current.set(pageNum, renderTask)

          await renderTask.promise
          ctx.restore()

          if (!isCancelled) {
            setPagesState((prev) =>
              prev.map((p) => (p.pageNumber === pageNum ? { ...p, rendered: true } : p))
            )
          }
        } catch (err: any) {
          if (err?.name !== 'RenderingCancelledException') {
            console.warn(`[PdfCanvasViewer] Error renderizando página ${pageNum}:`, err)
          }
        }
      }
    }

    renderAllPages()

    return () => {
      isCancelled = true
    }
  }, [numPages, containerWidth, url])

  return (
    <div className="pdf-canvas-container" ref={containerRef}>
      {loading && (
        <div className="attachment-loading-state">
          <span className="spinner" />
          <p>Preparando documento...</p>
        </div>
      )}

      {error && (
        <div className="attachment-error-state">
          <AppIcon name="file-text" size={32} color="#94a3b8" />
          <p>{error}</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-pdf-external"
            title="Abrir PDF en pestaña nueva"
          >
            <AppIcon name="external-link" size={16} />
            <span>Abrir PDF</span>
          </a>
        </div>
      )}

      {!loading && !error && numPages > 0 && (
        <div className="pdf-pages-scroll-wrapper">
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
            <div key={pageNum} className="pdf-page-card">
              <canvas
                ref={(el) => {
                  if (el) {
                    canvasRefs.current.set(pageNum, el)
                  } else {
                    canvasRefs.current.delete(pageNum)
                  }
                }}
                className="pdf-page-canvas"
              />
              {numPages > 1 && (
                <span className="pdf-page-number-pill">
                  Pág. {pageNum} / {numPages}
                </span>
              )}
            </div>
          ))}

          {/* Botón de acción secundario siempre disponible al pie */}
          <div className="attachment-pdf-footer-bar">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-pdf-external"
              title="Abrir PDF original en visor del sistema"
            >
              <AppIcon name="external-link" size={15} />
              <span>Abrir PDF</span>
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

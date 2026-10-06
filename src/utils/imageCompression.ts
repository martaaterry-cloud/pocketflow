/**
 * ==========================================================================
 * Utilidad de validación y compresión de justificantes para PocketFlow
 * ==========================================================================
 */

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const ALLOWED_PDF_MIME_TYPE = 'application/pdf' as const
export const ALL_ALLOWED_MIME_TYPES = [...ALLOWED_IMAGE_MIME_TYPES, ALLOWED_PDF_MIME_TYPE] as const

export const MAX_RAW_IMAGE_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB límite antes de compresión
export const MAX_PROCESSED_IMAGE_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB límite tras compresión
export const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB límite para PDF

export const TARGET_MAX_DIMENSION = 1920 // Lado mayor máximo en px
export const TARGET_QUALITY = 0.8 // Calidad JPEG/WebP (80%)

export interface ProcessedAttachmentResult {
  blob: Blob
  fileName: string
  mimeType: string
  fileSize: number
  isPdf: boolean
}

/**
 * Determina si el tipo MIME o la extensión del archivo es un PDF.
 */
export function isPdfFile(file: { type?: string; name?: string }): boolean {
  if (file.type === ALLOWED_PDF_MIME_TYPE) return true
  if (file.name && file.name.toLowerCase().endsWith('.pdf')) return true
  return false
}

/**
 * Normaliza el nombre de archivo eliminando caracteres peligrosos.
 */
export function sanitizeFileName(name: string): string {
  const clean = name.replace(/[^\w\s.-]/gi, '_').trim()
  return clean || 'justificante'
}

/**
 * Comprueba si el archivo es HEIC/HEIF por MIME o extensión.
 */
export function isHeicFile(file: { type?: string; name?: string }): boolean {
  const type = (file.type || '').toLowerCase()
  const name = (file.name || '').toLowerCase()
  return (
    type === 'image/heic' ||
    type === 'image/heif' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  )
}

/**
 * Valida y comprime una imagen o valida un PDF para su subida como justificante.
 */
export async function validateAndProcessAttachment(
  file: File
): Promise<ProcessedAttachmentResult> {
  const sanitizedName = sanitizeFileName(file.name)

  // 1. Verificación de PDF
  if (isPdfFile(file)) {
    if (file.size > MAX_PDF_SIZE_BYTES) {
      throw new Error(
        `El PDF supera el tamaño máximo permitido (${(MAX_PDF_SIZE_BYTES / (1024 * 1024)).toFixed(0)} MB).`
      )
    }
    return {
      blob: file,
      fileName: sanitizedName,
      mimeType: ALLOWED_PDF_MIME_TYPE,
      fileSize: file.size,
      isPdf: true,
    }
  }

  // 2. Detección de HEIC sin soporte nativo de decodificación
  if (isHeicFile(file)) {
    // Si no estamos en un entorno con soporte nativo para decodificar HEIC en canvas/Image,
    // intentamos cargarlo; si falla, se informa con mensaje claro.
    try {
      return await compressImageFile(file, sanitizedName)
    } catch {
      throw new Error(
        'Este formato de imagen (HEIC) no se puede procesar en este navegador. Usa JPG, PNG, WebP o PDF.'
      )
    }
  }

  // 3. Verificación de formatos de imagen permitidos
  const lowerType = (file.type || '').toLowerCase()
  const isAllowedImage =
    ALLOWED_IMAGE_MIME_TYPES.includes(lowerType as any) ||
    sanitizedName.toLowerCase().endsWith('.jpg') ||
    sanitizedName.toLowerCase().endsWith('.jpeg') ||
    sanitizedName.toLowerCase().endsWith('.png') ||
    sanitizedName.toLowerCase().endsWith('.webp')

  if (!isAllowedImage) {
    throw new Error(
      'Formato de archivo no permitido. Solo se admiten imágenes (JPG, PNG, WebP) y documentos PDF.'
    )
  }

  if (file.size > MAX_RAW_IMAGE_SIZE_BYTES) {
    throw new Error(
      `La imagen original supera el tamaño máximo admitido (${(MAX_RAW_IMAGE_SIZE_BYTES / (1024 * 1024)).toFixed(0)} MB).`
    )
  }

  return await compressImageFile(file, sanitizedName)
}

/**
 * Comprime una imagen redimensionándola a un máximo de 1920px en el lado mayor
 * con calidad 0.80 preservando la relación de aspecto.
 */
export async function compressImageFile(
  file: File | Blob,
  fileName: string,
  options?: {
    maxDimension?: number
    quality?: number
  }
): Promise<ProcessedAttachmentResult> {
  const maxDim = options?.maxDimension ?? TARGET_MAX_DIMENSION
  const quality = options?.quality ?? TARGET_QUALITY

  // Si estamos en un entorno sin DOM (ej. Node o test sin Canvas), fallback seguro
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      blob: file,
      fileName,
      mimeType: file.type || 'image/jpeg',
      fileSize: file.size,
      isPdf: false,
    }
  }

  const objectUrl = URL.createObjectURL(file)

  try {
    const img = await loadImageElement(objectUrl)
    let width = img.naturalWidth || img.width
    let height = img.naturalHeight || img.height

    if (width <= 0 || height <= 0) {
      throw new Error('No se pudieron leer las dimensiones de la imagen.')
    }

    // Calcular escala proporcional
    if (width > maxDim || height > maxDim) {
      if (width >= height) {
        height = Math.round((height * maxDim) / width)
        width = maxDim
      } else {
        width = Math.round((width * maxDim) / height)
        height = maxDim
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('No se pudo inicializar el contexto de renderizado de imagen.')
    }

    // Dibujar imagen escalada
    ctx.drawImage(img, 0, 0, width, height)

    // Determinar formato de salida (preferir image/jpeg para máxima compatibilidad y compresión de fotos)
    const outputMimeType = 'image/jpeg'

    const compressedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), outputMimeType, quality)
    })

    if (!compressedBlob) {
      throw new Error('Error al generar la imagen comprimida.')
    }

    if (compressedBlob.size > MAX_PROCESSED_IMAGE_SIZE_BYTES) {
      throw new Error(
        `La imagen comprimida supera el límite de ${(MAX_PROCESSED_IMAGE_SIZE_BYTES / (1024 * 1024)).toFixed(0)} MB.`
      )
    }

    // Ajustar extensión a .jpg si se convirtió a JPEG
    let outFileName = fileName
    if (!outFileName.toLowerCase().endsWith('.jpg') && !outFileName.toLowerCase().endsWith('.jpeg')) {
      const base = outFileName.replace(/\.[^/.]+$/, '')
      outFileName = `${base || 'ticket'}.jpg`
    }

    return {
      blob: compressedBlob,
      fileName: outFileName,
      mimeType: outputMimeType,
      fileSize: compressedBlob.size,
      isPdf: false,
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = (err) => reject(err)
    img.src = src
  })
}

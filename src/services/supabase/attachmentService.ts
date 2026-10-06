import type { AttachmentMetadata } from '../../models/finance'
import { getSupabase } from './supabaseClient'

export const RECEIPTS_BUCKET_NAME = 'receipts'
export const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 600 // 10 minutos

/**
 * Obtiene la extensión a partir del nombre o tipo MIME.
 */
function getExtensionFromMimeOrName(fileName: string, mimeType: string): string {
  if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
    return 'pdf'
  }
  if (mimeType === 'image/png' || fileName.toLowerCase().endsWith('.png')) {
    return 'png'
  }
  if (mimeType === 'image/webp' || fileName.toLowerCase().endsWith('.webp')) {
    return 'webp'
  }
  return 'jpg'
}

/**
 * Sube un archivo binario (imagen comprimida o PDF) a Supabase Storage en el bucket privado 'receipts'.
 * Ruta: <userId>/<year>/<attachmentId>.<extension>
 */
export async function uploadAttachment(
  blob: Blob,
  options: {
    userId: string
    fileName: string
    mimeType: string
    date?: string
    attachmentId?: string
    customClient?: any
  }
): Promise<AttachmentMetadata> {
  const { userId, fileName, mimeType, date, customClient } = options
  if (!userId || userId.trim() === '') {
    throw new Error('No se puede subir un justificante sin un ID de usuario válido.')
  }

  const supabase = customClient || getSupabase()
  const attachmentId = options.attachmentId || crypto.randomUUID()
  const year = date ? date.slice(0, 4) : new Date().getFullYear().toString()
  const ext = getExtensionFromMimeOrName(fileName, mimeType)
  const storagePath = `${userId}/${year}/${attachmentId}.${ext}`

  const { error } = await supabase.storage
    .from(RECEIPTS_BUCKET_NAME)
    .upload(storagePath, blob, {
      contentType: mimeType,
      upsert: false,
    })

  if (error) {
    console.error('[AttachmentService] Error subiendo archivo a Storage:', error)
    throw new Error(`Error al subir justificante: ${error.message}`)
  }

  const metadata: AttachmentMetadata = {
    id: attachmentId,
    fileName,
    mimeType,
    fileSize: blob.size,
    storagePath,
    createdAt: new Date().toISOString(),
  }

  return metadata
}

interface CachedSignedUrl {
  url: string
  expiresAt: number
}

const signedUrlCache = new Map<string, CachedSignedUrl>()

export function clearSignedUrlCache(): void {
  signedUrlCache.clear()
}

/**
 * Genera una URL firmada de corta duración (por defecto 10 min) para visualizar o descargar
 * de forma segura un justificante privado de Supabase Storage.
 * Utiliza una caché en memoria para evitar llamadas redundantes de red a Storage.
 */
export async function createSignedAttachmentUrl(
  storagePath: string,
  expiresInSeconds = DEFAULT_SIGNED_URL_EXPIRY_SECONDS,
  customClient?: any
): Promise<string | null> {
  if (!storagePath || storagePath.trim() === '') {
    return null
  }

  const now = Date.now()
  const cached = signedUrlCache.get(storagePath)
  if (cached && cached.expiresAt > now + 30_000) {
    return cached.url
  }

  try {
    const supabase = customClient || getSupabase()
    const { data, error } = await supabase.storage
      .from(RECEIPTS_BUCKET_NAME)
      .createSignedUrl(storagePath, expiresInSeconds)

    if (error || !data?.signedUrl) {
      console.warn('[AttachmentService] Error generando signed URL:', error)
      return null
    }

    signedUrlCache.set(storagePath, {
      url: data.signedUrl,
      expiresAt: now + expiresInSeconds * 1000,
    })

    return data.signedUrl
  } catch (err) {
    console.warn('[AttachmentService] Excepción al obtener signed URL:', err)
    return null
  }
}

/**
 * Elimina un archivo individual de Supabase Storage mediante su storagePath.
 */
export async function deleteAttachment(
  storagePath: string,
  customClient?: any
): Promise<boolean> {
  if (!storagePath || storagePath.trim() === '') {
    return false
  }

  signedUrlCache.delete(storagePath)

  try {
    const supabase = customClient || getSupabase()
    const { error } = await supabase.storage
      .from(RECEIPTS_BUCKET_NAME)
      .remove([storagePath])

    if (error) {
      console.error('[AttachmentService] Error eliminando archivo de Storage:', error)
      return false
    }

    return true
  } catch (err) {
    console.error('[AttachmentService] Excepción al eliminar archivo:', err)
    return false
  }
}

/**
 * Elimina en lote todos los archivos físicos en Storage asociados a un movimiento.
 * No bloquea si algún archivo falla, pero intenta la limpieza de todos los paths.
 */
export async function deleteAttachmentsForMovement(
  attachments?: AttachmentMetadata[],
  customClient?: any
): Promise<{ success: boolean; deletedCount: number }> {
  if (!attachments || attachments.length === 0) {
    return { success: true, deletedCount: 0 }
  }

  const paths = attachments
    .map((a) => a.storagePath)
    .filter((p): p is string => Boolean(p && p.trim().length > 0))

  if (paths.length === 0) {
    return { success: true, deletedCount: 0 }
  }

  try {
    const supabase = customClient || getSupabase()
    const { error } = await supabase.storage
      .from(RECEIPTS_BUCKET_NAME)
      .remove(paths)

    if (error) {
      console.warn('[AttachmentService] Aviso al limpiar adjuntos de movimiento:', error)
      return { success: false, deletedCount: 0 }
    }

    return { success: true, deletedCount: paths.length }
  } catch (err) {
    console.warn('[AttachmentService] Excepción al limpiar adjuntos de movimiento:', err)
    return { success: false, deletedCount: 0 }
  }
}

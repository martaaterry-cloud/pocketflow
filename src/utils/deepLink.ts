/**
 * Parser, validador y control de deduplicación para Deep Links de Atajos iOS en Pocketflow.
 * Esquema esperado: pocketflow://expense?amount=...&description=...&category=...
 */

export interface ParsedShortcutExpense {
  valid: true
  amount: number
  description: string
  categoryId: string
}

export interface InvalidShortcutExpense {
  valid: false
  error: string
}

export type ShortcutExpenseResult = ParsedShortcutExpense | InvalidShortcutExpense

/**
 * Categorías estándar y permitidas como fallback
 */
export const DEFAULT_FALLBACK_CATEGORY = 'other'

/**
 * Normaliza y decodifica un valor textual proveniente de query params.
 * Soporta espacios codificados como '%20' o '+', tildes, caracteres especiales y ñ.
 */
export function safeDecodeQueryParam(val: string | null | undefined): string {
  if (!val) return ''
  try {
    if (val.includes('%')) {
      return decodeURIComponent(val).trim()
    }
    return val.trim()
  } catch {
    return val.trim()
  }
}

/**
 * Parsea y valida estrictamente una URL de deep link.
 * Solo se permite la acción "expense" (gastos rápidos de V1).
 * Nunca permite transferencias, ingresos, borrado o modificación de saldos.
 */
export function parseShortcutUrl(
  rawUrl: string,
  validCategoryIds?: string[]
): ShortcutExpenseResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'URL vacía o no válida' }
  }

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { valid: false, error: 'URL malformada' }
  }

  // 1. Validar esquema
  if (parsed.protocol !== 'pocketflow:') {
    return { valid: false, error: `Protocolo no admitido: ${parsed.protocol}` }
  }

  // 2. Validar acción (solo "expense")
  // En URLs personalizadas como pocketflow://expense?...
  // parsed.hostname suele ser "expense" o parsed.pathname es "/expense"
  const host = parsed.hostname.toLowerCase()
  const path = parsed.pathname.toLowerCase().replace(/^\/+/, '')
  const action = host || path

  if (action !== 'expense') {
    return {
      valid: false,
      error: `Acción '${action}' no permitida. Solo se admiten gastos rápidos ('expense').`,
    }
  }

  // 3. Validar importe (amount)
  const rawAmount = parsed.searchParams.get('amount')
  if (!rawAmount || !rawAmount.trim()) {
    return { valid: false, error: 'Falta el parámetro obligatorio amount' }
  }

  // Normalizar coma decimal a punto
  const normalizedAmount = rawAmount.trim().replace(',', '.')
  const numAmount = Number(normalizedAmount)

  if (isNaN(numAmount) || !isFinite(numAmount)) {
    return { valid: false, error: 'El importe (amount) debe ser un número válido' }
  }

  if (numAmount <= 0) {
    return { valid: false, error: 'El importe (amount) debe ser mayor que 0' }
  }

  // Limitar a 2 decimales para coherencia financiera
  const sanitizedAmount = Math.round(numAmount * 100) / 100

  // 4. Validar y decodificar descripción
  const rawDescription = parsed.searchParams.get('description')
  const decodedDescription = safeDecodeQueryParam(rawDescription)
  // Fallback si viene vacío y cap de longitud de seguridad (120 caracteres)
  const description = decodedDescription
    ? decodedDescription.slice(0, 120)
    : 'Gasto rápido'

  // 5. Validar categoría
  const rawCategory = parsed.searchParams.get('category')
  const cleanCategory = safeDecodeQueryParam(rawCategory).toLowerCase()

  let finalCategory = DEFAULT_FALLBACK_CATEGORY
  if (cleanCategory) {
    if (validCategoryIds && validCategoryIds.length > 0) {
      if (validCategoryIds.includes(cleanCategory)) {
        finalCategory = cleanCategory
      } else {
        // Fallback documentado: si la categoría no existe en la app, asignar fallback seguro 'other'
        finalCategory = validCategoryIds.includes(DEFAULT_FALLBACK_CATEGORY)
          ? DEFAULT_FALLBACK_CATEGORY
          : validCategoryIds[0]
      }
    } else {
      finalCategory = cleanCategory
    }
  } else if (validCategoryIds && validCategoryIds.length > 0) {
    finalCategory = validCategoryIds.includes(DEFAULT_FALLBACK_CATEGORY)
      ? DEFAULT_FALLBACK_CATEGORY
      : validCategoryIds[0]
  }

  return {
    valid: true,
    amount: sanitizedAmount,
    description,
    categoryId: finalCategory,
  }
}

/**
 * Creador de deduplicador temporal ligero.
 * iOS puede disparar appUrlOpen más de una vez ante un único deep link en aperturas en frío o cambios de estado.
 */
export function createDeepLinkDeduplicator(windowMs = 2500) {
  let lastUrl = ''
  let lastTimestamp = 0

  return {
    /**
     * Devuelve true si la URL es nueva y debe procesarse.
     * Devuelve false si es un duplicado idéntico recibido dentro de la ventana de tiempo.
     */
    shouldProcess(url: string, now = Date.now()): boolean {
      if (url === lastUrl && now - lastTimestamp < windowMs) {
        return false
      }
      lastUrl = url
      lastTimestamp = now
      return true
    },
    reset() {
      lastUrl = ''
      lastTimestamp = 0
    },
  }
}

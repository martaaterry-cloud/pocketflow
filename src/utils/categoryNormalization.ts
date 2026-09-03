/**
 * Normalización centralizada de categorías y resolución de alias para Pocketflow.
 * Asegura que nombres/aliases históricos como 'Otros', 'Otras', 'other', 'others', 'misc'
 * resuelvan SIEMPRE a la categoría canónica 'other' (nombre visible "Otros").
 */

export const CANONICAL_OTHER_CATEGORY_ID = 'other'
export const CANONICAL_OTHER_CATEGORY_NAME = 'Otros'

export const CATEGORY_ALIAS_MAP: Record<string, string> = {
  // Alias de Otros / Genéricos
  other: 'other',
  others: 'other',
  otro: 'other',
  otros: 'other',
  otra: 'other',
  otras: 'other',
  misc: 'other',
  miscellaneous: 'other',
  miscelanea: 'other',
  miscelaneas: 'other',
  varios: 'other',
  varias: 'other',
  general: 'other',
  default: 'other',

  // Alias de Alimentación
  food: 'food',
  comida: 'food',
  alimentacion: 'food',
  supermercado: 'food',
  super: 'food',
  restaurante: 'food',
  restaurantes: 'food',
  cena: 'food',
  cenas: 'food',
  almuerzo: 'food',
  desayuno: 'food',

  // Alias de Ocio
  leisure: 'leisure',
  ocio: 'leisure',
  entretenimiento: 'leisure',
  fiesta: 'leisure',
  cine: 'leisure',
  eventos: 'leisure',
  salidas: 'leisure',
  bares: 'leisure',

  // Alias de Transporte
  transport: 'transport',
  transporte: 'transport',
  coche: 'transport',
  gasolina: 'transport',
  combustible: 'transport',
  diesel: 'transport',
  metro: 'transport',
  bus: 'transport',
  taxi: 'transport',
  uber: 'transport',
  cabify: 'transport',
  parking: 'transport',

  // Alias de Ropa
  clothes: 'clothes',
  ropa: 'clothes',
  vestimenta: 'clothes',
  calzado: 'clothes',
  zapatos: 'clothes',
  moda: 'clothes',

  // Alias de Suscripciones
  subscriptions: 'subscriptions',
  suscripciones: 'subscriptions',
  suscripcion: 'subscriptions',
  subscription: 'subscriptions',
  streaming: 'subscriptions',
  cuotas: 'subscriptions',

  // Alias de Deporte
  sport: 'sport',
  deporte: 'sport',
  gym: 'sport',
  gimnasio: 'sport',
  fitness: 'sport',

  // Alias de Viajes
  travel: 'travel',
  viajes: 'travel',
  viaje: 'travel',
  vuelo: 'travel',
  vuelos: 'travel',
  hotel: 'travel',
  hoteles: 'travel',
  vacaciones: 'travel',

  // Alias de Salud
  health: 'health',
  salud: 'health',
  farmacia: 'health',
  medico: 'health',
  hospital: 'health',
  dentista: 'health',

  // Alias de Casa
  house: 'house',
  home: 'house',
  casa: 'house',
  hogar: 'house',
  vivienda: 'house',
  alquiler: 'house',
  mantenimiento: 'house',
}

/**
 * Normaliza un string eliminando tildes, espacios en blanco y pasando a minúsculas.
 */
export function sanitizeCategoryKey(rawKey: string | undefined | null): string {
  if (!rawKey || typeof rawKey !== 'string') return ''
  return rawKey
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Resuelve cualquier identificador, nombre o alias recibido (desde UI, Deep Link o Atajo)
 * a un category_id canónico existente en el sistema.
 */
export function normalizeCategoryAlias(
  rawCategory: string | undefined | null,
  validCategoryIds?: string[]
): string {
  const clean = sanitizeCategoryKey(rawCategory)
  if (!clean) return CANONICAL_OTHER_CATEGORY_ID

  // 1. Si coincide directamente con un alias conocido
  if (CATEGORY_ALIAS_MAP[clean]) {
    const canonicalId = CATEGORY_ALIAS_MAP[clean]
    if (!validCategoryIds || validCategoryIds.length === 0 || validCategoryIds.includes(canonicalId)) {
      return canonicalId
    }
  }

  // 2. Si coincide con una categoría válida del usuario por ID o nombre sanitizado
  if (validCategoryIds && validCategoryIds.length > 0) {
    const directMatch = validCategoryIds.find(
      (id) => sanitizeCategoryKey(id) === clean || sanitizeCategoryKey(id).includes(clean)
    )
    if (directMatch) return directMatch

    return validCategoryIds.includes(CANONICAL_OTHER_CATEGORY_ID)
      ? CANONICAL_OTHER_CATEGORY_ID
      : validCategoryIds[0]
  }

  return clean || CANONICAL_OTHER_CATEGORY_ID
}

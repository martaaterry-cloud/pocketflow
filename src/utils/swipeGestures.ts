/**
 * Utilidades para detección y control de gestos swipe en vistas Home
 */

export type HomeModeIndex = 0 | 1 | 2

/**
 * Calcula el siguiente índice activo a partir de los desplazamientos deltaX y deltaY.
 * Reglas:
 * - Movimiento debe ser predominantemente horizontal: abs(deltaX) > abs(deltaY)
 * - Debe superar el umbral mínimo (threshold, por defecto 50px)
 * - deltaX < 0 (swipe hacia la izquierda) -> avanza a la siguiente vista (máx 2)
 * - deltaX > 0 (swipe hacia la derecha) -> retrocede a la vista anterior (mín 0)
 * - Si es vertical o no supera el umbral -> mantiene el índice actual sin cambios
 */
export function calculateSwipeNextIndex(
  currentIndex: HomeModeIndex,
  deltaX: number,
  deltaY: number,
  threshold: number = 50
): HomeModeIndex {
  // Swipe predominantemente vertical o diagonal: ignorar
  if (Math.abs(deltaX) <= Math.abs(deltaY)) {
    return currentIndex
  }

  // Swipe corto que no supera el umbral: ignorar
  if (Math.abs(deltaX) < threshold) {
    return currentIndex
  }

  // Swipe horizontal válido
  if (deltaX < 0) {
    // Izquierda -> siguiente
    return Math.min(2, currentIndex + 1) as HomeModeIndex
  } else {
    // Derecha -> anterior
    return Math.max(0, currentIndex - 1) as HomeModeIndex
  }
}

import type { FrequencyType, Transaction, VariableExpenseEstimate } from '../models/finance'

/**
 * Calcula el importe mensual estimado para un gasto variable según su frecuencia:
 * - per_week: coste_unitario * valor_frecuencia * 4.33 (semanas/mes promedio)
 * - per_month: coste_unitario * valor_frecuencia
 * Redondeado a 2 decimales.
 */
export function calculateMonthlyEstimate(
  unitCost: number,
  frequencyType: FrequencyType,
  frequencyValue: number
): number {
  if (unitCost <= 0 || frequencyValue <= 0) return 0

  let raw = 0
  if (frequencyType === 'per_week') {
    raw = unitCost * frequencyValue * 4.33
  } else {
    raw = unitCost * frequencyValue
  }

  return Math.round(raw * 100) / 100
}

/**
 * Normaliza un nombre o descripción para matching conservador exacto:
 * trim + lowercase sin alterar palabras intermedias.
 */
export function normalizeEstimateName(name: string): string {
  return (name || '').trim().toLowerCase()
}

/**
 * Calcula el gasto real efectuado este mes que coincide con la estimación:
 * - Tipo expense
 * - Misma categoría
 * - Misma fecha (mes en curso YYYY-MM)
 * - Matching conservador exacto normalizado por nombre
 */
export function calculateRealSpentForEstimate(
  estimate: VariableExpenseEstimate,
  transactions: Transaction[],
  monthKey?: string
): number {
  const currentMonth = monthKey || new Date().toISOString().slice(0, 7)
  const targetName = normalizeEstimateName(estimate.name)

  const matchedTotal = transactions
    .filter((t) => {
      if (t.type !== 'expense') return false
      if (t.categoryId !== estimate.categoryId) return false
      if (!t.date || !t.date.startsWith(currentMonth)) return false
      return normalizeEstimateName(t.description) === targetName
    })
    .reduce((sum, t) => sum + (t.amount || 0), 0)

  return Math.round(matchedTotal * 100) / 100
}

/**
 * Calcula el importe estimado pendiente en el mes:
 * pendiente = max(0, previsto - real)
 */
export function calculatePendingEstimate(
  monthlyEstimate: number,
  realSpent: number
): number {
  const diff = monthlyEstimate - realSpent
  return diff > 0 ? Math.round(diff * 100) / 100 : 0
}

export interface VariableEstimatesSummary {
  totalEstimatedMonthly: number
  totalRealSpentMonthly: number
  totalPendingEstimated: number
  activeCount: number
}

/**
 * Resumen agregado de todos los gastos variables activos del mes.
 */
export function calculateVariableEstimatesSummary(
  estimates: VariableExpenseEstimate[],
  transactions: Transaction[],
  monthKey?: string
): VariableEstimatesSummary {
  const activeEstimates = estimates.filter((e) => e.active)

  let totalEstimatedMonthly = 0
  let totalRealSpentMonthly = 0
  let totalPendingEstimated = 0

  for (const est of activeEstimates) {
    const monthly = calculateMonthlyEstimate(est.unitCost, est.frequencyType, est.frequencyValue)
    const real = calculateRealSpentForEstimate(est, transactions, monthKey)
    const pending = calculatePendingEstimate(monthly, real)

    totalEstimatedMonthly += monthly
    totalRealSpentMonthly += real
    totalPendingEstimated += pending
  }

  return {
    totalEstimatedMonthly: Math.round(totalEstimatedMonthly * 100) / 100,
    totalRealSpentMonthly: Math.round(totalRealSpentMonthly * 100) / 100,
    totalPendingEstimated: Math.round(totalPendingEstimated * 100) / 100,
    activeCount: activeEstimates.length,
  }
}

/**
 * Selector puro para calcular el total pendiente estimado de los gastos variables previstos:
 * sum(max(0, estimated_monthly - actual_month_spend_matching_estimate))
 * Considera únicamente estimaciones activas (active: true).
 */
export function selectPendingVariableExpenseEstimate(
  estimates: VariableExpenseEstimate[],
  transactions: Transaction[],
  monthKey?: string
): number {
  if (!estimates || !Array.isArray(estimates) || estimates.length === 0) {
    return 0
  }

  const activeEstimates = estimates.filter((e) => e.active)
  if (activeEstimates.length === 0) {
    return 0
  }

  const currentMonth = monthKey || new Date().toISOString().slice(0, 7)

  let totalPending = 0
  for (const est of activeEstimates) {
    const monthly = calculateMonthlyEstimate(est.unitCost, est.frequencyType, est.frequencyValue)
    const real = calculateRealSpentForEstimate(est, transactions, currentMonth)
    const pending = calculatePendingEstimate(monthly, real)
    totalPending += pending
  }

  return Math.round(totalPending * 100) / 100
}


import type { Account, Category, FinancialPlanSettings, Reserve, SavingsGoal, SpecialPeriod, Transaction } from '../models/finance'

/**
 * Ingresos mensuales configurados según los ajustes del usuario.
 */
export function selectMonthlyIncome(settings: FinancialPlanSettings): number {
  return Math.max(0, settings.monthlyIncome || 0)
}

/**
 * Calcula los gastos esenciales del mes de referencia basándose en las categorías marcadas como esenciales.
 */
export function selectEssentialMonthlyExpenses(
  categories: Category[],
  transactions: Transaction[],
  settings: FinancialPlanSettings,
  referenceDate: Date
): number {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()
  const essentialSet = new Set(settings.essentialCategoryIds || [])

  const monthTxs = transactions.filter((t) => {
    if (t.type !== 'expense') return false
    const d = new Date(t.date)
    return d.getFullYear() === year && d.getMonth() === month
  })

  const sum = monthTxs
    .filter((t) => t.categoryId && essentialSet.has(t.categoryId))
    .reduce((acc, t) => acc + t.amount, 0)

  return Math.round(sum * 100) / 100
}

/**
 * Calcula los gastos variables (no esenciales) del mes de referencia.
 */
export function selectVariableMonthlyExpenses(
  categories: Category[],
  transactions: Transaction[],
  settings: FinancialPlanSettings,
  referenceDate: Date
): number {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()
  const essentialSet = new Set(settings.essentialCategoryIds || [])

  const monthTxs = transactions.filter((t) => {
    if (t.type !== 'expense') return false
    const d = new Date(t.date)
    return d.getFullYear() === year && d.getMonth() === month
  })

  const sum = monthTxs
    .filter((t) => !t.categoryId || !essentialSet.has(t.categoryId))
    .reduce((acc, t) => acc + t.amount, 0)

  return Math.round(sum * 100) / 100
}

/**
 * Objetivo de ahorro mensual (por porcentaje de ingresos o cantidad fija).
 */
export function selectTargetMonthlySavings(settings: FinancialPlanSettings): number {
  if (settings.targetSavingsType === 'percentage') {
    const income = selectMonthlyIncome(settings)
    const pct = Math.max(0, settings.targetSavingsValue || 0)
    return Math.round(((income * pct) / 100) * 100) / 100
  }
  return Math.max(0, settings.targetSavingsValue || 0)
}

/**
 * Ahorro real transferido al ahorro en el mes de referencia (transferencias neta hacia la cuenta de ahorro).
 */
export function selectActualMonthlySavings(
  transactions: Transaction[],
  accounts: Account[],
  referenceDate: Date
): number {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()
  const savingsAccount = accounts.find((a) => a.type === 'savings')
  if (!savingsAccount) return 0

  const monthTransfers = transactions.filter((t) => {
    if (t.type !== 'transfer') return false
    const d = new Date(t.date)
    return d.getFullYear() === year && d.getMonth() === month
  })

  let net = 0
  for (const t of monthTransfers) {
    if (t.toAccountId === savingsAccount.id) {
      net += t.amount
    } else if (t.accountId === savingsAccount.id) {
      net -= t.amount
    }
  }

  return Math.round(net * 100) / 100
}

/**
 * Objetivo cuantitativo del fondo de emergencia en euros (por número de meses de gastos esenciales o importe fijo).
 */
export function selectEmergencyFundTarget(
  settings: FinancialPlanSettings,
  essentialMonthlyExpenses: number
): number {
  if (settings.emergencyFundTargetType === 'months') {
    const months = Math.max(0, settings.emergencyFundTargetValue || 0)
    return Math.round(months * essentialMonthlyExpenses * 100) / 100
  }
  return Math.max(0, settings.emergencyFundTargetValue || 0)
}

/**
 * Meses de gastos esenciales cubiertos por el fondo de emergencia actual.
 * Evita divisiones por cero y no arroja NaN ni Infinity.
 */
export function selectEmergencyFundMonthsCovered(
  currentEmergencyFund: number,
  essentialMonthlyExpenses: number
): number {
  if (essentialMonthlyExpenses <= 0 || currentEmergencyFund <= 0) return 0
  const covered = currentEmergencyFund / essentialMonthlyExpenses
  return Math.round(covered * 10) / 10
}

/**
 * Suma total asignada a objetivos de ahorro.
 */
export function selectTotalAllocatedToGoals(goals: SavingsGoal[]): number {
  const sum = goals.reduce((acc, g) => acc + (g.current || 0), 0)
  return Math.round(sum * 100) / 100
}

/**
 * Suma total asignada a reservas de gastos previstos.
 */
export function selectTotalAllocatedToReserves(reserves: Reserve[]): number {
  const sum = reserves
    .filter((r) => r.active)
    .reduce((acc, r) => acc + (r.currentAllocated || 0), 0)
  return Math.round(sum * 100) / 100
}

/**
 * Ahorro libre restante deduciendo fondo de emergencia, objetivos y reservas.
 * Invariante: savingsBalance = emergencyAllocated + goalsAllocated + reservesAllocated + freeSavings.
 */
export function selectFreeSavingsWithReserves(
  savingsBalance: number,
  emergencyAllocated: number,
  goalsAllocated: number,
  reservesAllocated: number
): number {
  const allocated = emergencyAllocated + goalsAllocated + reservesAllocated
  const free = savingsBalance - allocated
  return Math.max(0, Math.round(free * 100) / 100)
}

/**
 * Cuota mensual necesaria para completar una reserva antes de su fecha límite.
 * Si la reserva ya está cubierta, devuelve 0 €.
 * Si la fecha ha vencido, trata de forma segura devolviendo la cantidad pendiente restante.
 */
export function selectMonthlyReserveNeeded(reserve: Reserve, referenceDate: Date): number {
  if (!reserve.active) return 0
  const pending = Math.max(0, reserve.targetAmount - (reserve.currentAllocated || 0))
  if (pending <= 0) return 0

  const target = new Date(reserve.targetDate)
  if (isNaN(target.getTime())) return pending

  const refYear = referenceDate.getFullYear()
  const refMonth = referenceDate.getMonth()
  const targetYear = target.getFullYear()
  const targetMonth = target.getMonth()

  const monthsDiff = (targetYear - refYear) * 12 + (targetMonth - refMonth)

  // Si la fecha objetivo ya pasó o es el mes actual, se requiere todo el pendiente
  if (monthsDiff <= 0) {
    return Math.round(pending * 100) / 100
  }

  return Math.round((pending / monthsDiff) * 100) / 100
}

/**
 * Próximos periodos especiales ordenados cronológicamente por fecha de inicio.
 */
export function selectUpcomingSpecialPeriods(
  specialPeriods: SpecialPeriod[],
  referenceDate: Date
): SpecialPeriod[] {
  const refIso = referenceDate.toISOString().slice(0, 10)
  return [...specialPeriods]
    .filter((p) => p.endDate >= refIso)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
}

/**
 * Comprueba si un rango de fechas de periodo especial intersecta con un mes determinado.
 */
export function isMonthInSpecialPeriod(period: SpecialPeriod, year: number, monthIndex: number): boolean {
  const start = new Date(period.startDate)
  const end = new Date(period.endDate)

  // Primer y último día del mes evaluado
  const firstDayOfMonth = new Date(year, monthIndex, 1, 0, 0, 0)
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0, 23, 59, 59)

  return start <= lastDayOfMonth && end >= firstDayOfMonth
}

/**
 * Calcula el gasto extraordinario esperado para un mes específico según los periodos especiales activos.
 * Si un periodo cruza varios meses (ej. Navidad de 1 Dic a 6 Ene), distribuye proporcionalmente el extra.
 */
export function selectExpectedExtraSpendingForMonth(
  specialPeriods: SpecialPeriod[],
  targetMonthDate: Date
): number {
  const year = targetMonthDate.getFullYear()
  const month = targetMonthDate.getMonth()

  let totalExtra = 0
  for (const period of specialPeriods) {
    if (!period.expectedExtraBudget || period.expectedExtraBudget <= 0) continue
    if (isMonthInSpecialPeriod(period, year, month)) {
      const start = new Date(period.startDate)
      const end = new Date(period.endDate)
      const monthsSpan = Math.max(
        1,
        (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
      )
      totalExtra += period.expectedExtraBudget / monthsSpan
    }
  }

  return Math.round(totalExtra * 100) / 100
}

/**
 * Expectativa de gasto mensual ajustada con los gastos extraordinarios previstos.
 */
export function selectAdjustedMonthlySpendingExpectation(
  baseExpenses: number,
  specialPeriods: SpecialPeriod[],
  targetMonthDate: Date
): number {
  const extra = selectExpectedExtraSpendingForMonth(specialPeriods, targetMonthDate)
  return Math.round((baseExpenses + extra) * 100) / 100
}

export interface MonthlyForecastItem {
  monthKey: string // YYYY-MM
  monthName: string
  year: number
  monthIndex: number
  expectedIncome: number
  normalExpenses: number
  expectedExtraExpenses: number
  targetSavings: number
  expectedReserves: number
  estimatedMargin: number
  isHighSpend: boolean
}

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

/**
 * Previsión anual sencilla para los próximos 12 meses a partir de la fecha de referencia.
 */
export function selectAnnualForecast12Months(
  settings: FinancialPlanSettings,
  normalEstimatedExpenses: number,
  specialPeriods: SpecialPeriod[],
  reserves: Reserve[],
  referenceDate: Date
): MonthlyForecastItem[] {
  const items: MonthlyForecastItem[] = []
  const income = selectMonthlyIncome(settings)
  const targetSavings = selectTargetMonthlySavings(settings)

  for (let i = 0; i < 12; i++) {
    const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + i, 1)
    const y = d.getFullYear()
    const m = d.getMonth()
    const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`
    const monthName = MONTH_NAMES[m]

    const expectedExtra = selectExpectedExtraSpendingForMonth(specialPeriods, d)

    // Suma de reservas mensuales necesarias que expiren este mes o en el futuro
    let monthReserves = 0
    for (const r of reserves) {
      if (!r.active) continue
      const needed = selectMonthlyReserveNeeded(r, d)
      monthReserves += needed
    }
    monthReserves = Math.round(monthReserves * 100) / 100

    const totalOutflow = normalEstimatedExpenses + expectedExtra + targetSavings + monthReserves
    const estimatedMargin = Math.round((income - totalOutflow) * 100) / 100
    const isHighSpend = expectedExtra > 0

    items.push({
      monthKey,
      monthName,
      year: y,
      monthIndex: m,
      expectedIncome: income,
      normalExpenses: normalEstimatedExpenses,
      expectedExtraExpenses: expectedExtra,
      targetSavings,
      expectedReserves: monthReserves,
      estimatedMargin,
      isHighSpend,
    })
  }

  return items
}

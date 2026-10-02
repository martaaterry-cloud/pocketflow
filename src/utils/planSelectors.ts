import type {
  Account,
  Budget,
  CashTransaction,
  Category,
  ExpenseShare,
  FinancialPlanSettings,
  RecurringFrequency,
  RecurringPayment,
  Reserve,
  SavingsGoal,
  SpecialPeriod,
  Transaction,
  VariableExpenseEstimate,
} from '../models/finance'
import { selectLinkedReimbursementsForExpense, selectRealIncome } from './sharedExpenseSelectors'
import { calculateMonthlyEstimate } from './variableEstimates'

/**
 * Convierte cualquier frecuencia de pago recurrente a su equivalente mensual.
 * - 'monthly': importe directo.
 * - 'yearly': importe / 12.
 * - 'weekly': importe * 4.33 (promedio estándar de semanas al mes).
 */
export function selectMonthlyAmountForFrequency(
  amount: number,
  frequency: RecurringFrequency
): number {
  const num = Math.max(0, Number(amount) || 0)
  if (frequency === 'monthly') {
    return Math.round(num * 100) / 100
  }
  if (frequency === 'yearly') {
    return Math.round((num / 12) * 100) / 100
  }
  if (frequency === 'weekly') {
    return Math.round(num * 4.33 * 100) / 100
  }
  return Math.round(num * 100) / 100
}

/**
 * Suma mensualizada de todos los ingresos recurrentes activos (`type === 'income'`).
 */
export function selectExpectedMonthlyIncomeFromRecurring(
  recurring: RecurringPayment[] = []
): number {
  const activeIncomeRecs = recurring.filter(
    (r) => r.active !== false && (r.type === 'income' || r.categoryId === 'income')
  )

  const sum = activeIncomeRecs.reduce((acc, r) => {
    return acc + selectMonthlyAmountForFrequency(r.amount, r.frequency)
  }, 0)

  return Math.round(sum * 100) / 100
}

export interface ExpectedIncomeItemDetail {
  id: string
  name: string
  amount: number
  frequency: RecurringFrequency
  monthlyAmount: number
}

export interface ExpectedMonthlyIncomeDetail {
  amount: number
  source: 'real' | 'recurring' | 'mixed' | 'manual' | 'none'
  realAmount: number
  pendingRecurringAmount: number
  referenceAmount: number
  items: ExpectedIncomeItemDetail[]
  isManualFallback: boolean
  isUnconfigured: boolean
}

/**
 * Resuelve la fuente canónica de ingresos mensuales del plan:
 * 1) Ingresos reales cobrados en el mes (fuente de verdad).
 * 2) Previsión pendiente de ingresos recurrentes activos (no duplicando si ya entró el ingreso real).
 * 3) Referencia mensual opcional configurada manualmente.
 * 4) 0 si no hay ninguna de las anteriores (Plan opera con los datos disponibles sin inventar salarios).
 */
export function selectExpectedMonthlyIncomeDetail(
  settings: FinancialPlanSettings | null | undefined,
  recurring: RecurringPayment[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = [],
  referenceDate: Date = new Date()
): ExpectedMonthlyIncomeDetail {
  const refDate = referenceDate instanceof Date ? referenceDate : new Date()

  // 1. Ingresos reales cobrados este mes (Banco + Efectivo excluyendo reembolsos)
  const realAmount =
    (Array.isArray(transactions) && transactions.length > 0) ||
    (Array.isArray(cashTransactions) && cashTransactions.length > 0)
      ? selectRealIncome(transactions || [], refDate, 'month', cashTransactions || [])
      : 0

  // 2. Ingresos recurrentes activos
  const activeIncomeRecs = Array.isArray(recurring)
    ? recurring.filter((r) => r.active !== false && (r.type === 'income' || r.categoryId === 'income'))
    : []

  const items: ExpectedIncomeItemDetail[] = activeIncomeRecs.map((r) => ({
    id: r.id,
    name: r.name,
    amount: r.amount,
    frequency: r.frequency,
    monthlyAmount: selectMonthlyAmountForFrequency(r.amount, r.frequency),
  }))

  const recurringTotal = Math.round(items.reduce((acc, it) => acc + it.monthlyAmount, 0) * 100) / 100

  // 3. Previsión recurrente pendiente (no duplicar si ya entró el ingreso real)
  let pendingRecurringAmount = 0
  if (recurringTotal > 0) {
    if (realAmount >= recurringTotal) {
      pendingRecurringAmount = 0
    } else if (realAmount > 0) {
      pendingRecurringAmount = Math.max(0, Math.round((recurringTotal - realAmount) * 100) / 100)
    } else {
      pendingRecurringAmount = recurringTotal
    }
  }

  // 4. Referencia mensual opcional
  const referenceAmount = Math.max(0, Math.round((settings?.monthlyIncome || 0) * 100) / 100)

  // 5. Determinación de importe y fuente computable
  if (realAmount > 0 || pendingRecurringAmount > 0) {
    const total = Math.round((realAmount + pendingRecurringAmount) * 100) / 100
    const source =
      realAmount > 0 && pendingRecurringAmount > 0 ? 'mixed' : realAmount > 0 ? 'real' : 'recurring'
    return {
      amount: total,
      source,
      realAmount,
      pendingRecurringAmount,
      referenceAmount,
      items,
      isManualFallback: false,
      isUnconfigured: false,
    }
  }

  if (referenceAmount > 0) {
    return {
      amount: referenceAmount,
      source: 'manual',
      realAmount: 0,
      pendingRecurringAmount: 0,
      referenceAmount,
      items: [],
      isManualFallback: true,
      isUnconfigured: false,
    }
  }

  return {
    amount: 0,
    source: 'none',
    realAmount: 0,
    pendingRecurringAmount: 0,
    referenceAmount: 0,
    items: [],
    isManualFallback: false,
    isUnconfigured: true,
  }
}

/**
 * Ingresos mensuales previstos unificados (fuente canónica).
 */
export function selectExpectedMonthlyIncome(
  settings: FinancialPlanSettings | null | undefined,
  recurring: RecurringPayment[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = [],
  referenceDate: Date = new Date()
): number {
  return selectExpectedMonthlyIncomeDetail(settings, recurring, transactions, cashTransactions, referenceDate).amount
}

/**
 * Ingresos mensuales configurados manualmente en los ajustes.
 * @deprecated Preferir `selectExpectedMonthlyIncome(settings, recurring)`.
 */
export function selectMonthlyIncome(settings: FinancialPlanSettings | null | undefined): number {
  return Math.max(0, settings?.monthlyIncome || 0)
}

/**
 * Gasto comprometido / fijo previsto = suma mensualizada de gastos recurrentes activos.
 */
export function selectExpectedCommittedExpenses(recurring: RecurringPayment[] = []): number {
  const activeExpenseRecs = Array.isArray(recurring)
    ? recurring.filter((r) => r.active !== false && r.type !== 'income' && r.categoryId !== 'income')
    : []

  const sum = activeExpenseRecs.reduce((acc, r) => {
    return acc + selectMonthlyAmountForFrequency(r.amount, r.frequency)
  }, 0)

  return Math.round(sum * 100) / 100
}

/**
 * Gasto fijo real neto del mes = transacciones con `expenseNature === 'fixed'`
 * menos los reembolsos vinculados aplicables.
 */
export function selectActualFixedMonthlyExpenses(
  transactions: Transaction[],
  referenceDate: Date = new Date(),
  cashTransactions: CashTransaction[] = [],
  expenseShares: ExpenseShare[] = []
): number {
  if (!Array.isArray(transactions)) return 0
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()

  const fixedTxs = transactions.filter((t) => {
    if (t.type !== 'expense' || (t.isShared && t.paidBy === 'contact') || t.expenseNature !== 'fixed') return false
    const d = new Date(t.date)
    return d.getFullYear() === year && d.getMonth() === month
  })

  let sum = 0
  fixedTxs.forEach((t) => {
    const linked = selectLinkedReimbursementsForExpense(t.id, transactions, cashTransactions, expenseShares)
    sum += Math.max(0, t.amount - linked)
  })

  return Math.round(sum * 100) / 100
}

/**
 * Gasto variable previsto mensual = estimaciones variables activas o presupuestos.
 * Si no hay estimaciones ni presupuestos configurados, devuelve null ("Sin previsión").
 */
export function selectExpectedVariableMonthlyExpenses(
  estimates: VariableExpenseEstimate[] = [],
  budgets: Budget[] = []
): number | null {
  const activeEstimates = Array.isArray(estimates) ? estimates.filter((e) => e.active !== false) : []
  if (activeEstimates.length > 0) {
    const sum = activeEstimates.reduce((acc, e) => {
      return acc + calculateMonthlyEstimate(e.unitCost, e.frequencyType, e.frequencyValue)
    }, 0)
    return Math.round(sum * 100) / 100
  }

  if (Array.isArray(budgets) && budgets.length > 0) {
    const sum = budgets.reduce((acc, b) => acc + (b.amountLimit || 0), 0)
    return Math.round(sum * 100) / 100
  }

  return null
}

/**
 * Gasto variable real neto del mes = transacciones con `expenseNature === 'variable'`
 * o sin clasificar (`!t.expenseNature`), restando reembolsos vinculados.
 */
export function selectActualVariableMonthlyExpenses(
  transactions: Transaction[],
  referenceDate: Date = new Date(),
  cashTransactions: CashTransaction[] = [],
  expenseShares: ExpenseShare[] = []
): number {
  if (!Array.isArray(transactions)) return 0
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()

  const varTxs = transactions.filter((t) => {
    if (t.type !== 'expense' || (t.isShared && t.paidBy === 'contact')) return false
    if (t.expenseNature === 'fixed' || t.expenseNature === 'extraordinary') return false
    const d = new Date(t.date)
    return d.getFullYear() === year && d.getMonth() === month
  })

  let sum = 0
  varTxs.forEach((t) => {
    const linked = selectLinkedReimbursementsForExpense(t.id, transactions, cashTransactions, expenseShares)
    sum += Math.max(0, t.amount - linked)
  })

  return Math.round(sum * 100) / 100
}

/**
 * Gasto extraordinario real neto del mes = transacciones con `expenseNature === 'extraordinary'`,
 * restando reembolsos vinculados.
 */
export function selectActualExtraordinaryMonthlyExpenses(
  transactions: Transaction[],
  referenceDate: Date = new Date(),
  cashTransactions: CashTransaction[] = [],
  expenseShares: ExpenseShare[] = []
): number {
  if (!Array.isArray(transactions)) return 0
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()

  const extraTxs = transactions.filter((t) => {
    if (t.type !== 'expense' || (t.isShared && t.paidBy === 'contact') || t.expenseNature !== 'extraordinary') return false
    const d = new Date(t.date)
    return d.getFullYear() === year && d.getMonth() === month
  })

  let sum = 0
  extraTxs.forEach((t) => {
    const linked = selectLinkedReimbursementsForExpense(t.id, transactions, cashTransactions, expenseShares)
    sum += Math.max(0, t.amount - linked)
  })

  return Math.round(sum * 100) / 100
}

/**
 * Calcula los gastos esenciales del mes de referencia basándose en las categorías marcadas como esenciales.
 * @deprecated Legacy (Fase 1/2). En Fase 3 el cálculo principal usa `selectExpectedCommittedExpenses`
 * y `selectActualFixedMonthlyExpenses`. Se mantiene por retrocompatibilidad.
 */
export function selectEssentialMonthlyExpenses(
  categories: Category[],
  transactions: Transaction[],
  settings: FinancialPlanSettings,
  referenceDate: Date
): number {
  if (!Array.isArray(transactions)) return 0
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()
  const essentialSet = new Set(settings?.essentialCategoryIds || [])

  const monthTxs = transactions.filter((t) => {
    if (t.type !== 'expense' || (t.isShared && t.paidBy === 'contact')) return false
    const d = new Date(t.date)
    return d.getFullYear() === year && d.getMonth() === month
  })

  let sum = 0
  monthTxs
    .filter((t) => t.categoryId && essentialSet.has(t.categoryId))
    .forEach((t) => {
      const linked = selectLinkedReimbursementsForExpense(t.id, transactions)
      sum += Math.max(0, t.amount - linked)
    })

  return Math.round(sum * 100) / 100
}

/**
 * Calcula los gastos variables (no esenciales) del mes de referencia.
 * @deprecated Legacy. Preferir `selectActualVariableMonthlyExpenses`.
 */
export function selectVariableMonthlyExpenses(
  categories: Category[],
  transactions: Transaction[],
  settings: FinancialPlanSettings,
  referenceDate: Date
): number {
  if (!Array.isArray(transactions)) return 0
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth()
  const essentialSet = new Set(settings?.essentialCategoryIds || [])

  const monthTxs = transactions.filter((t) => {
    if (t.type !== 'expense' || (t.isShared && t.paidBy === 'contact')) return false
    const d = new Date(t.date)
    return d.getFullYear() === year && d.getMonth() === month
  })

  let sum = 0
  monthTxs
    .filter((t) => !t.categoryId || !essentialSet.has(t.categoryId))
    .forEach((t) => {
      const linked = selectLinkedReimbursementsForExpense(t.id, transactions)
      sum += Math.max(0, t.amount - linked)
    })

  return Math.round(sum * 100) / 100
}

/**
 * Objetivo de ahorro mensual (por porcentaje de ingresos o cantidad fija).
 */
export function selectTargetMonthlySavings(
  settings: FinancialPlanSettings | null | undefined,
  expectedIncome?: number
): number {
  if (!settings) return 0
  if (settings.targetSavingsType === 'percentage') {
    const income = expectedIncome !== undefined ? expectedIncome : selectMonthlyIncome(settings)
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
  if (!Array.isArray(transactions) || !Array.isArray(accounts)) return 0
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
 * Objetivo cuantitativo del fondo de emergencia en euros (por número de meses de gastos o importe fijo).
 */
export function selectEmergencyFundTarget(
  settings: FinancialPlanSettings | null | undefined,
  baseMonthlyExpenses: number
): number {
  if (!settings) return 0
  if (settings.emergencyFundTargetType === 'months') {
    const months = Math.max(0, settings.emergencyFundTargetValue || 0)
    return Math.round(months * baseMonthlyExpenses * 100) / 100
  }
  return Math.max(0, settings.emergencyFundTargetValue || 0)
}

/**
 * Meses de gastos cubiertos por el fondo de emergencia actual.
 * Evita divisiones por cero y no arroja NaN ni Infinity.
 */
export function selectEmergencyFundMonthsCovered(
  currentEmergencyFund: number,
  baseMonthlyExpenses: number
): number {
  if (baseMonthlyExpenses <= 0 || currentEmergencyFund <= 0) return 0
  const covered = currentEmergencyFund / baseMonthlyExpenses
  return Math.round(covered * 10) / 10
}

/**
 * Suma total asignada a objetivos de ahorro.
 */
export function selectTotalAllocatedToGoals(goals: SavingsGoal[]): number {
  if (!Array.isArray(goals)) return 0
  const sum = goals.reduce((acc, g) => acc + (g.current || 0), 0)
  return Math.round(sum * 100) / 100
}

/**
 * Suma total asignada a reservas de gastos previstos.
 */
export function selectTotalAllocatedToReserves(reserves: Reserve[]): number {
  if (!Array.isArray(reserves)) return 0
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
 */
export function selectMonthlyReserveNeeded(reserve: Reserve, referenceDate: Date): number {
  if (!reserve?.active) return 0
  const pending = Math.max(0, reserve.targetAmount - (reserve.currentAllocated || 0))
  if (pending <= 0) return 0

  const target = new Date(reserve.targetDate)
  if (isNaN(target.getTime())) return pending

  const refYear = referenceDate.getFullYear()
  const refMonth = referenceDate.getMonth()
  const targetYear = target.getFullYear()
  const targetMonth = target.getMonth()

  const monthsDiff = (targetYear - refYear) * 12 + (targetMonth - refMonth)

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
  if (!Array.isArray(specialPeriods)) return []
  const refIso = referenceDate.toISOString().slice(0, 10)
  return [...specialPeriods]
    .filter((p) => p.endDate >= refIso)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
}

/**
 * Comprueba si un rango de fechas de periodo especial intersecta con un mes determinado.
 */
export function isMonthInSpecialPeriod(period: SpecialPeriod, year: number, monthIndex: number): boolean {
  if (!period?.startDate || !period?.endDate) return false
  const start = new Date(period.startDate)
  const end = new Date(period.endDate)

  const firstDayOfMonth = new Date(year, monthIndex, 1, 0, 0, 0)
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0, 23, 59, 59)

  return start <= lastDayOfMonth && end >= firstDayOfMonth
}

/**
 * Calcula el gasto extraordinario esperado para un mes específico según los periodos especiales activos.
 */
export function selectExpectedExtraSpendingForMonth(
  specialPeriods: SpecialPeriod[],
  targetMonthDate: Date
): number {
  if (!Array.isArray(specialPeriods)) return 0
  const year = targetMonthDate.getFullYear()
  const month = targetMonthDate.getMonth()

  let totalExtra = 0
  for (const period of specialPeriods) {
    if (
      period.expectedExtraBudget === undefined ||
      period.expectedExtraBudget === null ||
      period.expectedExtraBudget <= 0
    ) {
      continue
    }
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
  specialPeriodsInMonth?: SpecialPeriod[]
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
  settings: FinancialPlanSettings | null | undefined,
  recurringOrExpenses: RecurringPayment[] | number,
  normalEstimatedExpensesOrPeriods: number | SpecialPeriod[],
  specialPeriodsOrReserves: SpecialPeriod[] | Reserve[],
  reservesOrRefDate?: Reserve[] | Date,
  referenceDateInput?: Date
): MonthlyForecastItem[] {
  let income = 0
  let normalEstimatedExpenses = 0
  let specialPeriods: SpecialPeriod[] = []
  let reserves: Reserve[] = []
  let refDate = new Date()

  if (typeof recurringOrExpenses === 'number') {
    // Legacy positional call: (settings, normalEstimatedExpenses, specialPeriods, reserves, referenceDate)
    income = selectMonthlyIncome(settings)
    normalEstimatedExpenses = recurringOrExpenses
    specialPeriods = Array.isArray(normalEstimatedExpensesOrPeriods) ? normalEstimatedExpensesOrPeriods : []
    reserves = Array.isArray(specialPeriodsOrReserves) ? (specialPeriodsOrReserves as Reserve[]) : []
    refDate = reservesOrRefDate instanceof Date ? reservesOrRefDate : new Date()
  } else {
    // Canonical Phase 3 call: (settings, recurring, normalEstimatedExpenses, specialPeriods, reserves, referenceDate)
    const recurring = Array.isArray(recurringOrExpenses) ? recurringOrExpenses : []
    income = selectExpectedMonthlyIncome(settings, recurring)
    normalEstimatedExpenses = typeof normalEstimatedExpensesOrPeriods === 'number' ? normalEstimatedExpensesOrPeriods : 0
    specialPeriods = Array.isArray(specialPeriodsOrReserves) ? (specialPeriodsOrReserves as SpecialPeriod[]) : []
    reserves = Array.isArray(reservesOrRefDate) ? reservesOrRefDate : []
    refDate = referenceDateInput instanceof Date ? referenceDateInput : new Date()
  }

  const items: MonthlyForecastItem[] = []
  const targetSavings = selectTargetMonthlySavings(settings, income)

  for (let i = 0; i < 12; i++) {
    const d = new Date(refDate.getFullYear(), refDate.getMonth() + i, 1)
    const y = d.getFullYear()
    const m = d.getMonth()
    const monthKey = `${y}-${String(m + 1).padStart(2, '0')}`
    const monthName = MONTH_NAMES[m]

    const expectedExtra = selectExpectedExtraSpendingForMonth(specialPeriods, d)
    const monthPeriods = specialPeriods.filter((p) => isMonthInSpecialPeriod(p, y, m))

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
      specialPeriodsInMonth: monthPeriods,
    })
  }

  return items
}

export interface MonthlyPlanCardSummary {
  hasConfiguredPlan: boolean
  incomeSource: 'real' | 'recurring' | 'mixed' | 'manual' | 'none'
  monthlyIncome: number
  targetSavings: number
  expectedCommittedExpenses: number
  actualFixedExpenses: number
  expectedVariableExpenses: number | null
  actualVariableExpenses: number
  actualExtraordinaryExpenses: number
  expectedExtraExpenses: number
  reservesNeeded: number
  freeToSpend: number
  plannedMargin: number
  // Campos de compatibilidad
  essentialExpenses: number
  variableExpenses: number
}

/**
 * Selector canónico para la tarjeta compacta "Plan del mes" en Inicio y resumen del Plan.
 * Admite tanto la llamada canónica de Fase 3 como la llamada posicional heredada (Fase 1/2) para retrocompatibilidad total.
 */
export function selectMonthlyPlanCardSummary(
  settings: FinancialPlanSettings | null | undefined,
  recurringOrEssential: RecurringPayment[] | number = [],
  transactionsOrVariable: Transaction[] | number = [],
  specialPeriods: SpecialPeriod[] = [],
  reserves: Reserve[] = [],
  estimatesOrRefDate?: VariableExpenseEstimate[] | Date,
  budgets?: Budget[],
  pendingCommittedExpenses = 0,
  referenceDate: Date = new Date(),
  cashTransactions: CashTransaction[] = []
): MonthlyPlanCardSummary {
  // Manejo de compatibilidad para llamadas heredadas donde el 2º argumento es un número
  if (typeof recurringOrEssential === 'number') {
    const essentialExpenses = recurringOrEssential
    const variableExpenses = typeof transactionsOrVariable === 'number' ? transactionsOrVariable : 0
    const refDate = estimatesOrRefDate instanceof Date ? estimatesOrRefDate : new Date()

    const monthlyIncome = selectMonthlyIncome(settings)
    const hasConfiguredPlan = monthlyIncome > 0
    if (!hasConfiguredPlan) {
      return {
        hasConfiguredPlan: false,
        incomeSource: 'none',
        monthlyIncome: 0,
        targetSavings: 0,
        expectedCommittedExpenses: essentialExpenses,
        actualFixedExpenses: essentialExpenses,
        expectedVariableExpenses: variableExpenses,
        actualVariableExpenses: variableExpenses,
        actualExtraordinaryExpenses: 0,
        expectedExtraExpenses: 0,
        reservesNeeded: 0,
        freeToSpend: 0,
        plannedMargin: 0,
        essentialExpenses,
        variableExpenses,
      }
    }

    const targetSavings = selectTargetMonthlySavings(settings, monthlyIncome)
    const expectedExtraExpenses = selectExpectedExtraSpendingForMonth(specialPeriods, refDate)
    let reservesNeeded = 0
    if (Array.isArray(reserves)) {
      for (const r of reserves) {
        if (!r.active) continue
        reservesNeeded += selectMonthlyReserveNeeded(r, refDate)
      }
    }
    reservesNeeded = Math.round(reservesNeeded * 100) / 100

    const totalCommittedAndPlanned =
      essentialExpenses + variableExpenses + targetSavings + expectedExtraExpenses + reservesNeeded
    const freeToSpend = Math.round((monthlyIncome - totalCommittedAndPlanned) * 100) / 100

    return {
      hasConfiguredPlan: true,
      incomeSource: 'manual',
      monthlyIncome,
      targetSavings,
      expectedCommittedExpenses: essentialExpenses,
      actualFixedExpenses: essentialExpenses,
      expectedVariableExpenses: variableExpenses,
      actualVariableExpenses: variableExpenses,
      actualExtraordinaryExpenses: 0,
      expectedExtraExpenses,
      reservesNeeded,
      freeToSpend,
      plannedMargin: freeToSpend,
      essentialExpenses,
      variableExpenses,
    }
  }

  // Ejecución canónica Fase 3
  const recurring = Array.isArray(recurringOrEssential) ? recurringOrEssential : []
  const transactions = Array.isArray(transactionsOrVariable) ? transactionsOrVariable : []
  const estimates = Array.isArray(estimatesOrRefDate) ? estimatesOrRefDate : []
  const refDate = referenceDate instanceof Date ? referenceDate : new Date()

  const incomeDetail = selectExpectedMonthlyIncomeDetail(settings, recurring, transactions, cashTransactions, refDate)
  const monthlyIncome = incomeDetail.amount
  const hasConfiguredPlan = monthlyIncome > 0

  const expectedCommittedExpenses = selectExpectedCommittedExpenses(recurring)
  const actualFixedExpenses = selectActualFixedMonthlyExpenses(transactions, refDate)
  const expectedVariableExpenses = selectExpectedVariableMonthlyExpenses(estimates, budgets)
  const actualVariableExpenses = selectActualVariableMonthlyExpenses(transactions, refDate)
  const actualExtraordinaryExpenses = selectActualExtraordinaryMonthlyExpenses(transactions, refDate)

  if (!hasConfiguredPlan) {
    return {
      hasConfiguredPlan: false,
      incomeSource: 'none',
      monthlyIncome: 0,
      targetSavings: 0,
      expectedCommittedExpenses,
      actualFixedExpenses,
      expectedVariableExpenses,
      actualVariableExpenses,
      actualExtraordinaryExpenses,
      expectedExtraExpenses: 0,
      reservesNeeded: 0,
      freeToSpend: 0,
      plannedMargin: 0,
      essentialExpenses: expectedCommittedExpenses,
      variableExpenses: actualVariableExpenses,
    }
  }

  const targetSavings = selectTargetMonthlySavings(settings, monthlyIncome)
  const expectedExtraExpenses = selectExpectedExtraSpendingForMonth(specialPeriods, refDate)

  let reservesNeeded = 0
  if (Array.isArray(reserves)) {
    for (const r of reserves) {
      if (!r.active) continue
      reservesNeeded += selectMonthlyReserveNeeded(r, refDate)
    }
  }
  reservesNeeded = Math.round(reservesNeeded * 100) / 100

  // 1. Margen mensual previsto = Ingresos - Comprometido - Variable previsto - Extras futuros - Reservas - Ahorro objetivo
  const variableToDeductInPlan = expectedVariableExpenses !== null ? expectedVariableExpenses : 0
  const plannedOutflow =
    expectedCommittedExpenses + variableToDeductInPlan + expectedExtraExpenses + reservesNeeded + targetSavings
  const plannedMargin = Math.round((monthlyIncome - plannedOutflow) * 100) / 100

  // 2. Margen restante actual ("Libre para gastar") =
  //    Ingresos previstos - Ahorro objetivo - Comprometido pendiente - Gasto fijo realizado - Variable realizado - Extraordinario realizado - Extras futuros - Reservas
  const currentCommittedOutflow = Math.max(expectedCommittedExpenses, actualFixedExpenses + pendingCommittedExpenses)
  const currentActualOutflow =
    targetSavings +
    currentCommittedOutflow +
    actualVariableExpenses +
    actualExtraordinaryExpenses +
    expectedExtraExpenses +
    reservesNeeded

  const freeToSpend = Math.round((monthlyIncome - currentActualOutflow) * 100) / 100

  return {
    hasConfiguredPlan: true,
    incomeSource: incomeDetail.source,
    monthlyIncome,
    targetSavings,
    expectedCommittedExpenses,
    actualFixedExpenses,
    expectedVariableExpenses,
    actualVariableExpenses,
    actualExtraordinaryExpenses,
    expectedExtraExpenses,
    reservesNeeded,
    freeToSpend,
    plannedMargin,
    essentialExpenses: expectedCommittedExpenses,
    variableExpenses: actualVariableExpenses,
  }
}

/**
 * Valida las fechas de inicio y fin de un periodo especial.
 * - Formato de fechas en YYYY-MM-DD.
 * - La fecha final no puede ser anterior a la fecha inicial.
 * - Permite periodos de 1 día (startDate === endDate).
 * - Permite periodos que crucen de año (ej. 2026-12-15 a 2027-01-10).
 */
export function validateSpecialPeriodDates(
  startDate: string,
  endDate: string
): { valid: boolean; error?: string } {
  if (!startDate || !endDate) {
    return { valid: false, error: 'Debes indicar las fechas de inicio y fin.' }
  }

  if (endDate < startDate) {
    return { valid: false, error: 'La fecha final debe ser posterior a la fecha inicial.' }
  }

  return { valid: true }
}

/**
 * Genera los valores iniciales para crear una reserva a partir de un periodo especial de forma opcional.
 * - Nombre: mismo nombre del periodo especial.
 * - Fecha objetivo: startDate del periodo especial.
 * - Importe objetivo: si expectedExtraBudget > 0 se sugiere ese importe; si no tiene estimación (o es <= 0), se deja undefined.
 */
export function buildReserveInitialValuesFromSpecialPeriod(
  period: Pick<SpecialPeriod, 'name' | 'startDate'> & { id?: string; expectedExtraBudget?: number | null }
): {
  name: string
  targetDate: string
  targetAmount?: number
  iconKey: string
  specialPeriodId?: string
} {
  return {
    name: period.name,
    targetDate: period.startDate,
    targetAmount:
      typeof period.expectedExtraBudget === 'number' && period.expectedExtraBudget > 0
        ? period.expectedExtraBudget
        : undefined,
    iconKey: 'sparkles',
    specialPeriodId: period.id,
  }
}

/* ==========================================================================
   Control del Mes (Cerebro del Plan Financiero)
   ========================================================================== */

export type MonthlySpendingControlStatus = 'comfortable' | 'on_track' | 'tight' | 'over'

export interface ReserveMonthlyNeedItem {
  id: string
  name: string
  neededThisMonth: number
  targetAmount: number
  currentAllocated: number
  targetDate: string
}

export interface MonthlySpendingControl {
  hasConfiguredIncome: boolean
  incomeExpected: number
  incomeReal: number
  incomePending: number
  incomeReference: number
  incomeSource: 'real' | 'recurring' | 'mixed' | 'manual' | 'none'
  incomeItemCount: number

  // 1. Necesario / Comprometido
  necessaryExpected: number
  necessaryPaid: number
  necessaryPending: number

  // 2. Planificado / Gastos futuros
  plannedForMonth: number
  plannedReserves: number
  plannedSpecialPeriods: number
  reservesBreakdown: ReserveMonthlyNeedItem[]

  // 3. Ahorro
  targetSavings: number

  // 4. Libre / Controlable
  discretionaryTotalBudget: number
  discretionarySpent: number
  discretionaryAvailable: number

  // Días y ritmo
  daysElapsed: number
  daysRemaining: number
  totalDaysInMonth: number
  recommendedDailyAvailable: number | null

  // Estado y asesor sobrio
  status: MonthlySpendingControlStatus
  statusMessage: string
  detailedExplanation: string

  // Contexto especial
  specialContext: {
    hasSpecialPeriod: boolean
    isHighSpendMonth: boolean
    isLowSpendMonth: boolean
    specialPeriodNames: string[]
    extraBudgetPlanned: number
    note?: string
  }
}

/**
 * Selector canónico de Control de Gasto del Mes.
 * Unifica:
 * - Ingresos reales cobrados y previstos pendientes (o referencia manual opcional)
 * - Necesario / comprometido (fijos, recurrentes, estimaciones variables esenciales y gastos esenciales)
 * - Planificado para gastos futuros (cuota mensual de reservas y estacionalidad de periodos especiales)
 * - Objetivo de ahorro
 * - Margen real para gasto libre (discrecional), consumo actual y recomendación diaria sobria.
 */
export function selectMonthlySpendingControl(
  settings: FinancialPlanSettings | null | undefined,
  recurring: RecurringPayment[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = [],
  expenseShares: ExpenseShare[] = [],
  specialPeriods: SpecialPeriod[] = [],
  reserves: Reserve[] = [],
  estimates: VariableExpenseEstimate[] = [],
  budgets: Budget[] = [],
  referenceDate: Date = new Date()
): MonthlySpendingControl {
  const refDate = referenceDate instanceof Date ? referenceDate : new Date()
  const year = refDate.getFullYear()
  const month = refDate.getMonth()

  // 1. Días del mes
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate()
  const daysElapsed = Math.min(totalDaysInMonth, Math.max(1, refDate.getDate()))
  const daysRemaining = Math.max(0, totalDaysInMonth - daysElapsed)

  // 2. Ingresos calculados del mes
  const incomeDetail = selectExpectedMonthlyIncomeDetail(settings, recurring, transactions, cashTransactions, refDate)
  const incomeExpected = incomeDetail.amount
  const incomeReal = incomeDetail.realAmount
  const incomePending = incomeDetail.pendingRecurringAmount
  const incomeReference = incomeDetail.referenceAmount
  const hasConfiguredIncome = incomeExpected > 0

  // 3. Clasificación de gastos reales del mes (Banco + Efectivo con deducción de reembolsos)
  const essentialSet = new Set(settings?.essentialCategoryIds || [])

  let necessaryPaid = 0
  let discretionarySpent = 0
  let recurringPaidNet = 0
  let essentialVariablePaid = 0

  const isSameMonth = (dStr: string): boolean => {
    if (!dStr) return false
    const d = new Date(dStr)
    return !isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month
  }

  // Banco
  if (Array.isArray(transactions)) {
    for (const t of transactions) {
      if (t.type !== 'expense') continue
      if (!isSameMonth(t.date)) continue
      // Si fue pagado por un contacto, no es gasto directo del usuario
      if (t.paidBy === 'contact') continue

      const linked = selectLinkedReimbursementsForExpense(t.id, transactions, cashTransactions, expenseShares)
      const net = Math.max(0, t.amount - linked)

      const isFixed = t.expenseNature === 'fixed'
      const isEssentialCat = Boolean(t.categoryId && essentialSet.has(t.categoryId))
      const isNecessary = isFixed || isEssentialCat
      const isExtraordinary = t.expenseNature === 'extraordinary'

      if (isNecessary) {
        necessaryPaid += net
        if (t.recurringPaymentId || (isFixed && !isEssentialCat)) {
          recurringPaidNet += net
        } else if (isEssentialCat && !isFixed) {
          essentialVariablePaid += net
        }
      } else if (!isExtraordinary) {
        // Gasto variable no esencial = gasto libre
        discretionarySpent += net
      }
    }
  }

  // Efectivo
  if (Array.isArray(cashTransactions)) {
    for (const c of cashTransactions) {
      if (c.type !== 'expense') continue
      if (!isSameMonth(c.date)) continue
      if (c.paidBy === 'contact') continue

      const linked = selectLinkedReimbursementsForExpense(c.id, transactions, cashTransactions, expenseShares)
      const net = Math.max(0, c.amount - linked)

      const isEssentialCat = Boolean(c.categoryId && essentialSet.has(c.categoryId))
      if (isEssentialCat) {
        necessaryPaid += net
        essentialVariablePaid += net
      } else {
        discretionarySpent += net
      }
    }
  }

  necessaryPaid = Math.round(necessaryPaid * 100) / 100
  discretionarySpent = Math.round(discretionarySpent * 100) / 100

  // 4. Comprometido y necesario esperado (sin doble conteo de lo ya pagado)
  const recurringExpected = selectExpectedCommittedExpenses(recurring)
  const recurringPending = Math.max(0, recurringExpected - recurringPaidNet)

  const activeEstimates = Array.isArray(estimates) ? estimates.filter((e) => e.active !== false) : []
  const essentialEstimates = activeEstimates.filter((e) => essentialSet.has(e.categoryId))
  const essentialVariableExpected = essentialEstimates.reduce((acc, e) => {
    return acc + calculateMonthlyEstimate(e.unitCost, e.frequencyType, e.frequencyValue)
  }, 0)
  const essentialVariablePending = Math.max(0, essentialVariableExpected - essentialVariablePaid)

  const necessaryPending = Math.round((recurringPending + essentialVariablePending) * 100) / 100
  const necessaryExpected = Math.round((necessaryPaid + necessaryPending) * 100) / 100

  // 5. Planificado / Reservas y Periodos especiales
  const reservesBreakdown: ReserveMonthlyNeedItem[] = []
  let plannedReserves = 0
  if (Array.isArray(reserves)) {
    for (const r of reserves) {
      if (!r.active) continue
      const needed = selectMonthlyReserveNeeded(r, refDate)
      if (needed > 0) {
        plannedReserves += needed
        reservesBreakdown.push({
          id: r.id,
          name: r.name,
          neededThisMonth: needed,
          targetAmount: r.targetAmount,
          currentAllocated: r.currentAllocated || 0,
          targetDate: r.targetDate,
        })
      }
    }
  }
  plannedReserves = Math.round(plannedReserves * 100) / 100

  const plannedSpecialPeriods = selectExpectedExtraSpendingForMonth(specialPeriods, refDate)
  const plannedForMonth = Math.round((plannedReserves + plannedSpecialPeriods) * 100) / 100

  // Contexto especial
  const monthSpecialPeriods = Array.isArray(specialPeriods)
    ? specialPeriods.filter((p) => isMonthInSpecialPeriod(p, year, month))
    : []
  const isHighSpendMonth = monthSpecialPeriods.some(
    (p) => p.type === 'expected_high_spend' || (typeof p.expectedExtraBudget === 'number' && p.expectedExtraBudget > 0)
  )
  const isLowSpendMonth = monthSpecialPeriods.some((p) => p.type === 'expected_low_spend')
  const specialPeriodNames = monthSpecialPeriods.map((p) => p.name)

  let specialNote: string | undefined
  if (isHighSpendMonth && specialPeriodNames.length > 0) {
    specialNote = `Este mes incluye un periodo de gasto alto previsto: ${specialPeriodNames.join(', ')}.`
  } else if (isLowSpendMonth && specialPeriodNames.length > 0) {
    specialNote = `Este mes incluye un periodo de gasto bajo previsto: ${specialPeriodNames.join(', ')}.`
  }

  // 6. Objetivo de ahorro
  const targetSavings = selectTargetMonthlySavings(settings, incomeExpected)

  // 7. Margen disponible para gasto libre
  const discretionaryTotalBudget = hasConfiguredIncome
    ? Math.round((incomeExpected - necessaryExpected - plannedForMonth - targetSavings) * 100) / 100
    : 0
  const discretionaryAvailable = Math.round((discretionaryTotalBudget - discretionarySpent) * 100) / 100

  // 8. Recomendación diaria
  let recommendedDailyAvailable: number | null = null
  if (hasConfiguredIncome && daysRemaining > 0 && discretionaryAvailable > 0) {
    recommendedDailyAvailable = Math.round((discretionaryAvailable / daysRemaining) * 100) / 100
  }

  // 9. Estado y mensajes del asesor sobrio
  let status: MonthlySpendingControlStatus = 'on_track'
  let statusMessage = 'Tu gasto libre está dentro del margen previsto.'
  let detailedExplanation = ''

  if (!hasConfiguredIncome) {
    status = 'on_track'
    statusMessage = 'Añade un ingreso en Movimientos o configura una referencia para calcular el margen libre diario.'
    detailedExplanation = 'Sin ingresos registrados ni referencia configurada no es posible calcular el margen disponible para gasto libre.'
  } else if (discretionaryAvailable < 0) {
    status = 'over'
    statusMessage = 'El gasto libre ha superado el margen previsto del mes.'
    const overAmount = Math.abs(discretionaryAvailable).toFixed(2).replace('.', ',')
    detailedExplanation = `Has utilizado ${discretionarySpent.toFixed(2).replace('.', ',')} € de los ${discretionaryTotalBudget.toFixed(2).replace('.', ',')} € disponibles para gasto libre (${overAmount} € por encima del margen).`
  } else {
    const consumedRatio = discretionaryTotalBudget > 0 ? discretionarySpent / discretionaryTotalBudget : 0
    const monthProgress = totalDaysInMonth > 0 ? daysElapsed / totalDaysInMonth : 0

    if (consumedRatio > 0.85 || (consumedRatio > monthProgress + 0.25 && discretionaryAvailable < 50)) {
      status = 'tight'
      statusMessage = 'Te queda poco margen libre para el resto del mes.'
    } else if (consumedRatio < 0.5 && monthProgress > 0.4) {
      status = 'comfortable'
      statusMessage = 'Tu margen de gasto libre es holgado este mes.'
    } else {
      status = 'on_track'
      statusMessage = 'Tu gasto libre está dentro del margen previsto.'
    }

    const dailyText =
      recommendedDailyAvailable !== null
        ? `, aproximadamente ${recommendedDailyAvailable.toFixed(2).replace('.', ',')} €/día.`
        : '.'
    detailedExplanation = `Has utilizado ${discretionarySpent.toFixed(2).replace('.', ',')} € de los ${discretionaryTotalBudget.toFixed(2).replace('.', ',')} € disponibles para gasto libre. Quedan ${discretionaryAvailable.toFixed(2).replace('.', ',')} € para ${daysRemaining} días${dailyText}`
  }

  return {
    hasConfiguredIncome,
    incomeExpected,
    incomeReal,
    incomePending,
    incomeReference,
    incomeSource: incomeDetail.source,
    incomeItemCount: incomeDetail.items.length,

    necessaryExpected,
    necessaryPaid,
    necessaryPending,

    plannedForMonth,
    plannedReserves,
    plannedSpecialPeriods,
    reservesBreakdown,

    targetSavings,

    discretionaryTotalBudget,
    discretionarySpent,
    discretionaryAvailable,

    daysElapsed,
    daysRemaining,
    totalDaysInMonth,
    recommendedDailyAvailable,

    status,
    statusMessage,
    detailedExplanation,

    specialContext: {
      hasSpecialPeriod: monthSpecialPeriods.length > 0,
      isHighSpendMonth,
      isLowSpendMonth,
      specialPeriodNames,
      extraBudgetPlanned: plannedSpecialPeriods,
      note: specialNote,
    },
  }
}




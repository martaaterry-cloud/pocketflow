import { classifyEconomicMovements, economicDate, inEconomicRange, roundMoney } from './economicClassification'
import type { CashTransaction, Category, ExpenseShare, Transaction } from '../models/finance'
import { selectEconomicExpenses, selectEconomicSummaryForRange, selectEconomicCategoryExpenses } from './sharedExpenseSelectors'

export type StatsPeriod = 'day' | 'week' | 'month' | 'year'

export interface DateRange {
  start: Date
  end: Date
  daysCount: number
}

export interface CategoryExpenseBreakdown {
  categoryId: string
  name: string
  color: string
  icon: string
  amount: number
  percentage: number
}

export interface TimeSeriesPoint {
  label: string
  amount: number
  date: Date
}

export interface ExpenseNatureBreakdown {
  fixed: number
  variable: number
  extraordinary: number
  total: number
  fixedPct: number
  variablePct: number
  extraordinaryPct: number
}

export interface PeriodStatistics {
  period: StatsPeriod
  dateRange: DateRange
  income: number
  realIncome: number
  reimbursements: number
  expenses: number
  netExpenses: number
  savingsTransferred: number
  cashWithdrawals: number
  netFlow: number
  transactionCount: number
  averageDailySpend: number
  topCategory: { categoryId: string; name: string; icon: string; amount: number } | null
  categoryBreakdown: CategoryExpenseBreakdown[]
  timeSeries: TimeSeriesPoint[]
  natureBreakdown: ExpenseNatureBreakdown
}

export interface PeriodComparison {
  currentExpenses: number
  previousExpenses: number
  diffAmount: number
  percentageDiff: number | null // null si previousExpenses === 0 para evitar NaN o Infinity
  isHigher: boolean
}

/**
 * Calcula los límites de fecha locales para un periodo específico, evitando
 * desajustes causados por conversiones UTC.
 */
export function getLocalDateRange(period: StatsPeriod, referenceDate: Date = new Date()): DateRange {
  const ref = new Date(referenceDate)
  const year = ref.getFullYear()
  const month = ref.getMonth()
  const date = ref.getDate()

  if (period === 'day') {
    const start = new Date(year, month, date, 0, 0, 0, 0)
    const end = new Date(year, month, date, 23, 59, 59, 999)
    return { start, end, daysCount: 1 }
  }

  if (period === 'week') {
    // Semana de lunes a domingo
    const dayOfWeek = (ref.getDay() + 6) % 7 // 0 = Lunes, 6 = Domingo
    const start = new Date(year, month, date - dayOfWeek, 0, 0, 0, 0)
    const end = new Date(year, month, date - dayOfWeek + 6, 23, 59, 59, 999)
    return { start, end, daysCount: 7 }
  }

  if (period === 'month') {
    const start = new Date(year, month, 1, 0, 0, 0, 0)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const end = new Date(year, month, daysInMonth, 23, 59, 59, 999)
    return { start, end, daysCount: daysInMonth }
  }

  // year
  const start = new Date(year, 0, 1, 0, 0, 0, 0)
  const end = new Date(year, 11, 31, 23, 59, 59, 999)
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  return { start, end, daysCount: isLeapYear ? 366 : 365 }
}

/**
 * Obtiene el rango del periodo anterior para comparaciones históricas.
 */
export function getPreviousLocalDateRange(period: StatsPeriod, referenceDate: Date = new Date()): DateRange {
  const ref = new Date(referenceDate)

  if (period === 'day') {
    const prev = new Date(ref)
    prev.setDate(ref.getDate() - 1)
    return getLocalDateRange('day', prev)
  }

  if (period === 'week') {
    const prev = new Date(ref)
    prev.setDate(ref.getDate() - 7)
    return getLocalDateRange('week', prev)
  }

  if (period === 'month') {
    const prev = new Date(ref.getFullYear(), ref.getMonth() - 1, 1)
    return getLocalDateRange('month', prev)
  }

  // year
  const prev = new Date(ref.getFullYear() - 1, 0, 1)
  return getLocalDateRange('year', prev)
}

/**
 * Filtra transacciones comprendidas dentro de un DateRange exacto en tiempo local.
 */
export function filterTransactionsByRange(transactions: Transaction[], range: DateRange): Transaction[] {
  return transactions.filter((t) => inEconomicRange(t.date, range))
}

/**
 * Calcula todas las estadísticas y métricas del periodo de forma pura.
 * Utiliza la definición canónica de gasto neto personal:
 * netExpense(t) = max(0, t.amount - linkedReimbursements(t))
 */
export function calculatePeriodStatistics(
  transactions: Transaction[], categories: Category[], period: StatsPeriod,
  referenceDate: Date = new Date(), cashTransactions: CashTransaction[] = [], expenseShares: ExpenseShare[] = []
): PeriodStatistics {
  const dateRange = getLocalDateRange(period, referenceDate)
  const summary = selectEconomicSummaryForRange(transactions, cashTransactions, dateRange, expenseShares)
  const expenses = selectEconomicExpenses(transactions, cashTransactions, expenseShares, 'total', (date) => inEconomicRange(date, dateRange))
  const categoryBreakdown = selectEconomicCategoryExpenses(transactions, cashTransactions, categories,
    referenceDate, 'all', expenseShares, 'total', 'net', dateRange).map((c) => ({ ...c, categoryId: c.id }))
  const natureBreakdown = expenseNatureSummary(expenses)
  const movements = classifyEconomicMovements(transactions, cashTransactions)
    .filter((m) => inEconomicRange(m.transaction.date, dateRange))
  const cashWithdrawals = roundMoney(movements.filter((m) => m.source === 'bank' &&
    (m.transaction as Transaction).specialType === 'cash_withdrawal').reduce((sum, m) => sum + m.transaction.amount, 0))
  const savingsTransferred = roundMoney(movements.filter((m) => m.kind === 'transfer' && m.source === 'bank' &&
    (m.transaction as Transaction).toAccountId === 'savings').reduce((sum, m) => sum + m.transaction.amount, 0))
  const top = categoryBreakdown[0]
  // Un único universo de importes netos para todas las series.
  const timeSeries = generateTimeSeries(expenses.map((e) => ({ ...e.movement.transaction, amount: e.net })), period, dateRange)
  const transferIds = new Set(movements.filter((m) => m.transferId).map((m) => m.transferId))
  return { period, dateRange, income: roundMoney(summary.realIncome + summary.reimbursements),
    realIncome: summary.realIncome, reimbursements: summary.reimbursements,
    expenses: summary.grossExpenses, netExpenses: summary.netExpenses, netFlow: summary.netBalance,
    cashWithdrawals, savingsTransferred, categoryBreakdown, natureBreakdown, timeSeries,
    transactionCount: movements.filter((m) => !m.transferId).length + transferIds.size,
    averageDailySpend: dateRange.daysCount > 0 ? roundMoney(summary.netExpenses / dateRange.daysCount) : 0,
    topCategory: top ? { categoryId: top.categoryId, name: top.name, icon: top.icon, amount: top.amount } : null }
}

function expenseNatureSummary(expenses: ReturnType<typeof selectEconomicExpenses>): ExpenseNatureBreakdown {
  const sum = (nature: string) => roundMoney(expenses.filter((e) =>
    ((e.movement.transaction as Transaction).expenseNature || 'variable') === nature).reduce((acc, e) => acc + e.net, 0))
  const fixed = sum('fixed'), variable = sum('variable'), extraordinary = sum('extraordinary')
  const total = roundMoney(fixed + variable + extraordinary)
  const pct = (value: number) => total > 0 ? Math.round(value / total * 100) : 0
  return { fixed, variable, extraordinary, total, fixedPct: pct(fixed), variablePct: pct(variable), extraordinaryPct: pct(extraordinary) }
}

/**
 * Calcula el desglose de gastos por naturaleza (fijo, variable, extraordinario)
 * para un periodo dado, calculando el gasto neto personal de cada partida.
 */
export function selectExpensesByNature(
  transactions: Transaction[], period: StatsPeriod = 'month', referenceDate: Date = new Date(),
  cashTransactions: CashTransaction[] = [], expenseShares: ExpenseShare[] = []
): ExpenseNatureBreakdown {
  const range = getLocalDateRange(period, referenceDate)
  return expenseNatureSummary(selectEconomicExpenses(transactions, cashTransactions, expenseShares, 'total', (date) => inEconomicRange(date, range)))
}

/**
 * Genera puntos de serie temporal agregados por día (semana/mes) o por mes (año),
 * calculando el gasto neto personal tras reembolsos vinculados.
 */
function generateTimeSeries(
  periodTxs: (Transaction | CashTransaction)[], period: StatsPeriod, range: DateRange
): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = []
  const calcNetForTxs = (txs: (Transaction | CashTransaction)[]) => txs.reduce((sum, t) => sum + t.amount, 0)

  if (period === 'day') {
    // 4 intervalos horarios del día: Mañana, Mediodía, Tarde, Noche
    const intervals = [
      { label: '0-6h', startH: 0, endH: 6 },
      { label: '6-12h', startH: 6, endH: 12 },
      { label: '12-18h', startH: 12, endH: 18 },
      { label: '18-24h', startH: 18, endH: 24 },
    ]
    intervals.forEach((slot) => {
      const slotTxs = periodTxs.filter((t) => {
        const h = economicDate(t.date).getHours()
        return h >= slot.startH && h < slot.endH
      })
      const sum = calcNetForTxs(slotTxs)
      points.push({
        label: slot.label,
        amount: Math.round(sum * 100) / 100,
        date: range.start,
      })
    })
    return points
  }

  if (period === 'week') {
    // 7 días de la semana: L, M, X, J, V, S, D
    const weekdayLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(range.start)
      dayDate.setDate(range.start.getDate() + i)
      const dayYear = dayDate.getFullYear()
      const dayMonth = dayDate.getMonth()
      const dayDay = dayDate.getDate()

      const dayTxs = periodTxs.filter((t) => {
        const d = economicDate(t.date)
        return d.getFullYear() === dayYear && d.getMonth() === dayMonth && d.getDate() === dayDay
      })
      const sum = calcNetForTxs(dayTxs)

      points.push({
        label: weekdayLabels[i],
        amount: Math.round(sum * 100) / 100,
        date: dayDate,
      })
    }
    return points
  }

  if (period === 'month') {
    // Agrupar en 4 semanas / tramos del mes para visualización clara en móvil
    const daysInMonth = range.daysCount
    const chunkDays = Math.ceil(daysInMonth / 4)
    for (let i = 0; i < 4; i++) {
      const startDay = i * chunkDays + 1
      const endDay = Math.min(daysInMonth, (i + 1) * chunkDays)
      const label = `${startDay}-${endDay}`

      const chunkTxs = periodTxs.filter((t) => {
        const d = economicDate(t.date)
        return (
          d.getFullYear() === range.start.getFullYear() &&
          d.getMonth() === range.start.getMonth() &&
          d.getDate() >= startDay &&
          d.getDate() <= endDay
        )
      })
      const sum = calcNetForTxs(chunkTxs)

      points.push({
        label,
        amount: Math.round(sum * 100) / 100,
        date: new Date(range.start.getFullYear(), range.start.getMonth(), startDay),
      })
    }
    return points
  }

  // year: 12 meses
  const monthLabels = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
  const yearNum = range.start.getFullYear()
  for (let m = 0; m < 12; m++) {
    const monthTxs = periodTxs.filter((t) => {
      const d = economicDate(t.date)
      return d.getFullYear() === yearNum && d.getMonth() === m
    })
    const sum = calcNetForTxs(monthTxs)

    points.push({
      label: monthLabels[m],
      amount: Math.round(sum * 100) / 100,
      date: new Date(yearNum, m, 1),
    })
  }
  return points
}

/**
 * Compara dos periodos y calcula diferencia absoluta y porcentual.
 * Evita estrictamente NaN e Infinity si previousExpenses === 0.
 */
export function compareWithPreviousPeriod(
  currentExpenses: number,
  previousExpenses: number
): PeriodComparison {
  const diffAmount = Math.round((currentExpenses - previousExpenses) * 100) / 100
  let percentageDiff: number | null = null

  if (previousExpenses > 0) {
    percentageDiff = Math.round(((currentExpenses - previousExpenses) / previousExpenses) * 1000) / 10
  }

  return {
    currentExpenses,
    previousExpenses,
    diffAmount,
    percentageDiff,
    isHigher: diffAmount > 0,
  }
}

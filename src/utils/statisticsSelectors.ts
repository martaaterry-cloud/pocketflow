import type { Category, Transaction } from '../models/finance'
import { normalizeCategoryAlias } from './categoryNormalization'
import { selectLinkedReimbursementsForExpense } from './sharedExpenseSelectors'

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
  const startMs = range.start.getTime()
  const endMs = range.end.getTime()

  return transactions.filter((t) => {
    const txTime = new Date(t.date).getTime()
    return txTime >= startMs && txTime <= endMs
  })
}

/**
 * Calcula todas las estadísticas y métricas del periodo de forma pura.
 * Utiliza la definición canónica de gasto neto personal:
 * netExpense(t) = max(0, t.amount - linkedReimbursements(t))
 */
export function calculatePeriodStatistics(
  transactions: Transaction[],
  categories: Category[],
  period: StatsPeriod,
  referenceDate: Date = new Date()
): PeriodStatistics {
  const dateRange = getLocalDateRange(period, referenceDate)
  const periodTxs = filterTransactionsByRange(transactions, dateRange)

  let income = 0
  let realIncome = 0
  let reimbursements = 0
  let expenses = 0
  let netExpensesSum = 0
  let savingsTransferred = 0
  let cashWithdrawals = 0

  let fixedNetExpenses = 0
  let variableNetExpenses = 0
  let extraordinaryNetExpenses = 0

  const categoryNetExpensesMap = new Map<string, number>()

  periodTxs.forEach((t) => {
    if (t.type === 'income') {
      income += t.amount
      if (t.incomeKind === 'reimbursement') {
        reimbursements += t.amount
      } else {
        realIncome += t.amount
      }
    } else if (t.type === 'expense') {
      expenses += t.amount

      // Cálculo canónico del gasto neto individual
      const linked = selectLinkedReimbursementsForExpense(t.id, transactions)
      const net = Math.max(0, Math.round((t.amount - linked) * 100) / 100)
      netExpensesSum += net

      const catId = normalizeCategoryAlias(t.categoryId || 'other')
      categoryNetExpensesMap.set(catId, (categoryNetExpensesMap.get(catId) ?? 0) + net)

      if (t.specialType === 'cash_withdrawal') {
        cashWithdrawals += t.amount
      }

      const nature = t.expenseNature || 'variable'
      if (nature === 'fixed') {
        fixedNetExpenses += net
      } else if (nature === 'extraordinary') {
        extraordinaryNetExpenses += net
      } else {
        variableNetExpenses += net
      }
    } else if (t.type === 'transfer') {
      // Transferencias hacia ahorro
      if (t.toAccountId === 'savings' || t.description.toLowerCase().includes('ahorro')) {
        savingsTransferred += t.amount
      }
    }
  })

  income = Math.round(income * 100) / 100
  realIncome = Math.round(realIncome * 100) / 100
  reimbursements = Math.round(reimbursements * 100) / 100
  expenses = Math.round(expenses * 100) / 100
  const netExpenses = Math.round(netExpensesSum * 100) / 100
  cashWithdrawals = Math.round(cashWithdrawals * 100) / 100

  fixedNetExpenses = Math.round(fixedNetExpenses * 100) / 100
  variableNetExpenses = Math.round(variableNetExpenses * 100) / 100
  extraordinaryNetExpenses = Math.round(extraordinaryNetExpenses * 100) / 100

  savingsTransferred = Math.round(savingsTransferred * 100) / 100
  // Balance neto real = Ingresos reales - Gasto neto
  const netFlow = Math.round((realIncome - netExpenses) * 100) / 100

  const natureBreakdown: ExpenseNatureBreakdown = {
    fixed: fixedNetExpenses,
    variable: variableNetExpenses,
    extraordinary: extraordinaryNetExpenses,
    total: netExpenses,
    fixedPct: netExpenses > 0 ? Math.round((fixedNetExpenses / netExpenses) * 100) : 0,
    variablePct: netExpenses > 0 ? Math.round((variableNetExpenses / netExpenses) * 100) : 0,
    extraordinaryPct: netExpenses > 0 ? Math.round((extraordinaryNetExpenses / netExpenses) * 100) : 0,
  }

  // Desglose por categoría basado en gasto neto
  const categoryBreakdown: CategoryExpenseBreakdown[] = []
  categoryNetExpensesMap.forEach((amount, categoryId) => {
    const canonicalId = normalizeCategoryAlias(categoryId)
    const category = categories.find((c) => normalizeCategoryAlias(c.id) === canonicalId)
    const roundedAmount = Math.round(amount * 100) / 100
    if (roundedAmount > 0) {
      const percentage = netExpenses > 0 ? Math.round((roundedAmount / netExpenses) * 100) : 0
      categoryBreakdown.push({
        categoryId: canonicalId,
        name: canonicalId === 'other' ? 'Otros' : category?.name ?? 'Otros',
        color: category?.color ?? '#B9B9B9',
        icon: category?.iconKey || category?.icon || 'ellipsis',
        amount: roundedAmount,
        percentage,
      })
    }
  })
  categoryBreakdown.sort((a, b) => b.amount - a.amount)

  // Top categoría (por gasto neto)
  let topCategory: PeriodStatistics['topCategory'] = null
  if (categoryBreakdown.length > 0) {
    const top = categoryBreakdown[0]
    topCategory = {
      categoryId: top.categoryId,
      name: top.name,
      icon: top.icon,
      amount: top.amount,
    }
  }

  // Gasto medio diario (basado en gasto neto)
  const averageDailySpend =
    dateRange.daysCount > 0 ? Math.round((netExpenses / dateRange.daysCount) * 100) / 100 : 0

  // Serie temporal agregada con importes netos
  const timeSeries = generateTimeSeries(periodTxs, transactions, period, dateRange)

  return {
    period,
    dateRange,
    income,
    realIncome,
    reimbursements,
    expenses,
    netExpenses,
    savingsTransferred,
    cashWithdrawals,
    netFlow,
    transactionCount: periodTxs.length,
    averageDailySpend,
    topCategory,
    categoryBreakdown,
    timeSeries,
    natureBreakdown,
  }
}

/**
 * Calcula el desglose de gastos por naturaleza (fijo, variable, extraordinario)
 * para un periodo dado, calculando el gasto neto personal de cada partida.
 */
export function selectExpensesByNature(
  transactions: Transaction[],
  period: StatsPeriod = 'month',
  referenceDate: Date = new Date()
): ExpenseNatureBreakdown {
  const dateRange = getLocalDateRange(period, referenceDate)
  const periodTxs = filterTransactionsByRange(transactions, dateRange)

  let fixed = 0
  let variable = 0
  let extraordinary = 0
  let totalNet = 0

  periodTxs.forEach((t) => {
    if (t.type === 'expense') {
      const linked = selectLinkedReimbursementsForExpense(t.id, transactions)
      const net = Math.max(0, Math.round((t.amount - linked) * 100) / 100)
      totalNet += net

      const nature = t.expenseNature || 'variable'
      if (nature === 'fixed') {
        fixed += net
      } else if (nature === 'extraordinary') {
        extraordinary += net
      } else {
        variable += net
      }
    }
  })

  totalNet = Math.round(totalNet * 100) / 100
  fixed = Math.round(fixed * 100) / 100
  variable = Math.round(variable * 100) / 100
  extraordinary = Math.round(extraordinary * 100) / 100

  return {
    fixed,
    variable,
    extraordinary,
    total: totalNet,
    fixedPct: totalNet > 0 ? Math.round((fixed / totalNet) * 100) : 0,
    variablePct: totalNet > 0 ? Math.round((variable / totalNet) * 100) : 0,
    extraordinaryPct: totalNet > 0 ? Math.round((extraordinary / totalNet) * 100) : 0,
  }
}

/**
 * Genera puntos de serie temporal agregados por día (semana/mes) o por mes (año),
 * calculando el gasto neto personal tras reembolsos vinculados.
 */
function generateTimeSeries(
  periodTxs: Transaction[],
  allTransactions: Transaction[],
  period: StatsPeriod,
  range: DateRange
): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = []

  const calcNetForTxs = (txs: Transaction[]) => {
    return txs
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => {
        const linked = selectLinkedReimbursementsForExpense(t.id, allTransactions)
        const net = Math.max(0, Math.round((t.amount - linked) * 100) / 100)
        return sum + net
      }, 0)
  }

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
        const h = new Date(t.date).getHours()
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
        const d = new Date(t.date)
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
        const d = new Date(t.date)
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
      const d = new Date(t.date)
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

import type { Category, Transaction } from '../models/finance'

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

export interface PeriodStatistics {
  period: StatsPeriod
  dateRange: DateRange
  income: number
  expenses: number
  savingsTransferred: number
  netFlow: number
  transactionCount: number
  averageDailySpend: number
  topCategory: { categoryId: string; name: string; icon: string; amount: number } | null
  categoryBreakdown: CategoryExpenseBreakdown[]
  timeSeries: TimeSeriesPoint[]
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
  let expenses = 0
  let savingsTransferred = 0

  const categoryExpensesMap = new Map<string, number>()

  periodTxs.forEach((t) => {
    if (t.type === 'income') {
      income += t.amount
    } else if (t.type === 'expense') {
      expenses += t.amount
      const catId = t.categoryId ?? 'other'
      categoryExpensesMap.set(catId, (categoryExpensesMap.get(catId) ?? 0) + t.amount)
    } else if (t.type === 'transfer') {
      // Transferencias hacia ahorro
      if (t.toAccountId === 'savings' || t.description.toLowerCase().includes('ahorro')) {
        savingsTransferred += t.amount
      }
    }
  })

  income = Math.round(income * 100) / 100
  expenses = Math.round(expenses * 100) / 100
  savingsTransferred = Math.round(savingsTransferred * 100) / 100
  const netFlow = Math.round((income - expenses) * 100) / 100

  // Desglose por categoría
  const categoryBreakdown: CategoryExpenseBreakdown[] = []
  categoryExpensesMap.forEach((amount, categoryId) => {
    const category = categories.find((c) => c.id === categoryId)
    const percentage = expenses > 0 ? Math.round((amount / expenses) * 100) : 0
    categoryBreakdown.push({
      categoryId,
      name: category?.name ?? 'Otras',
      color: category?.color ?? '#8b8d86',
      icon: category?.iconKey || category?.icon || 'shopping-basket',
      amount: Math.round(amount * 100) / 100,
      percentage,
    })
  })
  categoryBreakdown.sort((a, b) => b.amount - a.amount)

  // Top categoría
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

  // Gasto medio diario
  const averageDailySpend =
    dateRange.daysCount > 0 ? Math.round((expenses / dateRange.daysCount) * 100) / 100 : 0

  // Serie temporal (barras simples)
  const timeSeries = generateTimeSeries(periodTxs, period, dateRange)

  return {
    period,
    dateRange,
    income,
    expenses,
    savingsTransferred,
    netFlow,
    transactionCount: periodTxs.length,
    averageDailySpend,
    topCategory,
    categoryBreakdown,
    timeSeries,
  }
}

/**
 * Genera puntos de serie temporal agregados por día (semana/mes) o por mes (año).
 */
function generateTimeSeries(
  transactions: Transaction[],
  period: StatsPeriod,
  range: DateRange
): TimeSeriesPoint[] {
  const points: TimeSeriesPoint[] = []

  if (period === 'day') {
    // 4 intervalos horarios del día: Mañana, Mediodía, Tarde, Noche
    const intervals = [
      { label: '0-6h', startH: 0, endH: 6 },
      { label: '6-12h', startH: 6, endH: 12 },
      { label: '12-18h', startH: 12, endH: 18 },
      { label: '18-24h', startH: 18, endH: 24 },
    ]
    intervals.forEach((slot) => {
      const sum = transactions
        .filter((t) => t.type === 'expense')
        .filter((t) => {
          const h = new Date(t.date).getHours()
          return h >= slot.startH && h < slot.endH
        })
        .reduce((s, t) => s + t.amount, 0)
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

      const sum = transactions
        .filter((t) => t.type === 'expense')
        .filter((t) => {
          const d = new Date(t.date)
          return d.getFullYear() === dayYear && d.getMonth() === dayMonth && d.getDate() === dayDay
        })
        .reduce((s, t) => s + t.amount, 0)

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

      const sum = transactions
        .filter((t) => t.type === 'expense')
        .filter((t) => {
          const d = new Date(t.date)
          return (
            d.getFullYear() === range.start.getFullYear() &&
            d.getMonth() === range.start.getMonth() &&
            d.getDate() >= startDay &&
            d.getDate() <= endDay
          )
        })
        .reduce((s, t) => s + t.amount, 0)

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
    const sum = transactions
      .filter((t) => t.type === 'expense')
      .filter((t) => {
        const d = new Date(t.date)
        return d.getFullYear() === yearNum && d.getMonth() === m
      })
      .reduce((s, t) => s + t.amount, 0)

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

import type { Account, Category, RecurringFrequency, RecurringPayment, SavingsGoal, Transaction } from '../models/finance'

/**
 * Dinero para gastar = saldo actual de Cuenta diaria.
 */
export function selectSpendableBalance(accounts: Account[]): number {
  const dailyAccount = accounts.find((a) => a.type === 'spending')
  return dailyAccount?.balance ?? 0
}

/**
 * Ahorro total = saldo actual de Cuenta Ahorro.
 */
export function selectSavingsBalance(accounts: Account[]): number {
  const savingsAccount = accounts.find((a) => a.type === 'savings')
  return savingsAccount?.balance ?? 0
}

/**
 * Dinero total = saldo Cuenta diaria + saldo Ahorro.
 */
export function selectTotalMoney(accounts: Account[]): number {
  const daily = selectSpendableBalance(accounts)
  const savings = selectSavingsBalance(accounts)
  return Math.round((daily + savings) * 100) / 100
}

/**
 * Ahorro asignado = cantidad del ahorro ya asignada a objetivos.
 */
export function selectAssignedSavings(goals: SavingsGoal[]): number {
  const sum = goals.reduce((acc, goal) => acc + (goal.current ?? 0), 0)
  return Math.round(sum * 100) / 100
}

/**
 * Ahorro libre = ahorro total - ahorro asignado.
 */
export function selectFreeSavings(savingsBalance: number, assignedSavings: number): number {
  return Math.max(0, Math.round((savingsBalance - assignedSavings) * 100) / 100)
}

/**
 * Progreso visual y estado de un objetivo de ahorro.
 */
export function selectGoalProgress(
  current: number,
  target: number
): { percentage: number; isCompleted: boolean } {
  if (!target || target <= 0) {
    return { percentage: 0, isCompleted: false }
  }
  const percentage = Math.min(100, Math.round((current / target) * 100))
  return {
    percentage,
    isCompleted: current >= target,
  }
}

/**
 * Obtiene la lista de pagos recurrentes que siguen pendientes de cobro en el periodo (mes en curso).
 * Considera únicamente los recurrentes activos que afectan a la cuenta de gastos diaria.
 * Verifica si ya existe una transacción vinculada mediante recurringPaymentId (o heurística de respaldo).
 */
export function selectPendingRecurringPayments(
  recurring: RecurringPayment[],
  transactions: Transaction[],
  referenceDate: Date = new Date(),
  spendingAccountId = 'daily'
): RecurringPayment[] {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  return recurring.filter((r) => {
    // 1. Debe estar activo
    if (!r.active) return false

    // 2. Debe pertenecer a la cuenta diaria
    if (r.accountId && r.accountId !== spendingAccountId) return false

    // 3. Comprobar si ya fue registrado como gasto en el mes en curso
    const alreadyRegistered = transactions.some((t) => {
      if (t.type !== 'expense') return false

      const d = new Date(t.date)
      const isSameMonth = d.getMonth() === currentMonth && d.getFullYear() === currentYear
      if (!isSameMonth) return false

      // Enlace robusto por ID prioritario
      if (t.recurringPaymentId && t.recurringPaymentId === r.id) {
        return true
      }

      // Enlace de respaldo por nombre/concepto o categoría+importe exacto
      const matchesDescription = t.description.toLowerCase().includes(r.name.toLowerCase())
      const matchesCategoryAndAmount =
        r.categoryId && t.categoryId === r.categoryId && Math.abs(t.amount - r.amount) < 0.01

      return matchesDescription || matchesCategoryAndAmount
    })

    return !alreadyRegistered
  })
}

/**
 * Dinero comprometido = suma de los gastos recurrentes pendientes que afectarán
 * a la Cuenta diaria dentro del periodo en curso.
 */
export function selectCommittedAmount(
  recurring: RecurringPayment[],
  transactions: Transaction[],
  referenceDate: Date = new Date(),
  spendingAccountId = 'daily'
): number {
  const pending = selectPendingRecurringPayments(
    recurring,
    transactions,
    referenceDate,
    spendingAccountId
  )
  const total = pending.reduce((sum, r) => sum + r.amount, 0)
  return Math.round(total * 100) / 100
}

/**
 * Disponible real = dinero para gastar - dinero comprometido.
 */
export function selectRealAvailable(spendableBalance: number, committedAmount: number): number {
  return Math.max(0, Math.round((spendableBalance - committedAmount) * 100) / 100)
}

/**
 * Gastado este mes = suma de transacciones de tipo 'expense' en el mes en curso.
 * Las transferencias internas quedan estrictamente excluidas.
 */
export function selectMonthExpenses(
  transactions: Transaction[],
  referenceDate: Date = new Date()
): number {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  const sum = transactions
    .filter((t) => t.type === 'expense')
    .filter((t) => {
      const d = new Date(t.date)
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear
    })
    .reduce((acc, t) => acc + t.amount, 0)

  return Math.round(sum * 100) / 100
}

/**
 * Disponible proyectado = Disponible real - Previsto variable pendiente.
 * No oculta valores negativos si financieramente tienen significado.
 * Redondeado a 2 decimales.
 */
export function selectProjectedAvailable(
  realAvailable: number,
  pendingVariableEstimate: number
): number {
  return Math.round((realAvailable - pendingVariableEstimate) * 100) / 100
}

/**
 * Calcula la siguiente fecha para un pago recurrente respetando fines de mes
 * y calendario gregoriano sin romper por meses de 28/29/30 días.
 */
export function calculateNextRecurringDate(
  currentDateStr: string,
  frequency: RecurringFrequency
): string {
  if (!currentDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(currentDateStr)) {
    return new Date().toISOString().slice(0, 10)
  }

  const parts = currentDateStr.split('-').map(Number)
  const year = parts[0]
  const month = parts[1] // 1-12
  const day = parts[2] // 1-31

  if (frequency === 'weekly') {
    const d = new Date(Date.UTC(year, month - 1, day))
    d.setUTCDate(d.getUTCDate() + 7)
    return d.toISOString().slice(0, 10)
  }

  if (frequency === 'monthly') {
    let targetYear = year
    let targetMonth = month + 1 // 1-indexed
    if (targetMonth > 12) {
      targetYear += 1
      targetMonth = 1
    }
    const maxDaysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate()
    const targetDay = Math.min(day, maxDaysInTargetMonth)
    const mm = String(targetMonth).padStart(2, '0')
    const dd = String(targetDay).padStart(2, '0')
    return `${targetYear}-${mm}-${dd}`
  }

  if (frequency === 'yearly') {
    const targetYear = year + 1
    const maxDaysInTargetMonth = new Date(Date.UTC(targetYear, month, 0)).getUTCDate()
    const targetDay = Math.min(day, maxDaysInTargetMonth)
    const mm = String(month).padStart(2, '0')
    const dd = String(targetDay).padStart(2, '0')
    return `${targetYear}-${mm}-${dd}`
  }

  return currentDateStr
}

export type RecurringPaymentCycleStatus = 'confirmed_for_cycle' | 'due' | 'upcoming'

/**
 * Determina el estado contextual de un pago recurrente en el ciclo actual:
 * - 'confirmed_for_cycle': ya cobrado este mes
 * - 'due': pendiente de confirmar o previsto hoy
 * - 'upcoming': próximo en fecha futura
 */
export function selectRecurringPaymentCycleStatus(
  payment: RecurringPayment,
  transactions: Transaction[],
  referenceDate: Date = new Date()
): {
  status: RecurringPaymentCycleStatus
  label: string
  confirmedTx?: Transaction
} {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()
  const todayStr = referenceDate.toISOString().slice(0, 10)

  // 1. Comprobar si ya fue confirmado en el ciclo/mes en curso mediante recurringPaymentId
  const confirmedTx = transactions.find((t) => {
    if (t.type !== 'expense') return false
    const d = new Date(t.date)
    if (d.getMonth() !== currentMonth || d.getFullYear() !== currentYear) return false
    if (t.recurringPaymentId && t.recurringPaymentId === payment.id) return true
    return false
  })

  if (confirmedTx) {
    return {
      status: 'confirmed_for_cycle',
      label: 'Cobrado este ciclo',
      confirmedTx,
    }
  }

  // 2. Si la fecha ya llegó o es hoy
  if (payment.nextDate <= todayStr) {
    return {
      status: 'due',
      label: payment.nextDate === todayStr ? 'Previsto hoy' : 'Pendiente de confirmar',
    }
  }

  // 3. Si la fecha es futura
  const parts = payment.nextDate.split('-')
  const day = parseInt(parts[2], 10)
  const monthNames = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
  ]
  const monthIndex = parseInt(parts[1], 10) - 1
  const formattedDate = `${day} ${monthNames[monthIndex] || ''}`

  return {
    status: 'upcoming',
    label: `Próximo: ${formattedDate}`,
  }
}

/**
 * Gasto bruto desglosado por categoría en el mes actual.
 */
export function selectCategoryExpenses(
  transactions: Transaction[],
  categories: Category[],
  referenceDate: Date = new Date()
): { id: string; name: string; amount: number; percentage: number; color: string; iconKey?: string }[] {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  const monthExpenses = transactions.filter((t) => {
    if (t.type !== 'expense') return false
    const d = new Date(t.date)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })

  const total = monthExpenses.reduce((sum, t) => sum + t.amount, 0)
  const categoryMap = new Map<string, number>()

  monthExpenses.forEach((t) => {
    const catId = t.categoryId || 'other'
    categoryMap.set(catId, (categoryMap.get(catId) || 0) + t.amount)
  })

  return categories.map((c) => {
    const amount = Math.round((categoryMap.get(c.id) || 0) * 100) / 100
    const percentage = total > 0 ? Math.round((amount / total) * 100) : 0
    return {
      id: c.id,
      name: c.name,
      amount,
      percentage,
      color: c.color,
      iconKey: c.icon,
    }
  })
}



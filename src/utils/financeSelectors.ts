import type { Account, RecurringPayment, SavingsGoal, Transaction } from '../models/finance'

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

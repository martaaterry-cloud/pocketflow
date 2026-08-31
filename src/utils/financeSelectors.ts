import type { Account, RecurringPayment, Transaction } from '../models/finance'

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
 * Dinero comprometido = gastos recurrentes pendientes del periodo (mes en curso).
 * Si un gasto recurrente ya tiene una transacción asociada en el mes, no se computa como pendiente.
 */
export function selectCommittedAmount(
  recurring: RecurringPayment[],
  transactions: Transaction[],
  referenceDate: Date = new Date()
): number {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  const pending = recurring.filter((r) => {
    if (!r.active) return false
    const alreadyPaid = transactions.some((t) => {
      if (t.type !== 'expense') return false
      const d = new Date(t.date)
      const isSameMonth = d.getMonth() === currentMonth && d.getFullYear() === currentYear
      return (
        isSameMonth &&
        (t.description.toLowerCase().includes(r.name.toLowerCase()) ||
          (r.categoryId && t.categoryId === r.categoryId && Math.abs(t.amount - r.amount) < 0.01))
      )
    })
    return !alreadyPaid
  })

  const total = pending.reduce((sum, r) => sum + r.amount, 0)
  return Math.round(total * 100) / 100
}

/**
 * Disponible real = dinero para gastar - dinero comprometido.
 * Uno de los números principales de la app.
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

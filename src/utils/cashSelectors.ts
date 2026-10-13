import { inEconomicMonth } from './economicClassification'
import type { Account, CashTransaction, ExpenseShare, Transaction } from '../models/finance'
import { selectTotalMoney } from './financeSelectors'
import { selectNetPersonalExpensesForPeriod, selectNetCashExpensesForPeriod, selectEconomicSummary } from './sharedExpenseSelectors'

export { selectNetCashExpensesForPeriod } from './sharedExpenseSelectors'

/**
 * Salidas de efectivo brutas (expense) en un periodo dado.
 */
export function selectGrossCashExpensesForPeriod(
  cashTransactions: CashTransaction[] = [], referenceDate: Date = new Date(), scope: 'month' | 'all' = 'month',
  transactions: Transaction[] = []
): number {
  if (!Array.isArray(cashTransactions)) return 0
  return selectEconomicSummary(transactions, cashTransactions, referenceDate, scope, [], 'cash').grossExpenses
}

/**
 * Calcula el saldo de efectivo físico derivado exclusivamente de sus movimientos:
 * - 'income' (entradas): +amount
 * - 'expense' (salidas): -amount
 * - 'adjustment' (ajustes): +amount (donde amount puede ser positivo o negativo)
 *
 * Invariante: Nunca almacena un saldo persistido separado.
 */
export function selectCashBalance(cashTransactions: CashTransaction[] = []): number {
  if (!Array.isArray(cashTransactions) || cashTransactions.length === 0) {
    return 0
  }

  const net = cashTransactions.reduce((acc, tx) => {
    const amount = Number(tx.amount) || 0
    if (tx.type === 'income') {
      return acc + Math.abs(amount)
    }
    if (tx.type === 'expense') {
      if (tx.isShared && tx.paidBy === 'contact') {
        return acc
      }
      return acc - Math.abs(amount)
    }
    if (tx.type === 'adjustment') {
      return acc + amount
    }
    return acc
  }, 0)

  return Math.round(net * 100) / 100
}

/**
 * Entradas de efectivo (income) en un periodo dado.
 */
export function selectCashIncomeForPeriod(
  cashTransactions: CashTransaction[] = [], referenceDate: Date = new Date(), scope: 'month' | 'all' = 'month',
  transactions: Transaction[] = []
): number {
  if (!Array.isArray(cashTransactions)) return 0
  return selectEconomicSummary(transactions, cashTransactions, referenceDate, scope, [], 'cash').realIncome
}

/**
 * Salidas de efectivo (expense) en un periodo dado. Por defecto computa el gasto neto.
 */
export function selectCashExpensesForPeriod(
  cashTransactions: CashTransaction[] = [],
  referenceDate: Date = new Date(),
  scope: 'month' | 'all' = 'month',
  transactions: Transaction[] = [],
  expenseShares: ExpenseShare[] = []
): number {
  return selectNetCashExpensesForPeriod(cashTransactions, transactions, referenceDate, scope, expenseShares)
}

/**
 * Calcula la diferencia exacta (delta) necesaria para un ajuste de efectivo.
 * Ejemplo:
 * - Saldo calculado actual: 61 €
 * - Efectivo contado físicamente: 54 €
 * - Delta = 54 - 61 = -7 €
 */
export function calculateCashAdjustmentDelta(
  currentCashBalance: number,
  countedPhysicalCash: number
): number {
  const current = Math.round(Number(currentCashBalance || 0) * 100) / 100
  const counted = Math.round(Number(countedPhysicalCash || 0) * 100) / 100
  return Math.round((counted - current) * 100) / 100
}

/**
 * Genera el payload para registrar un movimiento de ajuste rápido de efectivo.
 */
export function createCashAdjustmentInput(
  currentCashBalance: number,
  countedPhysicalCash: number,
  date: string = new Date().toISOString(),
  note?: string
) {
  const delta = calculateCashAdjustmentDelta(currentCashBalance, countedPhysicalCash)
  if (delta === 0) return null
  return {
    type: 'adjustment' as const,
    amount: delta,
    description: delta >= 0 ? 'Ajuste positivo de efectivo' : 'Ajuste de efectivo (discrepancia)',
    date,
    note: note ?? `Ajuste manual de ${currentCashBalance} € a ${countedPhysicalCash} €`,
  }
}

/**
 * Visión total de liquidez patrimonial disponible:
 * - Banco: saldo cuenta diaria + saldo cuenta ahorro
 * - Efectivo: saldo físico derivado
 * - Total: suma de ambos
 */
export function selectTotalAvailableMoney(
  bankAccounts: Account[] = [],
  cashTransactions: CashTransaction[] = []
): {
  bank: number
  cash: number
  total: number
} {
  const bank = selectTotalMoney(bankAccounts)
  const cash = selectCashBalance(cashTransactions)
  const total = Math.round((bank + cash) * 100) / 100

  return {
    bank,
    cash,
    total,
  }
}

/**
 * Obtiene la suma de retiradas de cajero bancarias vinculadas explícitamente
 * a una entrada de efectivo en el periodo.
 */
export function selectLinkedCashWithdrawalsForPeriod(
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = [],
  referenceDate: Date = new Date(),
  scope: 'month' | 'all' = 'month'
): number {
  if (!Array.isArray(transactions) || !Array.isArray(cashTransactions)) return 0


  // IDs de transacciones bancarias que tienen entrada de efectivo vinculada
  const linkedBankTxIds = new Set(
    cashTransactions
      .filter((ctx) => ctx.type === 'income' && ctx.bankTransactionId)
      .map((ctx) => ctx.bankTransactionId as string)
  )

  const sum = transactions
    .filter((t) => t.type === 'expense' && t.specialType === 'cash_withdrawal' && linkedBankTxIds.has(t.id))
    .filter((t) => inEconomicMonth(t.date, referenceDate, scope))
    .reduce((acc, t) => acc + t.amount, 0)

  return Math.round(sum * 100) / 100
}

export interface TotalEconomicConsumptionSummary {
  bankNetExpenses: number
  cashExpenses: number
  /** @deprecated Las retiradas ya están excluidas del gasto bancario; siempre 0. */
  linkedWithdrawalsDeducted: number
  transferredToCash: number
  totalEconomicConsumption: number
}

/**
 * Selector canónico de consumo económico global sin doble conteo de cajero:
 *
 * Gasto Total Real = Gasto Neto Bancario + Gasto Real Neto en Efectivo.
 * Los traslados internos ya están excluidos en ambos orígenes.
 */
export function selectTotalEconomicConsumptionForPeriod(
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = [],
  referenceDate: Date = new Date(),
  scope: 'month' | 'all' = 'month',
  expenseShares: ExpenseShare[] = []
): TotalEconomicConsumptionSummary {
  const bankNetExpenses = selectNetPersonalExpensesForPeriod(
    transactions,
    referenceDate,
    scope,
    cashTransactions,
    expenseShares
  )
  const cashExpenses = selectNetCashExpensesForPeriod(
    cashTransactions,
    transactions,
    referenceDate,
    scope,
    expenseShares
  )
  const transferredToCash = selectLinkedCashWithdrawalsForPeriod(
    transactions,
    cashTransactions,
    referenceDate,
    scope
  )

  const totalEconomicConsumption = Math.max(
    0,
    Math.round((bankNetExpenses + cashExpenses) * 100) / 100
  )

  return {
    bankNetExpenses,
    cashExpenses,
    linkedWithdrawalsDeducted: 0,
    transferredToCash,
    totalEconomicConsumption,
  }
}

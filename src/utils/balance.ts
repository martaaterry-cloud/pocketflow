import type { Account, Transaction } from '../models/finance'

/**
 * Calcula el saldo actual de una cuenta a partir de su saldo inicial
 * y del histórico completo de transacciones de forma determinista y reproducible.
 *
 * saldo actual = saldo inicial
 *              + ingresos hacia la cuenta
 *              - gastos de la cuenta
 *              + transferencias entrantes
 *              - transferencias salientes
 */
export function calculateAccountBalance(
  account: Pick<Account, 'id' | 'initialBalance'>,
  transactions: Transaction[]
): number {
  const effect = transactions.reduce((acc, t) => {
    if (t.type === 'expense' && t.accountId === account.id) {
      return acc - t.amount
    }
    if (t.type === 'income' && t.accountId === account.id) {
      return acc + t.amount
    }
    if (t.type === 'transfer') {
      if (t.accountId === account.id) {
        return acc - t.amount // Origen
      }
      if (t.toAccountId === account.id) {
        return acc + t.amount // Destino
      }
    }
    return acc
  }, 0)

  // Redondear a 2 decimales para evitar problemas de precisión en coma flotante
  return Math.round(((account.initialBalance ?? 0) + effect) * 100) / 100
}

/**
 * Reconcilia y proyecta todas las cuentas con sus saldos actuales calculados.
 * Garantiza que la UI siempre vea el saldo derivado del histórico.
 */
export function reconcileAccounts(
  accounts: Account[],
  transactions: Transaction[]
): Account[] {
  return accounts.map((acc) => ({
    ...acc,
    balance: calculateAccountBalance(acc, transactions),
  }))
}

/**
 * Auto-recuperación para estados heredados: si una cuenta no tiene initialBalance definido,
 * lo deriva matemáticamente deduciendo el efecto del histórico sobre el balance guardado.
 */
export function ensureAccountInitialBalance(
  account: Account,
  transactions: Transaction[],
  defaultInitialFallback = 0
): Account {
  if (typeof account.initialBalance === 'number' && !isNaN(account.initialBalance)) {
    return account
  }

  const effect = transactions.reduce((sum, t) => {
    if (t.type === 'expense' && t.accountId === account.id) return sum - t.amount
    if (t.type === 'income' && t.accountId === account.id) return sum + t.amount
    if (t.type === 'transfer') {
      if (t.accountId === account.id) return sum - t.amount
      if (t.toAccountId === account.id) return sum + t.amount
    }
    return sum
  }, 0)

  const legacyBalance = typeof account.balance === 'number' ? account.balance : defaultInitialFallback
  return {
    ...account,
    initialBalance: Math.round((legacyBalance - effect) * 100) / 100,
  }
}

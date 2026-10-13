import type { CashTransaction, Transaction } from '../models/finance'

export type EconomicKind = 'expense' | 'income' | 'reimbursement' | 'transfer' | 'adjustment'
export type EconomicSource = 'bank' | 'cash' | 'total'
export interface EconomicMovement {
  transaction: Transaction | CashTransaction
  source: 'bank' | 'cash'
  kind: EconomicKind
  transferId?: string
}

export const roundMoney = (value: number): number => Math.round(value * 100) / 100

/** La fecha económica escrita determina el día; no se desplaza por el huso horario. */
export function economicDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value)
  if (!match) return new Date(value)
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0))
}

export function inEconomicMonth(value: string, referenceDate: Date, scope: 'month' | 'all' = 'month'): boolean {
  if (scope === 'all') return true
  const d = economicDate(value)
  return d.getFullYear() === referenceDate.getFullYear() && d.getMonth() === referenceDate.getMonth()
}

export function inEconomicRange(value: string, range: { start: Date; end: Date }): boolean {
  const time = economicDate(value).getTime()
  return time >= range.start.getTime() && time <= range.end.getTime()
}

/** Solo vínculos explícitos: nunca inferir un traslado por importe o descripción. */
export function classifyEconomicMovements(
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = []
): EconomicMovement[] {
  const bankById = new Map(transactions.map((t) => [t.id, t]))
  const deposits = new Set<string>()
  cashTransactions.forEach((c) => {
    const bank = c.bankTransactionId ? bankById.get(c.bankTransactionId) : undefined
    if (c.type === 'expense' && bank?.type === 'income' &&
        !bank.parentExpenseId && !bank.expenseShareId && !bank.isShared && !c.isShared) {
      deposits.add(bank.id)
    }
  })

  const bankMovements: EconomicMovement[] = transactions.map((t) => {
    let kind: EconomicKind
    if (t.specialType === 'account_adjustment') kind = 'adjustment'
    else if (t.type === 'transfer' || t.specialType === 'transfer' || t.specialType === 'cash_withdrawal' || deposits.has(t.id)) kind = 'transfer'
    else if (t.type === 'income') kind = t.incomeKind === 'reimbursement' || t.specialType === 'reimbursement' ? 'reimbursement' : 'income'
    else kind = 'expense'
    return { transaction: t, source: 'bank', kind, transferId: kind === 'transfer' ? t.id : undefined }
  })
  const cashMovements: EconomicMovement[] = cashTransactions.map((c) => {
    const bank = c.bankTransactionId ? bankById.get(c.bankTransactionId) : undefined
    let kind: EconomicKind
    if (c.type === 'adjustment') kind = 'adjustment'
    else if ((c.type === 'income' && (bank?.specialType === 'cash_withdrawal' || bank?.specialType === 'transfer')) ||
             (c.type === 'expense' && Boolean(bank && deposits.has(bank.id)))) kind = 'transfer'
    else if (c.type === 'income') kind = c.bankTransactionId ? 'reimbursement' : 'income'
    else kind = 'expense'
    return { transaction: c, source: 'cash', kind, transferId: kind === 'transfer' ? c.bankTransactionId : undefined }
  })
  return [...bankMovements, ...cashMovements]
}

export function isPersonalExpense(movement: EconomicMovement): boolean {
  const t = movement.transaction
  return movement.kind === 'expense' && !(t.isShared && t.paidBy === 'contact')
}

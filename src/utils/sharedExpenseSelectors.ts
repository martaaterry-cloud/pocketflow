import type { Category, ExpenseShare, ExpenseShareStatus, Transaction } from '../models/finance'
import { normalizeCategoryAlias } from './categoryNormalization'

export interface SplitResult {
  participantName: string
  contactId?: string
  isPayerShare: boolean
  amount: number
}

export interface NetCategoryExpense {
  id: string
  name: string
  color: string
  icon: string
  amount: number
  percentage: number
}

/**
 * Reembolsos vinculados a un gasto concreto (por parentExpenseId).
 */
export function selectLinkedReimbursementsForExpense(
  expenseId: string,
  transactions: Transaction[]
): number {
  const reimbursements = transactions.filter(
    (t) => t.type === 'income' && t.incomeKind === 'reimbursement' && t.parentExpenseId === expenseId
  )
  const sum = reimbursements.reduce((acc, t) => acc + t.amount, 0)
  return Math.round(sum * 100) / 100
}

/**
 * Gasto bruto del periodo = suma de todos los gastos (expense) realizados en el periodo.
 */
export function selectGrossExpensesForPeriod(
  transactions: Transaction[],
  referenceDate: Date = new Date(),
  scope: 'month' | 'all' = 'month'
): number {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  const sum = transactions
    .filter((t) => t.type === 'expense')
    .filter((t) => {
      if (scope === 'all') return true
      const d = new Date(t.date)
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear
    })
    .reduce((acc, t) => acc + t.amount, 0)

  return Math.round(sum * 100) / 100
}

export const selectGrossExpenses = selectGrossExpensesForPeriod

/**
 * Reembolsos vinculados a los gastos de este periodo.
 * Solo descuenta reembolsos asociados a gastos cuya fecha pertenece al periodo,
 * independientemente de la fecha en que se recibió el Bizum.
 */
export function selectLinkedReimbursementsForPeriod(
  transactions: Transaction[],
  referenceDate: Date = new Date(),
  scope: 'month' | 'all' = 'month'
): number {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  const periodExpenses = transactions.filter((t) => {
    if (t.type !== 'expense') return false
    if (scope === 'all') return true
    const d = new Date(t.date)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })

  let sum = 0
  periodExpenses.forEach((exp) => {
    const linked = selectLinkedReimbursementsForExpense(exp.id, transactions)
    // Capped al importe del gasto para evitar excesos
    sum += Math.min(exp.amount, linked)
  })

  return Math.round(sum * 100) / 100
}

/**
 * Reembolsos recibidos en el periodo (flujo de caja de entrada).
 * Incluye cualquier ingreso con incomeKind = 'reimbursement' que entró en este mes,
 * incluso si es un reembolso histórico o de gastos de meses anteriores.
 */
export function selectReimbursementsReceived(
  transactions: Transaction[],
  referenceDate: Date = new Date(),
  scope: 'month' | 'all' = 'month'
): number {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  const sum = transactions
    .filter((t) => t.type === 'income' && t.incomeKind === 'reimbursement')
    .filter((t) => {
      if (scope === 'all') return true
      const d = new Date(t.date)
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear
    })
    .reduce((acc, t) => acc + t.amount, 0)

  return Math.round(sum * 100) / 100
}

/**
 * Gasto neto personal del periodo:
 * Para cada gasto realizado en el periodo: net = max(0, expense.amount - linkedReimbursements).
 * Suma matemática de todos los netos.
 */
export function selectNetPersonalExpensesForPeriod(
  transactions: Transaction[],
  referenceDate: Date = new Date(),
  scope: 'month' | 'all' = 'month'
): number {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  const periodExpenses = transactions.filter((t) => {
    if (t.type !== 'expense') return false
    if (scope === 'all') return true
    const d = new Date(t.date)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })

  let totalNet = 0
  periodExpenses.forEach((exp) => {
    const linked = selectLinkedReimbursementsForExpense(exp.id, transactions)
    const net = Math.max(0, Math.round((exp.amount - linked) * 100) / 100)
    totalNet += net
  })

  return Math.round(totalNet * 100) / 100
}

export const selectNetPersonalExpenses = selectNetPersonalExpensesForPeriod

/**
 * Gasto neto personal agrupado por categoría para el periodo.
 * Hereda la categoría del gasto original y nunca produce importes negativos.
 */
export function selectNetExpensesByCategory(
  transactions: Transaction[],
  categories: Category[],
  referenceDate: Date = new Date(),
  scope: 'month' | 'all' = 'month'
): NetCategoryExpense[] {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  const periodExpenses = transactions.filter((t) => {
    if (t.type !== 'expense') return false
    if (scope === 'all') return true
    const d = new Date(t.date)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })

  const netByCategory = new Map<string, number>()

  periodExpenses.forEach((exp) => {
    const catId = normalizeCategoryAlias(exp.categoryId || 'other')
    const linked = selectLinkedReimbursementsForExpense(exp.id, transactions)
    const net = Math.max(0, Math.round((exp.amount - linked) * 100) / 100)
    netByCategory.set(catId, Math.round(((netByCategory.get(catId) ?? 0) + net) * 100) / 100)
  })

  const totalNet = Array.from(netByCategory.values()).reduce((sum, v) => sum + v, 0)

  const results: NetCategoryExpense[] = []
  const processedCatIds = new Set<string>()

  categories.forEach((cat) => {
    const canonicalId = normalizeCategoryAlias(cat.id)
    const amount = netByCategory.get(canonicalId) ?? 0
    if (amount > 0 && !processedCatIds.has(canonicalId)) {
      const percentage = totalNet > 0 ? Math.round((amount / totalNet) * 100) : 0
      results.push({
        id: canonicalId,
        name: canonicalId === 'other' ? 'Otros' : cat.name,
        color: cat.color ?? '#B9B9B9',
        icon: cat.iconKey || cat.icon || 'ellipsis',
        amount,
        percentage,
      })
      processedCatIds.add(canonicalId)
    }
  })

  // Para categorías con gastos que no estuvieran explícitamente en el array categories
  netByCategory.forEach((amount, catId) => {
    if (!processedCatIds.has(catId) && amount > 0) {
      const percentage = totalNet > 0 ? Math.round((amount / totalNet) * 100) : 0
      results.push({
        id: catId,
        name: catId === 'other' ? 'Otros' : catId,
        color: '#B9B9B9',
        icon: 'ellipsis',
        amount,
        percentage,
      })
      processedCatIds.add(catId)
    }
  })

  results.sort((a, b) => b.amount - a.amount)
  return results
}

/**
 * Reparto de un gasto a partes iguales con precisión exacta de céntimos.
 * Si hay resto de división, el pagador asume la diferencia para que los contactos
 * tengan importes redondeados (o viceversa), garantizando que la suma matemática
 * de las partes coincida exactamente con el importe total.
 *
 * Ejemplo del usuario:
 * 7,49 € entre Marta (pagador), Manuela y Pepa:
 * Marta = 2,49 €, Manuela = 2,50 €, Pepa = 2,50 €. Suma = 7,49 € exactos.
 */
export function splitExpenseEqually(
  totalAmount: number,
  participants: { name: string; contactId?: string }[],
  includePayer: boolean,
  payerName = 'Tú'
): SplitResult[] {
  const cleanTotal = Math.round(Number(totalAmount) * 100) / 100
  if (cleanTotal <= 0) return []

  const totalCents = Math.round(cleanTotal * 100)
  const count = participants.length + (includePayer ? 1 : 0)
  if (count === 0) return []

  const baseCents = Math.floor(totalCents / count)
  let remainder = totalCents % count

  // Si el pagador participa y hay resto, los participantes externos reciben baseCents + 1
  // mientras haya resto, y el pagador recibe lo que quede (o baseCents),
  // reproduciendo fielmente el caso 7,49 € / 3 = Marta 2,49, Manuela 2,50, Pepa 2,50.
  const results: SplitResult[] = []

  participants.forEach((p) => {
    let cents = baseCents
    if (remainder > 0) {
      cents += 1
      remainder -= 1
    }
    results.push({
      participantName: p.name.trim(),
      contactId: p.contactId,
      isPayerShare: false,
      amount: Math.round(cents) / 100,
    })
  })

  if (includePayer) {
    let payerCents = baseCents
    if (remainder > 0) {
      payerCents += remainder
    }
    // Añadimos la parte del pagador al inicio
    results.unshift({
      participantName: payerName,
      isPayerShare: true,
      amount: Math.round(payerCents) / 100,
    })
  }

  return results
}

/**
 * Ingresos reales = suma de transacciones income que NO son reembolsos.
 */
export function selectRealIncome(
  transactions: Transaction[],
  referenceDate: Date = new Date(),
  scope: 'month' | 'all' = 'month'
): number {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  const sum = transactions
    .filter((t) => t.type === 'income' && t.incomeKind !== 'reimbursement')
    .filter((t) => {
      if (scope === 'all') return true
      const d = new Date(t.date)
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear
    })
    .reduce((acc, t) => acc + t.amount, 0)

  return Math.round(sum * 100) / 100
}

/**
 * Calcula el estado de una parte de gasto (ExpenseShare) en base a los reembolsos recibidos.
 */
export function selectExpenseShareStatus(
  share: ExpenseShare,
  transactions: Transaction[]
): {
  expectedAmount: number
  receivedAmount: number
  pendingAmount: number
  status: ExpenseShareStatus
  reimbursements: Transaction[]
} {
  const reimbursements = transactions.filter(
    (t) =>
      t.type === 'income' &&
      t.incomeKind === 'reimbursement' &&
      (t.expenseShareId === share.id ||
        (t.parentExpenseId === share.expenseTransactionId && !t.expenseShareId && !share.isPayerShare))
  )

  const receivedAmount = Math.round(reimbursements.reduce((sum, t) => sum + t.amount, 0) * 100) / 100
  const expectedAmount = Math.round(share.expectedAmount * 100) / 100
  const pendingAmount = Math.max(0, Math.round((expectedAmount - receivedAmount) * 100) / 100)

  let status: ExpenseShareStatus = 'pending'
  if (pendingAmount <= 0) {
    status = 'received'
  } else if (receivedAmount > 0) {
    status = 'partial'
  }

  return {
    expectedAmount,
    receivedAmount,
    pendingAmount,
    status,
    reimbursements,
  }
}

/**
 * Pendiente total por recuperar de todas las partes de gastos compartidos (excluyendo la cuota propia).
 */
export function selectPendingReimbursements(
  shares: ExpenseShare[],
  transactions: Transaction[]
): number {
  const externalShares = shares.filter((s) => !s.isPayerShare)
  const total = externalShares.reduce((sum, share) => {
    const { pendingAmount } = selectExpenseShareStatus(share, transactions)
    return sum + pendingAmount
  }, 0)

  return Math.round(total * 100) / 100
}

/**
 * Detalle completo de un gasto compartido.
 */
export function selectExpenseShareDetails(
  expenseTransactionId: string,
  transactions: Transaction[],
  shares: ExpenseShare[]
) {
  const expenseTx = transactions.find((t) => t.id === expenseTransactionId)
  const expenseShares = shares.filter((s) => s.expenseTransactionId === expenseTransactionId)

  const payerShare = expenseShares.find((s) => s.isPayerShare)
  const externalShares = expenseShares.filter((s) => !s.isPayerShare)

  const externalSharesWithStatus = externalShares.map((s) => ({
    share: s,
    ...selectExpenseShareStatus(s, transactions),
  }))

  const totalExpected = Math.round(expenseShares.reduce((acc, s) => acc + s.expectedAmount, 0) * 100) / 100
  const totalRecovered = Math.round(
    externalSharesWithStatus.reduce((acc, s) => acc + s.receivedAmount, 0) * 100
  ) / 100
  const totalPendingToRecover = Math.round(
    externalSharesWithStatus.reduce((acc, s) => acc + s.pendingAmount, 0) * 100
  ) / 100

  return {
    expenseTx,
    payerShare,
    externalSharesWithStatus,
    totalExpected,
    totalRecovered,
    totalPendingToRecover,
    isFullyReimbursed: totalPendingToRecover <= 0,
  }
}

/**
 * Lista agrupada de deudores con saldo pendiente para selector rápido.
 */
export function selectPendingDebtors(
  shares: ExpenseShare[],
  transactions: Transaction[]
) {
  const map = new Map<string, {
    contactId?: string
    name: string
    totalPending: number
    pendingShares: {
      share: ExpenseShare
      pendingAmount: number
      expenseDescription: string
      expenseDate: string
    }[]
  }>()

  const externalShares = shares.filter((s) => !s.isPayerShare)

  externalShares.forEach((s) => {
    const { pendingAmount } = selectExpenseShareStatus(s, transactions)
    if (pendingAmount > 0) {
      const key = s.contactId || s.participantName.toLowerCase().trim()
      const tx = transactions.find((t) => t.id === s.expenseTransactionId)
      const existing = map.get(key) ?? {
        contactId: s.contactId,
        name: s.participantName,
        totalPending: 0,
        pendingShares: [],
      }

      existing.totalPending = Math.round((existing.totalPending + pendingAmount) * 100) / 100
      existing.pendingShares.push({
        share: s,
        pendingAmount,
        expenseDescription: tx?.description || 'Gasto compartido',
        expenseDate: tx?.date || s.createdAt || new Date().toISOString(),
      })
      map.set(key, existing)
    }
  })

  return Array.from(map.values()).sort((a, b) => b.totalPending - a.totalPending)
}

export const selectPendingReimbursementsByContact = selectPendingDebtors

/**
 * Lista de cuotas externas ya cobradas / recuperadas en su totalidad.
 */
export function selectSettledReimbursements(
  shares: ExpenseShare[],
  transactions: Transaction[]
) {
  const externalShares = shares.filter((s) => !s.isPayerShare)
  const settledList: {
    share: ExpenseShare
    participantName: string
    amount: number
    expenseDescription: string
    settledDate: string
  }[] = []

  externalShares.forEach((s) => {
    const status = selectExpenseShareStatus(s, transactions)
    if (status.status === 'received') {
      const tx = transactions.find((t) => t.id === s.expenseTransactionId)
      const lastReimb = status.reimbursements[status.reimbursements.length - 1]
      settledList.push({
        share: s,
        participantName: s.participantName,
        amount: s.expectedAmount,
        expenseDescription: tx?.description || 'Gasto compartido',
        settledDate: lastReimb?.date || tx?.date || s.createdAt || new Date().toISOString(),
      })
    }
  })

  return settledList.sort((a, b) => new Date(b.settledDate).getTime() - new Date(a.settledDate).getTime())
}

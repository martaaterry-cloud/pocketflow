import type { Category, ExpenseShare, ExpenseShareStatus, Transaction, CashTransaction } from '../models/finance'
import { normalizeCategoryAlias } from './categoryNormalization'

export interface SplitResult {
  participantName: string
  contactId?: string
  isPayerShare: boolean
  isUserShare?: boolean
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
 * Reembolsos vinculados a un gasto concreto (por parentExpenseId / bankTransactionId),
 * sumando tanto reembolsos bancarios (Bizum) como reembolsos recibidos en efectivo.
 *
 * Si se dispone de las partes (ExpenseShare):
 * - Suma únicamente el appliedAmount de las partes de terceros (min(expected, received)).
 * - El extra recibido por sobrepago de un tercero NUNCA reduce el gasto propio del usuario.
 */
export function selectLinkedReimbursementsForExpense(
  expenseId: string,
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = [],
  expenseShares: ExpenseShare[] = []
): number {
  const bankExpense = transactions.find((t) => t.id === expenseId)
  if (bankExpense && bankExpense.specialType === 'cash_withdrawal') {
    return 0
  }

  // 1. Si disponemos de las cuotas de reparto de este gasto
  const sharesForExpense = (expenseShares || []).filter((s) => s.expenseTransactionId === expenseId)
  const otherShares = sharesForExpense.filter(
    (s) => !s.isPayerShare && !s.isUserShare && s.participantName.toLowerCase() !== 'tú'
  )

  if (otherShares.length > 0) {
    let totalApplied = 0
    otherShares.forEach((share) => {
      const { appliedAmount } = selectExpenseShareStatus(share, transactions, cashTransactions)
      totalApplied += appliedAmount
    })
    return Math.round(totalApplied * 100) / 100
  }

  // 2. Fallback para gastos antiguos sin registro explícito en expenseShares
  const bankReimbursements = transactions.filter(
    (t) => t.type === 'income' && t.incomeKind === 'reimbursement' && t.parentExpenseId === expenseId
  )
  const cashReimbursements = cashTransactions.filter(
    (c) => c.type === 'income' && c.bankTransactionId === expenseId
  )
  const rawSum =
    bankReimbursements.reduce((acc, t) => acc + t.amount, 0) +
    cashReimbursements.reduce((acc, c) => acc + c.amount, 0)

  const expenseAmount = bankExpense?.amount ?? rawSum
  return Math.round(Math.min(expenseAmount, rawSum) * 100) / 100
}

/**
 * Gasto bruto del periodo = suma de todos los gastos (expense) realizados en el periodo.
 * Si un gasto compartido fue pagado por otra persona (paidBy === 'contact'), no cuenta como desembolso bancario inicial del usuario.
 */
export function selectGrossExpensesForPeriod(
  transactions: Transaction[],
  referenceDate: Date = new Date(),
  scope: 'month' | 'all' = 'month'
): number {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  const sum = transactions
    .filter((t) => t.type === 'expense' && (!t.isShared || t.paidBy !== 'contact'))
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
 * independientemente de la fecha en que se recibió el Bizum o efectivo.
 */
export function selectLinkedReimbursementsForPeriod(
  transactions: Transaction[],
  referenceDate: Date = new Date(),
  scope: 'month' | 'all' = 'month',
  cashTransactions: CashTransaction[] = [],
  expenseShares: ExpenseShare[] = []
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
    const linked = selectLinkedReimbursementsForExpense(exp.id, transactions, cashTransactions, expenseShares)
    sum += Math.min(exp.amount, linked)
  })

  return Math.round(sum * 100) / 100
}

/**
 * Reembolsos recibidos en el periodo (flujo de caja de entrada total, banco + efectivo).
 * Incluye cualquier ingreso de reembolso que entró en este mes.
 */
export function selectReimbursementsReceived(
  transactions: Transaction[],
  referenceDate: Date = new Date(),
  scope: 'month' | 'all' = 'month',
  cashTransactions: CashTransaction[] = []
): number {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  const bankSum = transactions
    .filter((t) => t.type === 'income' && t.incomeKind === 'reimbursement')
    .filter((t) => {
      if (scope === 'all') return true
      const d = new Date(t.date)
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear
    })
    .reduce((acc, t) => acc + t.amount, 0)

  const withdrawalTxIds = new Set(
    transactions.filter((t) => t.specialType === 'cash_withdrawal').map((t) => t.id)
  )

  const cashSum = cashTransactions
    .filter(
      (c) =>
        c.type === 'income' &&
        Boolean(c.bankTransactionId) &&
        !withdrawalTxIds.has(c.bankTransactionId as string)
    )
    .filter((c) => {
      if (scope === 'all') return true
      const d = new Date(c.date)
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear
    })
    .reduce((acc, c) => acc + c.amount, 0)

  return Math.round((bankSum + cashSum) * 100) / 100
}

/**
 * Gasto neto personal del periodo:
 * Para cada gasto realizado en el periodo: net = max(0, expense.amount - linkedReimbursements).
 * Suma matemática de todos los netos.
 */
export function selectNetPersonalExpensesForPeriod(
  transactions: Transaction[],
  referenceDate: Date = new Date(),
  scope: 'month' | 'all' = 'month',
  cashTransactions: CashTransaction[] = [],
  expenseShares: ExpenseShare[] = []
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
    const linked = selectLinkedReimbursementsForExpense(exp.id, transactions, cashTransactions, expenseShares)
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
  scope: 'month' | 'all' = 'month',
  cashTransactions: CashTransaction[] = [],
  expenseShares: ExpenseShare[] = []
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
    const linked = selectLinkedReimbursementsForExpense(exp.id, transactions, cashTransactions, expenseShares)
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
 * Soporta tanto "Yo pagué" (paidBy === 'user') como "Pagó otra persona" (paidBy === 'contact').
 */
export function splitExpenseEqually(
  totalAmount: number,
  participants: { name: string; contactId?: string }[],
  includeSelf: boolean,
  payerName = 'Tú',
  paidBy: 'user' | 'contact' = 'user',
  actualPayerName = 'Contacto',
  actualPayerContactId?: string
): SplitResult[] {
  const cleanTotal = Math.round(Number(totalAmount) * 100) / 100
  if (cleanTotal <= 0) return []

  const totalCents = Math.round(cleanTotal * 100)
  const isUserPayer = paidBy !== 'contact'

  // Si el usuario pagó (comportamiento canónico original):
  if (isUserPayer) {
    const count = participants.length + (includeSelf ? 1 : 0)
    if (count === 0) return []

    const baseCents = Math.floor(totalCents / count)
    let remainder = totalCents % count

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
        isUserShare: false,
        amount: Math.round(cents) / 100,
      })
    })

    if (includeSelf) {
      let payerCents = baseCents
      if (remainder > 0) {
        payerCents += remainder
      }
      results.unshift({
        participantName: payerName,
        isPayerShare: true,
        isUserShare: false,
        amount: Math.round(payerCents) / 100,
      })
    }

    return results
  }

  // Si pagó otra persona (paidBy === 'contact'):
  const effectivePayerName = actualPayerName.trim() || 'Contacto'
  const filteredOthers = participants.filter(
    (p) =>
      p.name.trim().toLowerCase() !== effectivePayerName.toLowerCase() &&
      p.name.trim().toLowerCase() !== 'tú'
  )

  const count = 1 + (includeSelf ? 1 : 0) + filteredOthers.length
  if (count === 0) return []

  const baseCents = Math.floor(totalCents / count)
  let remainder = totalCents % count

  const results: SplitResult[] = []

  // Cuota del usuario ('Tú')
  if (includeSelf) {
    results.push({
      participantName: 'Tú',
      isPayerShare: false,
      isUserShare: true,
      amount: Math.round(baseCents) / 100,
    })
  }

  // Otros participantes
  filteredOthers.forEach((p) => {
    results.push({
      participantName: p.name.trim(),
      contactId: p.contactId,
      isPayerShare: false,
      isUserShare: false,
      amount: Math.round(baseCents) / 100,
    })
  })

  // Cuota del pagador externo (asume el resto de la división para cuadre total exacto)
  let payerCents = baseCents
  if (remainder > 0) {
    payerCents += remainder
  }
  results.unshift({
    participantName: effectivePayerName,
    contactId: actualPayerContactId,
    isPayerShare: true,
    isUserShare: false,
    amount: Math.round(payerCents) / 100,
  })

  return results
}

export type SplitMode = 'equal' | 'custom'

export interface CustomParticipantInput {
  name: string
  contactId?: string
  amount: number
  isPayerShare?: boolean
  isUserShare?: boolean
}

export interface CustomSplitCalculation {
  isValid: boolean
  totalCents: number
  assignedCents: number
  remainingCents: number
  remainingAmount: number
  errorMessage?: string
  shares: SplitResult[]
}

/**
 * Calcula y valida un reparto personalizado de gasto compartido.
 * Trabaja en céntimos enteros para evitar problemas de precisión flotante.
 */
export function calculateCustomSplit(
  totalExpenseAmount: number,
  participants: CustomParticipantInput[],
  paidBy: 'user' | 'contact' = 'user',
  actualPayerName = 'Contacto',
  actualPayerContactId?: string
): CustomSplitCalculation {
  const cleanTotal = Math.round(Number(totalExpenseAmount) * 100) / 100
  const totalCents = Math.round(cleanTotal * 100)

  let assignedCents = 0
  const shares: SplitResult[] = []

  participants.forEach((p) => {
    const pCents = Math.round((Number(p.amount) || 0) * 100)
    assignedCents += pCents

    shares.push({
      participantName: p.name.trim(),
      contactId: p.contactId,
      isPayerShare: Boolean(p.isPayerShare),
      isUserShare: Boolean(p.isUserShare),
      amount: Math.round(pCents) / 100,
    })
  })

  const remainingCents = totalCents - assignedCents
  const remainingAmount = Math.round(remainingCents) / 100

  let errorMessage: string | undefined
  if (remainingCents > 0) {
    errorMessage = `Faltan ${remainingAmount.toFixed(2).replace('.', ',')} € por asignar.`
  } else if (remainingCents < 0) {
    errorMessage = `Has asignado ${(Math.abs(remainingAmount)).toFixed(2).replace('.', ',')} € de más.`
  }

  return {
    isValid: remainingCents === 0 && participants.length > 0 && totalCents > 0,
    totalCents,
    assignedCents,
    remainingCents,
    remainingAmount,
    errorMessage,
    shares,
  }
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
 * Calcula el estado de una parte de gasto (ExpenseShare) en base a los reembolsos recibidos (banco o efectivo)
 * y a los importes perdonados/ajustados explícitos.
 */
export function selectExpenseShareStatus(
  share: ExpenseShare,
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = []
): {
  expectedAmount: number
  receivedAmount: number
  appliedAmount: number
  extraAmount: number
  forgivenAmount: number
  pendingAmount: number
  status: ExpenseShareStatus
  reimbursements: (Transaction | CashTransaction)[]
} {
  const bankReimbursements = transactions.filter(
    (t) =>
      t.type === 'income' &&
      t.incomeKind === 'reimbursement' &&
      (t.expenseShareId === share.id ||
        (t.parentExpenseId === share.expenseTransactionId && !t.expenseShareId && !share.isPayerShare))
  )

  const cashReimbursements = cashTransactions.filter(
    (c) =>
      c.type === 'income' &&
      c.bankTransactionId === share.expenseTransactionId &&
      (!c.note?.includes('[share:') || c.note.includes(`[share:${share.id}]`))
  )

  const allReimbursements: (Transaction | CashTransaction)[] = [...bankReimbursements, ...cashReimbursements]
  const receivedAmount = Math.round(allReimbursements.reduce((sum, t) => sum + t.amount, 0) * 100) / 100
  const expectedAmount = Math.round(share.expectedAmount * 100) / 100
  const appliedAmount = Math.min(expectedAmount, receivedAmount)
  const extraAmount = Math.max(0, Math.round((receivedAmount - expectedAmount) * 100) / 100)
  const forgivenAmount = Math.max(0, Math.round((share.forgivenAmount ?? 0) * 100) / 100)
  const pendingAmount = Math.max(0, Math.round((expectedAmount - appliedAmount - forgivenAmount) * 100) / 100)

  let status: ExpenseShareStatus = 'pending'
  if (pendingAmount <= 0) {
    status = 'received'
  } else if (receivedAmount > 0 || forgivenAmount > 0) {
    status = 'partial'
  }

  return {
    expectedAmount,
    receivedAmount,
    appliedAmount,
    extraAmount,
    forgivenAmount,
    pendingAmount,
    status,
    reimbursements: allReimbursements,
  }
}

/**
 * Calcula el estado de una parte por pagar del usuario ante un acreedor (quien pagó el gasto).
 * Descuenta los pagos reales efectuados por el usuario hacia dicho gasto o cuota y los importes perdonados/ajustados.
 * Si el usuario paga más del importe debido (sobrepago), salda la deuda a 0 € sin generar deudas negativas ni inversas.
 */
export function selectExpensePayableStatus(
  share: ExpenseShare,
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = []
): {
  expectedAmount: number
  paidAmount: number
  appliedAmount: number
  forgivenAmount: number
  pendingAmount: number
  status: 'pending' | 'partial' | 'settled'
  payments: (Transaction | CashTransaction)[]
} {
  // Transacciones bancarias de pago al acreedor vinculadas a la cuota o al gasto origen
  const bankPayments = transactions.filter(
    (t) =>
      t.type === 'expense' &&
      (t.expenseShareId === share.id ||
        (t.parentExpenseId === share.expenseTransactionId && !t.isShared))
  )

  // Transacciones de efectivo de pago al acreedor
  const cashPayments = cashTransactions.filter(
    (c) =>
      c.type === 'expense' &&
      (c.bankTransactionId === share.expenseTransactionId &&
        (!c.note?.includes('[share:') || c.note.includes(`[share:${share.id}]`)))
  )

  const allPayments = [...bankPayments, ...cashPayments]
  const paidAmount = Math.round(allPayments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100
  const expectedAmount = Math.round(share.expectedAmount * 100) / 100
  const appliedAmount = Math.min(expectedAmount, paidAmount)
  const forgivenAmount = Math.max(0, Math.round((share.forgivenAmount ?? 0) * 100) / 100)
  const pendingAmount = Math.max(0, Math.round((expectedAmount - appliedAmount - forgivenAmount) * 100) / 100)

  let status: 'pending' | 'partial' | 'settled' = 'pending'
  if (pendingAmount <= 0) {
    status = 'settled'
  } else if (paidAmount > 0 || forgivenAmount > 0) {
    status = 'partial'
  }

  return {
    expectedAmount,
    paidAmount,
    appliedAmount,
    forgivenAmount,
    pendingAmount,
    status,
    payments: allPayments,
  }
}

/**
 * Detecta cuotas compartidas (ExpenseShare) huérfanas cuyo gasto origen
 * no existe ni en transacciones bancarias ni en transacciones de efectivo.
 */
export function selectOrphanExpenseShares(
  expenseShares: ExpenseShare[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = []
): ExpenseShare[] {
  const txIds = new Set(transactions.map((t) => t.id))
  const cashIds = new Set(cashTransactions.map((c) => c.id))
  return expenseShares.filter(
    (s) => !txIds.has(s.expenseTransactionId) && !cashIds.has(s.expenseTransactionId)
  )
}

/**
 * Pendiente total por recuperar de todas las partes de gastos compartidos ("Por cobrar").
 */
export function selectPendingReimbursements(
  shares: ExpenseShare[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = []
): number {
  const debtors = selectPendingDebtors(shares, transactions, cashTransactions)
  const total = debtors.reduce((sum, d) => sum + d.totalPending, 0)
  return Math.round(total * 100) / 100
}

/**
 * Detalle completo de un gasto compartido (banco o efectivo).
 */
export function selectExpenseShareDetails(
  expenseTransactionId: string,
  transactions: Transaction[] = [],
  shares: ExpenseShare[] = [],
  cashTransactions: CashTransaction[] = []
) {
  const expenseTx =
    transactions.find((t) => t.id === expenseTransactionId) ||
    cashTransactions.find((c) => c.id === expenseTransactionId)
  const expenseShares = shares.filter((s) => s.expenseTransactionId === expenseTransactionId)

  const isContactPaid = expenseTx?.paidBy === 'contact'
  const payerShare = expenseShares.find((s) => s.isPayerShare)
  const externalShares = expenseShares.filter((s) => !s.isPayerShare)

  const externalSharesWithStatus = externalShares.map((s) => ({
    share: s,
    ...selectExpenseShareStatus(s, transactions, cashTransactions),
  }))

  const userShare = expenseShares.find(
    (s) => s.isUserShare || s.participantName.toLowerCase() === 'tú' || (!s.isPayerShare && !s.contactId)
  )
  const userPayableStatus = userShare
    ? selectExpensePayableStatus(userShare, transactions, cashTransactions)
    : null

  const totalExpected = Math.round(expenseShares.reduce((acc, s) => acc + s.expectedAmount, 0) * 100) / 100
  const totalRecovered = Math.round(
    externalSharesWithStatus.reduce((acc, s) => acc + s.appliedAmount, 0) * 100
  ) / 100
  const totalForgiven = Math.round(
    externalSharesWithStatus.reduce((acc, s) => acc + s.forgivenAmount, 0) * 100
  ) / 100
  const totalPendingToRecover = Math.round(
    externalSharesWithStatus.reduce((acc, s) => acc + s.pendingAmount, 0) * 100
  ) / 100

  return {
    expenseTx,
    isContactPaid,
    payerShare,
    externalSharesWithStatus,
    userShare,
    userPayableStatus,
    totalExpected,
    totalRecovered,
    totalForgiven,
    totalPendingToRecover,
    isFullyReimbursed: totalPendingToRecover <= 0,
  }
}

/**
 * Lista agrupada de deudores con saldo pendiente para selector rápido ("Por cobrar").
 */
export function selectPendingDebtors(
  shares: ExpenseShare[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = []
) {
  const map = new Map<string, {
    contactId?: string
    name: string
    totalPending: number
    pendingShares: {
      share: ExpenseShare
      expectedAmount: number
      appliedAmount: number
      forgivenAmount: number
      pendingAmount: number
      expenseDescription: string
      expenseDate: string
    }[]
  }>()

  shares.forEach((s) => {
    const tx =
      transactions.find((t) => t.id === s.expenseTransactionId) ||
      cashTransactions.find((c) => c.id === s.expenseTransactionId)
    if (!tx) return // Defensa: ignorar cuota cuyo gasto origen no existe

    // Si el gasto lo pagó un tercero, los demás no le deben al usuario
    if (tx.paidBy === 'contact') return

    // La cuota del propio usuario o pagador no es una deuda por cobrar
    if (s.isPayerShare || s.isUserShare || s.participantName.toLowerCase() === 'tú') return

    const { expectedAmount, appliedAmount, forgivenAmount, pendingAmount } = selectExpenseShareStatus(s, transactions, cashTransactions)
    if (pendingAmount > 0) {
      const key = s.contactId || s.participantName.toLowerCase().trim()
      const existing = map.get(key) ?? {
        contactId: s.contactId,
        name: s.participantName,
        totalPending: 0,
        pendingShares: [],
      }

      existing.totalPending = Math.round((existing.totalPending + pendingAmount) * 100) / 100
      existing.pendingShares.push({
        share: s,
        expectedAmount,
        appliedAmount,
        forgivenAmount,
        pendingAmount,
        expenseDescription: tx.description || 'Gasto compartido',
        expenseDate: tx.date || s.createdAt || new Date().toISOString(),
      })
      map.set(key, existing)
    }
  })

  return Array.from(map.values()).sort((a, b) => b.totalPending - a.totalPending)
}

export const selectPendingReimbursementsByContact = selectPendingDebtors

/**
 * Lista agrupada de deudas que el usuario tiene pendientes de pagar a otras personas ("Por pagar").
 */
export function selectPendingPayables(
  shares: ExpenseShare[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = []
): {
  creditorContactId?: string
  creditorName: string
  totalPending: number
  pendingShares: {
    share: ExpenseShare
    expectedAmount: number
    appliedAmount: number
    forgivenAmount: number
    pendingAmount: number
    expenseDescription: string
    expenseDate: string
  }[]
}[] {
  const map = new Map<string, {
    creditorContactId?: string
    creditorName: string
    totalPending: number
    pendingShares: {
      share: ExpenseShare
      expectedAmount: number
      appliedAmount: number
      forgivenAmount: number
      pendingAmount: number
      expenseDescription: string
      expenseDate: string
    }[]
  }>()

  shares.forEach((s) => {
    const parentTx =
      transactions.find((t) => t.id === s.expenseTransactionId) ||
      cashTransactions.find((c) => c.id === s.expenseTransactionId)
    if (!parentTx) return

    // Solo cuotas de gastos pagados por un tercero (paidBy === 'contact') que correspondan a la parte del usuario
    const isContactPaid = parentTx.paidBy === 'contact'
    const isUserShare = Boolean(s.isUserShare) || s.participantName.toLowerCase() === 'tú' || (!s.isPayerShare && !s.contactId)
    if (!isContactPaid || !isUserShare) return

    const { expectedAmount, appliedAmount, forgivenAmount, pendingAmount } = selectExpensePayableStatus(s, transactions, cashTransactions)
    if (pendingAmount > 0) {
      const creditorName = parentTx.payerName || 'Contacto'
      const creditorKey = parentTx.payerContactId || creditorName.toLowerCase().trim()

      const existing = map.get(creditorKey) ?? {
        creditorContactId: parentTx.payerContactId,
        creditorName,
        totalPending: 0,
        pendingShares: [],
      }

      existing.totalPending = Math.round((existing.totalPending + pendingAmount) * 100) / 100
      existing.pendingShares.push({
        share: s,
        expectedAmount,
        appliedAmount,
        forgivenAmount,
        pendingAmount,
        expenseDescription: parentTx.description || 'Gasto compartido',
        expenseDate: parentTx.date || s.createdAt || new Date().toISOString(),
      })
      map.set(creditorKey, existing)
    }
  })

  return Array.from(map.values()).sort((a, b) => b.totalPending - a.totalPending)
}

/**
 * Total de deudas pendientes por pagar del usuario.
 */
export function selectTotalPendingPayables(
  shares: ExpenseShare[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = []
): number {
  const payables = selectPendingPayables(shares, transactions, cashTransactions)
  const total = payables.reduce((acc, p) => acc + p.totalPending, 0)
  return Math.round(total * 100) / 100
}

/**
 * Lista de cuotas externas ya cobradas / recuperadas en su totalidad ("Por cobrar" cobrado).
 */
export function selectSettledReimbursements(
  shares: ExpenseShare[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = []
) {
  const settledList: {
    share: ExpenseShare
    participantName: string
    expectedAmount: number
    appliedAmount: number
    forgivenAmount: number
    amount: number
    expenseDescription: string
    settledDate: string
  }[] = []

  shares.forEach((s) => {
    const tx =
      transactions.find((t) => t.id === s.expenseTransactionId) ||
      cashTransactions.find((c) => c.id === s.expenseTransactionId)
    if (!tx) return // Defensa: ignorar cuota cuyo gasto origen no existe
    if (tx.paidBy === 'contact') return
    if (s.isPayerShare || s.isUserShare || s.participantName.toLowerCase() === 'tú') return

    const status = selectExpenseShareStatus(s, transactions, cashTransactions)
    if (status.status === 'received') {
      const lastReimb = status.reimbursements[status.reimbursements.length - 1]
      settledList.push({
        share: s,
        participantName: s.participantName,
        expectedAmount: status.expectedAmount,
        appliedAmount: status.appliedAmount,
        forgivenAmount: status.forgivenAmount,
        amount: status.expectedAmount,
        expenseDescription: tx.description || 'Gasto compartido',
        settledDate: lastReimb?.date || tx.date || s.createdAt || new Date().toISOString(),
      })
    }
  })

  return settledList.sort((a, b) => new Date(b.settledDate).getTime() - new Date(a.settledDate).getTime())
}

/**
 * Lista de deudas propias ya liquidadas / pagadas en su totalidad al acreedor ("Por pagar" pagado).
 */
export function selectSettledPayables(
  shares: ExpenseShare[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = []
) {
  const settledList: {
    share: ExpenseShare
    creditorName: string
    expectedAmount: number
    appliedAmount: number
    forgivenAmount: number
    amount: number
    expenseDescription: string
    settledDate: string
  }[] = []

  shares.forEach((s) => {
    const parentTx =
      transactions.find((t) => t.id === s.expenseTransactionId) ||
      cashTransactions.find((c) => c.id === s.expenseTransactionId)
    if (!parentTx) return

    const isContactPaid = parentTx.paidBy === 'contact'
    const isUserShare = Boolean(s.isUserShare) || s.participantName.toLowerCase() === 'tú' || (!s.isPayerShare && !s.contactId)
    if (!isContactPaid || !isUserShare) return

    const status = selectExpensePayableStatus(s, transactions, cashTransactions)
    if (status.status === 'settled') {
      const lastPayment = status.payments[status.payments.length - 1]
      settledList.push({
        share: s,
        creditorName: parentTx.payerName || 'Contacto',
        expectedAmount: status.expectedAmount,
        appliedAmount: status.appliedAmount,
        forgivenAmount: status.forgivenAmount,
        amount: status.expectedAmount,
        expenseDescription: parentTx.description || 'Gasto compartido',
        settledDate: lastPayment?.date || parentTx.date || s.createdAt || new Date().toISOString(),
      })
    }
  })

  return settledList.sort((a, b) => new Date(b.settledDate).getTime() - new Date(a.settledDate).getTime())
}

/**
 * Gasto neto personal de efectivo del periodo:
 * Para cada gasto de efectivo (expense) realizado en el periodo:
 * net = max(0, expense.amount - linkedReimbursements).
 */
export function selectNetCashExpensesForPeriod(
  cashTransactions: CashTransaction[] = [],
  transactions: Transaction[] = [],
  referenceDate: Date = new Date(),
  scope: 'month' | 'all' = 'month',
  expenseShares: ExpenseShare[] = []
): number {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  const periodExpenses = cashTransactions.filter((c) => {
    if (c.type !== 'expense') return false
    if (scope === 'all') return true
    const d = new Date(c.date)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })

  let totalNet = 0
  periodExpenses.forEach((exp) => {
    const linked = selectLinkedReimbursementsForExpense(exp.id, transactions, cashTransactions, expenseShares)
    const net = Math.max(0, Math.round((exp.amount - linked) * 100) / 100)
    totalNet += net
  })

  return Math.round(totalNet * 100) / 100
}

export const selectNetCashExpenses = selectNetCashExpensesForPeriod

/**
 * Gasto neto de efectivo agrupado por categoría para el periodo.
 */
export function selectNetCashExpensesByCategory(
  cashTransactions: CashTransaction[] = [],
  transactions: Transaction[] = [],
  categories: Category[] = [],
  referenceDate: Date = new Date(),
  scope: 'month' | 'all' = 'month',
  expenseShares: ExpenseShare[] = []
): NetCategoryExpense[] {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  const periodExpenses = cashTransactions.filter((c) => {
    if (c.type !== 'expense') return false
    if (scope === 'all') return true
    const d = new Date(c.date)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })

  const netByCategory = new Map<string, number>()

  periodExpenses.forEach((exp) => {
    const catId = normalizeCategoryAlias(exp.categoryId || 'other')
    const linked = selectLinkedReimbursementsForExpense(exp.id, transactions, cashTransactions, expenseShares)
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

export interface DayNetStats {
  netExpenses: number
  grossExpenses: number
  realIncome: number
  reimbursements: number
  netBalance: number
}

/**
 * Calcula estadísticas financieras netas de un día específico,
 * descontando reembolsos vinculados de cada gasto del día y excluyendo transferencias.
 */
export function selectDayNetFinanceStats(
  transactions: Transaction[],
  year: number,
  month: number,
  day: number,
  cashTransactions: CashTransaction[] = [],
  expenseShares: ExpenseShare[] = []
): DayNetStats {
  const withdrawalTxIds = new Set(
    transactions.filter((t) => t.specialType === 'cash_withdrawal').map((t) => t.id)
  )
  const linkedBankWithdrawalIds = new Set(
    cashTransactions
      .filter((c) => c.type === 'income' && Boolean(c.bankTransactionId) && withdrawalTxIds.has(c.bankTransactionId as string))
      .map((c) => c.bankTransactionId as string)
  )

  let grossExpenses = 0
  let netExpenses = 0
  let realIncome = 0
  let reimbursements = 0

  transactions.forEach((t) => {
    const d = new Date(t.date)
    if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
      if (t.type === 'expense') {
        // Si es una retirada de cajero vinculada o un gasto pagado por un contacto, no computa como desembolso
        if (linkedBankWithdrawalIds.has(t.id) || (t.isShared && t.paidBy === 'contact')) {
          return
        }
        grossExpenses += t.amount
        const linked = selectLinkedReimbursementsForExpense(t.id, transactions, cashTransactions, expenseShares)
        const net = Math.max(0, Math.round((t.amount - linked) * 100) / 100)
        netExpenses += net
      } else if (t.type === 'income') {
        if (t.incomeKind === 'reimbursement') {
          reimbursements += t.amount
        } else {
          realIncome += t.amount
        }
      }
    }
  })

  // Movimientos de efectivo en este día
  cashTransactions.forEach((c) => {
    const d = new Date(c.date)
    if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
      if (c.type === 'expense') {
        if (c.isShared && c.paidBy === 'contact') {
          return
        }
        grossExpenses += c.amount
        const linked = selectLinkedReimbursementsForExpense(c.id, transactions, cashTransactions, expenseShares)
        const net = Math.max(0, Math.round((c.amount - linked) * 100) / 100)
        netExpenses += net
      } else if (c.type === 'income') {
        if (Boolean(c.bankTransactionId)) {
          if (!withdrawalTxIds.has(c.bankTransactionId as string)) {
            // Reembolso recibido en efectivo
            reimbursements += c.amount
          }
        } else {
          // Ingreso directo en efectivo
          realIncome += c.amount
        }
      }
      // 'adjustment' no se suma a gastos ni ingresos
    }
  })

  grossExpenses = Math.round(grossExpenses * 100) / 100
  netExpenses = Math.round(netExpenses * 100) / 100
  realIncome = Math.round(realIncome * 100) / 100
  reimbursements = Math.round(reimbursements * 100) / 100
  const netBalance = Math.round((realIncome - netExpenses) * 100) / 100

  return {
    netExpenses,
    grossExpenses,
    realIncome,
    reimbursements,
    netBalance,
  }
}

/**
 * Genera el mapa diario de estadísticas netas para cada día del mes.
 */
export function selectMonthDailyNetStats(
  transactions: Transaction[],
  year: number,
  month: number,
  cashTransactions: CashTransaction[] = [],
  expenseShares: ExpenseShare[] = []
): Map<number, DayNetStats> {
  const map = new Map<number, DayNetStats>()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const withdrawalTxIds = new Set(
    transactions.filter((t) => t.specialType === 'cash_withdrawal').map((t) => t.id)
  )
  const linkedBankWithdrawalIds = new Set(
    cashTransactions
      .filter((c) => c.type === 'income' && Boolean(c.bankTransactionId) && withdrawalTxIds.has(c.bankTransactionId as string))
      .map((c) => c.bankTransactionId as string)
  )

  const txsByDay = new Map<number, Transaction[]>()
  transactions.forEach((t) => {
    const d = new Date(t.date)
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate()
      const list = txsByDay.get(day) ?? []
      list.push(t)
      txsByDay.set(day, list)
    }
  })

  const cashByDay = new Map<number, CashTransaction[]>()
  cashTransactions.forEach((c) => {
    const d = new Date(c.date)
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate()
      const list = cashByDay.get(day) ?? []
      list.push(c)
      cashByDay.set(day, list)
    }
  })

  for (let day = 1; day <= daysInMonth; day++) {
    const dayTxs = txsByDay.get(day) ?? []
    const dayCash = cashByDay.get(day) ?? []
    let grossExpenses = 0
    let netExpenses = 0
    let realIncome = 0
    let reimbursements = 0

    dayTxs.forEach((t) => {
      if (t.type === 'expense') {
        if (linkedBankWithdrawalIds.has(t.id) || (t.isShared && t.paidBy === 'contact')) {
          return
        }
        grossExpenses += t.amount
        const linked = selectLinkedReimbursementsForExpense(t.id, transactions, cashTransactions, expenseShares)
        const net = Math.max(0, Math.round((t.amount - linked) * 100) / 100)
        netExpenses += net
      } else if (t.type === 'income') {
        if (t.incomeKind === 'reimbursement') {
          reimbursements += t.amount
        } else {
          realIncome += t.amount
        }
      }
    })

    dayCash.forEach((c) => {
      if (c.type === 'expense') {
        if (c.isShared && c.paidBy === 'contact') {
          return
        }
        grossExpenses += c.amount
        const linked = selectLinkedReimbursementsForExpense(c.id, transactions, cashTransactions, expenseShares)
        const net = Math.max(0, Math.round((c.amount - linked) * 100) / 100)
        netExpenses += net
      } else if (c.type === 'income') {
        if (Boolean(c.bankTransactionId)) {
          if (!withdrawalTxIds.has(c.bankTransactionId as string)) {
            reimbursements += c.amount
          }
        } else {
          realIncome += c.amount
        }
      }
    })

    if (grossExpenses > 0 || realIncome > 0 || reimbursements > 0) {
      grossExpenses = Math.round(grossExpenses * 100) / 100
      netExpenses = Math.round(netExpenses * 100) / 100
      realIncome = Math.round(realIncome * 100) / 100
      reimbursements = Math.round(reimbursements * 100) / 100
      const netBalance = Math.round((realIncome - netExpenses) * 100) / 100

      map.set(day, {
        netExpenses,
        grossExpenses,
        realIncome,
        reimbursements,
        netBalance,
      })
    }
  }

  return map
}


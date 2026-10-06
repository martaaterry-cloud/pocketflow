import type { AttachmentMetadata, CashTransaction, Category, ExpenseShare, Transaction } from '../models/finance'
import { normalizeCategoryAlias } from './categoryNormalization'

export type MovementSource = 'bank' | 'cash'
export type UnifiedMovementType = 'expense' | 'income' | 'transfer' | 'adjustment'

export interface UnifiedMovement {
  id: string
  source: MovementSource
  type: UnifiedMovementType
  amount: number
  date: string
  description: string
  categoryId?: string
  note?: string
  accountId?: string
  toAccountId?: string
  incomeKind?: string
  expenseNature?: string
  giftRecipient?: string
  isShared?: boolean
  paidBy?: 'user' | 'contact'
  payerName?: string
  payerContactId?: string
  userShareAmount?: number
  paymentMethod?: 'bank' | 'bizum' | 'cash'
  isCashWithdrawal: boolean
  isLinkedCashWithdrawal: boolean
  isReimbursement: boolean
  isAdjustment: boolean
  bankTransactionId?: string
  parentExpenseId?: string
  attachments?: AttachmentMetadata[]
  originalTransaction: Transaction | CashTransaction
}

export interface UnifiedMovementFilters {
  source?: 'all' | 'bank' | 'bizum' | 'cash'
  type?: 'all' | 'expense' | 'income' | 'transfer' | 'adjustment'
  incomeSubFilter?: 'all' | 'income' | 'reimbursement'
  search?: string
  categoryId?: string
  referenceDate?: Date
  scope?: 'month' | 'all'
}

/**
 * Determina si una fecha (string 'YYYY-MM-DD', ISO o Date) pertenece al mismo mes y año
 * que la fecha de referencia económica, evitando desfases por huso horario.
 */
export function isSameMonthYear(dateInput: string | Date | undefined, referenceDate: Date = new Date()): boolean {
  if (!dateInput) return false
  if (typeof dateInput === 'string') {
    const clean = dateInput.slice(0, 10)
    const parts = clean.split('-')
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10) - 1
      return y === referenceDate.getFullYear() && m === referenceDate.getMonth()
    }
  }
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  return !isNaN(d.getTime()) && d.getFullYear() === referenceDate.getFullYear() && d.getMonth() === referenceDate.getMonth()
}

/**
 * Selector canónico para obtener los movimientos unificados de un período específico (por defecto, mes actual),
 * ordenados cronológicamente descendente.
 */
export function selectUnifiedMovementsForPeriod(
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = [],
  expenseShares: ExpenseShare[] = [],
  referenceDate: Date = new Date(),
  scope: 'month' | 'all' = 'month'
): UnifiedMovement[] {
  const allUnified = toUnifiedMovements(transactions, cashTransactions, expenseShares)
  if (scope === 'all') return allUnified
  return allUnified.filter((m) => isSameMonthYear(m.date, referenceDate))
}

/**
 * Convierte y unifica los movimientos bancarios (Transaction) y de efectivo (CashTransaction)
 * en una única cronología ordenada por fecha descendente, sin mutar ni duplicar la persistencia.
 */
export function toUnifiedMovements(
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = [],
  expenseShares: ExpenseShare[] = []
): UnifiedMovement[] {
  const withdrawalTxIds = new Set(
    transactions.filter((t) => t.specialType === 'cash_withdrawal').map((t) => t.id)
  )

  const bankMovements: UnifiedMovement[] = transactions.map((t) => {
    const isShared = Boolean(
      t.isShared || (expenseShares && expenseShares.some((s) => s.expenseTransactionId === t.id))
    )
    const isCashWithdrawal = t.specialType === 'cash_withdrawal'
    const isReimbursement = t.type === 'income' && t.incomeKind === 'reimbursement'

    const userShare = isShared
      ? expenseShares.find(
          (s) =>
            s.expenseTransactionId === t.id &&
            (s.isUserShare || s.participantName.toLowerCase() === 'tú' || (!s.isPayerShare && !s.contactId))
        )
      : undefined

    return {
      id: t.id,
      source: 'bank',
      type: t.type,
      amount: t.amount,
      date: t.date,
      description: t.description,
      categoryId: t.categoryId,
      note: t.note,
      accountId: t.accountId,
      toAccountId: t.toAccountId,
      incomeKind: t.incomeKind,
      expenseNature: t.expenseNature,
      giftRecipient: t.giftRecipient,
      isShared,
      paidBy: t.paidBy,
      payerName: t.payerName,
      payerContactId: t.payerContactId,
      userShareAmount: userShare?.expectedAmount,
      paymentMethod: t.paymentMethod || 'bank',
      isCashWithdrawal,
      isLinkedCashWithdrawal: false,
      isReimbursement,
      isAdjustment: false,
      parentExpenseId: t.parentExpenseId,
      attachments: t.attachments,
      originalTransaction: t,
    }
  })

  const cashMovements: UnifiedMovement[] = cashTransactions.map((c) => {
    const isShared = Boolean(
      c.isShared || (expenseShares && expenseShares.some((s) => s.expenseTransactionId === c.id))
    )
    const isLinkedCashWithdrawal =
      c.type === 'income' && Boolean(c.bankTransactionId) && withdrawalTxIds.has(c.bankTransactionId as string)
    const isReimbursement =
      c.type === 'income' && Boolean(c.bankTransactionId) && !withdrawalTxIds.has(c.bankTransactionId as string)
    const isAdjustment = c.type === 'adjustment'

    const userShare = isShared
      ? expenseShares.find(
          (s) =>
            s.expenseTransactionId === c.id &&
            (s.isUserShare || s.participantName.toLowerCase() === 'tú' || (!s.isPayerShare && !s.contactId))
        )
      : undefined

    return {
      id: c.id,
      source: 'cash',
      type: c.type,
      amount: c.amount,
      date: c.date,
      description: c.description,
      categoryId: c.categoryId,
      note: c.note,
      isShared,
      paidBy: c.paidBy,
      payerName: c.payerName,
      payerContactId: c.payerContactId,
      userShareAmount: userShare?.expectedAmount,
      paymentMethod: c.paymentMethod || 'cash',
      isCashWithdrawal: false,
      isLinkedCashWithdrawal,
      isReimbursement,
      isAdjustment,
      bankTransactionId: c.bankTransactionId,
      attachments: c.attachments,
      originalTransaction: c,
    }
  })

  const combined = [...bankMovements, ...cashMovements]

  // Ordenar cronológicamente descendente (más recientes primero)
  return combined.sort((a, b) => {
    const timeA = new Date(a.date).getTime()
    const timeB = new Date(b.date).getTime()
    if (timeB !== timeA) {
      return timeB - timeA
    }
    // Desempate estable
    return a.id.localeCompare(b.id)
  })
}

/**
 * Filtra los movimientos unificados por medio/origen (Todos / Banco / Bizum / Efectivo), tipo, subfiltro de ingresos, búsqueda y periodo.
 */
export function filterUnifiedMovements(
  movements: UnifiedMovement[],
  categories: Category[],
  filters: UnifiedMovementFilters
): UnifiedMovement[] {
  const {
    source = 'all',
    type = 'all',
    incomeSubFilter = 'all',
    search = '',
    categoryId,
    referenceDate,
    scope = 'all',
  } = filters
  const cleanSearch = search.trim().toLowerCase()

  return movements.filter((m) => {
    // 0. Filtro por periodo (seguro frente a desfase UTC/zona horaria)
    if (scope === 'month' && referenceDate) {
      if (!isSameMonthYear(m.date, referenceDate)) {
        return false
      }
    }

    // 1. Filtro por medio / origen (Banco, Bizum, Efectivo)
    if (source === 'bank') {
      if (m.source !== 'bank' || m.paymentMethod === 'bizum') return false
    }
    if (source === 'bizum') {
      if (m.paymentMethod !== 'bizum') return false
    }
    if (source === 'cash') {
      if (m.source !== 'cash' && m.paymentMethod !== 'cash') return false
    }

    // 2. Filtro por tipo
    if (type === 'expense' && (m.type !== 'expense' || m.isCashWithdrawal)) return false
    if (type === 'income' && (m.type !== 'income' || m.isLinkedCashWithdrawal)) return false
    if (type === 'transfer') {
      const isTransferLike = m.type === 'transfer' || m.isCashWithdrawal || m.isLinkedCashWithdrawal
      if (!isTransferLike) return false
    }
    if (type === 'adjustment') {
      if (m.type !== 'adjustment' && !m.isAdjustment) return false
    }

    // 3. Subfiltro de ingresos
    if (type === 'income' && incomeSubFilter !== 'all') {
      if (incomeSubFilter === 'reimbursement' && !m.isReimbursement) return false
      if (incomeSubFilter === 'income' && (m.isReimbursement || m.isLinkedCashWithdrawal)) return false
    }

    // 4. Filtro por categoría específica
    if (categoryId && m.categoryId !== categoryId) {
      const catNorm = normalizeCategoryAlias(m.categoryId || '')
      const targetNorm = normalizeCategoryAlias(categoryId)
      if (catNorm !== targetNorm) return false
    }

    // 5. Búsqueda por texto (descripción, nota, categoría, regalo, pagador, medio)
    if (cleanSearch) {
      const cat = categories.find((c) => c.id === m.categoryId)
      const matchesDesc = m.description.toLowerCase().includes(cleanSearch)
      const matchesNote = Boolean(m.note && m.note.toLowerCase().includes(cleanSearch))
      const matchesCat = Boolean(cat && cat.name.toLowerCase().includes(cleanSearch))
      const matchesGift = Boolean(m.giftRecipient && m.giftRecipient.toLowerCase().includes(cleanSearch))
      const matchesPayer = Boolean(m.payerName && m.payerName.toLowerCase().includes(cleanSearch))
      const matchesMethod = Boolean(m.paymentMethod && m.paymentMethod.toLowerCase().includes(cleanSearch))

      if (!matchesDesc && !matchesNote && !matchesCat && !matchesGift && !matchesPayer && !matchesMethod) {
        return false
      }
    }

    return true
  })
}

/**
 * Estadísticas agregadas de la lista filtrada de movimientos unificados.
 */
export function calculateUnifiedMovementStats(movements: UnifiedMovement[]) {
  let expenses = 0
  let incomes = 0
  let realIncomes = 0
  let reimbursements = 0
  let adjustments = 0

  movements.forEach((m) => {
    if (m.type === 'expense') {
      expenses += m.amount
    } else if (m.type === 'income') {
      incomes += m.amount
      if (m.isReimbursement) {
        reimbursements += m.amount
      } else if (!m.isLinkedCashWithdrawal) {
        realIncomes += m.amount
      }
    } else if (m.type === 'adjustment') {
      adjustments += m.amount
    }
  })

  return {
    expenses: Math.round(expenses * 100) / 100,
    incomes: Math.round(incomes * 100) / 100,
    realIncomes: Math.round(realIncomes * 100) / 100,
    reimbursements: Math.round(reimbursements * 100) / 100,
    adjustments: Math.round(adjustments * 100) / 100,
  }
}

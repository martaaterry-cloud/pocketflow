import type { CashTransaction, Category, ExpenseShare, Transaction } from '../models/finance'
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
  isShared: boolean
  isCashWithdrawal: boolean
  isLinkedCashWithdrawal: boolean
  isReimbursement: boolean
  isAdjustment: boolean
  bankTransactionId?: string
  parentExpenseId?: string
  originalTransaction: Transaction | CashTransaction
}

export interface UnifiedMovementFilters {
  source?: 'all' | 'bank' | 'cash'
  type?: 'all' | 'expense' | 'income' | 'transfer'
  incomeSubFilter?: 'all' | 'income' | 'reimbursement'
  search?: string
  categoryId?: string
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
      isCashWithdrawal,
      isLinkedCashWithdrawal: false,
      isReimbursement,
      isAdjustment: false,
      parentExpenseId: t.parentExpenseId,
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
      isCashWithdrawal: false,
      isLinkedCashWithdrawal,
      isReimbursement,
      isAdjustment,
      bankTransactionId: c.bankTransactionId,
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
 * Filtra los movimientos unificados por origen (Todos / Banco / Efectivo), tipo, subfiltro de ingresos y búsqueda.
 */
export function filterUnifiedMovements(
  movements: UnifiedMovement[],
  categories: Category[],
  filters: UnifiedMovementFilters
): UnifiedMovement[] {
  const { source = 'all', type = 'all', incomeSubFilter = 'all', search = '', categoryId } = filters
  const cleanSearch = search.trim().toLowerCase()

  return movements.filter((m) => {
    // 1. Filtro por origen
    if (source === 'bank' && m.source !== 'bank') return false
    if (source === 'cash' && m.source !== 'cash') return false

    // 2. Filtro por tipo
    if (type === 'expense' && m.type !== 'expense') return false
    if (type === 'income' && m.type !== 'income') return false
    if (type === 'transfer') {
      const isTransferLike = m.type === 'transfer' || m.isCashWithdrawal || m.isLinkedCashWithdrawal
      if (!isTransferLike) return false
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

    // 5. Búsqueda por texto (descripción, nota, categoría, regalo)
    if (cleanSearch) {
      const cat = categories.find((c) => c.id === m.categoryId)
      const matchesDesc = m.description.toLowerCase().includes(cleanSearch)
      const matchesNote = Boolean(m.note && m.note.toLowerCase().includes(cleanSearch))
      const matchesCat = Boolean(cat && cat.name.toLowerCase().includes(cleanSearch))
      const matchesGift = Boolean(m.giftRecipient && m.giftRecipient.toLowerCase().includes(cleanSearch))

      if (!matchesDesc && !matchesNote && !matchesCat && !matchesGift) {
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

import { useState, useMemo, useEffect } from 'react'
import type { CashTransaction, Category, ExpenseShare, Transaction } from '../models/finance'
import { SwipeableTransactionRow } from './SwipeableTransactionRow'
import { selectExpenseShareStatus } from '../utils/sharedExpenseSelectors'
import { toUnifiedMovements, type UnifiedMovement } from '../utils/unifiedMovementSelectors'

export interface TransactionListProps {
  movements?: UnifiedMovement[]
  transactions?: Transaction[]
  categories: Category[]
  expenseShares?: ExpenseShare[]
  cashTransactions?: CashTransaction[]
  allTransactions?: Transaction[]
  limit?: number
  onSelect?: (transaction: Transaction | CashTransaction) => void
  onEdit?: (transaction: Transaction | CashTransaction) => void
  onDelete?: (transaction: Transaction) => void
  onDeleteCash?: (transaction: CashTransaction) => void
}

export function TransactionList({
  movements,
  transactions = [],
  categories,
  expenseShares = [],
  cashTransactions = [],
  allTransactions,
  limit,
  onSelect,
  onEdit,
  onDelete,
  onDeleteCash,
}: TransactionListProps) {
  const [openRowId, setOpenRowId] = useState<string | null>(null)

  const items: UnifiedMovement[] = useMemo(() => {
    if (movements) return movements
    return toUnifiedMovements(transactions, cashTransactions, expenseShares)
  }, [movements, transactions, cashTransactions, expenseShares])

  const rows = limit ? items.slice(0, limit) : items

  // Cerrar fila abierta al hacer tap fuera de cualquier fila deslizable
  useEffect(() => {
    if (!openRowId) return

    const handleGlobalPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (!target?.closest('.swipeable-row-container')) {
        setOpenRowId(null)
      }
    }

    window.addEventListener('pointerdown', handleGlobalPointerDown)
    return () => {
      window.removeEventListener('pointerdown', handleGlobalPointerDown)
    }
  }, [openRowId])

  // Mapa rápido de deudas pendientes por transacción compartida usando fuente canónica y completa
  const txSource = allTransactions ?? transactions
  const pendingByTx = useMemo(() => {
    const map = new Map<string, number>()
    if (!expenseShares.length) return map

    expenseShares.filter((s) => !s.isPayerShare).forEach((s) => {
      const { pendingAmount } = selectExpenseShareStatus(s, txSource, cashTransactions)
      const prev = map.get(s.expenseTransactionId) ?? 0
      map.set(s.expenseTransactionId, Math.round((prev + pendingAmount) * 100) / 100)
    })
    return map
  }, [expenseShares, txSource, cashTransactions])

  if (rows.length === 0) {
    return (
      <div className="transaction-list empty">
        <p className="muted">No hay movimientos para mostrar.</p>
      </div>
    )
  }

  return (
    <div className="transaction-list">
      {rows.map((m) => {
        const pendingToRecover = pendingByTx.get(m.id)

        return (
          <SwipeableTransactionRow
            key={m.id}
            movement={m}
            categories={categories}
            isShared={m.isShared}
            pendingToRecover={pendingToRecover}
            isOpen={openRowId === m.id}
            onOpenChange={(open) => {
              if (open) setOpenRowId(m.id)
              else if (openRowId === m.id) setOpenRowId(null)
            }}
            onSelect={onSelect}
            onEdit={onEdit}
            onDelete={onDelete}
            onDeleteCash={onDeleteCash}
          />
        )
      })}
    </div>
  )
}

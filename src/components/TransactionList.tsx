import { useState, useMemo, useEffect } from 'react'
import type { Category, ExpenseShare, Transaction } from '../models/finance'
import { SwipeableTransactionRow } from './SwipeableTransactionRow'
import { selectExpenseShareStatus } from '../utils/sharedExpenseSelectors'

export function TransactionList({
  transactions,
  categories,
  expenseShares = [],
  limit,
  onSelect,
  onEdit,
  onDelete,
}: {
  transactions: Transaction[]
  categories: Category[]
  expenseShares?: ExpenseShare[]
  limit?: number
  onSelect?: (transaction: Transaction) => void
  onEdit?: (transaction: Transaction) => void
  onDelete?: (transaction: Transaction) => void
}) {
  const [openRowId, setOpenRowId] = useState<string | null>(null)

  const rows = limit ? transactions.slice(0, limit) : transactions

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

  // Mapa rápido de deudas pendientes por transacción compartida
  const pendingByTx = useMemo(() => {
    const map = new Map<string, number>()
    if (!expenseShares.length) return map

    expenseShares.filter((s) => !s.isPayerShare).forEach((s) => {
      const { pendingAmount } = selectExpenseShareStatus(s, transactions)
      const prev = map.get(s.expenseTransactionId) ?? 0
      map.set(s.expenseTransactionId, Math.round((prev + pendingAmount) * 100) / 100)
    })
    return map
  }, [expenseShares, transactions])

  if (rows.length === 0) {
    return (
      <div className="transaction-list empty">
        <p className="muted">No hay movimientos para mostrar.</p>
      </div>
    )
  }

  return (
    <div className="transaction-list">
      {rows.map((t) => {
        const isShared = Boolean(t.isShared || (expenseShares && expenseShares.some((s) => s.expenseTransactionId === t.id)))
        const pendingToRecover = pendingByTx.get(t.id)

        return (
          <SwipeableTransactionRow
            key={t.id}
            transaction={t}
            categories={categories}
            isShared={isShared}
            pendingToRecover={pendingToRecover}
            isOpen={openRowId === t.id}
            onOpenChange={(open) => {
              if (open) setOpenRowId(t.id)
              else if (openRowId === t.id) setOpenRowId(null)
            }}
            onSelect={onSelect}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )
      })}
    </div>
  )
}

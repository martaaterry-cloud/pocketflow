import { useState, useMemo, useEffect } from 'react'
import type { CashTransaction, Category, ExpenseShare, Transaction } from '../models/finance'
import { SwipeableTransactionRow } from './SwipeableTransactionRow'
import { selectExpenseShareStatus, selectExpensePayableStatus } from '../utils/sharedExpenseSelectors'
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

    const sharesByTx = new Map<string, ExpenseShare[]>()
    expenseShares.forEach((s) => {
      const list = sharesByTx.get(s.expenseTransactionId) ?? []
      list.push(s)
      sharesByTx.set(s.expenseTransactionId, list)
    })

    sharesByTx.forEach((shares, txId) => {
      const tx = txSource.find((t) => t.id === txId) || cashTransactions.find((c) => c.id === txId)
      if (!tx) return

      if (tx.paidBy === 'contact') {
        const userShare = shares.find(
          (s) =>
            s.isUserShare ||
            s.participantName.toLowerCase() === 'tú' ||
            (!s.isPayerShare && !s.contactId)
        )
        if (userShare) {
          const { pendingAmount } = selectExpensePayableStatus(userShare, txSource, cashTransactions)
          map.set(txId, pendingAmount)
        }
      } else {
        const externalShares = shares.filter(
          (s) => !s.isPayerShare && !s.isUserShare && s.participantName.toLowerCase() !== 'tú'
        )
        let totalPending = 0
        externalShares.forEach((s) => {
          const { pendingAmount } = selectExpenseShareStatus(s, txSource, cashTransactions)
          totalPending += pendingAmount
        })
        map.set(txId, Math.round(totalPending * 100) / 100)
      }
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

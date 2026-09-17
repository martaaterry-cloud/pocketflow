import React, { useMemo } from 'react'
import type { Category, ExpenseShare, Transaction } from '../models/finance'
import { money } from '../utils/money'
import { normalizeCategoryAlias } from '../utils/categoryNormalization'
import { selectLinkedReimbursementsForExpense } from '../utils/sharedExpenseSelectors'
import { SwipeableTransactionRow } from './SwipeableTransactionRow'
import { AppIcon } from '../ui/icons'

interface CategoryDetailModalProps {
  open: boolean
  onClose: () => void
  category: Category | null
  transactions: Transaction[]
  categories: Category[]
  expenseShares?: ExpenseShare[]
  mode?: 'net' | 'gross'
  periodLabel?: string
  onSelectTransaction?: (transaction: Transaction) => void
  onEditTransaction?: (transaction: Transaction) => void
  onDeleteTransaction?: (transaction: Transaction) => void
}

export function CategoryDetailModal({
  open,
  onClose,
  category,
  transactions,
  categories,
  expenseShares = [],
  mode = 'net',
  periodLabel,
  onSelectTransaction,
  onEditTransaction,
  onDeleteTransaction,
}: CategoryDetailModalProps) {
  if (!open || !category) return null

  const canonicalCategoryId = normalizeCategoryAlias(category.id)

  // Filtrar las transacciones de esta categoría
  const categoryTransactions = useMemo(() => {
    return transactions
      .filter((t) => {
        if (t.type !== 'expense') return false
        const catId = normalizeCategoryAlias(t.categoryId || 'other')
        return catId === canonicalCategoryId
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [transactions, canonicalCategoryId])

  // Cálculo de totales bruto, neto y reembolsos vinculados
  const { grossTotal, linkedReimbursementsTotal, netTotal } = useMemo(() => {
    let gross = 0
    let linkedReimb = 0
    let net = 0

    categoryTransactions.forEach((t) => {
      gross += t.amount
      const linked = selectLinkedReimbursementsForExpense(t.id, transactions)
      linkedReimb += Math.min(t.amount, linked)
      net += Math.max(0, t.amount - linked)
    })

    return {
      grossTotal: Math.round(gross * 100) / 100,
      linkedReimbursementsTotal: Math.round(linkedReimb * 100) / 100,
      netTotal: Math.round(net * 100) / 100,
    }
  }, [categoryTransactions, transactions])

  const displayedAmount = mode === 'net' ? netTotal : grossTotal

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal modal-category-detail"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="category-detail-header-info">
            <span
              className="category-dot"
              style={{ background: category.color || '#B9B9B9' }}
            >
              <AppIcon
                name={category.iconKey || category.icon || 'shopping-basket'}
                size={16}
                color="#fff"
              />
            </span>
            <div>
              <h3>{category.name}</h3>
              <span className="modal-header-sub">
                {periodLabel ? `Gastos del ${periodLabel.toLowerCase()}` : 'Desglose de movimientos'}
              </span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar">
            <AppIcon name="x" size={18} />
          </button>
        </div>

        {/* Tarjeta de Resumen de la Categoría */}
        <div className="category-detail-summary-card">
          <div className="summary-left">
            <span className="summary-tag">
              {mode === 'net' ? 'Total neto personal' : 'Total bruto gastado'}
            </span>
            <strong className="summary-amount">−{money(displayedAmount)}</strong>
          </div>
          <div className="summary-right">
            <span className="summary-count-badge">
              {categoryTransactions.length} {categoryTransactions.length === 1 ? 'movimiento' : 'movimientos'}
            </span>
            {linkedReimbursementsTotal > 0 && (
              <small className="summary-reimb-note">
                Bruto: {money(grossTotal)} · Devuelto: +{money(linkedReimbursementsTotal)}
              </small>
            )}
          </div>
        </div>

        {/* Lista de Movimientos */}
        <div className="category-detail-list-section">
          <div className="section-title mini">
            <h4>Movimientos incluidos</h4>
          </div>

          {categoryTransactions.length === 0 ? (
            <div className="transaction-list empty" style={{ padding: '24px 0' }}>
              <p className="muted">No hay movimientos en esta categoría para este periodo.</p>
            </div>
          ) : (
            <div className="transaction-list">
              {categoryTransactions.map((t) => {
                const isShared = Boolean(
                  t.isShared || (expenseShares && expenseShares.some((s) => s.expenseTransactionId === t.id))
                )

                return (
                  <SwipeableTransactionRow
                    key={t.id}
                    transaction={t}
                    categories={categories}
                    isShared={isShared}
                    onSelect={(tx) => {
                      onClose()
                      onSelectTransaction?.(tx)
                    }}
                    onEdit={
                      onEditTransaction
                        ? (tx) => {
                            onClose()
                            onEditTransaction(tx)
                          }
                        : undefined
                    }
                    onDelete={
                      onDeleteTransaction
                        ? (tx) => {
                            onClose()
                            onDeleteTransaction(tx)
                          }
                        : undefined
                    }
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

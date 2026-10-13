import React, { useMemo } from 'react'
import type { Category, ExpenseShare, Transaction, CashTransaction } from '../models/finance'
import { money } from '../utils/money'
import { normalizeCategoryAlias } from '../utils/categoryNormalization'
import { selectEconomicExpenses } from '../utils/sharedExpenseSelectors'
import { toUnifiedMovements } from '../utils/unifiedMovementSelectors'
import { economicDate, inEconomicMonth, inEconomicRange, type EconomicSource } from '../utils/economicClassification'
import { SwipeableTransactionRow } from './SwipeableTransactionRow'
import { AppIcon } from '../ui/icons'

export interface CategoryDetailModalProps {
  open: boolean
  onClose: () => void
  category: Category | null
  transactions: Transaction[]
  categories: Category[]
  expenseShares?: ExpenseShare[]
  cashTransactions?: CashTransaction[]
  allTransactions?: Transaction[]
  mode?: 'net' | 'gross'
  periodLabel?: string
  referenceDate?: Date
  scope?: 'month' | 'all'
  source?: EconomicSource
  dateRange?: { start: Date; end: Date }
  onSelectTransaction?: (transaction: Transaction | CashTransaction) => void
  onEditTransaction?: (transaction: Transaction | CashTransaction) => void
  onDeleteTransaction?: (transaction: Transaction) => void
  onDeleteCash?: (transaction: CashTransaction) => void
}

export function CategoryDetailModal({
  open,
  onClose,
  category,
  transactions,
  categories,
  expenseShares = [],
  cashTransactions = [],
  allTransactions,
  mode = 'net',
  periodLabel,
  referenceDate,
  scope = 'month',
  source = 'total',
  dateRange,
  onSelectTransaction,
  onEditTransaction,
  onDeleteTransaction,
  onDeleteCash,
}: CategoryDetailModalProps) {
  const canonicalCategoryId = normalizeCategoryAlias(category?.id || '')
  const lookupTransactions = allTransactions ?? transactions
  const categoryExpenses = useMemo(() => selectEconomicExpenses(lookupTransactions, cashTransactions, expenseShares, source)
    .filter((e) => {
      const t = e.movement.transaction
      if (!transactions.some((tx) => tx.id === t.id) && e.movement.source === 'bank') return false
      if (dateRange ? !inEconomicRange(t.date, dateRange) : referenceDate && !inEconomicMonth(t.date, referenceDate, scope)) return false
      return normalizeCategoryAlias(t.categoryId || 'other') === canonicalCategoryId
    }).sort((a, b) => economicDate(b.movement.transaction.date).getTime() - economicDate(a.movement.transaction.date).getTime()),
    [transactions, lookupTransactions, cashTransactions, expenseShares, source, dateRange, referenceDate, scope, canonicalCategoryId])
  const categoryTransactions = categoryExpenses.map((e) => e.movement.transaction)
  const grossTotal = Math.round(categoryExpenses.reduce((sum, e) => sum + e.gross, 0) * 100) / 100
  const linkedReimbursementsTotal = Math.round(categoryExpenses.reduce((sum, e) => sum + e.linked, 0) * 100) / 100
  const netTotal = Math.round(categoryExpenses.reduce((sum, e) => sum + e.net, 0) * 100) / 100
  const unifiedById = useMemo(() => new Map(toUnifiedMovements(lookupTransactions, cashTransactions, expenseShares)
    .map((m) => [m.id, m])), [lookupTransactions, cashTransactions, expenseShares])

  const displayedAmount = mode === 'net' ? netTotal : grossTotal

  // Desglose por destinatario para Regalos
  const isGiftsCategory =
    canonicalCategoryId === 'gifts' || Boolean(category?.name.toLowerCase().includes('regalo'))

  const recipientsBreakdown = useMemo(() => {
    if (!isGiftsCategory) return []
    const map = new Map<string, number>()
    categoryExpenses.forEach((e) => {
      const recipient = (e.movement.transaction as Transaction).giftRecipient?.trim() || 'Sin especificar'
      const amt = mode === 'net' ? e.net : e.gross
      map.set(recipient, (map.get(recipient) || 0) + amt)
    })
    return Array.from(map.entries())
      .map(([recipient, amount]) => ({
        recipient,
        amount: Math.round(amount * 100) / 100,
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [isGiftsCategory, categoryExpenses, mode])

  if (!open || !category) return null

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

        {/* Resumen por destinatario para Regalos */}
        {isGiftsCategory && recipientsBreakdown.length > 0 && (
          <div
            className="gift-recipients-summary"
            style={{
              margin: '12px 0',
              padding: '12px 14px',
              background: 'var(--card-bg, #f8fafc)',
              borderRadius: 12,
              border: '1px solid var(--border, #e2e8f0)',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-muted, #64748b)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Por destinatario
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {recipientsBreakdown.map((item) => (
                <div
                  key={item.recipient}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: 'var(--text-primary, #0f172a)' }}>{item.recipient}</span>
                  <strong>{money(item.amount)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

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
                    movement={unifiedById.get(t.id)}
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
                    onDeleteCash={onDeleteCash ? (tx) => { onClose(); onDeleteCash(tx) } : undefined}
                    onDelete={
                      onDeleteTransaction
                        ? () => {
                            onClose()
                            onDeleteTransaction(t as Transaction)
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

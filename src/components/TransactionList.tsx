import type { Category, Transaction } from '../models/finance'
import { money, shortDate } from '../utils/money'

export function TransactionList({
  transactions,
  categories,
  limit,
  onSelect,
}: {
  transactions: Transaction[]
  categories: Category[]
  limit?: number
  onSelect?: (transaction: Transaction) => void
}) {
  const rows = limit ? transactions.slice(0, limit) : transactions

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
        const category = categories.find((c) => c.id === t.categoryId)
        const isTransfer = t.type === 'transfer'
        const isIncome = t.type === 'income'

        return (
          <div
            className={`transaction-row ${onSelect ? 'clickable' : ''}`}
            key={t.id}
            onClick={() => onSelect?.(t)}
            role={onSelect ? 'button' : undefined}
            tabIndex={onSelect ? 0 : undefined}
          >
            <div
              className="category-dot"
              style={{
                background: isTransfer ? '#768ca5' : isIncome ? '#5d9c74' : category?.color ?? '#bbb',
              }}
            >
              {isTransfer ? '⇄' : isIncome ? '↓' : category?.icon ?? '◌'}
            </div>
            <div className="transaction-main">
              <strong>{t.description}</strong>
              <span>
                {isTransfer ? 'Transferencia interna' : isIncome ? 'Ingreso' : category?.name ?? 'Sin categoría'} ·{' '}
                {shortDate(t.date)}
              </span>
            </div>
            <strong className={`transaction-amount ${isIncome ? 'positive' : isTransfer ? 'transfer' : ''}`}>
              {isIncome ? '+' : isTransfer ? '↔ ' : '−'}
              {money(t.amount)}
            </strong>
          </div>
        )
      })}
    </div>
  )
}

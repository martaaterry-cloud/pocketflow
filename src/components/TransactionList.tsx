import type { Category, Transaction } from '../models/finance'
import { money, shortDate } from '../utils/money'

export function TransactionList({ transactions, categories, limit }: { transactions: Transaction[]; categories: Category[]; limit?: number }) {
  const rows = limit ? transactions.slice(0, limit) : transactions
  return (
    <div className="transaction-list">
      {rows.map((t) => {
        const category = categories.find((c) => c.id === t.categoryId)
        return (
          <div className="transaction-row" key={t.id}>
            <div className="category-dot" style={{ background: category?.color ?? '#bbb' }}>{category?.icon ?? '↔'}</div>
            <div className="transaction-main">
              <strong>{t.description}</strong>
              <span>{t.type === 'transfer' ? 'Transferencia' : category?.name ?? 'Sin categoría'} · {shortDate(t.date)}</span>
            </div>
            <strong className={t.type === 'income' ? 'positive' : ''}>{t.type === 'income' ? '+' : t.type === 'transfer' ? '↔ ' : '−'}{money(t.amount)}</strong>
          </div>
        )
      })}
    </div>
  )
}

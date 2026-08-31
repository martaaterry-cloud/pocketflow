import type { Category, Transaction } from '../models/finance'
import { money } from '../utils/money'

export function DonutChart({ transactions, categories }: { transactions: Transaction[]; categories: Category[] }) {
  const expenses = transactions.filter((t) => t.type === 'expense')
  const total = expenses.reduce((sum, t) => sum + t.amount, 0)
  const byCategory = categories
    .map((category) => ({
      ...category,
      amount: expenses.filter((t) => t.categoryId === category.id).reduce((sum, t) => sum + t.amount, 0),
    }))
    .filter((item) => item.amount > 0)

  let cursor = 0
  const gradient = byCategory.map((item) => {
    const start = cursor
    cursor += total ? (item.amount / total) * 100 : 0
    return `${item.color} ${start}% ${cursor}%`
  }).join(', ')

  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background: `conic-gradient(${gradient || '#ecece8 0 100%'})` }}>
        <div className="donut-center">
          <strong>{money(total)}</strong>
          <span>este mes</span>
        </div>
      </div>
      <div className="legend">
        {byCategory.slice(0, 4).map((item) => (
          <span key={item.id}><i style={{ background: item.color }} />{item.name}</span>
        ))}
      </div>
    </div>
  )
}

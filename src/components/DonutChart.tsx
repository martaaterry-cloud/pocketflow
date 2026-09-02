import type { Category, Transaction } from '../models/finance'
import { money } from '../utils/money'
import { selectNetExpensesByCategory, type NetCategoryExpense } from '../utils/sharedExpenseSelectors'

interface DonutChartProps {
  transactions?: Transaction[]
  categories?: Category[]
  categoryItems?: NetCategoryExpense[]
}

export function DonutChart({ transactions = [], categories = [], categoryItems }: DonutChartProps) {
  const byCategory = categoryItems ?? selectNetExpensesByCategory(transactions, categories)
  const total = Math.round(byCategory.reduce((sum, item) => sum + item.amount, 0) * 100) / 100

  let cursor = 0
  const gradient = byCategory
    .map((item) => {
      const start = cursor
      cursor += total ? (item.amount / total) * 100 : 0
      return `${item.color} ${start}% ${cursor}%`
    })
    .join(', ')

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
          <span key={item.id}>
            <i style={{ background: item.color }} />
            {item.name}
          </span>
        ))}
      </div>
    </div>
  )
}

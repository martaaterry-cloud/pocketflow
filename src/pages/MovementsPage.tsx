import { useMemo, useState } from 'react'
import { TransactionList } from '../components/TransactionList'
import type { Transaction, TransactionType } from '../models/finance'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'

type FilterType = 'all' | TransactionType

export function MovementsPage({
  finance,
  onAdd,
  onSelectTransaction,
}: {
  finance: ReturnTypeFinance
  onAdd: () => void
  onSelectTransaction?: (tx: Transaction) => void
}) {
  const [filter, setFilter] = useState<FilterType>('all')
  const [search, setSearch] = useState('')

  const filteredTransactions = useMemo(() => {
    return finance.transactions.filter((tx) => {
      const matchesType = filter === 'all' || tx.type === filter
      const matchesSearch =
        !search.trim() ||
        tx.description.toLowerCase().includes(search.toLowerCase().trim()) ||
        finance.categories.find((c) => c.id === tx.categoryId)?.name.toLowerCase().includes(search.toLowerCase().trim())
      return matchesType && matchesSearch
    })
  }, [finance.transactions, finance.categories, filter, search])

  const stats = useMemo(() => {
    const expenses = filteredTransactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const incomes = filteredTransactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    return { expenses, incomes }
  }, [filteredTransactions])

  return (
    <main className="page">
      <header className="simple-header">
        <h1>Movimientos</h1>
        <button className="round-button" onClick={onAdd} aria-label="Añadir movimiento">
          ＋
        </button>
      </header>

      <div className="search-bar">
        <span className="search-icon">🔍</span>
        <input
          type="search"
          placeholder="Buscar concepto o categoría..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className="search-clear" onClick={() => setSearch('')} aria-label="Limpiar búsqueda">
            ×
          </button>
        )}
      </div>

      <div className="filter-pills">
        <button
          type="button"
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          Todos ({finance.transactions.length})
        </button>
        <button
          type="button"
          className={filter === 'expense' ? 'active' : ''}
          onClick={() => setFilter('expense')}
        >
          Gastos
        </button>
        <button
          type="button"
          className={filter === 'income' ? 'active' : ''}
          onClick={() => setFilter('income')}
        >
          Ingresos
        </button>
        <button
          type="button"
          className={filter === 'transfer' ? 'active' : ''}
          onClick={() => setFilter('transfer')}
        >
          Transferencias
        </button>
      </div>

      <div className="filter-summary">
        {filter === 'income' ? (
          <span>Total ingresos: <strong className="positive">+{money(stats.incomes)}</strong></span>
        ) : filter === 'expense' ? (
          <span>Total gastos: <strong>−{money(stats.expenses)}</strong></span>
        ) : (
          <span>Mostrando {filteredTransactions.length} movimientos</span>
        )}
      </div>

      <section className="section">
        <TransactionList
          transactions={filteredTransactions}
          categories={finance.categories}
          onSelect={onSelectTransaction}
        />
      </section>
    </main>
  )
}

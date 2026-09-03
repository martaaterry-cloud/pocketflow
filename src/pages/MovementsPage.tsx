import { useMemo, useState } from 'react'
import { TransactionList } from '../components/TransactionList'
import type { Transaction, TransactionType } from '../models/finance'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'
import { AppIcon } from '../ui/icons'

type FilterType = 'all' | TransactionType
type IncomeSubFilter = 'all' | 'income' | 'reimbursement'

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
  const [incomeSubFilter, setIncomeSubFilter] = useState<IncomeSubFilter>('all')
  const [search, setSearch] = useState('')
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null)

  const filteredTransactions = useMemo(() => {
    return finance.transactions.filter((tx) => {
      const matchesType = filter === 'all' || tx.type === filter

      let matchesSub = true
      if (filter === 'income' && incomeSubFilter !== 'all') {
        const isReimbursement = tx.incomeKind === 'reimbursement'
        matchesSub = incomeSubFilter === 'reimbursement' ? isReimbursement : !isReimbursement
      }

      const matchesSearch =
        !search.trim() ||
        tx.description.toLowerCase().includes(search.toLowerCase().trim()) ||
        finance.categories.find((c) => c.id === tx.categoryId)?.name.toLowerCase().includes(search.toLowerCase().trim())
      return matchesType && matchesSub && matchesSearch
    })
  }, [finance.transactions, finance.categories, filter, incomeSubFilter, search])

  const stats = useMemo(() => {
    const expenses = filteredTransactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const incomes = filteredTransactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const realIncomes = filteredTransactions
      .filter((t) => t.type === 'income' && t.incomeKind !== 'reimbursement')
      .reduce((s, t) => s + t.amount, 0)
    const reimbursements = filteredTransactions
      .filter((t) => t.type === 'income' && t.incomeKind === 'reimbursement')
      .reduce((s, t) => s + t.amount, 0)

    return { expenses, incomes, realIncomes, reimbursements }
  }, [filteredTransactions])

  return (
    <main className="page">
      <header className="simple-header">
        <h1>Movimientos</h1>
        <button className="round-button" onClick={onAdd} aria-label="Añadir movimiento">
          <AppIcon name="plus" size={18} />
        </button>
      </header>

      <div className="search-bar">
        <span className="search-icon">
          <AppIcon name="search" size={16} />
        </span>
        <input
          type="search"
          placeholder="Buscar concepto o categoría..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className="search-clear" onClick={() => setSearch('')} aria-label="Limpiar búsqueda">
            <AppIcon name="x" size={14} />
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

      {/* Subfiltro discreto para Ingresos */}
      {filter === 'income' && (
        <div className="filter-pills sub-pills" style={{ marginTop: 8 }}>
          <button
            type="button"
            className={incomeSubFilter === 'all' ? 'active' : ''}
            onClick={() => setIncomeSubFilter('all')}
          >
            Todos los ingresos
          </button>
          <button
            type="button"
            className={incomeSubFilter === 'income' ? 'active' : ''}
            onClick={() => setIncomeSubFilter('income')}
          >
            Ingresos reales
          </button>
          <button
            type="button"
            className={incomeSubFilter === 'reimbursement' ? 'active' : ''}
            onClick={() => setIncomeSubFilter('reimbursement')}
          >
            Reembolsos / Bizums
          </button>
        </div>
      )}

      <div className="filter-summary">
        {filter === 'income' ? (
          <span>
            Total: <strong className="positive">+{money(stats.incomes)}</strong>
            {stats.reimbursements > 0 && (
              <small className="muted" style={{ marginLeft: 8 }}>
                (Reales: +{money(stats.realIncomes)} · Reembolsos: +{money(stats.reimbursements)})
              </small>
            )}
          </span>
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
          expenseShares={finance.expenseShares}
          onSelect={onSelectTransaction}
          onEdit={onSelectTransaction}
          onDelete={(t) => setTxToDelete(t)}
        />
      </section>

      {/* Modal de confirmación de eliminación */}
      {txToDelete && (
        <div className="modal-backdrop" onClick={() => setTxToDelete(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem' }}>¿Eliminar movimiento?</h3>
            <p className="description" style={{ margin: '0 0 20px', color: 'var(--text-muted)' }}>
              ¿Seguro que quieres eliminar <strong>{txToDelete.description}</strong> ({money(txToDelete.amount)})? Esta acción no se puede deshacer.
            </p>
            <div className="modal-actions" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setTxToDelete(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  finance.deleteTransaction(txToDelete.id)
                  setTxToDelete(null)
                }}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

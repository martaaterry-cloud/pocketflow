import { useMemo, useState } from 'react'
import { TransactionList } from '../components/TransactionList'
import { DeleteTransactionModal } from '../components/DeleteTransactionModal'
import type { CashTransaction, Transaction, TransactionType } from '../models/finance'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'
import { AppIcon } from '../ui/icons'
import {
  toUnifiedMovements,
  filterUnifiedMovements,
  calculateUnifiedMovementStats,
  type MovementSource,
} from '../utils/unifiedMovementSelectors'

type FilterType = 'all' | TransactionType
type IncomeSubFilter = 'all' | 'income' | 'reimbursement'
type SourceFilter = 'all' | MovementSource

export function MovementsPage({
  finance,
  onAdd,
  onSelectTransaction,
}: {
  finance: ReturnTypeFinance
  onAdd: () => void
  onSelectTransaction?: (tx: Transaction | CashTransaction) => void
}) {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [filter, setFilter] = useState<FilterType>('all')
  const [incomeSubFilter, setIncomeSubFilter] = useState<IncomeSubFilter>('all')
  const [search, setSearch] = useState('')
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null)

  // 1. Cronología completa combinada (Banco + Efectivo)
  const allUnifiedMovements = useMemo(() => {
    return toUnifiedMovements(
      finance.transactions ?? [],
      finance.cashTransactions ?? [],
      finance.expenseShares ?? []
    )
  }, [finance.transactions, finance.cashTransactions, finance.expenseShares])

  // 2. Conteo por origen
  const totalAllCount = allUnifiedMovements.length
  const totalBankCount = (finance.transactions ?? []).length
  const totalCashCount = (finance.cashTransactions ?? []).length

  // 3. Filtrado completo y búsqueda
  const filteredMovements = useMemo(() => {
    return filterUnifiedMovements(allUnifiedMovements, finance.categories ?? [], {
      source: sourceFilter,
      type: filter,
      incomeSubFilter,
      search,
    })
  }, [allUnifiedMovements, finance.categories, sourceFilter, filter, incomeSubFilter, search])

  // 4. Estadísticas del conjunto filtrado
  const stats = useMemo(() => {
    return calculateUnifiedMovementStats(filteredMovements)
  }, [filteredMovements])

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

      {/* Selector de Origen: Todos | Banco | Efectivo */}
      <div className="filter-pills source-pills">
        <button
          type="button"
          className={sourceFilter === 'all' ? 'active' : ''}
          onClick={() => setSourceFilter('all')}
        >
          Todos ({totalAllCount})
        </button>
        <button
          type="button"
          className={sourceFilter === 'bank' ? 'active' : ''}
          onClick={() => setSourceFilter('bank')}
        >
          Banco ({totalBankCount})
        </button>
        <button
          type="button"
          className={sourceFilter === 'cash' ? 'active' : ''}
          onClick={() => setSourceFilter('cash')}
        >
          Efectivo ({totalCashCount})
        </button>
      </div>

      {/* Selector de Tipo: Todos | Gastos | Ingresos | Transferencias */}
      <div className="filter-pills type-pills" style={{ marginTop: 6 }}>
        <button
          type="button"
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          Todos
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
        {sourceFilter !== 'cash' && (
          <button
            type="button"
            className={filter === 'transfer' ? 'active' : ''}
            onClick={() => setFilter('transfer')}
          >
            Transferencias
          </button>
        )}
      </div>

      {/* Subfiltro discreto para Ingresos */}
      {filter === 'income' && (
        <div className="filter-pills sub-pills" style={{ marginTop: 6 }}>
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
          <span>Mostrando {filteredMovements.length} movimientos</span>
        )}
      </div>

      <section className="section">
        {filteredMovements.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 20px', textAlign: 'center' }}>
            <p className="muted" style={{ margin: 0 }}>
              {sourceFilter === 'cash'
                ? 'No hay movimientos en efectivo'
                : sourceFilter === 'bank'
                ? 'No hay movimientos bancarios'
                : 'No hay movimientos para mostrar.'}
            </p>
          </div>
        ) : (
          <TransactionList
            movements={filteredMovements}
            categories={finance.categories}
            expenseShares={finance.expenseShares}
            cashTransactions={finance.cashTransactions}
            allTransactions={finance.transactions}
            onSelect={onSelectTransaction}
            onEdit={onSelectTransaction}
            onDelete={(t) => setTxToDelete(t)}
            onDeleteCash={(c) => finance.deleteCashTransaction(c.id)}
          />
        )}
      </section>

      {/* Modal de confirmación de eliminación con soporte de vínculo a efectivo */}
      <DeleteTransactionModal
        open={Boolean(txToDelete)}
        transaction={txToDelete}
        cashTransactions={finance.cashTransactions}
        onClose={() => setTxToDelete(null)}
        onDeleteBankOnly={(id) => finance.deleteTransaction(id)}
        onDeleteBoth={(bankId, cashId) => {
          finance.deleteTransaction(bankId)
          finance.deleteCashTransaction(cashId)
        }}
      />
    </main>
  )
}

import { useMemo, useState } from 'react'
import { DeleteTransactionModal } from '../components/DeleteTransactionModal'
import { SwipeableTransactionRow } from '../components/SwipeableTransactionRow'
import type { CashTransaction, Transaction } from '../models/finance'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'
import { AppIcon } from '../ui/icons'
import {
  toUnifiedMovements,
  filterUnifiedMovements,
  type MovementSource,
  type UnifiedMovement,
} from '../utils/unifiedMovementSelectors'
import {
  selectNetPersonalExpensesForPeriod,
  selectRealIncome,
  selectNetExpensesByCategory,
  selectCategoryMonthlyStats,
  selectIncomeCategoryBreakdown,
  selectExpenseShareStatus,
  selectExpensePayableStatus,
} from '../utils/sharedExpenseSelectors'

type FilterType = 'all' | 'expense' | 'income' | 'transfer' | 'adjustment'
type IncomeSubFilter = 'all' | 'income' | 'reimbursement'
type SourceFilter = 'all' | 'bank' | 'bizum' | 'cash'
type SubView = 'main' | 'expenses' | 'category-detail' | 'incomes'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

function formatMonthYear(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`
}

function formatDayHeader(dateStr: string): string {
  try {
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10)
      const month = parseInt(parts[1], 10) - 1
      const day = parseInt(parts[2], 10)
      const d = new Date(year, month, day)
      const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
      const monthNames = [
        'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
      ]
      const dayName = dayNames[d.getDay()]
      const monthName = monthNames[d.getMonth()]
      return `${dayName}, ${day} de ${monthName}`
    }
  } catch {}
  return dateStr
}

export function MovementsPage({
  finance,
  onAdd,
  onSelectTransaction,
}: {
  finance: ReturnTypeFinance
  onAdd: () => void
  onSelectTransaction?: (tx: Transaction | CashTransaction) => void
}) {
  // 1. Estado de navegación temporal y sub-vistas
  const [selectedMonthDate, setSelectedMonthDate] = useState<Date>(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [subView, setSubView] = useState<SubView>('main')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

  // 2. Filtros de lista
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [filter, setFilter] = useState<FilterType>('all')
  const [incomeSubFilter, setIncomeSubFilter] = useState<IncomeSubFilter>('all')
  const [search, setSearch] = useState('')
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null)
  const [openRowId, setOpenRowId] = useState<string | null>(null)

  // 3. Comprobar si el mes seleccionado es el mes actual
  const now = new Date()
  const isCurrentMonth =
    selectedMonthDate.getFullYear() === now.getFullYear() &&
    selectedMonthDate.getMonth() === now.getMonth()

  // Handlers para navegación entre meses
  const handlePrevMonth = () => {
    setSelectedMonthDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
    )
  }

  const handleNextMonth = () => {
    setSelectedMonthDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
    )
  }

  const handleCurrentMonth = () => {
    setSelectedMonthDate(new Date(now.getFullYear(), now.getMonth(), 1))
  }

  // 4. Totales canónicos del mes
  const netMonthExpenses = useMemo(() => {
    return selectNetPersonalExpensesForPeriod(
      finance.transactions ?? [],
      selectedMonthDate,
      'month',
      finance.cashTransactions ?? [],
      finance.expenseShares ?? []
    )
  }, [finance.transactions, finance.cashTransactions, finance.expenseShares, selectedMonthDate])

  const realMonthIncome = useMemo(() => {
    return selectRealIncome(
      finance.transactions ?? [],
      selectedMonthDate,
      'month',
      finance.cashTransactions ?? []
    )
  }, [finance.transactions, finance.cashTransactions, selectedMonthDate])

  const monthBalance = Math.round((realMonthIncome - netMonthExpenses) * 100) / 100

  // 5. Cronología unificada completa (Banco + Efectivo)
  const allUnifiedMovements = useMemo(() => {
    return toUnifiedMovements(
      finance.transactions ?? [],
      finance.cashTransactions ?? [],
      finance.expenseShares ?? []
    )
  }, [finance.transactions, finance.cashTransactions, finance.expenseShares])

  // 6. Movimientos del mes filtrados
  const filteredMonthMovements = useMemo(() => {
    return filterUnifiedMovements(allUnifiedMovements, finance.categories ?? [], {
      source: sourceFilter,
      type: filter,
      incomeSubFilter,
      search,
      referenceDate: selectedMonthDate,
      scope: 'month',
    })
  }, [allUnifiedMovements, finance.categories, sourceFilter, filter, incomeSubFilter, search, selectedMonthDate])

  // 7. Agrupación diaria de movimientos para el mes seleccionado
  const dayGroups = useMemo(() => {
    const groupsMap = new Map<string, UnifiedMovement[]>()

    filteredMonthMovements.forEach((m) => {
      const dateStr = m.date.slice(0, 10)
      const list = groupsMap.get(dateStr) ?? []
      list.push(m)
      groupsMap.set(dateStr, list)
    })

    const groups: { dateStr: string; formattedDate: string; dayNet: number; movements: UnifiedMovement[] }[] = []
    groupsMap.forEach((movements, dateStr) => {
      let dayNet = 0
      movements.forEach((m) => {
        if (m.type === 'expense' && !m.isCashWithdrawal) {
          dayNet -= m.amount
        } else if (m.type === 'income' && !m.isLinkedCashWithdrawal) {
          dayNet += m.amount
        } else if (m.type === 'adjustment') {
          dayNet += m.amount
        }
      })

      groups.push({
        dateStr,
        formattedDate: formatDayHeader(dateStr),
        dayNet: Math.round(dayNet * 100) / 100,
        movements,
      })
    })

    return groups
  }, [filteredMonthMovements])

  // 8. Mapa de deudas pendientes por transacción compartida
  const txSource = finance.transactions ?? []
  const cashTxSource = finance.cashTransactions ?? []
  const pendingByTx = useMemo(() => {
    const map = new Map<string, number>()
    const expenseShares = finance.expenseShares ?? []
    if (!expenseShares.length) return map

    const sharesByTx = new Map<string, typeof expenseShares>()
    expenseShares.forEach((s) => {
      const list = sharesByTx.get(s.expenseTransactionId) ?? []
      list.push(s)
      sharesByTx.set(s.expenseTransactionId, list)
    })

    sharesByTx.forEach((shares, txId) => {
      const tx = txSource.find((t) => t.id === txId) || cashTxSource.find((c) => c.id === txId)
      if (!tx) return

      if (tx.paidBy === 'contact') {
        const userShare = shares.find(
          (s) =>
            s.isUserShare ||
            s.participantName.toLowerCase() === 'tú' ||
            (!s.isPayerShare && !s.contactId)
        )
        if (userShare) {
          const { pendingAmount } = selectExpensePayableStatus(userShare, txSource, cashTxSource)
          map.set(txId, pendingAmount)
        }
      } else {
        const externalShares = shares.filter(
          (s) => !s.isPayerShare && !s.isUserShare && s.participantName.toLowerCase() !== 'tú'
        )
        let totalPending = 0
        externalShares.forEach((s) => {
          const { pendingAmount } = selectExpenseShareStatus(s, txSource, cashTxSource)
          totalPending += pendingAmount
        })
        map.set(txId, Math.round(totalPending * 100) / 100)
      }
    })

    return map
  }, [finance.expenseShares, txSource, cashTxSource])

  // 9. Desglose de categorías de gastos para la vista de Gastos
  const categoryExpenses = useMemo(() => {
    return selectNetExpensesByCategory(
      finance.transactions ?? [],
      finance.categories ?? [],
      selectedMonthDate,
      'month',
      finance.cashTransactions ?? [],
      finance.expenseShares ?? []
    )
  }, [finance.transactions, finance.categories, selectedMonthDate, finance.cashTransactions, finance.expenseShares])

  // 10. Estadísticas de la categoría seleccionada para la vista Detalle de Categoría
  const categoryStats = useMemo(() => {
    if (!selectedCategoryId) return null
    return selectCategoryMonthlyStats(
      selectedCategoryId,
      finance.categories ?? [],
      finance.transactions ?? [],
      finance.cashTransactions ?? [],
      finance.expenseShares ?? [],
      selectedMonthDate,
      3
    )
  }, [selectedCategoryId, finance.categories, finance.transactions, finance.cashTransactions, finance.expenseShares, selectedMonthDate])

  // 11. Desglose de ingresos para la vista de Ingresos
  const incomeStats = useMemo(() => {
    return selectIncomeCategoryBreakdown(
      finance.transactions ?? [],
      finance.categories ?? [],
      selectedMonthDate,
      'month',
      finance.cashTransactions ?? [],
      finance.expenseShares ?? []
    )
  }, [finance.transactions, finance.categories, selectedMonthDate, finance.cashTransactions, finance.expenseShares])

  // =========================================================================
  // SUB-VISTA: DETALLE DE CATEGORÍA
  // =========================================================================
  if (subView === 'category-detail' && categoryStats) {
    const maxHistory = Math.max(...categoryStats.history.map((h) => h.amount), 1)

    return (
      <main className="page movements-subview-page">
        <header className="subview-header">
          <button
            type="button"
            className="subview-back-btn"
            onClick={() => setSubView('expenses')}
            aria-label="Volver a gastos"
          >
            <AppIcon name="chevron-left" size={20} />
            <span>Gastos</span>
          </button>
          <div className="subview-title-wrap">
            <div className="category-header-badge">
              <span
                className="category-dot"
                style={{ background: categoryStats.categoryColor }}
              >
                <AppIcon name={categoryStats.categoryIcon} size={15} color="#fff" />
              </span>
              <h2>{categoryStats.categoryName}</h2>
            </div>
            <span className="subview-subtitle">{formatMonthYear(selectedMonthDate)}</span>
          </div>
        </header>

        {/* Métricas clave de la categoría */}
        <section className="category-detail-metrics-grid">
          <div className="category-metric-card primary">
            <span className="metric-label">Gasto en {MONTH_NAMES[selectedMonthDate.getMonth()]}</span>
            <strong className="metric-value">−{money(categoryStats.currentMonthAmount)}</strong>
            <span className="metric-sub">
              {categoryStats.currentMonthPercentage}% de tus gastos del mes
            </span>
          </div>

          <div className="category-metric-card secondary">
            <span className="metric-label">Media últimos 3 meses</span>
            <strong className="metric-value">−{money(categoryStats.recentAverage)}</strong>
            <span className="metric-sub">Media mensual de referencia</span>
          </div>
        </section>

        {/* Gráfico de evolución histórica (3 meses) */}
        <section className="category-evolution-section">
          <h3 className="section-title">Evolución reciente</h3>
          <div className="category-evolution-bars">
            {categoryStats.history.map((pt) => {
              const heightPct = Math.max(8, Math.round((pt.amount / maxHistory) * 100))
              return (
                <div key={pt.monthKey} className={`evolution-col ${pt.isCurrent ? 'current' : ''}`}>
                  <span className="evolution-amount">{money(pt.amount)}</span>
                  <div className="evolution-bar-track">
                    <div
                      className="evolution-bar-fill"
                      style={{
                        height: `${heightPct}%`,
                        backgroundColor: categoryStats.categoryColor,
                        opacity: pt.isCurrent ? 1 : 0.55,
                      }}
                    />
                  </div>
                  <span className="evolution-month-label">{pt.shortMonthLabel}</span>
                </div>
              )
            })}
          </div>
        </section>

        {/* Lista de movimientos de esta categoría en el mes */}
        <section className="category-movements-section">
          <div className="section-header-row">
            <h3 className="section-title">Movimientos ({categoryStats.movements.length})</h3>
          </div>

          {categoryStats.movements.length === 0 ? (
            <div className="empty-state">
              <p className="muted">No hay movimientos de {categoryStats.categoryName} en {formatMonthYear(selectedMonthDate)}.</p>
            </div>
          ) : (
            <div className="transaction-list">
              {categoryStats.movements.map((m) => {
                const pendingToRecover = pendingByTx.get(m.id)
                return (
                  <SwipeableTransactionRow
                    key={m.id}
                    movement={m}
                    categories={finance.categories ?? []}
                    isShared={m.isShared}
                    pendingToRecover={pendingToRecover}
                    isOpen={openRowId === m.id}
                    onOpenChange={(open) => {
                      if (open) setOpenRowId(m.id)
                      else if (openRowId === m.id) setOpenRowId(null)
                    }}
                    onSelect={onSelectTransaction}
                    onEdit={onSelectTransaction}
                    onDelete={(t) => setTxToDelete(t)}
                    onDeleteCash={(c) => finance.deleteCashTransaction(c.id)}
                  />
                )
              })}
            </div>
          )}
        </section>

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

  // =========================================================================
  // SUB-VISTA: ANÁLISIS DE GASTOS DEL MES
  // =========================================================================
  if (subView === 'expenses') {
    return (
      <main className="page movements-subview-page">
        <header className="subview-header">
          <button
            type="button"
            className="subview-back-btn"
            onClick={() => setSubView('main')}
            aria-label="Volver a movimientos"
          >
            <AppIcon name="chevron-left" size={20} />
            <span>Movimientos</span>
          </button>
          <div className="subview-title-wrap">
            <h2>Gastos</h2>
            <span className="subview-subtitle">{formatMonthYear(selectedMonthDate)}</span>
          </div>
        </header>

        {/* Tarjeta de Total Gastos */}
        <div className="subview-hero-card expense-hero">
          <span className="hero-label">Total gastos del mes</span>
          <strong className="hero-amount">−{money(netMonthExpenses)}</strong>
          <span className="hero-sub">{categoryExpenses.length} categorías con gasto</span>
        </div>

        {/* Lista de categorías ordenadas por importe */}
        <section className="category-breakdown-section">
          <h3 className="section-title">Distribución por categorías</h3>

          {categoryExpenses.length === 0 ? (
            <div className="empty-state">
              <p className="muted">No hay gastos registrados en {formatMonthYear(selectedMonthDate)}.</p>
            </div>
          ) : (
            <div className="category-breakdown-list">
              {categoryExpenses.map((cat) => {
                return (
                  <button
                    key={cat.id}
                    type="button"
                    className="category-breakdown-row"
                    onClick={() => {
                      setSelectedCategoryId(cat.id)
                      setSubView('category-detail')
                    }}
                    aria-label={`Ver detalle de categoría ${cat.name}`}
                  >
                    <div className="cat-row-top">
                      <div className="cat-row-left">
                        <span className="category-dot" style={{ background: cat.color }}>
                          <AppIcon name={cat.icon} size={15} color="#fff" />
                        </span>
                        <strong className="cat-name">{cat.name}</strong>
                      </div>
                      <div className="cat-row-right">
                        <strong className="cat-amount">−{money(cat.amount)}</strong>
                        <span className="cat-pct">{cat.percentage}%</span>
                        <AppIcon name="chevron-right" size={16} className="cat-chevron" />
                      </div>
                    </div>

                    <div className="cat-progress-track">
                      <div
                        className="cat-progress-fill"
                        style={{
                          width: `${Math.max(4, cat.percentage)}%`,
                          backgroundColor: cat.color,
                        }}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      </main>
    )
  }

  // =========================================================================
  // SUB-VISTA: ANÁLISIS DE INGRESOS DEL MES
  // =========================================================================
  if (subView === 'incomes') {
    return (
      <main className="page movements-subview-page">
        <header className="subview-header">
          <button
            type="button"
            className="subview-back-btn"
            onClick={() => setSubView('main')}
            aria-label="Volver a movimientos"
          >
            <AppIcon name="chevron-left" size={20} />
            <span>Movimientos</span>
          </button>
          <div className="subview-title-wrap">
            <h2>Ingresos</h2>
            <span className="subview-subtitle">{formatMonthYear(selectedMonthDate)}</span>
          </div>
        </header>

        {/* Tarjeta de Total Ingresos Reales */}
        <div className="subview-hero-card income-hero">
          <span className="hero-label">Total ingresos económicos</span>
          <strong className="hero-amount">+ {money(incomeStats.total)}</strong>
          <span className="hero-sub">Excluye recuperaciones y reembolsos de deudas</span>
        </div>

        {/* Distribución de ingresos */}
        {incomeStats.items.length > 0 && (
          <section className="category-breakdown-section">
            <h3 className="section-title">Distribución de ingresos</h3>
            <div className="category-breakdown-list">
              {incomeStats.items.map((item) => (
                <div key={item.id} className="category-breakdown-row static">
                  <div className="cat-row-top">
                    <div className="cat-row-left">
                      <span className="category-dot" style={{ background: item.color }}>
                        <AppIcon name={item.icon} size={15} color="#fff" />
                      </span>
                      <strong className="cat-name">{item.name}</strong>
                    </div>
                    <div className="cat-row-right">
                      <strong className="cat-amount positive">+{money(item.amount)}</strong>
                      <span className="cat-pct">{item.percentage}%</span>
                    </div>
                  </div>
                  <div className="cat-progress-track">
                    <div
                      className="cat-progress-fill"
                      style={{
                        width: `${Math.max(4, item.percentage)}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Lista de movimientos de ingreso */}
        <section className="category-movements-section">
          <div className="section-header-row">
            <h3 className="section-title">Movimientos ({incomeStats.movements.length})</h3>
          </div>

          {incomeStats.movements.length === 0 ? (
            <div className="empty-state">
              <p className="muted">No hay ingresos económicos en {formatMonthYear(selectedMonthDate)}.</p>
            </div>
          ) : (
            <div className="transaction-list">
              {incomeStats.movements.map((m) => (
                <SwipeableTransactionRow
                  key={m.id}
                  movement={m}
                  categories={finance.categories ?? []}
                  isShared={m.isShared}
                  isOpen={openRowId === m.id}
                  onOpenChange={(open) => {
                    if (open) setOpenRowId(m.id)
                    else if (openRowId === m.id) setOpenRowId(null)
                  }}
                  onSelect={onSelectTransaction}
                  onEdit={onSelectTransaction}
                  onDelete={(t) => setTxToDelete(t)}
                  onDeleteCash={(c) => finance.deleteCashTransaction(c.id)}
                />
              ))}
            </div>
          )}
        </section>

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

  // =========================================================================
  // VISTA PRINCIPAL: RESUMEN MENSUAL + AGRUPACIÓN DIARIA
  // =========================================================================
  return (
    <main className="page movements-main-page">
      {/* Cabecera Principal */}
      <header className="simple-header movements-header">
        <h1>Movimientos</h1>
        <button className="round-button" onClick={onAdd} aria-label="Añadir movimiento">
          <AppIcon name="plus" size={18} />
        </button>
      </header>

      {/* Selector de Mes */}
      <div className="month-selector-bar">
        <button
          type="button"
          className="month-nav-btn prev"
          onClick={handlePrevMonth}
          aria-label="Mes anterior"
        >
          <AppIcon name="chevron-left" size={18} />
        </button>
        <div className="month-label-wrap">
          <span className="month-title">{formatMonthYear(selectedMonthDate)}</span>
          {!isCurrentMonth && (
            <button type="button" className="current-month-badge" onClick={handleCurrentMonth}>
              Ir a hoy
            </button>
          )}
        </div>
        <button
          type="button"
          className="month-nav-btn next"
          onClick={handleNextMonth}
          aria-label="Mes siguiente"
        >
          <AppIcon name="chevron-right" size={18} />
        </button>
      </div>

      {/* Resumen Mensual: Tarjetas GASTOS / INGRESOS (Pulsables) */}
      <section className="monthly-summary-cards">
        <button
          type="button"
          className="monthly-card expense-card"
          onClick={() => setSubView('expenses')}
          aria-label="Ver análisis de gastos"
        >
          <div className="monthly-card-header">
            <span className="monthly-card-label">Gastos</span>
            <AppIcon name="chevron-right" size={14} className="monthly-card-chevron" />
          </div>
          <strong className="monthly-card-amount">−{money(netMonthExpenses)}</strong>
          <span className="monthly-card-action">Ver categorías ›</span>
        </button>

        <button
          type="button"
          className="monthly-card income-card"
          onClick={() => setSubView('incomes')}
          aria-label="Ver análisis de ingresos"
        >
          <div className="monthly-card-header">
            <span className="monthly-card-label">Ingresos</span>
            <AppIcon name="chevron-right" size={14} className="monthly-card-chevron" />
          </div>
          <strong className="monthly-card-amount">+ {money(realMonthIncome)}</strong>
          <span className="monthly-card-action">Ver detalle ›</span>
        </button>
      </section>

      {/* Balance mensual discreto */}
      <div className="monthly-balance-bar">
        <span className="balance-label">Balance del mes:</span>
        <strong className={`balance-amount ${monthBalance >= 0 ? 'positive' : 'negative'}`}>
          {monthBalance >= 0 ? `+${money(monthBalance)}` : money(monthBalance)}
        </strong>
      </div>

      {/* Buscador */}
      <div className="search-bar">
        <span className="search-icon">
          <AppIcon name="search" size={16} />
        </span>
        <input
          type="search"
          placeholder="Buscar concepto, categoría, persona..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button className="search-clear" onClick={() => setSearch('')} aria-label="Limpiar búsqueda">
            <AppIcon name="x" size={14} />
          </button>
        )}
      </div>

      {/* Filtro por Medio: Todos | Banco | Bizum | Efectivo */}
      <div className="filter-pills medium-pills">
        <button
          type="button"
          className={sourceFilter === 'all' ? 'active' : ''}
          onClick={() => setSourceFilter('all')}
        >
          Todos
        </button>
        <button
          type="button"
          className={sourceFilter === 'bank' ? 'active' : ''}
          onClick={() => setSourceFilter('bank')}
        >
          Banco
        </button>
        <button
          type="button"
          className={sourceFilter === 'bizum' ? 'active' : ''}
          onClick={() => setSourceFilter('bizum')}
        >
          Bizum
        </button>
        <button
          type="button"
          className={sourceFilter === 'cash' ? 'active' : ''}
          onClick={() => setSourceFilter('cash')}
        >
          Efectivo
        </button>
      </div>

      {/* Filtro por Tipo: Todos | Gastos | Ingresos | Transferencias | Ajustes */}
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
        <button
          type="button"
          className={filter === 'transfer' ? 'active' : ''}
          onClick={() => setFilter('transfer')}
        >
          Transferencias
        </button>
        <button
          type="button"
          className={filter === 'adjustment' ? 'active' : ''}
          onClick={() => setFilter('adjustment')}
        >
          Ajustes
        </button>
      </div>

      {/* Subfiltro de Ingresos */}
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

      {/* Historial Agrupado por Días */}
      <section className="section movements-history-section">
        {dayGroups.length === 0 ? (
          <div className="empty-state" style={{ padding: '36px 20px', textAlign: 'center' }}>
            <p className="muted" style={{ margin: 0 }}>
              {search
                ? 'No hay movimientos que coincidan con la búsqueda.'
                : `No hay movimientos en ${formatMonthYear(selectedMonthDate)}.`}
            </p>
          </div>
        ) : (
          <div className="day-groups-container">
            {dayGroups.map((group) => (
              <div key={group.dateStr} className="day-group">
                <div className="day-group-header">
                  <span className="day-group-title">{group.formattedDate}</span>
                  <span className={`day-group-net ${group.dayNet > 0 ? 'positive' : group.dayNet < 0 ? 'negative' : 'neutral'}`}>
                    {group.dayNet > 0 ? `+${money(group.dayNet)}` : group.dayNet < 0 ? money(group.dayNet) : '0,00 €'}
                  </span>
                </div>

                <div className="transaction-list">
                  {group.movements.map((m) => {
                    const pendingToRecover = pendingByTx.get(m.id)
                    return (
                      <SwipeableTransactionRow
                        key={m.id}
                        movement={m}
                        categories={finance.categories ?? []}
                        isShared={m.isShared}
                        pendingToRecover={pendingToRecover}
                        isOpen={openRowId === m.id}
                        onOpenChange={(open) => {
                          if (open) setOpenRowId(m.id)
                          else if (openRowId === m.id) setOpenRowId(null)
                        }}
                        onSelect={onSelectTransaction}
                        onEdit={onSelectTransaction}
                        onDelete={(t) => setTxToDelete(t)}
                        onDeleteCash={(c) => finance.deleteCashTransaction(c.id)}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
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

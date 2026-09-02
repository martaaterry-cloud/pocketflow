import { DonutChart } from '../components/DonutChart'
import { TransactionList } from '../components/TransactionList'
import type { Transaction } from '../models/finance'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'
import { selectPendingVariableExpenseEstimate } from '../utils/variableEstimates'
import { AppIcon } from '../ui/icons'

export function HomePage({
  finance,
  onAdd,
  onSelectTransaction,
  onNavigateToVariableEstimates,
}: {
  finance: ReturnTypeFinance
  onAdd: () => void
  onSelectTransaction?: (tx: Transaction) => void
  onNavigateToVariableEstimates?: () => void
}) {
  const displayName = finance.profile?.displayName?.trim()
  const greeting = displayName ? `Hola, ${displayName}` : 'Hola'

  const estimates = finance.variableExpenseEstimates ?? []
  const hasActiveEstimates = estimates.some((e) => e.active)
  const pendingVariableExpenses = selectPendingVariableExpenseEstimate(
    estimates,
    finance.transactions ?? []
  )

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <span className="eyebrow">Mi dinero</span>
          <h1>{greeting}</h1>
        </div>
        <button className="round-button" onClick={onAdd} aria-label="Añadir movimiento">
          <AppIcon name="plus" size={18} />
        </button>
      </header>

      <section className="hero-card">
        <div className="hero-top-row">
          <span className="hero-tag">Disponible real</span>
          {finance.totals.committedAmount > 0 && (
            <span className="hero-committed-pill">
              {money(finance.totals.committedAmount)} comprometidos
            </span>
          )}
        </div>

        <strong className="hero-main-number">{money(finance.totals.realAvailable)}</strong>

        <div className="hero-kpis">
          <div className="hero-kpi-item">
            <span>Dinero total</span>
            <strong>{money(finance.totals.totalMoney)}</strong>
          </div>
          <div className="hero-kpi-item">
            <span>Ahorro total</span>
            <strong>{money(finance.totals.savingsBalance)}</strong>
            {finance.totals.assignedSavings > 0 && (
              <small className="hero-kpi-sub">
                {money(finance.totals.assignedSavings)} asignados
              </small>
            )}
          </div>
          <div className="hero-kpi-item">
            <span>Gastado este mes</span>
            <strong>{money(finance.totals.monthExpenses)}</strong>
          </div>
        </div>
      </section>

      {/* Indicador compacto de gastos variables previstos */}
      {hasActiveEstimates && (
        <button
          type="button"
          className="variable-estimate-home-banner"
          onClick={onNavigateToVariableEstimates}
          aria-label="Ver gastos variables previstos"
        >
          <div className="variable-estimate-home-left">
            <span className="variable-estimate-home-icon">
              <AppIcon name="activity" size={16} />
            </span>
            <div className="variable-estimate-home-info">
              <span className="variable-estimate-home-title">Previsto variable pendiente</span>
              <span className="variable-estimate-home-sub">Previsión del mes sin computar en saldo</span>
            </div>
          </div>
          <div className="variable-estimate-home-right">
            <strong className="variable-estimate-home-amount">{money(pendingVariableExpenses)}</strong>
            <span className="variable-estimate-home-chevron">
              <AppIcon name="chevron-right" size={16} />
            </span>
          </div>
        </button>
      )}

      <section className="section">
        <div className="section-title">
          <h2>Gastos por categoría</h2>
          <span>
            {money(finance.totals.monthExpenses)} este mes
            {finance.totals.budgetsSummary.totalBudgeted > 0 &&
              ` · Presupuestos: ${finance.totals.budgetsSummary.overallUsagePercentage}%`}
          </span>
        </div>
        <DonutChart transactions={finance.transactions} categories={finance.categories} />
      </section>

      <section className="section">
        <div className="section-title">
          <h2>Últimos movimientos</h2>
        </div>
        <TransactionList
          transactions={finance.transactions}
          categories={finance.categories}
          limit={5}
          onSelect={onSelectTransaction}
        />
      </section>
    </main>
  )
}

import { useState } from 'react'
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
  const [isExpanded, setIsExpanded] = useState(false)
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

      <section
        className={`hero-card interactive ${isExpanded ? 'expanded' : ''}`}
        onClick={() => setIsExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsExpanded((prev) => !prev)
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-label="Tarjeta de dinero disponible. Toca para ver u ocultar el desglose."
      >
        <div className="hero-top-row">
          <span className="hero-tag">Disponible real</span>
          {finance.totals.committedAmount > 0 && (
            <span className="hero-committed-pill">
              {money(finance.totals.committedAmount)} comprometidos
            </span>
          )}
        </div>

        <strong className="hero-main-number">{money(finance.totals.realAvailable)}</strong>

        {/* Indicador discreto de disponible proyectado en tarjeta cerrada */}
        {hasActiveEstimates && !isExpanded && (
          <div className="hero-projected-sub">
            <span>Disponible proyectado:</span>
            <strong>{money(finance.totals.projectedAvailable)}</strong>
          </div>
        )}

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

        {/* Desglose expandido al tocar cualquier parte de la tarjeta */}
        {isExpanded && (
          <div className="hero-breakdown">
            <div className="hero-breakdown-divider" />
            <div className="hero-breakdown-header">
              <span>Desglose de liquidez y previsión</span>
            </div>

            <div className="hero-breakdown-row">
              <div className="breakdown-label">
                <span>Dinero total</span>
                <small>Saldo actual en todas tus cuentas</small>
              </div>
              <strong className="breakdown-value">{money(finance.totals.totalMoney)}</strong>
            </div>

            {finance.totals.savingsBalance > 0 && (
              <div className="hero-breakdown-row sub">
                <div className="breakdown-label">
                  <span>· Ahorro reservado</span>
                  <small>Fondos separados en cuenta de ahorro</small>
                </div>
                <span className="breakdown-value text-muted">
                  {money(finance.totals.savingsBalance)}
                </span>
              </div>
            )}

            <div className="hero-breakdown-row">
              <div className="breakdown-label">
                <span>Comprometido pendiente</span>
                <small>Pagos recurrentes previstos aún no cobrados</small>
              </div>
              <strong className="breakdown-value negative">
                {finance.totals.committedAmount > 0 ? `-${money(finance.totals.committedAmount)}` : '0,00 €'}
              </strong>
            </div>

            <div className="hero-breakdown-row highlight">
              <div className="breakdown-label">
                <span>= Disponible real</span>
                <small>Dinero disponible tras compromisos conocidos</small>
              </div>
              <strong className="breakdown-value positive">
                {money(finance.totals.realAvailable)}
              </strong>
            </div>

            <div className="hero-breakdown-row">
              <div className="breakdown-label">
                <span>Previsto variable pendiente</span>
                <small>Estimaciones habituales del mes (ej. Gimnasio Rafa)</small>
              </div>
              <strong className="breakdown-value negative">
                {pendingVariableExpenses > 0 ? `-${money(pendingVariableExpenses)}` : '0,00 €'}
              </strong>
            </div>

            <div className="hero-breakdown-row highlight projected">
              <div className="breakdown-label">
                <span>= Disponible proyectado</span>
                <small>Guía de lo que probablemente te quedará</small>
              </div>
              <strong className="breakdown-value">
                {money(finance.totals.projectedAvailable)}
              </strong>
            </div>
          </div>
        )}
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

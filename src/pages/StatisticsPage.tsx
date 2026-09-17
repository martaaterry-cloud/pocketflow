import { useMemo, useState } from 'react'
import { DonutChart } from '../components/DonutChart'
import { CategoryDetailModal } from '../components/CategoryDetailModal'
import type { Category, Transaction } from '../models/finance'
import type { ReturnTypeFinance } from '../types'
import {
  calculatePeriodStatistics,
  compareWithPreviousPeriod,
  getPreviousLocalDateRange,
  type StatsPeriod,
} from '../utils/statisticsSelectors'
import { money } from '../utils/money'
import { normalizeCategoryAlias } from '../utils/categoryNormalization'
import { AppIcon } from '../ui/icons'

export function StatisticsPage({
  finance,
  onBack,
  onSelectTransaction,
}: {
  finance: ReturnTypeFinance
  onBack: () => void
  onSelectTransaction?: (tx: Transaction) => void
}) {
  const [period, setPeriod] = useState<StatsPeriod>('month')
  const [selectedCategoryForDetail, setSelectedCategoryForDetail] = useState<Category | null>(null)
  const now = useMemo(() => new Date(), [])

  // Estadísticas del periodo actual
  const stats = useMemo(() => {
    return calculatePeriodStatistics(finance.transactions, finance.categories, period, now)
  }, [finance.transactions, finance.categories, period, now])

  // Transacciones del periodo actual
  const periodTransactions = useMemo(() => {
    return finance.transactions.filter((t) => {
      const txTime = new Date(t.date).getTime()
      return txTime >= stats.dateRange.start.getTime() && txTime <= stats.dateRange.end.getTime()
    })
  }, [finance.transactions, stats.dateRange])

  // Estadísticas del periodo anterior para comparativa (especialmente mes y semana)
  const comparison = useMemo(() => {
    if (period !== 'month' && period !== 'week') return null

    const prevRange = getPreviousLocalDateRange(period, now)
    const prevStats = calculatePeriodStatistics(
      finance.transactions,
      finance.categories,
      period,
      prevRange.start
    )

    return compareWithPreviousPeriod(stats.expenses, prevStats.expenses)
  }, [finance.transactions, finance.categories, period, now, stats.expenses])

  const periodLabels: Record<StatsPeriod, string> = {
    day: 'Día',
    week: 'Semana',
    month: 'Mes',
    year: 'Año',
  }

  // Altura máxima para normalizar barras del gráfico de evolución temporal
  const maxBarAmount = useMemo(() => {
    const max = Math.max(...stats.timeSeries.map((p) => p.amount), 1)
    return max
  }, [stats.timeSeries])

  const handleOpenCategoryDetail = (categoryId: string) => {
    const canonical = normalizeCategoryAlias(categoryId)
    const cat = finance.categories.find((c) => normalizeCategoryAlias(c.id) === canonical) || {
      id: canonical,
      name: canonical === 'other' ? 'Otros' : categoryId,
      color: '#B9B9B9',
      icon: 'ellipsis',
    }
    setSelectedCategoryForDetail(cat)
  }

  return (
    <main className="page">
      <header className="simple-header">
        <button type="button" className="text-button back-button" onClick={onBack}>
          <AppIcon name="chevron-left" size={16} /> Más
        </button>
        <h1>Estadísticas</h1>
        <div style={{ width: 44 }} />
      </header>

      {/* Selector de Periodo */}
      <div className="segmented">
        {(['day', 'week', 'month', 'year'] as StatsPeriod[]).map((p) => (
          <button
            key={p}
            type="button"
            className={period === p ? 'active' : ''}
            onClick={() => setPeriod(p)}
          >
            {periodLabels[p]}
          </button>
        ))}
      </div>

      {/* Tarjeta de Resumen Neto del Periodo */}
      <section className="hero-card light" style={{ marginTop: 16 }}>
        <span className="hero-tag">Balance neto del {periodLabels[period].toLowerCase()}</span>
        <strong className="hero-main-number">
          {stats.netFlow >= 0 ? '+' : ''}
          {money(stats.netFlow)}
        </strong>

        <div className="hero-kpis">
          <div className="hero-kpi-item">
            <span>{stats.reimbursements > 0 ? 'Ingresos reales' : 'Ingresos'}</span>
            <strong className="positive">+{money(stats.realIncome)}</strong>
          </div>
          <div className="hero-kpi-item">
            <span>{stats.reimbursements > 0 ? 'Gasto neto' : 'Gastos'}</span>
            <strong>−{money(stats.netExpenses)}</strong>
            {stats.reimbursements > 0 && (
              <small className="hero-kpi-sub" style={{ color: '#8b5cf6' }}>
                Bruto: {money(stats.expenses)} · Devuelto: +{money(stats.reimbursements)}
              </small>
            )}
          </div>
          <div className="hero-kpi-item">
            <span>Ahorro transferido</span>
            <strong className="savings-highlight">{money(stats.savingsTransferred)}</strong>
          </div>
        </div>
      </section>

      {/* Comparativa con Periodo Anterior (si aplica) */}
      {comparison && (
        <div className="comparison-banner">
          <span className="comparison-label">
            Comparado con {period === 'month' ? 'el mes anterior' : 'la semana anterior'}:
          </span>
          <div className="comparison-values">
            <strong>
              {comparison.diffAmount > 0 ? '+' : ''}
              {money(comparison.diffAmount)}
            </strong>
            {comparison.percentageDiff !== null ? (
              <span
                className={`comparison-pct ${comparison.isHigher ? 'higher' : 'lower'}`}
              >
                {comparison.diffAmount > 0 ? '▲' : '▼'} {Math.abs(comparison.percentageDiff)}%
              </span>
            ) : (
              <span className="comparison-pct neutral">Primer registro</span>
            )}
          </div>
        </div>
      )}

      {/* Métricas Secundarias */}
      <div className="stats-kpi-grid">
        <div className="stat-box">
          <span>Movimientos</span>
          <b>{stats.transactionCount}</b>
        </div>
        <div className="stat-box">
          <span>Gasto medio / día</span>
          <b>{money(stats.averageDailySpend)}</b>
        </div>
        {stats.cashWithdrawals > 0 ? (
          <div className="stat-box highlight-withdrawal">
            <span>Cajero / Efectivo</span>
            <b>{money(stats.cashWithdrawals)}</b>
          </div>
        ) : (
          <div className="stat-box">
            <span>Mayor categoría</span>
            <b>{stats.topCategory ? `${stats.topCategory.name}` : '—'}</b>
          </div>
        )}
      </div>

      {/* Gráfico 1: Evolución Temporal (Barras CSS/SVG puras) */}
      <section className="section">
        <div className="section-title">
          <h2>Evolución de gastos</h2>
          <span>{periodLabels[period]}</span>
        </div>

        <div className="chart-card">
          <div className="bar-chart-container">
            {stats.timeSeries.map((point, index) => {
              const heightPct = Math.round((point.amount / maxBarAmount) * 100)

              return (
                <div className="bar-column" key={`${point.label}-${index}`}>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ height: `${Math.max(4, heightPct)}%` }}
                      title={`${point.label}: ${money(point.amount)}`}
                    />
                  </div>
                  <span className="bar-label">{point.label}</span>
                  {point.amount > 0 && <span className="bar-val">{Math.round(point.amount)}€</span>}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Gráfico 2: Distribución por Categoría */}
      <section className="section">
        <div className="section-title">
          <h2>Distribución por categorías</h2>
          <span>{money(stats.expenses)} total</span>
        </div>

        {stats.expenses > 0 ? (
          <>
            <DonutChart
              transactions={periodTransactions}
              categories={finance.categories}
              onSelectCategoryFilter={handleOpenCategoryDetail}
            />

            <div className="category-stats-list" style={{ marginTop: 16 }}>
              {stats.categoryBreakdown.map((cat) => (
                <div
                  className="category-stat-row clickable"
                  key={cat.categoryId}
                  onClick={() => handleOpenCategoryDetail(cat.categoryId)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Ver movimientos de ${cat.name}`}
                >
                  <div className="cat-stat-left">
                    <span className="category-dot mini" style={{ background: cat.color }}>
                      <AppIcon name={cat.icon} size={14} color="#fff" />
                    </span>
                    <strong>{cat.name}</strong>
                  </div>
                  <div className="cat-stat-right">
                    <strong>{money(cat.amount)}</strong>
                    <small>{cat.percentage}%</small>
                    <AppIcon name="chevron-right" size={14} color="#94a3b8" />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="transaction-list empty">
            <p className="muted">No hay gastos registrados en este periodo.</p>
          </div>
        )}
      </section>

      {/* Sección 3: Clasificación por Naturaleza (Fijo / Variable / Extraordinario) */}
      {stats.expenses > 0 && (
        <section className="section">
          <div className="section-title">
            <h2>Naturaleza del gasto</h2>
            <span>{periodLabels[period]}</span>
          </div>

          <div className="nature-breakdown-card">
            <div className="nature-progress-bar">
              {stats.natureBreakdown.variable > 0 && (
                <div
                  className="nature-bar-segment variable"
                  style={{ width: `${stats.natureBreakdown.variablePct}%` }}
                  title={`Variable: ${money(stats.natureBreakdown.variable)} (${stats.natureBreakdown.variablePct}%)`}
                />
              )}
              {stats.natureBreakdown.fixed > 0 && (
                <div
                  className="nature-bar-segment fixed"
                  style={{ width: `${stats.natureBreakdown.fixedPct}%` }}
                  title={`Fijo / Comprometido: ${money(stats.natureBreakdown.fixed)} (${stats.natureBreakdown.fixedPct}%)`}
                />
              )}
              {stats.natureBreakdown.extraordinary > 0 && (
                <div
                  className="nature-bar-segment extraordinary"
                  style={{ width: `${stats.natureBreakdown.extraordinaryPct}%` }}
                  title={`Extraordinario: ${money(stats.natureBreakdown.extraordinary)} (${stats.natureBreakdown.extraordinaryPct}%)`}
                />
              )}
            </div>

            <div className="nature-legend-grid">
              <div className="nature-legend-item">
                <span className="nature-dot variable" />
                <div className="nature-legend-text">
                  <span className="nature-legend-title">Variable</span>
                  <strong>{money(stats.natureBreakdown.variable)}</strong>
                  <small>{stats.natureBreakdown.variablePct}% del gasto</small>
                </div>
              </div>

              <div className="nature-legend-item">
                <span className="nature-dot fixed" />
                <div className="nature-legend-text">
                  <span className="nature-legend-title">Fijo / Comprometido</span>
                  <strong>{money(stats.natureBreakdown.fixed)}</strong>
                  <small>{stats.natureBreakdown.fixedPct}% del gasto</small>
                </div>
              </div>

              <div className="nature-legend-item">
                <span className="nature-dot extraordinary" />
                <div className="nature-legend-text">
                  <span className="nature-legend-title">Extraordinario</span>
                  <strong>{money(stats.natureBreakdown.extraordinary)}</strong>
                  <small>{stats.natureBreakdown.extraordinaryPct}% del gasto</small>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Modal de Detalle de Categoría */}
      <CategoryDetailModal
        open={Boolean(selectedCategoryForDetail)}
        onClose={() => setSelectedCategoryForDetail(null)}
        category={selectedCategoryForDetail}
        transactions={periodTransactions}
        categories={finance.categories}
        expenseShares={finance.expenseShares}
        mode="net"
        periodLabel={periodLabels[period]}
        onSelectTransaction={onSelectTransaction}
        onEditTransaction={onSelectTransaction}
      />
    </main>
  )
}

import { useMemo, useState } from 'react'
import { DonutChart } from '../components/DonutChart'
import type { ReturnTypeFinance } from '../types'
import {
  calculatePeriodStatistics,
  compareWithPreviousPeriod,
  getPreviousLocalDateRange,
  type StatsPeriod,
} from '../utils/statisticsSelectors'
import { money } from '../utils/money'
import { AppIcon } from '../ui/icons'

export function StatisticsPage({
  finance,
  onBack,
}: {
  finance: ReturnTypeFinance
  onBack: () => void
}) {
  const [period, setPeriod] = useState<StatsPeriod>('month')
  const now = useMemo(() => new Date(), [])

  // Estadísticas del periodo actual
  const stats = useMemo(() => {
    return calculatePeriodStatistics(finance.transactions, finance.categories, period, now)
  }, [finance.transactions, finance.categories, period, now])

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
            <span>Ingresos</span>
            <strong className="positive">+{money(stats.income)}</strong>
          </div>
          <div className="hero-kpi-item">
            <span>Gastos</span>
            <strong>−{money(stats.expenses)}</strong>
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
        <div className="stat-box">
          <span>Mayor categoría</span>
          <b>{stats.topCategory ? `${stats.topCategory.icon} ${stats.topCategory.name}` : '—'}</b>
        </div>
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
              transactions={finance.transactions.filter((t) => {
                const txTime = new Date(t.date).getTime()
                return txTime >= stats.dateRange.start.getTime() && txTime <= stats.dateRange.end.getTime()
              })}
              categories={finance.categories}
            />

            <div className="category-stats-list" style={{ marginTop: 16 }}>
              {stats.categoryBreakdown.map((cat) => (
                <div className="category-stat-row" key={cat.categoryId}>
                  <div className="cat-stat-left">
                    <span className="category-dot mini" style={{ background: cat.color }}>
                      <AppIcon name={cat.icon} size={14} color="#fff" />
                    </span>
                    <strong>{cat.name}</strong>
                  </div>
                  <div className="cat-stat-right">
                    <strong>{money(cat.amount)}</strong>
                    <small>{cat.percentage}%</small>
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
    </main>
  )
}

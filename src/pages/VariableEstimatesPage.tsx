import { useState } from 'react'
import type {
  CreateVariableExpenseEstimateInput,
  UpdateVariableExpenseEstimateInput,
  VariableExpenseEstimate,
} from '../models/finance'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'
import {
  calculateMonthlyEstimate,
  calculatePendingEstimate,
  calculateRealSpentForEstimate,
} from '../utils/variableEstimates'
import { AppIcon } from '../ui/icons'
import { VariableEstimateModal } from '../components/VariableEstimateModal'

export function VariableEstimatesPage({
  finance,
  onBack,
}: {
  finance: ReturnTypeFinance
  onBack: () => void
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingEstimate, setEditingEstimate] = useState<VariableExpenseEstimate | null>(null)

  const estimates = finance.variableExpenseEstimates ?? []
  const transactions = finance.transactions ?? []
  const categories = finance.categories ?? []
  const currentMonthKey = new Date().toISOString().slice(0, 7)

  const handleOpenCreate = () => {
    setEditingEstimate(null)
    setModalOpen(true)
  }

  const handleOpenEdit = (est: VariableExpenseEstimate) => {
    setEditingEstimate(est)
    setModalOpen(true)
  }

  const handleSave = (
    data: CreateVariableExpenseEstimateInput | UpdateVariableExpenseEstimateInput,
    id?: string
  ) => {
    if (id) {
      finance.updateVariableExpenseEstimate(id, data)
    } else {
      finance.addVariableExpenseEstimate(data as CreateVariableExpenseEstimateInput)
    }
  }

  const handleDelete = (id: string) => {
    finance.deleteVariableExpenseEstimate(id)
  }

  // Resumen
  const summary = finance.totals.variableEstimatesSummary ?? {
    totalEstimatedMonthly: 0,
    totalRealSpentMonthly: 0,
    totalPendingEstimated: 0,
    activeCount: 0,
  }

  return (
    <main className="page">
      <header className="simple-header">
        <button type="button" className="text-button back-button" onClick={onBack}>
          <AppIcon name="chevron-left" size={16} /> Más
        </button>
        <h1>Gastos variables</h1>
        <button
          type="button"
          className="round-button"
          onClick={handleOpenCreate}
          aria-label="Añadir previsión variable"
        >
          <AppIcon name="plus" size={18} />
        </button>
      </header>

      {/* Hero Card de Resumen */}
      <section className="hero-card light" style={{ marginBottom: 20 }}>
        <span>Previsión mensual de variables</span>
        <strong>{money(summary.totalEstimatedMonthly)}</strong>
        <div className="hero-meta" style={{ display: 'flex', gap: 16, marginTop: 8 }}>
          <span>
            Real este mes: <b>{money(summary.totalRealSpentMonthly)}</b>
          </span>
          <span>
            Pendiente: <b>{money(summary.totalPendingEstimated)}</b>
          </span>
        </div>
      </section>

      {/* Tarjeta explicativa limpia */}
      <div
        style={{
          padding: '12px 16px',
          borderRadius: '12px',
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          fontSize: '0.84rem',
          color: 'var(--text-main, #334155)',
          marginBottom: 20,
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
        }}
      >
        <span style={{ color: '#3b82f6', marginTop: 2 }}>
          <AppIcon name="shield" size={16} />
        </span>
        <div>
          <strong>Estimación por frecuencia de uso:</strong> Esta sección calcula una previsión
          mensual aproximada pero <em>no</em> registra movimientos ficticios ni altera el saldo de
          tus cuentas. El gasto real solo cuenta cuando introduces un movimiento real con ese nombre.
        </div>
      </div>

      {/* Lista de Gastos Variables Previstos */}
      <section className="section">
        <div className="section-title">
          <h2>Estimaciones activas ({estimates.length})</h2>
        </div>

        {estimates.length === 0 ? (
          <div className="transaction-list empty">
            <p className="muted">No tienes ningún gasto variable previsto configurado.</p>
            <button
              type="button"
              className="primary-button"
              onClick={handleOpenCreate}
              style={{ marginTop: 12 }}
            >
              Crear primera previsión
            </button>
          </div>
        ) : (
          <div className="recurring-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {estimates.map((est) => {
              const category = categories.find((c) => c.id === est.categoryId)
              const monthly = calculateMonthlyEstimate(est.unitCost, est.frequencyType, est.frequencyValue)
              const realSpent = calculateRealSpentForEstimate(est, transactions, currentMonthKey)
              const pending = calculatePendingEstimate(monthly, realSpent)
              const freqText =
                est.frequencyType === 'per_week'
                  ? `${est.unitCost.toFixed(2)} € × ${est.frequencyValue}/sem`
                  : `${est.unitCost.toFixed(2)} € × ${est.frequencyValue}/mes`

              return (
                <article
                  key={est.id}
                  className={`recurring-card ${!est.active ? 'inactive' : ''}`}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '16px',
                    border: '1px solid var(--border-color, #e2e8f0)',
                    backgroundColor: 'var(--bg-card, #ffffff)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    opacity: est.active ? 1 : 0.65,
                    transition: 'opacity 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          backgroundColor: category?.color ? `${category.color}22` : '#e2e8f0',
                          color: category?.color || '#64748b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <AppIcon name={category?.iconKey || 'tag'} size={18} />
                      </span>
                      <div>
                        <strong style={{ fontSize: '1rem', display: 'block' }}>{est.name}</strong>
                        <small style={{ color: 'var(--text-muted, #64748b)' }}>
                          {category?.name || 'General'} · {freqText}
                        </small>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main, #1e293b)' }}>
                        ~{money(monthly)}
                      </span>
                      <small style={{ display: 'block', color: 'var(--text-muted, #64748b)', fontSize: '0.75rem' }}>
                        previsto/mes
                      </small>
                    </div>
                  </div>

                  {/* Fila de progreso real vs pendiente */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderRadius: 10,
                      backgroundColor: 'var(--bg-card-light, #f8fafc)',
                      fontSize: '0.82rem',
                    }}
                  >
                    <span>
                      Gastado real este mes: <strong style={{ color: realSpent > 0 ? '#10b981' : 'inherit' }}>{money(realSpent)}</strong>
                    </span>
                    <span>
                      Pendiente estimado:{' '}
                      <strong style={{ color: pending > 0 ? '#3b82f6' : 'inherit' }}>{money(pending)}</strong>
                    </span>
                  </div>

                  {/* Acciones de la tarjeta */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 2 }}>
                    <button
                      type="button"
                      onClick={() => finance.toggleVariableExpenseEstimate(est.id)}
                      className="text-button"
                      style={{
                        fontSize: '0.8rem',
                        color: est.active ? 'var(--accent-green, #10b981)' : 'var(--text-muted, #64748b)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <AppIcon name={est.active ? 'check' : 'clock'} size={12} />
                      <span>{est.active ? 'Activa este mes' : 'En pausa'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(est)}
                      className="text-button"
                      style={{ fontSize: '0.82rem', fontWeight: 600 }}
                    >
                      Editar
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <VariableEstimateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        categories={categories}
        estimate={editingEstimate}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </main>
  )
}

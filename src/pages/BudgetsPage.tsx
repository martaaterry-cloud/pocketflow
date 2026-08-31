import { useState } from 'react'
import { BudgetModal } from '../components/BudgetModal'
import type { Budget, CreateBudgetInput, UpdateBudgetInput } from '../models/finance'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'

export function BudgetsPage({
  finance,
  onBack,
}: {
  finance: ReturnTypeFinance
  onBack: () => void
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)

  const summary = finance.totals.budgetsSummary

  const handleOpenCreate = () => {
    setEditingBudget(null)
    setModalOpen(true)
  }

  const handleOpenEdit = (b: Budget) => {
    setEditingBudget(b)
    setModalOpen(true)
  }

  const handleSave = (data: CreateBudgetInput | UpdateBudgetInput, id?: string) => {
    if (id) {
      finance.updateBudget(id, data)
    } else {
      finance.addBudget(data as CreateBudgetInput)
    }
  }

  return (
    <main className="page">
      <header className="simple-header">
        <button type="button" className="text-button back-button" onClick={onBack}>
          ‹ Más
        </button>
        <h1>Presupuestos</h1>
        <button
          type="button"
          className="round-button"
          onClick={handleOpenCreate}
          aria-label="Añadir presupuesto"
        >
          ＋
        </button>
      </header>

      {/* Tarjeta de Resumen Global de Presupuestos */}
      <section className="hero-card light" style={{ marginBottom: 20 }}>
        <span className="hero-tag">Presupuesto mensual total</span>
        <strong className="hero-main-number">{money(summary.totalBudgeted)}</strong>

        <div className="hero-kpis">
          <div className="hero-kpi-item">
            <span>Gastado</span>
            <strong>{money(summary.totalSpentOnBudgetedCategories)}</strong>
          </div>
          <div className="hero-kpi-item">
            <span>Restante global</span>
            <strong>{money(summary.totalRemaining)}</strong>
          </div>
          <div className="hero-kpi-item">
            <span>Consumo</span>
            <strong>{summary.overallUsagePercentage}%</strong>
          </div>
        </div>
      </section>

      {/* Lista de Presupuestos por Categoría */}
      <section className="section">
        <div className="section-title">
          <h2>Límites por categoría</h2>
          <span>{summary.items.length} activos</span>
        </div>

        {summary.items.length === 0 ? (
          <div className="transaction-list empty">
            <p className="muted">No has definido ningún presupuesto por categoría.</p>
            <button
              type="button"
              className="primary-button"
              style={{ marginTop: 14, maxWidth: 220 }}
              onClick={handleOpenCreate}
            >
              Crear primer presupuesto
            </button>
          </div>
        ) : (
          <div className="budget-list">
            {summary.items.map((item) => {
              const fullBudget = finance.budgets.find((b) => b.id === item.id)

              return (
                <div
                  className={`budget-card ${item.isOverBudget ? 'over-budget' : ''}`}
                  key={item.id}
                  onClick={() => fullBudget && handleOpenEdit(fullBudget)}
                >
                  <div className="budget-header">
                    <div className="budget-title">
                      <span
                        className="category-dot mini"
                        style={{ background: item.categoryColor }}
                      >
                        {item.categoryIcon}
                      </span>
                      <div>
                        <strong>{item.categoryName}</strong>
                        <span className="budget-amounts-sub">
                          {money(item.spent)} de {money(item.amountLimit)}
                        </span>
                      </div>
                    </div>

                    <div className="budget-badge-box">
                      {item.isOverBudget ? (
                        <span className="badge-status over">
                          {money(item.overBudget)} por encima
                        </span>
                      ) : (
                        <span className="badge-status ok">Quedan {money(item.remaining)}</span>
                      )}
                    </div>
                  </div>

                  <div className="progress">
                    <i
                      style={{
                        width: `${Math.min(100, item.percentage)}%`,
                        background: item.isOverBudget ? 'var(--accent-red)' : item.categoryColor,
                      }}
                    />
                  </div>

                  <div className="budget-footer">
                    <span>{item.percentage}% del presupuesto</span>
                    <button
                      type="button"
                      className="text-button mini"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (fullBudget) handleOpenEdit(fullBudget)
                      }}
                    >
                      Editar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="info-callout" style={{ marginTop: 24 }}>
          <p>
            ℹ️ <strong>Criterio de cálculo:</strong> Los presupuestos solo computan los gastos reales
            del mes. Las transferencias entre cuentas y el ahorro no consumen presupuesto.
          </p>
        </div>
      </section>

      <BudgetModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditingBudget(null)
        }}
        categories={finance.categories}
        existingBudgets={finance.budgets}
        budget={editingBudget}
        onSave={handleSave}
        onDelete={finance.deleteBudget}
      />
    </main>
  )
}

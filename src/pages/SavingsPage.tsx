import { useState } from 'react'
import { AllocateSavingsModal } from '../components/AllocateSavingsModal'
import { GoalModal } from '../components/GoalModal'
import type { CreateSavingsGoalInput, SavingsGoal, UpdateSavingsGoalInput } from '../models/finance'
import type { ReturnTypeFinance } from '../types'
import { selectGoalProgress } from '../utils/financeSelectors'
import { money } from '../utils/money'

export function SavingsPage({ finance }: { finance: ReturnTypeFinance }) {
  const [goalModalOpen, setGoalModalOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null)

  const [allocateModalOpen, setAllocateModalOpen] = useState(false)
  const [targetGoalForAllocation, setTargetGoalForAllocation] = useState<SavingsGoal | null>(null)

  const handleOpenCreateGoal = () => {
    setEditingGoal(null)
    setGoalModalOpen(true)
  }

  const handleOpenEditGoal = (goal: SavingsGoal) => {
    setEditingGoal(goal)
    setGoalModalOpen(true)
  }

  const handleSaveGoal = (
    data: CreateSavingsGoalInput | UpdateSavingsGoalInput,
    id?: string
  ) => {
    if (id) {
      finance.updateSavingsGoal(id, data)
    } else {
      finance.addSavingsGoal(data as CreateSavingsGoalInput)
    }
  }

  const handleOpenAllocate = (goal: SavingsGoal) => {
    setTargetGoalForAllocation(goal)
    setAllocateModalOpen(true)
  }

  return (
    <main className="page">
      <header className="simple-header">
        <h1>Ahorro</h1>
      </header>

      {/* Tarjeta de Ahorro y Distribución Lógica */}
      <section className="hero-card light">
        <span className="hero-tag">Ahorro total</span>
        <strong className="hero-main-number">{money(finance.totals.savingsBalance)}</strong>

        <div className="hero-kpis">
          <div className="hero-kpi-item">
            <span>Ahorro asignado</span>
            <strong>{money(finance.totals.assignedSavings)}</strong>
          </div>
          <div className="hero-kpi-item">
            <span>Ahorro libre</span>
            <strong>{money(finance.totals.freeSavings)}</strong>
          </div>
          <div className="hero-kpi-item">
            <span>Objetivos activos</span>
            <strong>{finance.goals.length}</strong>
          </div>
        </div>
      </section>

      {/* Lista de Objetivos */}
      <section className="section">
        <div className="section-title">
          <h2>Objetivos de ahorro</h2>
          <button type="button" className="text-button" onClick={handleOpenCreateGoal}>
            ＋ Nuevo
          </button>
        </div>

        {finance.goals.length === 0 ? (
          <div className="transaction-list empty">
            <p className="muted">No tienes objetivos de ahorro todavía.</p>
            <button
              type="button"
              className="primary-button"
              style={{ marginTop: 14, maxWidth: 220 }}
              onClick={handleOpenCreateGoal}
            >
              Crear primer objetivo
            </button>
          </div>
        ) : (
          <div className="goals-grid">
            {finance.goals.map((goal) => {
              const { percentage, isCompleted } = selectGoalProgress(goal.current, goal.target)

              return (
                <div className="goal-card" key={goal.id}>
                  <div className="goal-header">
                    <div className="goal-title-area">
                      <span className="goal-emoji">{goal.icon ?? '🎯'}</span>
                      <div>
                        <strong>{goal.name}</strong>
                        {goal.targetDate && (
                          <span className="goal-deadline">Meta: {goal.targetDate}</span>
                        )}
                      </div>
                    </div>
                    <span className={`goal-badge ${isCompleted ? 'completed' : ''}`}>
                      {isCompleted ? '¡Conseguido! 🎉' : `${percentage}%`}
                    </span>
                  </div>

                  <div className="goal-amounts">
                    <span>
                      Asignado: <b>{money(goal.current)}</b>
                    </span>
                    <span>
                      Objetivo: <b>{money(goal.target)}</b>
                    </span>
                  </div>

                  <div className="progress">
                    <i style={{ width: `${percentage}%` }} />
                  </div>

                  <div className="goal-actions-row">
                    <button
                      type="button"
                      className="goal-action-btn primary"
                      onClick={() => handleOpenAllocate(goal)}
                    >
                      Asignar / Retirar
                    </button>
                    <button
                      type="button"
                      className="goal-action-btn secondary"
                      onClick={() => handleOpenEditGoal(goal)}
                    >
                      Editar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Modales */}
      <GoalModal
        open={goalModalOpen}
        onClose={() => {
          setGoalModalOpen(false)
          setEditingGoal(null)
        }}
        goal={editingGoal}
        onSave={handleSaveGoal}
        onDelete={finance.deleteSavingsGoal}
      />

      <AllocateSavingsModal
        open={allocateModalOpen}
        onClose={() => {
          setAllocateModalOpen(false)
          setTargetGoalForAllocation(null)
        }}
        goal={targetGoalForAllocation}
        freeSavings={finance.totals.freeSavings}
        onAllocate={finance.allocateSavingsToGoal}
        onDeallocate={finance.deallocateSavingsFromGoal}
      />
    </main>
  )
}

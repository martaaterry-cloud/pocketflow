import { useMemo, useState } from 'react'
import { AllocateEmergencyModal } from '../components/AllocateEmergencyModal'
import { AllocateReserveModal } from '../components/AllocateReserveModal'
import { AllocateSavingsModal } from '../components/AllocateSavingsModal'
import { GoalModal } from '../components/GoalModal'
import { ReserveModal } from '../components/ReserveModal'
import type {
  CreateReserveInput,
  CreateSavingsGoalInput,
  Reserve,
  SavingsGoal,
  UpdateReserveInput,
  UpdateSavingsGoalInput,
} from '../models/finance'
import type { ReturnTypeFinance } from '../types'
import { selectGoalProgress } from '../utils/financeSelectors'
import { selectMonthlyReserveNeeded } from '../utils/planSelectors'
import { money } from '../utils/money'
import { AppIcon } from '../ui/icons'

export function SavingsPage({ finance }: { finance: ReturnTypeFinance }) {
  const now = useMemo(() => new Date(), [])
  const plan = finance.totals.planMetrics

  // Estados modales de Objetivos
  const [goalModalOpen, setGoalModalOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null)
  const [allocateGoalOpen, setAllocateGoalOpen] = useState(false)
  const [targetGoalForAllocation, setTargetGoalForAllocation] = useState<SavingsGoal | null>(null)

  // Estados modales de Fondo de Emergencia
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false)

  // Estados modales de Reservas
  const [reserveModalOpen, setReserveModalOpen] = useState(false)
  const [editingReserve, setEditingReserve] = useState<Reserve | null>(null)
  const [allocateReserveOpen, setAllocateReserveOpen] = useState(false)
  const [targetReserveForAlloc, setTargetReserveForAlloc] = useState<Reserve | null>(null)

  // Cálculo de totales asignados
  const totalAssignedSavings = useMemo(() => {
    const goals = finance.totals.assignedSavings || 0
    const reserves = finance.totals.reservesAllocated || 0
    const emergency = finance.totals.emergencyAllocated || 0
    return Math.round((goals + reserves + emergency) * 100) / 100
  }, [finance.totals.assignedSavings, finance.totals.reservesAllocated, finance.totals.emergencyAllocated])

  // Handlers para Objetivos
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

  const handleOpenAllocateGoal = (goal: SavingsGoal) => {
    setTargetGoalForAllocation(goal)
    setAllocateGoalOpen(true)
  }

  // Handlers para Reservas
  const handleOpenCreateReserve = () => {
    setEditingReserve(null)
    setReserveModalOpen(true)
  }

  const handleOpenEditReserve = (r: Reserve) => {
    setEditingReserve(r)
    setReserveModalOpen(true)
  }

  const handleSaveReserve = (data: CreateReserveInput | UpdateReserveInput, id?: string) => {
    if (id) {
      finance.updateReserve(id, data)
    } else {
      finance.addReserve(data as CreateReserveInput)
    }
  }

  const handleOpenAllocateReserve = (r: Reserve) => {
    setTargetReserveForAlloc(r)
    setAllocateReserveOpen(true)
  }

  const hasGoals = (finance.goals || []).length > 0
  const hasReserves = (finance.reserves || []).length > 0

  return (
    <main className="page">
      <header className="simple-header">
        <h1>Ahorro</h1>
      </header>

      {/* 1. Resumen Central de Ahorro y Distribución */}
      <section className="hero-card light" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 2px' }}>
          <span className="hero-tag">Ahorro total</span>
          <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
            Asignado: <b>{money(totalAssignedSavings)}</b>
          </span>
        </div>
        <strong className="hero-main-number">{money(finance.totals.savingsBalance)}</strong>

        <div className="hero-kpis" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginTop: 14 }}>
          <div className="hero-kpi-item">
            <span>Ahorro libre</span>
            <strong style={{ color: finance.totals.freeSavings > 0 ? '#10b981' : undefined }}>
              {money(finance.totals.freeSavings)}
            </strong>
            <small>Sin asignar</small>
          </div>
          <div className="hero-kpi-item">
            <span>Fondo emergencia</span>
            <strong>{money(finance.totals.emergencyAllocated ?? 0)}</strong>
            <small>Imprevistos</small>
          </div>
          <div className="hero-kpi-item">
            <span>En objetivos</span>
            <strong>{money(finance.totals.assignedSavings)}</strong>
            <small>Metas voluntarias</small>
          </div>
          <div className="hero-kpi-item">
            <span>En reservas</span>
            <strong>{money(finance.totals.reservesAllocated ?? 0)}</strong>
            <small>Gastos previstos</small>
          </div>
        </div>
      </section>

      {/* 2. Sección A: Fondo de Emergencia */}
      <section className="section" style={{ marginBottom: 28 }}>
        <div className="section-title">
          <h2>Fondo de emergencia</h2>
        </div>
        <p className="section-subtitle">
          Dinero reservado para imprevistos y tranquilidad financiera ante contingencias.
        </p>

        <div className="account-card" style={{ marginTop: 12 }}>
          <div className="account-header" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div className="account-title">
              <span className="account-icon savings">
                <AppIcon name="shield" size={18} />
              </span>
              <div>
                <strong>Colchón de seguridad</strong>
                <span className="account-subtitle">
                  {plan.emergencyFundMonthsCovered} meses cubiertos
                </span>
              </div>
            </div>
            <div className="account-balance-box">
              <span className="balance-label">Fondo actual</span>
              <strong className="balance-value">{money(finance.totals.emergencyAllocated ?? 0)}</strong>
            </div>
          </div>

          <div className="plan-progress-box">
            <div className="progress" style={{ marginTop: 10 }}>
              <i
                style={{
                  width: `${Math.min(
                    100,
                    plan.emergencyFundTarget > 0
                      ? Math.round(((finance.totals.emergencyAllocated ?? 0) / plan.emergencyFundTarget) * 100)
                      : 0
                  )}%`,
                }}
              />
            </div>
            <div className="progress-labels">
              <span>
                Objetivo: <b>{money(plan.emergencyFundTarget)}</b>
              </span>
              <span>
                Pendiente: <b>{money(Math.max(0, plan.emergencyFundTarget - (finance.totals.emergencyAllocated ?? 0)))}</b>
              </span>
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              className="goal-action-btn primary"
              style={{ maxWidth: 220, width: '100%', padding: '8px 16px', fontSize: 13 }}
              onClick={() => setEmergencyModalOpen(true)}
            >
              Asignar / Liberar
            </button>
          </div>
        </div>
      </section>

      {/* 3. Sección B: Objetivos de Ahorro */}
      <section className="section" style={{ marginBottom: 28 }}>
        <div className="section-title">
          <h2>Objetivos de ahorro</h2>
          {hasGoals && (
            <button type="button" className="text-button" onClick={handleOpenCreateGoal}>
              <AppIcon name="plus" size={15} /> Nuevo objetivo
            </button>
          )}
        </div>
        <p className="section-subtitle">
          Meta voluntaria que quieres alcanzar (ej. vacaciones, compras grandes, caprichos).
        </p>

        {!hasGoals ? (
          <div
            className="transaction-list empty"
            style={{
              marginTop: 12,
              padding: '24px 16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              No tienes objetivos de ahorro todavía.
            </p>
            <button
              type="button"
              className="primary-button"
              style={{ marginTop: 14, maxWidth: 220, width: '100%', alignSelf: 'center' }}
              onClick={handleOpenCreateGoal}
            >
              Crear primer objetivo
            </button>
          </div>
        ) : (
          <div className="goals-grid" style={{ marginTop: 12 }}>
            {finance.goals.map((goal) => {
              const { percentage, isCompleted } = selectGoalProgress(goal.current, goal.target)

              return (
                <div className="goal-card" key={goal.id}>
                  <div className="goal-header">
                    <div className="goal-title-area">
                      <span className="goal-icon-badge">
                        <AppIcon name={goal.iconKey || goal.icon || 'target'} size={20} />
                      </span>
                      <div>
                        <strong>{goal.name}</strong>
                        {goal.targetDate && (
                          <span className="goal-deadline">Meta: {goal.targetDate}</span>
                        )}
                      </div>
                    </div>
                    <span className={`goal-badge ${isCompleted ? 'completed' : ''}`}>
                      {isCompleted ? 'Completado' : `${percentage}%`}
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
                      onClick={() => handleOpenAllocateGoal(goal)}
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

      {/* 4. Sección C: Reservas de Gastos Previstos */}
      <section className="section" style={{ marginBottom: 32 }}>
        <div className="section-title">
          <h2>Reservas de gastos previstos</h2>
          {hasReserves && (
            <button type="button" className="text-button" onClick={handleOpenCreateReserve}>
              <AppIcon name="plus" size={15} /> Nueva reserva
            </button>
          )}
        </div>
        <p className="section-subtitle">
          Dinero apartado para un gasto futuro previsto (ej. seguro anual, Navidad, matrícula, ITV).
        </p>

        {!hasReserves ? (
          <div
            className="transaction-list empty"
            style={{
              marginTop: 12,
              padding: '24px 16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              No has creado ninguna reserva todavía.
            </p>
            <button
              type="button"
              className="primary-button"
              style={{ marginTop: 14, maxWidth: 220, width: '100%', alignSelf: 'center' }}
              onClick={handleOpenCreateReserve}
            >
              Crear primera reserva
            </button>
          </div>
        ) : (
          <div className="goals-grid" style={{ marginTop: 12 }}>
            {finance.reserves.map((reserve) => {
              const monthlyNeeded = selectMonthlyReserveNeeded(reserve, now)
              const pct =
                reserve.targetAmount > 0
                  ? Math.min(100, Math.round((reserve.currentAllocated / reserve.targetAmount) * 100))
                  : 0
              const isCovered = reserve.currentAllocated >= reserve.targetAmount

              return (
                <div className="goal-card" key={reserve.id}>
                  <div className="goal-header">
                    <div className="goal-title-area">
                      <span className="goal-icon-badge">
                        <AppIcon name={reserve.iconKey} size={20} />
                      </span>
                      <div>
                        <strong>{reserve.name}</strong>
                        <span className="goal-deadline">Previsto: {reserve.targetDate}</span>
                      </div>
                    </div>
                    <span className={`goal-badge ${isCovered ? 'completed' : ''}`}>
                      {isCovered ? 'Cubierta' : `${pct}%`}
                    </span>
                  </div>

                  <div className="goal-amounts">
                    <span>
                      Asignado: <b>{money(reserve.currentAllocated)}</b>
                    </span>
                    <span>
                      Objetivo: <b>{money(reserve.targetAmount)}</b>
                    </span>
                  </div>

                  <div className="progress">
                    <i style={{ width: `${pct}%` }} />
                  </div>

                  <div className="reserve-meta-row" style={{ margin: '8px 0', fontSize: 13, color: '#555' }}>
                    {isCovered ? (
                      <span style={{ color: '#2e7d32', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <AppIcon name="check" size={14} color="#2e7d32" /> Totalmente reservada
                      </span>
                    ) : (
                      <span>Cuota sugerida: <b>{money(monthlyNeeded)}/mes</b></span>
                    )}
                  </div>

                  <div className="goal-actions-row">
                    <button
                      type="button"
                      className="goal-action-btn primary"
                      onClick={() => handleOpenAllocateReserve(reserve)}
                    >
                      Asignar / Retirar
                    </button>
                    <button
                      type="button"
                      className="goal-action-btn secondary"
                      onClick={() => handleOpenEditReserve(reserve)}
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

      {/* Modales de Objetivos */}
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
        open={allocateGoalOpen}
        onClose={() => {
          setAllocateGoalOpen(false)
          setTargetGoalForAllocation(null)
        }}
        goal={targetGoalForAllocation}
        freeSavings={finance.totals.freeSavings}
        onAllocate={finance.allocateSavingsToGoal}
        onDeallocate={finance.deallocateSavingsFromGoal}
      />

      {/* Modal de Fondo de Emergencia */}
      <AllocateEmergencyModal
        open={emergencyModalOpen}
        onClose={() => setEmergencyModalOpen(false)}
        freeSavings={finance.totals.freeSavings}
        currentEmergency={finance.totals.emergencyAllocated ?? 0}
        targetEmergency={plan.emergencyFundTarget}
        onAllocate={finance.allocateEmergencyFund}
        onDeallocate={finance.deallocateEmergencyFund}
      />

      {/* Modales de Reservas */}
      <ReserveModal
        open={reserveModalOpen}
        onClose={() => {
          setReserveModalOpen(false)
          setEditingReserve(null)
        }}
        reserve={editingReserve}
        onSave={handleSaveReserve}
        onDelete={finance.deleteReserve}
      />

      <AllocateReserveModal
        open={allocateReserveOpen}
        onClose={() => {
          setAllocateReserveOpen(false)
          setTargetReserveForAlloc(null)
        }}
        reserve={targetReserveForAlloc}
        freeSavings={finance.totals.freeSavings}
        onAllocate={finance.allocateToReserve}
        onDeallocate={finance.deallocateFromReserve}
      />
    </main>
  )
}

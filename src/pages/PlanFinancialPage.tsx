import { useMemo, useState } from 'react'
import type {
  CreateReserveInput,
  CreateSpecialPeriodInput,
  Reserve,
  SpecialPeriod,
  UpdatePlanSettingsInput,
  UpdateReserveInput,
  UpdateSpecialPeriodInput,
} from '../models/finance'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'
import { AppIcon } from '../ui/icons'
import {
  selectAnnualForecast12Months,
  selectMonthlyReserveNeeded,
  selectUpcomingSpecialPeriods,
} from '../utils/planSelectors'
import { AllocateEmergencyModal } from '../components/AllocateEmergencyModal'
import { AllocateReserveModal } from '../components/AllocateReserveModal'
import { PlanSettingsModal } from '../components/PlanSettingsModal'
import { ReserveModal } from '../components/ReserveModal'
import { SpecialPeriodModal } from '../components/SpecialPeriodModal'

export function PlanFinancialPage({
  finance,
  onBack,
  onNavigateToRecurring,
}: {
  finance: ReturnTypeFinance
  onBack: () => void
  onNavigateToRecurring?: () => void
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false)

  const [reserveModalOpen, setReserveModalOpen] = useState(false)
  const [editingReserve, setEditingReserve] = useState<Reserve | null>(null)

  const [allocateReserveOpen, setAllocateReserveOpen] = useState(false)
  const [targetReserveForAlloc, setTargetReserveForAlloc] = useState<Reserve | null>(null)

  const [specialPeriodModalOpen, setSpecialPeriodModalOpen] = useState(false)
  const [editingPeriod, setEditingPeriod] = useState<SpecialPeriod | null>(null)

  const now = useMemo(() => new Date(), [])
  const plan = finance.totals.planMetrics
  const settings = finance.planSettings

  const upcomingPeriods = useMemo(() => {
    return selectUpcomingSpecialPeriods(finance.specialPeriods || [], now)
  }, [finance.specialPeriods, now])

  const annualForecast = useMemo(() => {
    const baseOutflow =
      plan.expectedCommittedExpenses + (plan.expectedVariableExpenses ?? plan.actualVariableExpenses)
    return selectAnnualForecast12Months(
      settings,
      finance.recurring || [],
      baseOutflow,
      finance.specialPeriods || [],
      finance.reserves || [],
      now
    )
  }, [settings, finance.recurring, plan, finance.specialPeriods, finance.reserves, now])

  const emergencyBase = plan.expectedCommittedExpenses > 0 ? plan.expectedCommittedExpenses : (plan.essentialMonthlyExpenses || 1)
  const scenario3Months = useMemo(() => {
    return Math.round(3 * emergencyBase * 100) / 100
  }, [emergencyBase])

  const scenario6Months = useMemo(() => {
    return Math.round(6 * emergencyBase * 100) / 100
  }, [emergencyBase])

  // Handlers para reservas
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

  // Handlers para periodos especiales
  const handleOpenCreatePeriod = () => {
    setEditingPeriod(null)
    setSpecialPeriodModalOpen(true)
  }

  const handleOpenEditPeriod = (p: SpecialPeriod) => {
    setEditingPeriod(p)
    setSpecialPeriodModalOpen(true)
  }

  const handleSavePeriod = (data: CreateSpecialPeriodInput | UpdateSpecialPeriodInput, id?: string) => {
    if (id) {
      finance.updateSpecialPeriod(id, data)
    } else {
      finance.addSpecialPeriod(data as CreateSpecialPeriodInput)
    }
  }

  const handleSaveSettings = (updates: UpdatePlanSettingsInput) => {
    finance.updatePlanSettings(updates)
  }

  return (
    <main className="page">
      <header className="simple-header">
        <button type="button" className="text-button back-button" onClick={onBack}>
          <AppIcon name="chevron-left" size={16} /> Más
        </button>
        <h1>Plan financiero</h1>
        <button
          type="button"
          className="round-button"
          onClick={() => setSettingsOpen(true)}
          title="Configurar plan"
          aria-label="Configurar plan"
        >
          <AppIcon name="sliders" size={18} />
        </button>
      </header>

      {/* 1. Resumen Mensual y Márgenes */}
      <section className="hero-card light" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="hero-tag">Margen mensual previsto</span>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            {plan.incomeDetail?.source === 'recurring' ? 'Nómina / Recurrente' : plan.incomeDetail?.source === 'manual' ? 'Manual' : 'Sin configurar'}
          </span>
        </div>
        <strong className={`hero-main-number ${plan.estimatedMonthlyMargin >= 0 ? '' : 'negative'}`}>
          {money(plan.estimatedMonthlyMargin)}
        </strong>
        <p className="hero-desc" style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
          Ingresos ({money(plan.monthlyIncome)}) menos comprometido ({money(plan.expectedCommittedExpenses)}), variable ({plan.expectedVariableExpenses !== null ? money(plan.expectedVariableExpenses) : `${money(plan.actualVariableExpenses)} real`}) y ahorro ({money(plan.targetMonthlySavings)}).
        </p>

        {/* Libre para gastar / Margen restante actual */}
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(99, 102, 241, 0.08)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#4338ca', fontWeight: 500 }}>Libre para gastar (margen restante actual)</span>
          <strong style={{ fontSize: 15, color: plan.currentRemainingMargin >= 0 ? '#10b981' : '#ef4444' }}>
            {money(plan.currentRemainingMargin)}
          </strong>
        </div>

        <div className="hero-kpis" style={{ gridTemplateColumns: 'repeat(2, 1fr)', marginTop: 14 }}>
          <div className="hero-kpi-item">
            <span>Ingresos previstos</span>
            <strong>{money(plan.monthlyIncome)}/mes</strong>
            <small>
              {plan.incomeDetail?.source === 'recurring'
                ? `${plan.incomeDetail.items.length} recurrente(s)`
                : 'Configurado'}
            </small>
          </div>
          <div className="hero-kpi-item">
            <span>Gasto comprometido</span>
            <strong>{money(plan.expectedCommittedExpenses)}/mes</strong>
            <small>Suscripciones y fijos</small>
          </div>
          <div className="hero-kpi-item">
            <span>Gasto variable</span>
            <strong>{money(plan.actualVariableExpenses)}</strong>
            <small>
              {plan.expectedVariableExpenses !== null
                ? `Previsto: ${money(plan.expectedVariableExpenses)}`
                : 'Gasto neto real'}
            </small>
          </div>
          <div className="hero-kpi-item">
            <span>Ahorro objetivo</span>
            <strong>{money(plan.targetMonthlySavings)}/mes</strong>
            <small>{settings.targetSavingsType === 'percentage' ? `${settings.targetSavingsValue}% ingresos` : 'Fijo'}</small>
          </div>
        </div>
      </section>

      {/* 2. Fondo de Emergencia */}
      <section className="section">
        <div className="section-title">
          <h2>Fondo de emergencia</h2>
          <button
            type="button"
            className="text-button"
            onClick={() => setEmergencyModalOpen(true)}
          >
            Asignar / Liberar
          </button>
        </div>

        <div className="account-card">
          <div className="account-header">
            <div className="account-title">
              <span className="account-icon savings">
                <AppIcon name="shield" size={18} />
              </span>
              <div>
                <strong>Colchón para imprevistos</strong>
                <span className="account-subtitle">
                  {plan.emergencyFundMonthsCovered} meses de gastos fijos cubiertos
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
                Objetivo configurado: <b>{money(plan.emergencyFundTarget)}</b>
                {settings.emergencyFundTargetType === 'months' ? ` (${settings.emergencyFundTargetValue} meses)` : ''}
              </span>
              <span>
                Pendiente: <b>{money(Math.max(0, plan.emergencyFundTarget - (finance.totals.emergencyAllocated ?? 0)))}</b>
              </span>
            </div>
          </div>

          <div className="scenarios-row" style={{ marginTop: 14 }}>
            <span className="scenarios-title">Escenarios de referencia neutrales:</span>
            <div className="scenarios-badges">
              <span className="scenario-chip">
                3 meses: <b>{money(scenario3Months)}</b>
              </span>
              <span className="scenario-chip">
                6 meses: <b>{money(scenario6Months)}</b>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Reservas (Gastos Previstos de Medio Plazo) */}
      <section className="section" style={{ marginTop: 24 }}>
        <div className="section-title">
          <h2>Reservas de gastos previstos</h2>
          <button type="button" className="text-button" onClick={handleOpenCreateReserve}>
            <AppIcon name="plus" size={14} /> Nueva reserva
          </button>
        </div>

        <p className="section-subtitle">
          Dinero separado para gastos que sabemos que van a ocurrir (Navidad, seguros, vacaciones).
        </p>

        {!finance.reserves?.length ? (
          <div className="transaction-list empty">
            <p className="muted">No has creado ninguna reserva todavía.</p>
            <button
              type="button"
              className="primary-button"
              style={{ marginTop: 12, maxWidth: 220 }}
              onClick={handleOpenCreateReserve}
            >
              Crear primera reserva
            </button>
          </div>
        ) : (
          <div className="goals-grid">
            {finance.reserves.map((reserve) => {
              const monthlyNeeded = selectMonthlyReserveNeeded(reserve, now)
              const pct = reserve.targetAmount > 0
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

      {/* 4. Estacionalidad / Meses Caros */}
      <section className="section" style={{ marginTop: 24 }}>
        <div className="section-title">
          <h2>Estacionalidad y periodos especiales</h2>
          <button type="button" className="text-button" onClick={handleOpenCreatePeriod}>
            <AppIcon name="plus" size={14} /> Añadir periodo
          </button>
        </div>

        <p className="section-subtitle">
          Periodos del año con gastos extraordinarios previstos para comparar con contexto.
        </p>

        {!upcomingPeriods.length ? (
          <div className="transaction-list empty">
            <p className="muted">No tienes periodos especiales configurados.</p>
          </div>
        ) : (
          <div className="special-periods-list">
            {upcomingPeriods.map((period) => (
              <div
                className="special-period-card clickable"
                key={period.id}
                onClick={() => handleOpenEditPeriod(period)}
              >
                <div className="special-period-header">
                  <div>
                    <strong>{period.name}</strong>
                    <span>
                      {period.startDate} al {period.endDate}
                    </span>
                  </div>
                  <span className="badge-status pending">
                    +{money(period.expectedExtraBudget)} previsto
                  </span>
                </div>
                <p className="special-period-context">
                  Este periodo contempla {money(period.expectedExtraBudget)} de gasto extraordinario planificado.
                  {period.note ? ` (${period.note})` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 5. Previsión Anual a 12 Meses */}
      <section className="section" style={{ marginTop: 24, marginBottom: 30 }}>
        <div className="section-title">
          <h2>Previsión para los próximos 12 meses</h2>
        </div>

        <p className="section-subtitle">
          Proyección mensual neutral según tus ingresos, gastos normales, extras estacionales y cuotas de reserva.
        </p>

        <div className="forecast-scroll-container">
          {annualForecast.map((item) => (
            <div
              className={`forecast-card ${item.isHighSpend ? 'high-spend' : ''}`}
              key={item.monthKey}
            >
              <div className="forecast-card-header">
                <strong>{item.monthName} {item.year}</strong>
                {item.isHighSpend && (
                  <span className="forecast-tag high">Gasto alto previsto</span>
                )}
              </div>

              <div className="forecast-kpis">
                <div>
                  <span>Ingresos previstos</span>
                  <b>{money(item.expectedIncome)}</b>
                </div>
                <div>
                  <span>Gasto estimado</span>
                  <b>{money(item.normalExpenses + item.expectedExtraExpenses)}</b>
                  {item.expectedExtraExpenses > 0 && (
                    <small>+{money(item.expectedExtraExpenses)} extra</small>
                  )}
                </div>
                <div>
                  <span>Reservas previstas</span>
                  <b>{money(item.expectedReserves)}</b>
                </div>
                <div>
                  <span>Margen estimado</span>
                  <b className={item.estimatedMargin >= 0 ? 'positive' : 'negative'}>
                    {money(item.estimatedMargin)}
                  </b>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Disclaimer legal / de seguridad */}
      <div className="info-callout" style={{ marginTop: 20, marginBottom: 20 }}>
        <p>
          <AppIcon name="info" size={16} /> <strong>Información de referencia:</strong> Las estimaciones, escenarios y cuotas sugeridas son herramientas orientativas basadas en tus datos y nunca constituyen asesoramiento financiero profesional.
        </p>
      </div>

      {/* Modales */}
      <PlanSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        categories={finance.categories}
        recurring={finance.recurring}
        onSave={handleSaveSettings}
        onNavigateToRecurring={onNavigateToRecurring}
      />

      <AllocateEmergencyModal
        open={emergencyModalOpen}
        onClose={() => setEmergencyModalOpen(false)}
        freeSavings={finance.totals.freeSavings}
        currentEmergency={finance.totals.emergencyAllocated ?? 0}
        targetEmergency={plan.emergencyFundTarget}
        onAllocate={finance.allocateEmergencyFund}
        onDeallocate={finance.deallocateEmergencyFund}
      />

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

      <SpecialPeriodModal
        open={specialPeriodModalOpen}
        onClose={() => {
          setSpecialPeriodModalOpen(false)
          setEditingPeriod(null)
        }}
        period={editingPeriod}
        onSave={handleSavePeriod}
        onDelete={finance.deleteSpecialPeriod}
      />
    </main>
  )
}

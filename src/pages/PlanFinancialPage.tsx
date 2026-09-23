import { useMemo, useState } from 'react'
import type {
  CreateReserveInput,
  CreateSpecialPeriodInput,
  SpecialPeriod,
  UpdatePlanSettingsInput,
  UpdateSpecialPeriodInput,
} from '../models/finance'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'
import { AppIcon } from '../ui/icons'
import {
  buildReserveInitialValuesFromSpecialPeriod,
  selectAnnualForecast12Months,
  selectMonthlyReserveNeeded,
  selectUpcomingSpecialPeriods,
} from '../utils/planSelectors'
import { PlanSettingsModal } from '../components/PlanSettingsModal'
import { SpecialPeriodModal } from '../components/SpecialPeriodModal'
import { ReserveModal, type ReserveInitialValues } from '../components/ReserveModal'

export function PlanFinancialPage({
  finance,
  onBack,
  onNavigateToRecurring,
  onNavigateToSavings,
}: {
  finance: ReturnTypeFinance
  onBack: () => void
  onNavigateToRecurring?: () => void
  onNavigateToSavings?: () => void
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [specialPeriodModalOpen, setSpecialPeriodModalOpen] = useState(false)
  const [editingPeriod, setEditingPeriod] = useState<SpecialPeriod | null>(null)
  const [createdPeriodForReservePrompt, setCreatedPeriodForReservePrompt] = useState<CreateSpecialPeriodInput | null>(null)
  const [reserveModalOpen, setReserveModalOpen] = useState(false)
  const [reserveInitialValues, setReserveInitialValues] = useState<ReserveInitialValues | null>(null)
  const [reserveCreatedSuccessName, setReserveCreatedSuccessName] = useState<string | null>(null)

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
      // Mostrar confirmación opcional para crear reserva
      setCreatedPeriodForReservePrompt(data as CreateSpecialPeriodInput)
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
            <span>Comprometido previsto</span>
            <strong>{money(plan.expectedCommittedExpenses)}/mes</strong>
            <small>Suscripciones y fijos</small>
          </div>
          <div className="hero-kpi-item">
            <span>Variable gastado neto este mes</span>
            <strong>{money(plan.actualVariableExpenses)}</strong>
            <small>
              {plan.expectedVariableExpenses !== null
                ? `Variable previsto pendiente: ${money(plan.expectedVariableExpenses)}`
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

      {/* 2. Fondo de Emergencia (Resumen Analítico) */}
      <section className="section">
        <div className="section-title">
          <h2>Fondo de emergencia</h2>
          {onNavigateToSavings && (
            <button
              type="button"
              className="text-button"
              onClick={onNavigateToSavings}
            >
              Gestionar en Ahorro <AppIcon name="chevron-right" size={14} />
            </button>
          )}
        </div>
        <p className="section-subtitle">
          Dinero reservado para imprevistos (estimado sobre tus gastos fijos/comprometidos).
        </p>

        <div className="account-card" style={{ marginTop: 10 }}>
          <div className="account-header">
            <div className="account-title">
              <span className="account-icon savings">
                <AppIcon name="shield" size={18} />
              </span>
              <div>
                <strong>Colchón para imprevistos</strong>
                <span className="account-subtitle">
                  {plan.emergencyFundMonthsCovered} meses de gastos cubiertos
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

      {/* 3. Reservas (Resumen de Gastos Previstos de Medio Plazo) */}
      <section className="section" style={{ marginTop: 24 }}>
        <div className="section-title">
          <h2>Reservas de gastos previstos</h2>
          {onNavigateToSavings && (
            <button type="button" className="text-button" onClick={onNavigateToSavings}>
              Gestionar en Ahorro <AppIcon name="chevron-right" size={14} />
            </button>
          )}
        </div>

        <p className="section-subtitle">
          Dinero apartado para gastos que sabemos que van a ocurrir (Navidad, seguros, vacaciones).
        </p>

        {!finance.reserves?.length ? (
          <div className="transaction-list empty" style={{ marginTop: 10 }}>
            <p className="muted">No tienes reservas creadas todavía.</p>
            {onNavigateToSavings && (
              <button
                type="button"
                className="primary-button"
                style={{ marginTop: 12, maxWidth: 220 }}
                onClick={onNavigateToSavings}
              >
                Ir a Ahorro
              </button>
            )}
          </div>
        ) : (
          <div className="goals-grid" style={{ marginTop: 10 }}>
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
          <div className="transaction-list empty" style={{ marginTop: 10 }}>
            <p className="muted">No tienes periodos especiales configurados.</p>
          </div>
        ) : (
          <div className="special-periods-list" style={{ marginTop: 10 }}>
            {upcomingPeriods.map((period) => {
              const hasAmount =
                typeof period.expectedExtraBudget === 'number' && !isNaN(period.expectedExtraBudget)
              const hasPositiveAmount = hasAmount && period.expectedExtraBudget! > 0
              const isZeroAmount = hasAmount && period.expectedExtraBudget === 0

              return (
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
                    {hasPositiveAmount ? (
                      <span className="badge-status pending">
                        +{money(period.expectedExtraBudget!)} previsto
                      </span>
                    ) : isZeroAmount ? (
                      <span className="badge-status">
                        0,00 € previsto
                      </span>
                    ) : (
                      <span className="badge-status muted">
                        Sin estimación
                      </span>
                    )}
                  </div>
                  <p className="special-period-context">
                    {hasPositiveAmount
                      ? `Este periodo contempla ${money(period.expectedExtraBudget!)} de gasto extraordinario planificado.`
                      : isZeroAmount
                      ? 'Este periodo contempla 0,00 € de gasto extraordinario planificado.'
                      : 'Periodo especial sin estimación económica definida.'}
                    {period.note ? ` (${period.note})` : ''}
                  </p>
                </div>
              )
            })}
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
          {annualForecast.map((item) => {
            const unestimatedPeriods = (item.specialPeriodsInMonth || []).filter(
              (p) => p.expectedExtraBudget === undefined || p.expectedExtraBudget === null
            )

            return (
              <div
                className={`forecast-card ${item.isHighSpend ? 'high-spend' : ''}`}
                key={item.monthKey}
              >
                <div className="forecast-card-header">
                  <strong>{item.monthName} {item.year}</strong>
                  {item.isHighSpend ? (
                    <span className="forecast-tag high">Gasto alto previsto</span>
                  ) : unestimatedPeriods.length > 0 ? (
                    <span
                      className="forecast-tag special"
                      title={unestimatedPeriods.map((p) => p.name).join(', ')}
                    >
                      Periodo especial
                    </span>
                  ) : null}
                </div>

                <div className="forecast-kpis">
                  <div>
                    <span>Ingresos previstos</span>
                    <b>{money(item.expectedIncome)}</b>
                  </div>
                  <div>
                    <span>Gasto mensual previsto</span>
                    <b>{money(item.normalExpenses + item.expectedExtraExpenses)}</b>
                    <small>
                      Comprometido + variable previsto
                      {item.expectedExtraExpenses > 0 && ` (+${money(item.expectedExtraExpenses)} extra)`}
                    </small>
                    {unestimatedPeriods.length > 0 && (
                      <small style={{ color: '#64748b', display: 'block', marginTop: 2 }}>
                        {unestimatedPeriods.map((p) => p.name).join(', ')}: sin estimación
                      </small>
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
            )
          })}
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

      {/* Confirmación opcional: ¿Crear reserva para el periodo especial? */}
      {createdPeriodForReservePrompt && (
        <div
          className="modal-backdrop"
          onClick={() => setCreatedPeriodForReservePrompt(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 440 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#10b981',
                  flexShrink: 0,
                }}
              >
                <AppIcon name="sparkles" size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                  Periodo especial creado
                </h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {createdPeriodForReservePrompt.name}
                </span>
              </div>
            </div>

            <p style={{ margin: '0 0 16px', color: 'var(--text-main)', fontSize: '0.95rem', lineHeight: 1.5 }}>
              ¿Quieres crear una reserva para prepararte para este periodo?
            </p>

            <div
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                backgroundColor: 'var(--bg-card-light, #f8fafc)',
                border: '1px solid var(--border-color, #e2e8f0)',
                marginBottom: 20,
                fontSize: '0.85rem',
                color: 'var(--text-muted)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div>
                <strong>Fecha objetivo:</strong> {createdPeriodForReservePrompt.startDate}
              </div>
              {typeof createdPeriodForReservePrompt.expectedExtraBudget === 'number' &&
              createdPeriodForReservePrompt.expectedExtraBudget > 0 ? (
                <div>
                  <strong>Objetivo sugerido:</strong> {money(createdPeriodForReservePrompt.expectedExtraBudget)}
                </div>
              ) : (
                <div>
                  <strong>Objetivo sugerido:</strong> Sin estimación (tú decides el importe)
                </div>
              )}
            </div>

            <div className="modal-actions horizontal" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setCreatedPeriodForReservePrompt(null)}
                style={{ flex: 1 }}
              >
                Ahora no
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  const initialVals = buildReserveInitialValuesFromSpecialPeriod(createdPeriodForReservePrompt)
                  setCreatedPeriodForReservePrompt(null)
                  setReserveInitialValues(initialVals)
                  setReserveModalOpen(true)
                }}
                style={{ flex: 1.3 }}
              >
                Crear reserva
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de creación de reserva prellenada */}
      <ReserveModal
        open={reserveModalOpen}
        onClose={() => {
          setReserveModalOpen(false)
          setReserveInitialValues(null)
        }}
        initialValues={reserveInitialValues}
        freeSavings={finance.totals.freeSavings || 0}
        onSave={(data) => {
          finance.addReserve(data as CreateReserveInput)
          setReserveModalOpen(false)
          setReserveInitialValues(null)
          setReserveCreatedSuccessName(data.name ?? 'Reserva')
        }}
      />

      {/* Notificación / Éxito tras crear la reserva */}
      {reserveCreatedSuccessName && (
        <div
          className="modal-backdrop"
          onClick={() => setReserveCreatedSuccessName(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 440 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#10b981',
                  flexShrink: 0,
                }}
              >
                <AppIcon name="check" size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                  Reserva creada
                </h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {reserveCreatedSuccessName}
                </span>
              </div>
            </div>

            <p style={{ margin: '0 0 20px', color: 'var(--text-main)', fontSize: '0.92rem', lineHeight: 1.5 }}>
              Tu reserva se ha creado con 0,00 € asignados. Puedes empezar a apartarle dinero desde la sección de Ahorro cuando lo desees.
            </p>

            <div className="modal-actions horizontal" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setReserveCreatedSuccessName(null)}
                style={{ flex: 1 }}
              >
                Cerrar
              </button>
              {onNavigateToSavings && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setReserveCreatedSuccessName(null)
                    onNavigateToSavings()
                  }}
                  style={{ flex: 1.3 }}
                >
                  Ver en Ahorro
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

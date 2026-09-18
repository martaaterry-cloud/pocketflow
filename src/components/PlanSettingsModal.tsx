import { useEffect, useMemo, useState } from 'react'
import type { Category, FinancialPlanSettings, RecurringPayment, UpdatePlanSettingsInput } from '../models/finance'
import { AppIcon } from '../ui/icons'
import { selectExpectedMonthlyIncomeDetail } from '../utils/planSelectors'
import { money } from '../utils/money'

interface PlanSettingsModalProps {
  open: boolean
  onClose: () => void
  settings: FinancialPlanSettings
  categories: Category[]
  recurring?: RecurringPayment[]
  onSave: (updates: UpdatePlanSettingsInput) => void
  onNavigateToRecurring?: () => void
}

export function PlanSettingsModal({
  open,
  onClose,
  settings,
  categories,
  recurring = [],
  onSave,
  onNavigateToRecurring,
}: PlanSettingsModalProps) {
  const [monthlyIncome, setMonthlyIncome] = useState('')
  const [showManualIncome, setShowManualIncome] = useState(false)
  const [targetSavingsType, setTargetSavingsType] = useState<'percentage' | 'fixed'>('percentage')
  const [targetSavingsValue, setTargetSavingsValue] = useState('')
  const [emergencyTargetType, setEmergencyTargetType] = useState<'months' | 'fixed'>('months')
  const [emergencyTargetValue, setEmergencyTargetValue] = useState('')
  const [essentialCategoryIds, setEssentialCategoryIds] = useState<string[]>([])

  const detectedIncomeDetail = useMemo(() => {
    return selectExpectedMonthlyIncomeDetail(settings, recurring)
  }, [settings, recurring])

  const hasRecurringIncome = detectedIncomeDetail.source === 'recurring' && detectedIncomeDetail.items.length > 0

  useEffect(() => {
    if (settings) {
      setMonthlyIncome(String(settings.monthlyIncome || '').replace('.', ','))
      setTargetSavingsType(settings.targetSavingsType || 'percentage')
      setTargetSavingsValue(String(settings.targetSavingsValue || 15).replace('.', ','))
      setEmergencyTargetType(settings.emergencyFundTargetType || 'months')
      setEmergencyTargetValue(String(settings.emergencyFundTargetValue || 3).replace('.', ','))
      setEssentialCategoryIds(settings.essentialCategoryIds || [])
      setShowManualIncome(!hasRecurringIncome)
    }
  }, [settings, open, hasRecurringIncome])

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const numIncome = Number(monthlyIncome.replace(',', '.'))
    const numSavings = Number(targetSavingsValue.replace(',', '.'))
    const numEmergency = Number(emergencyTargetValue.replace(',', '.'))

    onSave({
      monthlyIncome: isNaN(numIncome) || numIncome < 0 ? 0 : numIncome,
      targetSavingsType,
      targetSavingsValue: isNaN(numSavings) ? 15 : numSavings,
      emergencyFundTargetType: emergencyTargetType,
      emergencyFundTargetValue: isNaN(numEmergency) ? 3 : numEmergency,
      essentialCategoryIds, // Preservamos los IDs existentes para retrocompatibilidad sin exponerlos en la UI
    })
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Ajustes del Plan Financiero</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Cerrar">
            <AppIcon name="x" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* 1. Ingresos previstos */}
          {hasRecurringIncome ? (
            <div className="form-group" style={{ background: '#f8fafc', padding: 14, borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Ingresos previstos detectados</span>
                  <strong style={{ display: 'block', fontSize: 18, color: '#0f172a', marginTop: 2 }}>
                    {money(detectedIncomeDetail.amount)}/mes
                  </strong>
                </div>
                {onNavigateToRecurring && (
                  <button
                    type="button"
                    className="text-button"
                    style={{ fontSize: 13, color: '#6366f1', display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0 }}
                    onClick={() => {
                      onClose()
                      onNavigateToRecurring()
                    }}
                  >
                    Gestionar ingresos recurrentes <AppIcon name="chevron-right" size={14} />
                  </button>
                )}
              </div>

              <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, color: '#475569' }}>
                {detectedIncomeDetail.items.map((it) => (
                  <li key={it.id}>
                    <b>{it.name}</b>: {money(it.monthlyAmount)}/mes
                    {it.frequency !== 'monthly' && (
                      <span style={{ color: '#94a3b8', fontSize: 12 }}> ({money(it.amount)} {it.frequency === 'weekly' ? 'semanal' : 'anual'})</span>
                    )}
                  </li>
                ))}
              </ul>

              <div style={{ marginTop: 12, borderTop: '1px dashed #cbd5e1', paddingTop: 8 }}>
                <button
                  type="button"
                  className="text-button"
                  style={{ fontSize: 12, color: '#64748b' }}
                  onClick={() => setShowManualIncome((prev) => !prev)}
                >
                  {showManualIncome ? 'Ocultar importe manual' : '¿Usar un importe manual alternativo?'}
                </button>
              </div>

              {showManualIncome && (
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 12, color: '#64748b' }}>
                    Importe manual alternativo (€)
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Ej. 1.650,00"
                      value={monthlyIncome}
                      onChange={(e) => setMonthlyIncome(e.target.value)}
                      style={{ marginTop: 4 }}
                    />
                  </label>
                  <span className="field-hint" style={{ fontSize: 11 }}>
                    Nota: Los ingresos recurrentes activos tienen prioridad automática para no duplicar datos.
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="form-group">
              <label>
                Ingresos mensuales netos (€)
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="1.650,00"
                  value={monthlyIncome}
                  onChange={(e) => setMonthlyIncome(e.target.value)}
                  autoFocus
                />
              </label>
              <span className="field-hint">
                Referencia base del plan. También puedes añadir una nómina en <b>Recurrentes</b> para detectarla de forma automática.
              </span>
            </div>
          )}

          {/* 2. Objetivo de ahorro mensual */}
          <div className="form-group" style={{ marginTop: 16 }}>
            <label>Objetivo de ahorro mensual</label>
            <div className="segmented mini">
              <button
                type="button"
                className={targetSavingsType === 'percentage' ? 'active' : ''}
                onClick={() => setTargetSavingsType('percentage')}
              >
                Porcentaje de ingresos (%)
              </button>
              <button
                type="button"
                className={targetSavingsType === 'fixed' ? 'active' : ''}
                onClick={() => setTargetSavingsType('fixed')}
              >
                Cantidad fija (€)
              </button>
            </div>

            <input
              type="text"
              inputMode="decimal"
              placeholder={targetSavingsType === 'percentage' ? '15' : '250,00'}
              value={targetSavingsValue}
              onChange={(e) => setTargetSavingsValue(e.target.value)}
              style={{ marginTop: 8 }}
            />

            {targetSavingsType === 'percentage' && (
              <div className="quick-options-row">
                <span className="field-hint">Escenarios de referencia:</span>
                <button type="button" className="pill-btn" onClick={() => setTargetSavingsValue('10')}>
                  10 %
                </button>
                <button type="button" className="pill-btn" onClick={() => setTargetSavingsValue('15')}>
                  15 %
                </button>
                <button type="button" className="pill-btn" onClick={() => setTargetSavingsValue('20')}>
                  20 %
                </button>
              </div>
            )}
          </div>

          {/* 3. Meta del fondo de emergencia */}
          <div className="form-group" style={{ marginTop: 16 }}>
            <label>Meta para el fondo de emergencia</label>
            <div className="segmented mini">
              <button
                type="button"
                className={emergencyTargetType === 'months' ? 'active' : ''}
                onClick={() => setEmergencyTargetType('months')}
              >
                Meses de gastos fijos/comprometidos
              </button>
              <button
                type="button"
                className={emergencyTargetType === 'fixed' ? 'active' : ''}
                onClick={() => setEmergencyTargetType('fixed')}
              >
                Cantidad fija (€)
              </button>
            </div>

            <input
              type="text"
              inputMode="decimal"
              placeholder={emergencyTargetType === 'months' ? '3' : '3.000,00'}
              value={emergencyTargetValue}
              onChange={(e) => setEmergencyTargetValue(e.target.value)}
              style={{ marginTop: 8 }}
            />

            {emergencyTargetType === 'months' && (
              <div className="quick-options-row">
                <span className="field-hint">Referencias habituales:</span>
                <button type="button" className="pill-btn" onClick={() => setEmergencyTargetValue('3')}>
                  3 meses
                </button>
                <button type="button" className="pill-btn" onClick={() => setEmergencyTargetValue('6')}>
                  6 meses
                </button>
              </div>
            )}
          </div>

          <div className="modal-actions" style={{ marginTop: 24 }}>
            <button type="submit" className="primary-button">
              Guardar ajustes
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

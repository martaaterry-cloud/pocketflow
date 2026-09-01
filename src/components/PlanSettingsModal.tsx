import { useEffect, useState } from 'react'
import type { Category, FinancialPlanSettings, UpdatePlanSettingsInput } from '../models/finance'
import { AppIcon } from '../ui/icons'

interface PlanSettingsModalProps {
  open: boolean
  onClose: () => void
  settings: FinancialPlanSettings
  categories: Category[]
  onSave: (updates: UpdatePlanSettingsInput) => void
}

export function PlanSettingsModal({
  open,
  onClose,
  settings,
  categories,
  onSave,
}: PlanSettingsModalProps) {
  const [monthlyIncome, setMonthlyIncome] = useState('')
  const [targetSavingsType, setTargetSavingsType] = useState<'percentage' | 'fixed'>('percentage')
  const [targetSavingsValue, setTargetSavingsValue] = useState('')
  const [emergencyTargetType, setEmergencyTargetType] = useState<'months' | 'fixed'>('months')
  const [emergencyTargetValue, setEmergencyTargetValue] = useState('')
  const [essentialCategoryIds, setEssentialCategoryIds] = useState<string[]>([])

  useEffect(() => {
    if (settings) {
      setMonthlyIncome(String(settings.monthlyIncome).replace('.', ','))
      setTargetSavingsType(settings.targetSavingsType)
      setTargetSavingsValue(String(settings.targetSavingsValue).replace('.', ','))
      setEmergencyTargetType(settings.emergencyFundTargetType)
      setEmergencyTargetValue(String(settings.emergencyFundTargetValue).replace('.', ','))
      setEssentialCategoryIds(settings.essentialCategoryIds || [])
    }
  }, [settings, open])

  if (!open) return null

  const toggleCategory = (catId: string) => {
    setEssentialCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const numIncome = Number(monthlyIncome.replace(',', '.'))
    const numSavings = Number(targetSavingsValue.replace(',', '.'))
    const numEmergency = Number(emergencyTargetValue.replace(',', '.'))

    if (isNaN(numIncome) || numIncome < 0) return

    onSave({
      monthlyIncome: numIncome,
      targetSavingsType,
      targetSavingsValue: isNaN(numSavings) ? 15 : numSavings,
      emergencyFundTargetType: emergencyTargetType,
      emergencyFundTargetValue: isNaN(numEmergency) ? 3 : numEmergency,
      essentialCategoryIds,
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
          {/* Ingresos mensuales */}
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
            <span className="field-hint">Referencia base para cálculos de ahorro y márgenes.</span>
          </div>

          {/* Objetivo de ahorro mensual */}
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

          {/* Meta del fondo de emergencia */}
          <div className="form-group" style={{ marginTop: 16 }}>
            <label>Meta para el fondo de emergencia</label>
            <div className="segmented mini">
              <button
                type="button"
                className={emergencyTargetType === 'months' ? 'active' : ''}
                onClick={() => setEmergencyTargetType('months')}
              >
                Meses de gastos esenciales
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

          {/* Categorías de gastos esenciales */}
          <div className="form-group" style={{ marginTop: 16 }}>
            <label>Categorías de gastos esenciales</label>
            <span className="field-hint">
              Utilizadas para estimar tu presupuesto de contingencia ante imprevistos.
            </span>
            <div className="checkbox-list" style={{ marginTop: 8 }}>
              {categories.map((c) => {
                const isChecked = essentialCategoryIds.includes(c.id)
                return (
                  <label key={c.id} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleCategory(c.id)}
                    />
                    <span className="category-dot micro" style={{ background: c.color }}>
                      <AppIcon name={c.iconKey || c.icon} size={12} color="#fff" />
                    </span>
                    <span>{c.name}</span>
                  </label>
                )
              })}
            </div>
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

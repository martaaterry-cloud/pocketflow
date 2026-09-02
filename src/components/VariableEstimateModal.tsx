import { useEffect, useState } from 'react'
import type {
  Category,
  CreateVariableExpenseEstimateInput,
  FrequencyType,
  UpdateVariableExpenseEstimateInput,
  VariableExpenseEstimate,
} from '../models/finance'
import { calculateMonthlyEstimate } from '../utils/variableEstimates'
import { money } from '../utils/money'
import { AppIcon } from '../ui/icons'

interface VariableEstimateModalProps {
  open: boolean
  onClose: () => void
  categories: Category[]
  estimate?: VariableExpenseEstimate | null
  onSave: (data: CreateVariableExpenseEstimateInput | UpdateVariableExpenseEstimateInput, id?: string) => void
  onDelete?: (id: string) => void
}

export function VariableEstimateModal({
  open,
  onClose,
  categories,
  estimate,
  onSave,
  onDelete,
}: VariableEstimateModalProps) {
  const [name, setName] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [frequencyType, setFrequencyType] = useState<FrequencyType>('per_week')
  const [frequencyValue, setFrequencyValue] = useState('4')
  const [categoryId, setCategoryId] = useState('')
  const [active, setActive] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isEditing = Boolean(estimate)

  useEffect(() => {
    if (estimate) {
      setName(estimate.name)
      setUnitCost(String(estimate.unitCost).replace('.', ','))
      setFrequencyType(estimate.frequencyType)
      setFrequencyValue(String(estimate.frequencyValue))
      setCategoryId(estimate.categoryId)
      setActive(estimate.active)
      setConfirmDelete(false)
    } else {
      setName('')
      setUnitCost('1,50')
      setFrequencyType('per_week')
      setFrequencyValue('4')
      setCategoryId(categories.find((c) => c.id === 'sport')?.id ?? categories[0]?.id ?? 'other')
      setActive(true)
      setConfirmDelete(false)
    }
  }, [estimate, open, categories])

  if (!open) return null

  const numUnitCost = Number(unitCost.replace(',', '.')) || 0
  const numFrequencyValue = Number(frequencyValue) || 0
  const monthlyPreview = calculateMonthlyEstimate(numUnitCost, frequencyType, numFrequencyValue)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || numUnitCost <= 0 || numFrequencyValue <= 0) return

    const payload = {
      name: name.trim(),
      categoryId: categoryId || 'other',
      unitCost: numUnitCost,
      frequencyType,
      frequencyValue: numFrequencyValue,
      active,
    }

    if (estimate) {
      onSave(payload, estimate.id)
    } else {
      onSave(payload)
    }
    onClose()
  }

  const handleDelete = () => {
    if (!estimate || !onDelete) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    onDelete(estimate.id)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>{isEditing ? 'Editar previsión variable' : 'Nueva previsión variable'}</h2>
          <button type="button" className="close-button" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <form onSubmit={handleSubmit} className="modal-form">
          <label>
            <span>Nombre del gasto</span>
            <input
              type="text"
              placeholder="Ej. Gimnasio Rafa"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </label>

          <label>
            <span>Categoría</span>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label>
              <span>Coste por sesión / uso (€)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="1,50"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                required
              />
            </label>

            <label>
              <span>Tipo de frecuencia</span>
              <select
                value={frequencyType}
                onChange={(e) => setFrequencyType(e.target.value as FrequencyType)}
              >
                <option value="per_week">Veces por semana</option>
                <option value="per_month">Veces por mes</option>
              </select>
            </label>
          </div>

          <label>
            <span>Frecuencia estimada ({frequencyType === 'per_week' ? 'veces/semana' : 'veces/mes'})</span>
            <input
              type="number"
              min="0.5"
              step="any"
              value={frequencyValue}
              onChange={(e) => setFrequencyValue(e.target.value)}
              required
            />
          </label>

          {/* Previsualización del cálculo */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '12px',
              backgroundColor: 'var(--bg-card-light, #f4f6f8)',
              border: '1px solid var(--border-color, #e2e8f0)',
              fontSize: '0.88rem',
              color: 'var(--text-main, #1e293b)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>Estimación mensual calculada:</span>
              <strong style={{ fontSize: '1.05rem', color: 'var(--primary, #3b82f6)' }}>
                ~{money(monthlyPreview)}/mes
              </strong>
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted, #64748b)' }}>
              {frequencyType === 'per_week'
                ? `${unitCost || 0} € × ${frequencyValue || 0} veces/sem × 4,33 sem ≈ ${monthlyPreview.toFixed(2)} €`
                : `${unitCost || 0} € × ${frequencyValue || 0} veces/mes = ${monthlyPreview.toFixed(2)} €`}
            </span>
          </div>

          <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <span>Previsión activa para el cálculo de este mes</span>
          </label>

          <div className="modal-actions" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {isEditing && onDelete && (
              <button
                type="button"
                className={`danger-button ${confirmDelete ? 'confirm' : ''}`}
                onClick={handleDelete}
                style={{ flex: 1 }}
              >
                {confirmDelete ? '¿Seguro que quieres borrar?' : 'Eliminar'}
              </button>
            )}
            <button type="submit" className="primary-button" style={{ flex: 2 }}>
              {isEditing ? 'Guardar cambios' : 'Añadir estimación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

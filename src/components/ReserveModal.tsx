import { useEffect, useState } from 'react'
import type { CreateReserveInput, Reserve, UpdateReserveInput } from '../models/finance'
import { AppIcon, resolveIconKey } from '../ui/icons'
import { IconPicker } from './IconPicker'

export interface ReserveInitialValues {
  name?: string
  targetAmount?: number | ''
  targetDate?: string
  iconKey?: string
}

interface ReserveModalProps {
  open: boolean
  onClose: () => void
  reserve?: Reserve | null
  initialValues?: ReserveInitialValues | null
  freeSavings?: number
  onSave: (data: CreateReserveInput | UpdateReserveInput, id?: string) => void
  onDelete?: (id: string) => void
}

export function ReserveModal({
  open,
  onClose,
  reserve,
  initialValues,
  freeSavings,
  onSave,
  onDelete,
}: ReserveModalProps) {
  const [name, setName] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [iconKey, setIconKey] = useState('sparkles')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isEditing = Boolean(reserve)

  useEffect(() => {
    if (reserve) {
      setName(reserve.name)
      setTargetAmount(String(reserve.targetAmount).replace('.', ','))
      setTargetDate(reserve.targetDate)
      setIconKey(resolveIconKey(reserve.iconKey, 'sparkles'))
      setConfirmDelete(false)
    } else if (initialValues) {
      setName(initialValues.name ?? '')
      setTargetAmount(
        initialValues.targetAmount !== undefined &&
          initialValues.targetAmount !== '' &&
          initialValues.targetAmount !== null
          ? String(initialValues.targetAmount).replace('.', ',')
          : ''
      )
      setTargetDate(initialValues.targetDate ?? '')
      setIconKey(resolveIconKey(initialValues.iconKey, 'sparkles'))
      setConfirmDelete(false)
    } else {
      setName('')
      setTargetAmount('')
      setTargetDate('')
      setIconKey('sparkles')
      setConfirmDelete(false)
    }
  }, [reserve, initialValues, open])

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const numericTarget = Number(targetAmount.replace(',', '.'))
    if (!name.trim() || isNaN(numericTarget) || numericTarget <= 0 || !targetDate) return

    const sanitizedKey = resolveIconKey(iconKey, 'sparkles')

    if (isEditing && reserve) {
      onSave(
        {
          name: name.trim(),
          targetAmount: numericTarget,
          targetDate,
          iconKey: sanitizedKey,
        },
        reserve.id
      )
    } else {
      onSave({
        name: name.trim(),
        targetAmount: numericTarget,
        currentAllocated: 0,
        targetDate,
        iconKey: sanitizedKey,
        active: true,
      })
    }
    onClose()
  }

  const handleDelete = () => {
    if (reserve && onDelete) {
      onDelete(reserve.id)
      onClose()
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEditing ? 'Editar reserva' : 'Nueva reserva de gasto previsto'}</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Cerrar">
            <AppIcon name="x" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>
              Nombre de la reserva
              <input
                type="text"
                placeholder="Navidad, Seguro del coche, Matrícula..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              Importe previsto (€)
              <input
                type="text"
                inputMode="decimal"
                placeholder="400,00"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              Fecha prevista de gasto
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              Icono representativo
              <IconPicker selectedKey={iconKey} onSelect={setIconKey} />
            </label>
          </div>

          {!isEditing && typeof freeSavings === 'number' && freeSavings <= 0 && (
            <div
              className="info-callout"
              style={{
                marginTop: 6,
                marginBottom: 10,
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm, 10px)',
                backgroundColor: 'var(--bg-card-light, #f8fafc)',
                border: '1px solid var(--border-color, #e2e8f0)',
              }}
            >
              <p
                style={{
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: '0.85rem',
                  color: 'var(--text-muted, #64748b)',
                  lineHeight: 1.4,
                }}
              >
                <AppIcon name="info" size={16} />
                <span>Puedes crear la reserva ahora y empezar a asignarle dinero más adelante.</span>
              </p>
            </div>
          )}

          <div className="modal-actions">
            <button type="submit" className="primary-button">
              {isEditing ? 'Guardar cambios' : 'Crear reserva'}
            </button>

            {isEditing && onDelete && (
              <>
                {!confirmDelete ? (
                  <button
                    type="button"
                    className="danger-outline-button"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Eliminar reserva
                  </button>
                ) : (
                  <div className="confirm-delete-box">
                    <p>
                      ¿Seguro que deseas eliminar esta reserva? El dinero que tenga asignado volverá a estar disponible
                      en tu ahorro libre.
                    </p>
                    <div className="confirm-delete-actions">
                      <button
                        type="button"
                        className="danger-button"
                        onClick={handleDelete}
                      >
                        Sí, eliminar
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setConfirmDelete(false)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

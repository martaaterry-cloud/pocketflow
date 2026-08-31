import { useEffect, useState } from 'react'
import type { CreateSavingsGoalInput, SavingsGoal, UpdateSavingsGoalInput } from '../models/finance'

interface GoalModalProps {
  open: boolean
  onClose: () => void
  goal?: SavingsGoal | null
  onSave: (goalData: CreateSavingsGoalInput | UpdateSavingsGoalInput, id?: string) => void
  onDelete?: (id: string) => void
}

const DEFAULT_ICONS = ['🎯', '🗾', '🛡️', '🚗', '🏠', '✈️', '💻', '🎓']

export function GoalModal({ open, onClose, goal, onSave, onDelete }: GoalModalProps) {
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [icon, setIcon] = useState('🎯')
  const [targetDate, setTargetDate] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isEditing = Boolean(goal)

  useEffect(() => {
    if (goal) {
      setName(goal.name)
      setTarget(String(goal.target).replace('.', ','))
      setIcon(goal.icon ?? '🎯')
      setTargetDate(goal.targetDate ?? '')
      setConfirmDelete(false)
    } else {
      setName('')
      setTarget('')
      setIcon('🎯')
      setTargetDate('')
      setConfirmDelete(false)
    }
  }, [goal, open])

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const numericTarget = Number(target.replace(',', '.'))
    if (!name.trim() || isNaN(numericTarget) || numericTarget <= 0) return

    if (isEditing && goal) {
      onSave(
        {
          name: name.trim(),
          target: numericTarget,
          icon,
          targetDate: targetDate || undefined,
        },
        goal.id
      )
    } else {
      onSave({
        name: name.trim(),
        target: numericTarget,
        current: 0,
        icon,
        targetDate: targetDate || undefined,
      })
    }
    onClose()
  }

  const handleDelete = () => {
    if (goal && onDelete) {
      onDelete(goal.id)
      onClose()
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEditing ? 'Editar objetivo' : 'Nuevo objetivo de ahorro'}</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>
              Nombre del objetivo
              <input
                type="text"
                placeholder="Japón, Fondo de emergencia, Coche..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              Cantidad objetivo (€)
              <input
                type="text"
                inputMode="decimal"
                placeholder="2.500,00"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              Icono
              <div className="emoji-picker-row">
                {DEFAULT_ICONS.map((emoji) => (
                  <button
                    type="button"
                    key={emoji}
                    className={`emoji-btn ${icon === emoji ? 'selected' : ''}`}
                    onClick={() => setIcon(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </label>
          </div>

          <div className="form-group">
            <label>
              Fecha límite (opcional)
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </label>
          </div>

          <div className="modal-actions">
            <button type="submit" className="primary-button">
              {isEditing ? 'Guardar cambios' : 'Crear objetivo'}
            </button>

            {isEditing && onDelete && (
              <>
                {!confirmDelete ? (
                  <button
                    type="button"
                    className="danger-outline-button"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Eliminar objetivo
                  </button>
                ) : (
                  <div className="confirm-delete-box">
                    <p>
                      ¿Seguro que deseas eliminar este objetivo? El dinero que tenga asignado se liberará
                      automáticamente a tu ahorro libre.
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

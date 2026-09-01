import { useEffect, useState } from 'react'
import type { CreateSpecialPeriodInput, SpecialPeriod, SpecialPeriodType, UpdateSpecialPeriodInput } from '../models/finance'
import { AppIcon } from '../ui/icons'

interface SpecialPeriodModalProps {
  open: boolean
  onClose: () => void
  period?: SpecialPeriod | null
  onSave: (data: CreateSpecialPeriodInput | UpdateSpecialPeriodInput, id?: string) => void
  onDelete?: (id: string) => void
}

export function SpecialPeriodModal({ open, onClose, period, onSave, onDelete }: SpecialPeriodModalProps) {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [expectedExtraBudget, setExpectedExtraBudget] = useState('')
  const [type, setType] = useState<SpecialPeriodType>('expected_high_spend')
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isEditing = Boolean(period)

  useEffect(() => {
    if (period) {
      setName(period.name)
      setStartDate(period.startDate)
      setEndDate(period.endDate)
      setExpectedExtraBudget(String(period.expectedExtraBudget).replace('.', ','))
      setType(period.type)
      setNote(period.note ?? '')
      setConfirmDelete(false)
    } else {
      setName('')
      setStartDate('')
      setEndDate('')
      setExpectedExtraBudget('')
      setType('expected_high_spend')
      setNote('')
      setConfirmDelete(false)
    }
  }, [period, open])

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const numericExtra = Number(expectedExtraBudget.replace(',', '.'))
    if (!name.trim() || isNaN(numericExtra) || numericExtra < 0 || !startDate || !endDate) return

    if (isEditing && period) {
      onSave(
        {
          name: name.trim(),
          startDate,
          endDate,
          expectedExtraBudget: numericExtra,
          type,
          note: note.trim() || undefined,
        },
        period.id
      )
    } else {
      onSave({
        name: name.trim(),
        startDate,
        endDate,
        expectedExtraBudget: numericExtra,
        type,
        note: note.trim() || undefined,
      })
    }
    onClose()
  }

  const handleDelete = () => {
    if (period && onDelete) {
      onDelete(period.id)
      onClose()
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEditing ? 'Editar periodo estacional' : 'Nuevo periodo de gasto extraordinario'}</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Cerrar">
            <AppIcon name="x" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>
              Nombre del periodo
              <input
                type="text"
                placeholder="Navidad, Vacaciones de verano, Fiestas patronales..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              Fecha de inicio
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              Fecha de fin
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              Gasto extraordinario previsto (€)
              <input
                type="text"
                inputMode="decimal"
                placeholder="400,00"
                value={expectedExtraBudget}
                onChange={(e) => setExpectedExtraBudget(e.target.value)}
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              Tipo de periodo
              <select value={type} onChange={(e) => setType(e.target.value as SpecialPeriodType)}>
                <option value="expected_high_spend">Gasto alto previsto</option>
                <option value="normal">Periodo normal con ajuste</option>
                <option value="expected_low_spend">Gasto bajo previsto</option>
              </select>
            </label>
          </div>

          <div className="form-group">
            <label>
              Notas o contexto (opcional)
              <input
                type="text"
                placeholder="Compras, regalos, billetes de avión..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </div>

          <div className="modal-actions">
            <button type="submit" className="primary-button">
              {isEditing ? 'Guardar cambios' : 'Añadir periodo'}
            </button>

            {isEditing && onDelete && (
              <>
                {!confirmDelete ? (
                  <button
                    type="button"
                    className="danger-outline-button"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Eliminar periodo
                  </button>
                ) : (
                  <div className="confirm-delete-box">
                    <p>¿Seguro que deseas eliminar este periodo estacional?</p>
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

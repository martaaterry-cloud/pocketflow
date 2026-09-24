import { useEffect, useState } from 'react'
import type { CreateSpecialPeriodInput, Reserve, SpecialPeriod, SpecialPeriodType, UpdateSpecialPeriodInput } from '../models/finance'
import { validateSpecialPeriodDates } from '../utils/planSelectors'
import { AppIcon } from '../ui/icons'

interface SpecialPeriodModalProps {
  open: boolean
  onClose: () => void
  period?: SpecialPeriod | null
  reserves?: Reserve[]
  onSave: (data: CreateSpecialPeriodInput | UpdateSpecialPeriodInput, id?: string) => void
  onDelete?: (id: string) => void
}

export function SpecialPeriodModal({
  open,
  onClose,
  period,
  reserves = [],
  onSave,
  onDelete,
}: SpecialPeriodModalProps) {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [expectedExtraBudget, setExpectedExtraBudget] = useState('')
  const [type, setType] = useState<SpecialPeriodType>('expected_high_spend')
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const isEditing = Boolean(period)
  const linkedReserves = isEditing && period ? reserves.filter((r) => r.specialPeriodId === period.id) : []

  useEffect(() => {
    if (period) {
      setName(period.name)
      setStartDate(period.startDate)
      setEndDate(period.endDate)
      setExpectedExtraBudget(
        period.expectedExtraBudget !== undefined && period.expectedExtraBudget !== null
          ? String(period.expectedExtraBudget).replace('.', ',')
          : ''
      )
      setType(period.type)
      setNote(period.note ?? '')
      setConfirmDelete(false)
      setErrorMessage(null)
    } else {
      setName('')
      setStartDate('')
      setEndDate('')
      setExpectedExtraBudget('')
      setType('expected_high_spend')
      setNote('')
      setConfirmDelete(false)
      setErrorMessage(null)
    }
  }, [period, open])

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !startDate || !endDate) return

    const dateValidation = validateSpecialPeriodDates(startDate, endDate)
    if (!dateValidation.valid) {
      setErrorMessage(dateValidation.error ?? 'La fecha final debe ser posterior a la fecha inicial.')
      return
    }

    const trimmedExtra = expectedExtraBudget.trim()
    let numericExtra: number | undefined = undefined
    if (trimmedExtra !== '') {
      const parsed = Number(trimmedExtra.replace(',', '.'))
      if (isNaN(parsed) || parsed < 0) return
      numericExtra = parsed
    }

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
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setErrorMessage(null)
                }}
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              Fecha de fin
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value)
                  setErrorMessage(null)
                }}
              />
            </label>
          </div>

          {errorMessage && (
            <div
              className="form-error-callout"
              style={{
                backgroundColor: 'rgba(220, 38, 38, 0.08)',
                color: 'var(--accent-red, #dc2626)',
                border: '1px solid rgba(220, 38, 38, 0.25)',
                borderRadius: 'var(--radius-sm, 10px)',
                padding: '10px 14px',
                fontSize: '0.85rem',
                fontWeight: 500,
                marginBottom: 14,
              }}
            >
              {errorMessage}
            </div>
          )}

          <div className="form-group">
            <label>
              Importe extra estimado (€)
              <input
                type="text"
                inputMode="decimal"
                placeholder="Ej. 200 (opcional)"
                value={expectedExtraBudget}
                onChange={(e) => setExpectedExtraBudget(e.target.value)}
              />
            </label>
            <span className="form-help-text" style={{ fontSize: 12, color: '#64748b', marginTop: 4, display: 'block' }}>
              Déjalo vacío si todavía no sabes cuánto gastarás.
            </span>
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
                    <p>
                      ¿Seguro que deseas eliminar este periodo estacional?
                      {linkedReserves.length > 0 && (
                        <span style={{ display: 'block', marginTop: 6, fontWeight: 500 }}>
                          Este periodo tiene {linkedReserves.length} reserva(s) vinculada(s). Se eliminará el vínculo, pero las reservas se conservarán.
                        </span>
                      )}
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

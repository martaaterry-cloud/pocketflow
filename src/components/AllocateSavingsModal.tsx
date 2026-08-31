import { useState } from 'react'
import type { SavingsGoal } from '../models/finance'
import { money } from '../utils/money'

interface AllocateSavingsModalProps {
  open: boolean
  onClose: () => void
  goal: SavingsGoal | null
  freeSavings: number
  onAllocate: (goalId: string, amount: number) => boolean
  onDeallocate: (goalId: string, amount: number) => boolean
}

export function AllocateSavingsModal({
  open,
  onClose,
  goal,
  freeSavings,
  onAllocate,
  onDeallocate,
}: AllocateSavingsModalProps) {
  const [mode, setMode] = useState<'allocate' | 'deallocate'>('allocate')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!open || !goal) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const numeric = Number(amount.replace(',', '.'))

    if (isNaN(numeric) || numeric <= 0) {
      setError('Introduce un importe válido mayor que cero.')
      return
    }

    if (mode === 'allocate') {
      if (numeric > freeSavings) {
        setError(`No puedes asignar más de ${money(freeSavings)} (tu ahorro libre disponible).`)
        return
      }
      const success = onAllocate(goal.id, numeric)
      if (!success) {
        setError('Error al asignar ahorro.')
        return
      }
    } else {
      if (numeric > goal.current) {
        setError(`No puedes retirar más de ${money(goal.current)} (lo asignado a este objetivo).`)
        return
      }
      const success = onDeallocate(goal.id, numeric)
      if (!success) {
        setError('Error al retirar ahorro.')
        return
      }
    }

    setAmount('')
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {goal.icon ?? '🎯'} {goal.name}
          </h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        <div className="segmented">
          <button
            type="button"
            className={mode === 'allocate' ? 'active' : ''}
            onClick={() => {
              setMode('allocate')
              setError(null)
            }}
          >
            Asignar ahorro
          </button>
          <button
            type="button"
            className={mode === 'deallocate' ? 'active' : ''}
            onClick={() => {
              setMode('deallocate')
              setError(null)
            }}
          >
            Retirar ahorro
          </button>
        </div>

        <div className="info-badge-row">
          <span>Ahorro libre disponible: <b>{money(freeSavings)}</b></span>
          <span>Asignado a este objetivo: <b>{money(goal.current)}</b></span>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginTop: 14 }}>
            <label>
              {mode === 'allocate' ? 'Cantidad a asignar (€)' : 'Cantidad a retirar (€)'}
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  setError(null)
                }}
                autoFocus
              />
            </label>
          </div>

          {error && <div className="form-error-callout">{error}</div>}

          <div className="info-callout" style={{ marginTop: 12 }}>
            <p>
              ℹ️ <strong>Importante:</strong> Esta acción no mueve dinero del banco ni es un gasto.
              Solo distribuye lógicamente tu saldo de Ahorro existente.
            </p>
          </div>

          <div className="modal-actions" style={{ marginTop: 18 }}>
            <button type="submit" className="primary-button">
              {mode === 'allocate' ? 'Asignar a objetivo' : 'Devolver a ahorro libre'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

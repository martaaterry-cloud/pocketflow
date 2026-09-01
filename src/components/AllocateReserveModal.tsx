import { useState } from 'react'
import type { Reserve } from '../models/finance'
import { money } from '../utils/money'
import { AppIcon } from '../ui/icons'

interface AllocateReserveModalProps {
  open: boolean
  onClose: () => void
  reserve: Reserve | null
  freeSavings: number
  onAllocate: (reserveId: string, amount: number) => boolean
  onDeallocate: (reserveId: string, amount: number) => boolean
}

export function AllocateReserveModal({
  open,
  onClose,
  reserve,
  freeSavings,
  onAllocate,
  onDeallocate,
}: AllocateReserveModalProps) {
  const [mode, setMode] = useState<'allocate' | 'deallocate'>('allocate')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!open || !reserve) return null

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
      const success = onAllocate(reserve.id, numeric)
      if (!success) {
        setError('Error al asignar fondos a la reserva.')
        return
      }
    } else {
      if (numeric > reserve.currentAllocated) {
        setError(`No puedes retirar más de ${money(reserve.currentAllocated)} (lo asignado actualmente a esta reserva).`)
        return
      }
      const success = onDeallocate(reserve.id, numeric)
      if (!success) {
        setError('Error al retirar fondos de la reserva.')
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
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AppIcon name={reserve.iconKey} size={20} />
            {reserve.name}
          </h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Cerrar">
            <AppIcon name="x" size={18} />
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
          <span>Asignado a la reserva: <b>{money(reserve.currentAllocated)}</b></span>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 14 }}>
          <div className="form-group">
            <label>
              Importe a {mode === 'allocate' ? 'asignar' : 'retirar'} (€)
              <input
                type="text"
                inputMode="decimal"
                placeholder="50,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </label>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="submit" className="primary-button">
              {mode === 'allocate' ? 'Confirmar asignación' : 'Confirmar retirada'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { money } from '../utils/money'
import { AppIcon } from '../ui/icons'

interface AllocateEmergencyModalProps {
  open: boolean
  onClose: () => void
  freeSavings: number
  currentEmergency: number
  targetEmergency: number
  onAllocate: (amount: number) => boolean
  onDeallocate: (amount: number) => boolean
}

export function AllocateEmergencyModal({
  open,
  onClose,
  freeSavings,
  currentEmergency,
  targetEmergency,
  onAllocate,
  onDeallocate,
}: AllocateEmergencyModalProps) {
  const [mode, setMode] = useState<'allocate' | 'deallocate'>('allocate')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

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
      const success = onAllocate(numeric)
      if (!success) {
        setError('Error al asignar fondos al fondo de emergencia.')
        return
      }
    } else {
      if (numeric > currentEmergency) {
        setError(`No puedes retirar más de ${money(currentEmergency)} (lo asignado actualmente al fondo).`)
        return
      }
      const success = onDeallocate(numeric)
      if (!success) {
        setError('Error al retirar fondos del fondo de emergencia.')
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
            <AppIcon name="shield" size={20} />
            Fondo de emergencia
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
            Asignar al fondo
          </button>
          <button
            type="button"
            className={mode === 'deallocate' ? 'active' : ''}
            onClick={() => {
              setMode('deallocate')
              setError(null)
            }}
          >
            Liberar ahorro
          </button>
        </div>

        <div className="info-badge-row">
          <span>Ahorro libre: <b>{money(freeSavings)}</b></span>
          <span>Fondo actual: <b>{money(currentEmergency)}</b> de {money(targetEmergency)}</span>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 14 }}>
          <div className="form-group">
            <label>
              Importe a {mode === 'allocate' ? 'asignar' : 'retirar'} (€)
              <input
                type="text"
                inputMode="decimal"
                placeholder="100,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </label>
          </div>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="submit" className="primary-button">
              {mode === 'allocate' ? 'Confirmar asignación' : 'Confirmar liberación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { money } from '../utils/money'
import { calculateCashAdjustmentDelta } from '../utils/cashSelectors'
import { AppIcon } from '../ui/icons'

interface AdjustCashModalProps {
  open: boolean
  onClose: () => void
  currentBalance: number
  onSave: (countedAmount: number, date?: string, note?: string) => void
}

export function AdjustCashModal({
  open,
  onClose,
  currentBalance,
  onSave,
}: AdjustCashModalProps) {
  const [countedAmount, setCountedAmount] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setCountedAmount('')
      setDate(new Date().toISOString().slice(0, 10))
      setNote('')
      setError(null)
    }
  }, [open, currentBalance])

  if (!open) return null

  const parsedCounted = parseFloat(countedAmount.replace(',', '.'))
  const hasValidCount = !isNaN(parsedCounted) && parsedCounted >= 0
  const delta = hasValidCount ? calculateCashAdjustmentDelta(currentBalance, parsedCounted) : 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (isNaN(parsedCounted) || parsedCounted < 0) {
      setError('Introduce una cantidad válida de efectivo (0 o más).')
      return
    }

    if (delta === 0) {
      // El saldo coincide exactamente
      onClose()
      return
    }

    onSave(
      parsedCounted,
      date || new Date().toISOString().slice(0, 10),
      note.trim() || undefined
    )

    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 440,
          width: '100%',
          padding: '24px 20px',
          boxSizing: 'border-box',
        }}
      >
        <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(59, 130, 246, 0.12)',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <AppIcon name="scale" size={20} />
            </div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
              Actualizar efectivo
            </h3>
          </div>
          <button type="button" className="btn-icon-subtle" onClick={onClose} aria-label="Cerrar modal">
            <AppIcon name="x" size={20} />
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <h4 style={{ margin: '0 0 6px', fontSize: '1.02rem', fontWeight: 600, color: 'var(--text-main)' }}>
            ¿Cuánto efectivo tienes ahora?
          </h4>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
            Introduce lo que has contado físicamente. PocketFlow ajustará la diferencia automáticamente.
          </p>
        </div>

        {/* Comparativa visual de saldos */}
        <div
          style={{
            background: 'var(--bg-app, #f8f8f5)',
            border: '1px solid var(--border-light, #eaeae4)',
            borderRadius: 14,
            padding: '14px 16px',
            marginBottom: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            boxSizing: 'border-box',
            width: '100%',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.86rem', color: 'var(--text-muted)' }}>Saldo calculado actual:</span>
            <strong style={{ fontSize: '1rem', fontWeight: 700 }}>≈ {money(currentBalance)}</strong>
          </div>

          {hasValidCount && (
            <div
              style={{
                borderTop: '1px dashed var(--border-strong, #d7d8d0)',
                paddingTop: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '0.86rem', color: 'var(--text-muted)' }}>Ajuste resultante:</span>
              <strong
                style={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: delta > 0 ? '#16a34a' : delta < 0 ? '#dc2626' : 'var(--text-muted)',
                }}
              >
                {delta > 0 ? `+${money(delta)}` : delta < 0 ? money(delta) : '0,00 € (Sin cambios)'}
              </strong>
            </div>
          )}
        </div>

        {error && (
          <div className="error-banner" style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: '#fee2e2', color: '#991b1b', fontSize: '0.88rem', width: '100%', boxSizing: 'border-box' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="modal-form" style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
          <div className="form-group" style={{ width: '100%', boxSizing: 'border-box' }}>
            <label htmlFor="adjust-counted" style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Efectivo contado físicamente (€) *
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
              <input
                id="adjust-counted"
                type="text"
                inputMode="decimal"
                autoFocus
                placeholder="0,00"
                value={countedAmount}
                onChange={(e) => setCountedAmount(e.target.value)}
                required
                className="input-field"
                style={{
                  width: '100%',
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  padding: '12px 38px 12px 14px',
                  boxSizing: 'border-box',
                  borderRadius: 'var(--radius-md, 12px)',
                  border: '1px solid var(--border-strong, #d7d8d0)',
                }}
              />
              <span style={{ position: 'absolute', right: 14, fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-muted)', pointerEvents: 'none' }}>
                €
              </span>
            </div>
          </div>

          <div className="form-group" style={{ width: '100%', boxSizing: 'border-box' }}>
            <label htmlFor="adjust-date" style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Fecha
            </label>
            <input
              id="adjust-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input-field"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md, 12px)',
                border: '1px solid var(--border-strong, #d7d8d0)',
                fontSize: '0.95rem',
              }}
            />
          </div>

          <div className="form-group" style={{ width: '100%', boxSizing: 'border-box' }}>
            <label htmlFor="adjust-note" style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Nota o motivo (opcional)
            </label>
            <textarea
              id="adjust-note"
              placeholder="Ej. Conteo semanal de billetera..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="input-field"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md, 12px)',
                border: '1px solid var(--border-strong, #d7d8d0)',
                fontSize: '0.92rem',
                minHeight: 80,
                resize: 'vertical',
              }}
            />
          </div>

          <div className="modal-actions horizontal" style={{ display: 'flex', gap: 12, marginTop: 8, justifyContent: 'flex-end', width: '100%' }}>
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 'var(--radius-md, 12px)',
                fontWeight: 600,
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="primary-button"
              style={{
                flex: 1.3,
                minHeight: 44,
                borderRadius: 'var(--radius-md, 12px)',
                fontWeight: 600,
                background: '#2563eb',
              }}
            >
              Actualizar efectivo
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

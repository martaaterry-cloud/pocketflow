import { useState, useEffect } from 'react'
import type { RecurringPayment } from '../models/finance'
import { money } from '../utils/money'
import { getCoveredMonthsList } from '../utils/financeSelectors'
import { AppIcon } from '../ui/icons'

interface ConfirmRecurringPaymentModalProps {
  open: boolean
  payment: RecurringPayment | null
  onClose: () => void
  onConfirm: (paymentId: string, monthsCount: number) => void
  isSubmitting?: boolean
}

export function ConfirmRecurringPaymentModal({
  open,
  payment,
  onClose,
  onConfirm,
  isSubmitting = false,
}: ConfirmRecurringPaymentModalProps) {
  const [monthsCount, setMonthsCount] = useState<number>(1)

  useEffect(() => {
    if (open) {
      setMonthsCount(1)
    }
  }, [open, payment?.id])

  if (!open || !payment) return null

  const monthlyAmount = Number(payment.amount) || 0
  const expectedTotal = Math.round(monthlyAmount * monthsCount * 100) / 100
  const coveredMonths = getCoveredMonthsList(payment.nextDate || new Date(), monthsCount)

  const handleDecrement = () => {
    setMonthsCount((prev) => Math.max(1, prev - 1))
  }

  const handleIncrement = () => {
    setMonthsCount((prev) => Math.min(24, prev + 1))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onConfirm(payment.id, monthsCount)
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 700 }}>Confirmar pago</h2>
            <p className="muted" style={{ margin: '4px 0 0 0', fontSize: '0.875rem' }}>
              {payment.name} · {money(payment.amount)}/mes
            </p>
          </div>
          <button
            type="button"
            className="icon-button close-button"
            onClick={onClose}
            aria-label="Cerrar modal"
          >
            <AppIcon name="x" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Selector de Mensualidades Cubiertas */}
          <div className="form-group">
            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted, #666)' }}>
              Mensualidades cubiertas
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: 'var(--card-bg-subtle, #f5f5f7)',
                borderRadius: 12,
                padding: '6px 12px',
                marginTop: 6,
                border: '1px solid var(--border-color, #e5e5ea)',
              }}
            >
              <button
                type="button"
                className="round-button mini"
                onClick={handleDecrement}
                disabled={monthsCount <= 1 || isSubmitting}
                style={{ width: 36, height: 36 }}
                aria-label="Disminuir mensualidades"
              >
                <AppIcon name="minus" size={16} />
              </button>

              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '1.35rem', fontWeight: 700, display: 'block' }}>
                  {monthsCount}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #888)' }}>
                  {monthsCount === 1 ? 'mensualidad' : 'mensualidades'}
                </span>
              </div>

              <button
                type="button"
                className="round-button mini"
                onClick={handleIncrement}
                disabled={monthsCount >= 24 || isSubmitting}
                style={{ width: 36, height: 36 }}
                aria-label="Aumentar mensualidades"
              >
                <AppIcon name="plus" size={16} />
              </button>
            </div>
          </div>

          {/* Importe esperado y cálculo automático */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 10,
              backgroundColor: 'var(--accent-subtle, rgba(0, 122, 255, 0.08))',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '0.9rem', color: 'var(--text-color, #333)', fontWeight: 500 }}>
              Importe esperado
            </span>
            <strong style={{ fontSize: '1.2rem', color: 'var(--text-color, #111)' }}>
              {money(expectedTotal)}
            </strong>
          </div>

          {/* Detalle de Cobertura de Periodos */}
          <div className="form-group">
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted, #666)', marginBottom: 6, display: 'block' }}>
              Cobertura
            </label>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                maxHeight: 140,
                overflowY: 'auto',
                paddingRight: 4,
              }}
            >
              {coveredMonths.map((m, idx) => (
                <div
                  key={`${m.year}-${m.name}-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 8,
                    backgroundColor: 'var(--item-bg, #ffffff)',
                    border: '1px solid var(--border-color, #e5e5ea)',
                    fontSize: '0.875rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AppIcon name="calendar" size={14} color="var(--primary-color, #007aff)" />
                    <span style={{ fontWeight: 600 }}>{m.label}</span>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #888)' }}>
                    {idx === 0 ? 'Mes actual / ciclo' : 'Por adelantado'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Botones de acción */}
          <div className="modal-actions" style={{ marginTop: 8, display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="text-button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{ flex: 1 }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={isSubmitting}
              style={{ flex: 2 }}
            >
              {isSubmitting ? 'Confirmando...' : `Confirmar pago de ${money(expectedTotal)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

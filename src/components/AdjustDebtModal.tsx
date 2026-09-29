import { useState, useEffect, useMemo } from 'react'
import type { CashTransaction, ExpenseShare, Transaction } from '../models/finance'
import { money } from '../utils/money'
import { AppIcon } from '../ui/icons'
import { selectExpenseShareStatus, selectExpensePayableStatus } from '../utils/sharedExpenseSelectors'

interface AdjustDebtModalProps {
  open: boolean
  onClose: () => void
  share: ExpenseShare | null
  transactions?: Transaction[]
  cashTransactions?: CashTransaction[]
  onAdjustDebt: (shareId: string, amount: number) => void
  isPayable?: boolean
}

export function AdjustDebtModal({
  open,
  onClose,
  share,
  transactions = [],
  cashTransactions = [],
  onAdjustDebt,
  isPayable = false,
}: AdjustDebtModalProps) {
  const [forgiveInput, setForgiveInput] = useState('')

  const status = useMemo(() => {
    if (!share) return null
    if (isPayable) {
      return selectExpensePayableStatus(share, transactions, cashTransactions)
    }
    return selectExpenseShareStatus(share, transactions, cashTransactions)
  }, [share, isPayable, transactions, cashTransactions])

  const pendingAmount = status?.pendingAmount ?? 0
  const expectedAmount = status?.expectedAmount ?? 0
  const appliedAmount = status?.appliedAmount ?? 0
  const currentForgiven = status?.forgivenAmount ?? 0

  useEffect(() => {
    if (open && status) {
      setForgiveInput(String(pendingAmount).replace('.', ','))
    }
  }, [open, pendingAmount, status])

  if (!open || !share || !status) return null

  const parseAmount = (val: string): number => {
    const clean = val.replace(',', '.').replace(/[^0-9.]/g, '')
    const num = parseFloat(clean)
    return isNaN(num) ? 0 : Math.round(num * 100) / 100
  }

  const numericForgive = parseAmount(forgiveInput)
  const isValid = numericForgive > 0 && numericForgive <= pendingAmount + 0.0001

  const handleFullForgive = () => {
    setForgiveInput(String(pendingAmount).replace('.', ','))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) return
    onAdjustDebt(share.id, numericForgive)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" style={{ zIndex: 1200 }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <div>
            <span className="badge-shared">Ajuste de Deuda</span>
            <h3 style={{ marginTop: 4 }}>
              {isPayable ? `Ajustar deuda con ${share.participantName}` : `Perdonar deuda a ${share.participantName}`}
            </h3>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar">
            <AppIcon name="x" size={18} />
          </button>
        </div>

        <div className="shared-summary-card" style={{ marginBottom: 16 }}>
          <div className="shared-summary-row">
            <span>Deuda esperada original:</span>
            <strong>{money(expectedAmount)}</strong>
          </div>
          <div className="shared-summary-row">
            <span>{isPayable ? 'Pagado real:' : 'Cobrado real:'}</span>
            <strong style={{ color: 'var(--color-success, #16a34a)' }}>{money(appliedAmount)}</strong>
          </div>
          {currentForgiven > 0 && (
            <div className="shared-summary-row" style={{ color: 'var(--text-muted)' }}>
              <span>Perdonado/Ajustado previamente:</span>
              <strong>{money(currentForgiven)}</strong>
            </div>
          )}
          <div className="shared-summary-row highlight-pending">
            <span>Pendiente actual:</span>
            <strong style={{ color: isPayable ? '#ef4444' : '#7c3aed' }}>{money(pendingAmount)}</strong>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
              Importe a {isPayable ? 'ajustar' : 'perdonar'} (€)
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                inputMode="decimal"
                value={forgiveInput}
                onChange={(e) => setForgiveInput(e.target.value)}
                placeholder="0,00"
                autoFocus
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color, rgba(255,255,255,0.15))',
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  background: 'var(--bg-input, rgba(0,0,0,0.2))',
                  color: 'inherit',
                }}
              />
              <button
                type="button"
                className="secondary-button"
                onClick={handleFullForgive}
                style={{ fontSize: '0.8rem', padding: '0 12px', whiteSpace: 'nowrap' }}
              >
                Todo ({money(pendingAmount)})
              </button>
            </div>

            {numericForgive > pendingAmount && (
              <span style={{ display: 'block', marginTop: '6px', fontSize: '0.8rem', color: '#ef4444' }}>
                El importe no puede superar lo pendiente restante ({money(pendingAmount)}).
              </span>
            )}
          </div>

          <div className="info-notice" style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-secondary, rgba(255,255,255,0.03))', border: '1px solid var(--border-color, rgba(255,255,255,0.06))', marginBottom: '18px', fontSize: '0.8rem', color: 'var(--text-muted, #8e8e93)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
              <span style={{ display: 'inline-flex', marginTop: '2px', flexShrink: 0 }}>
                <AppIcon name="info" size={14} />
              </span>
              <span>
                Esta acción solo ajusta la obligación de deuda. No crea movimientos bancarios ficticios ni altera saldos de caja.
              </span>
            </div>
          </div>

          <div className="modal-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={!isValid}
              style={{ background: '#7c3aed' }}
            >
              {isPayable ? 'Ajustar deuda' : 'Perdonar importe'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

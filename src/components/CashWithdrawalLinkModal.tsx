import { money } from '../utils/money'
import { AppIcon } from '../ui/icons'
import type { Transaction } from '../models/finance'

interface CashWithdrawalLinkModalProps {
  open: boolean
  transaction: Transaction | null
  onClose: () => void
  onConfirm: (tx: Transaction) => void
}

export function CashWithdrawalLinkModal({
  open,
  transaction,
  onClose,
  onConfirm,
}: CashWithdrawalLinkModalProps) {
  if (!open || !transaction) return null

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 440, textAlign: 'center', padding: '28px 24px' }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'rgba(34, 197, 94, 0.12)',
            color: '#16a34a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          <AppIcon name="banknote" size={28} />
        </div>

        <h3 style={{ margin: '0 0 10px', fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
          ¿Añadir {money(transaction.amount)} a Efectivo?
        </h3>

        <p
          className="description"
          style={{
            margin: '0 0 24px',
            color: 'var(--text-muted)',
            fontSize: '0.94rem',
            lineHeight: 1.5,
          }}
        >
          Así PocketFlow sabrá que este dinero sigue siendo tuyo y no lo contará como gasto hasta que lo uses.
        </p>

        <div className="modal-actions horizontal" style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            type="button"
            className="secondary-button"
            style={{ flex: 1, padding: '12px 16px', borderRadius: 'var(--radius-md, 16px)' }}
            onClick={onClose}
          >
            Ahora no
          </button>
          <button
            type="button"
            className="primary-button"
            style={{
              flex: 1.3,
              padding: '12px 16px',
              borderRadius: 'var(--radius-md, 16px)',
              background: '#16a34a',
              color: '#ffffff',
            }}
            onClick={() => onConfirm(transaction)}
          >
            Añadir a Efectivo
          </button>
        </div>
      </div>
    </div>
  )
}

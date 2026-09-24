import { money } from '../utils/money'
import { AppIcon } from '../ui/icons'
import type { Transaction, CashTransaction } from '../models/finance'

interface DeleteTransactionModalProps {
  open: boolean
  transaction: Transaction | null
  cashTransactions?: CashTransaction[]
  onClose: () => void
  onDeleteBankOnly: (txId: string) => void
  onDeleteBoth: (bankTxId: string, cashTxId: string) => void
}

export function DeleteTransactionModal({
  open,
  transaction,
  cashTransactions = [],
  onClose,
  onDeleteBankOnly,
  onDeleteBoth,
}: DeleteTransactionModalProps) {
  if (!open || !transaction) return null

  const isWithdrawal = transaction.specialType === 'cash_withdrawal'
  const linkedCash = isWithdrawal
    ? cashTransactions.find((c) => c.bankTransactionId === transaction.id)
    : undefined

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <AppIcon name="trash-2" size={20} />
          </div>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)' }}>
            ¿Eliminar movimiento?
          </h3>
        </div>

        <p className="description" style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: '0.92rem', lineHeight: 1.5 }}>
          ¿Seguro que quieres eliminar <strong>{transaction.description}</strong> ({money(transaction.amount)})? Esta acción no se puede deshacer.
        </p>

        {linkedCash ? (
          <div
            style={{
              background: 'rgba(37, 99, 235, 0.06)',
              border: '1px solid rgba(37, 99, 235, 0.18)',
              borderRadius: 'var(--radius-md, 14px)',
              padding: '12px 14px',
              marginBottom: 20,
              fontSize: '0.88rem',
              color: 'var(--text-main)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#2563eb' }}>
              <AppIcon name="banknote" size={16} />
              <span>Esta retirada tiene un movimiento vinculado en Efectivo (+{money(linkedCash.amount)}).</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Puedes borrar solo el apunte bancario o eliminar también la entrada correspondiente de efectivo.
            </p>
          </div>
        ) : null}

        <div className="modal-actions" style={{ display: 'flex', flexDirection: linkedCash ? 'column' : 'row', gap: 10, justifyContent: 'flex-end' }}>
          {linkedCash ? (
            <>
              <button
                type="button"
                className="danger-button"
                style={{ width: '100%', padding: '12px' }}
                onClick={() => {
                  onDeleteBoth(transaction.id, linkedCash.id)
                  onClose()
                }}
              >
                Borrar ambos (Banco y Efectivo)
              </button>
              <button
                type="button"
                className="secondary-button"
                style={{ width: '100%', padding: '12px' }}
                onClick={() => {
                  onDeleteBankOnly(transaction.id)
                  onClose()
                }}
              >
                Borrar solo de Banco
              </button>
              <button
                type="button"
                className="secondary-button"
                style={{ width: '100%', padding: '10px', background: 'transparent', border: 'none', color: 'var(--text-muted)' }}
                onClick={onClose}
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="secondary-button"
                onClick={onClose}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => {
                  onDeleteBankOnly(transaction.id)
                  onClose()
                }}
              >
                Eliminar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

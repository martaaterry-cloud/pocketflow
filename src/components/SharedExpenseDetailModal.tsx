import { useState } from 'react'
import type { CashTransaction, ExpenseShare, Transaction } from '../models/finance'
import { money, shortDate } from '../utils/money'
import { selectExpenseShareDetails, selectExpensePayableStatus } from '../utils/sharedExpenseSelectors'
import { AppIcon } from '../ui/icons'
import { AdjustDebtModal } from './AdjustDebtModal'

interface SharedExpenseDetailModalProps {
  open: boolean
  onClose: () => void
  expenseTransaction: Transaction | CashTransaction
  allTransactions: Transaction[]
  expenseShares: ExpenseShare[]
  cashTransactions?: CashTransaction[]
  onRecordReimbursement: (shareId: string) => void
  onRecordPayablePayment?: (shareId: string) => void
  onAdjustDebt?: (shareId: string, amount: number) => void
  onEditExpense?: (tx: Transaction | CashTransaction) => void
}

export function SharedExpenseDetailModal({
  open,
  onClose,
  expenseTransaction,
  allTransactions,
  expenseShares,
  cashTransactions = [],
  onRecordReimbursement,
  onRecordPayablePayment,
  onAdjustDebt,
  onEditExpense,
}: SharedExpenseDetailModalProps) {
  const [adjustingShare, setAdjustingShare] = useState<ExpenseShare | null>(null)

  if (!open) return null

  const isContactPaid = expenseTransaction.paidBy === 'contact'
  const payerName = expenseTransaction.payerName || 'Contacto'

  const details = selectExpenseShareDetails(
    expenseTransaction.id,
    allTransactions,
    expenseShares,
    cashTransactions
  )

  const userShare = expenseShares.find(
    (s) => s.expenseTransactionId === expenseTransaction.id && (s.isUserShare || s.participantName.toLowerCase() === 'tú')
  )

  const userPayableStatus = userShare
    ? selectExpensePayableStatus(userShare, allTransactions, cashTransactions)
    : null

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
        <div className="modal shared-detail-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div>
              <span className="badge-shared">Gasto Compartido</span>
              <h3 style={{ marginTop: 4 }}>{expenseTransaction.description}</h3>
            </div>
            <button className="close-btn" onClick={onClose} aria-label="Cerrar">
              <AppIcon name="x" size={18} />
            </button>
          </div>

          {/* Resumen principal */}
          <div className="shared-summary-card">
            <div className="shared-summary-row">
              <span>Total gasto:</span>
              <strong>{money(expenseTransaction.amount)}</strong>
            </div>
            {isContactPaid ? (
              <>
                <div className="shared-summary-row highlight-personal">
                  <span>Pagado por:</span>
                  <strong>{payerName}</strong>
                </div>
                <div className="shared-summary-row highlight-personal">
                  <span>Tu cuota:</span>
                  <strong>{money(userShare?.expectedAmount ?? 0)}</strong>
                </div>
                {userPayableStatus && userPayableStatus.forgivenAmount > 0 && (
                  <div className="shared-summary-row" style={{ color: 'var(--text-muted)' }}>
                    <span>Ajustado/Perdonado:</span>
                    <strong>{money(userPayableStatus.forgivenAmount)}</strong>
                  </div>
                )}
                <div className="shared-summary-row highlight-pending">
                  <span>Pendiente por pagar a {payerName}:</span>
                  <strong style={{ color: '#ef4444' }}>{money(userPayableStatus?.pendingAmount ?? 0)}</strong>
                </div>
              </>
            ) : (
              <>
                <div className="shared-summary-row highlight-personal">
                  <span>Tu parte real (incluye absorbido):</span>
                  <strong>{money(details.payerShare?.expectedAmount ?? 0)}</strong>
                </div>
                {details.totalForgiven > 0 && (
                  <div className="shared-summary-row" style={{ color: 'var(--text-muted)' }}>
                    <span>Perdonado/Ajustado:</span>
                    <strong>{money(details.totalForgiven)}</strong>
                  </div>
                )}
                <div className="shared-summary-row highlight-pending">
                  <span>Pendiente por recuperar:</span>
                  <strong style={{ color: '#16a34a' }}>{money(details.totalPendingToRecover)}</strong>
                </div>
              </>
            )}
          </div>

          {/* Lista de participantes y cuotas */}
          <div className="shared-participants-section">
            <h4>Participantes y estado</h4>
            <div className="shared-participants-list">
              {/* Pagador */}
              {details.payerShare && (
                <div className="shared-participant-row payer">
                  <div className="participant-info">
                    <strong>{details.payerShare.participantName} {isContactPaid ? '' : '(Tú)'}</strong>
                    <span className="participant-role">Pagó el total</span>
                  </div>
                  <div className="participant-amounts">
                    <strong>{money(details.payerShare.expectedAmount)}</strong>
                  </div>
                </div>
              )}

              {/* Participantes externos o usuario si pagó contacto */}
              {details.externalSharesWithStatus.map((item) => {
                const isUserItem =
                  item.share.isUserShare || item.share.participantName.toLowerCase() === 'tú'
                const statusClass =
                  item.status === 'received'
                    ? 'status-received'
                    : item.status === 'partial'
                    ? 'status-partial'
                    : 'status-pending'

                const statusLabel =
                  item.status === 'received'
                    ? isContactPaid
                      ? 'Pagado'
                      : 'Cobrado'
                    : item.status === 'partial'
                    ? 'Parcial'
                    : 'Pendiente'

                return (
                  <div
                    className="shared-participant-row"
                    key={item.share.id}
                    style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div className="participant-info">
                        <strong>
                          {item.share.participantName} {isUserItem ? '(Tú)' : ''}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className={`participant-status-badge ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>

                    <div
                      className="participant-details-grid"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                        gap: '6px 12px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        fontSize: '0.78rem',
                      }}
                    >
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block' }}>Parte asignada:</span>
                        <strong>{money(item.expectedAmount)}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                          {isContactPaid ? 'Pagado real:' : 'Cobrado real:'}
                        </span>
                        <strong style={{ color: '#10b981' }}>{money(item.appliedAmount)}</strong>
                      </div>
                      {item.extraAmount && item.extraAmount > 0 ? (
                        <div>
                          <span style={{ color: 'var(--text-muted)', display: 'block' }}>Extra enviado:</span>
                          <strong style={{ color: 'var(--text-muted)' }}>{money(item.extraAmount)}</strong>
                        </div>
                      ) : null}
                      {item.forgivenAmount > 0 && (
                        <div>
                          <span style={{ color: 'var(--text-muted)', display: 'block' }}>
                            {isContactPaid ? 'Perdonado a ti:' : 'Perdonado:'}
                          </span>
                          <strong style={{ color: '#fbbf24' }}>{money(item.forgivenAmount)}</strong>
                        </div>
                      )}
                      <div>
                        <span style={{ color: 'var(--text-muted)', display: 'block' }}>Pendiente:</span>
                        <strong style={{ color: item.pendingAmount > 0 ? '#ef4444' : 'var(--text-muted)' }}>
                          {money(item.pendingAmount)}
                        </strong>
                      </div>
                    </div>

                    {item.pendingAmount > 0 && (
                      <div
                        className="participant-actions"
                        style={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          alignItems: 'center',
                          gap: '6px',
                          marginTop: 2,
                        }}
                      >
                        {isContactPaid && isUserItem ? (
                          <button
                            type="button"
                            className="small-action-button"
                            style={{ background: '#ef4444', color: '#fff' }}
                            onClick={() => onRecordPayablePayment?.(item.share.id)}
                          >
                            Pagar {money(item.pendingAmount)}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="small-action-button"
                            onClick={() => onRecordReimbursement(item.share.id)}
                          >
                            Cobrar {money(item.pendingAmount)}
                          </button>
                        )}
                        {onAdjustDebt && (
                          <button
                            type="button"
                            className="secondary-button"
                            style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                            onClick={() => setAdjustingShare(item.share)}
                          >
                            Ajustar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Historial de pagos vinculados */}
          {details.externalSharesWithStatus.some((s) => s.reimbursements.length > 0) && (
            <div className="shared-reimbursements-history">
              <h4>{isContactPaid ? 'Pagos realizados' : 'Reembolsos recibidos'}</h4>
              <div className="reimbursements-list">
                {details.externalSharesWithStatus.flatMap((s) =>
                  s.reimbursements.map((r) => {
                    const hasExtra = isContactPaid && s.extraAmount && s.extraAmount > 0
                    return (
                      <div className="reimbursement-item" key={r.id}>
                        <div>
                          <strong>{isContactPaid ? `-${money(r.amount)}` : `+${money(r.amount)}`}</strong>
                          <span>
                            {r.description} · {shortDate(r.date)}
                            {hasExtra && (
                              <span style={{ display: 'block', fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                Enviado: {money(r.amount)} · Aplicado: {money(s.appliedAmount)} · Extra: {money(s.extraAmount)}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          <div className="modal-actions" style={{ marginTop: 20 }}>
            {onEditExpense && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  onClose()
                  onEditExpense(expenseTransaction)
                }}
              >
                Editar gasto
              </button>
            )}
            <button type="button" className="primary-button" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>

      {adjustingShare && (
        <AdjustDebtModal
          open={Boolean(adjustingShare)}
          share={adjustingShare}
          transactions={allTransactions}
          cashTransactions={cashTransactions}
          onClose={() => setAdjustingShare(null)}
          onAdjustDebt={(shareId, amount) => {
            onAdjustDebt?.(shareId, amount)
            setAdjustingShare(null)
          }}
          isPayable={isContactPaid && (adjustingShare.isUserShare || adjustingShare.participantName.toLowerCase() === 'tú')}
        />
      )}
    </>
  )
}

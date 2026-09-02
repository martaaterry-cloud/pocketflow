import type { ExpenseShare, Transaction } from '../models/finance'
import { money, shortDate } from '../utils/money'
import { selectExpenseShareDetails } from '../utils/sharedExpenseSelectors'
import { AppIcon } from '../ui/icons'

interface SharedExpenseDetailModalProps {
  open: boolean
  onClose: () => void
  expenseTransaction: Transaction
  allTransactions: Transaction[]
  expenseShares: ExpenseShare[]
  onRecordReimbursement: (shareId: string) => void
  onEditExpense?: (tx: Transaction) => void
}

export function SharedExpenseDetailModal({
  open,
  onClose,
  expenseTransaction,
  allTransactions,
  expenseShares,
  onRecordReimbursement,
  onEditExpense,
}: SharedExpenseDetailModalProps) {
  if (!open) return null

  const details = selectExpenseShareDetails(
    expenseTransaction.id,
    allTransactions,
    expenseShares
  )

  return (
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
            <span>Total pagado:</span>
            <strong>{money(expenseTransaction.amount)}</strong>
          </div>
          <div className="shared-summary-row highlight-personal">
            <span>Tu parte real:</span>
            <strong>{money(details.payerShare?.expectedAmount ?? 0)}</strong>
          </div>
          <div className="shared-summary-row highlight-pending">
            <span>Pendiente por recuperar:</span>
            <strong>{money(details.totalPendingToRecover)}</strong>
          </div>
        </div>

        {/* Lista de participantes y cuotas */}
        <div className="shared-participants-section">
          <h4>Participantes y estado</h4>
          <div className="shared-participants-list">
            {/* Pagador */}
            {details.payerShare && (
              <div className="shared-participant-row payer">
                <div className="participant-info">
                  <strong>{details.payerShare.participantName} (Tú)</strong>
                  <span className="participant-role">Pagaste el total</span>
                </div>
                <div className="participant-amounts">
                  <strong>{money(details.payerShare.expectedAmount)}</strong>
                </div>
              </div>
            )}

            {/* Participantes externos */}
            {details.externalSharesWithStatus.map((item) => {
              const statusClass =
                item.status === 'received'
                  ? 'status-received'
                  : item.status === 'partial'
                  ? 'status-partial'
                  : 'status-pending'

              const statusLabel =
                item.status === 'received'
                  ? 'Completado'
                  : item.status === 'partial'
                  ? `Parcial (${money(item.receivedAmount)} / ${money(item.expectedAmount)})`
                  : 'Pendiente'

              return (
                <div className="shared-participant-row" key={item.share.id}>
                  <div className="participant-info">
                    <strong>{item.share.participantName}</strong>
                    <span className={`participant-status-badge ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </div>

                  <div className="participant-action-col">
                    <span className="participant-expected">{money(item.expectedAmount)}</span>
                    {item.pendingAmount > 0 && (
                      <button
                        type="button"
                        className="small-action-button"
                        onClick={() => onRecordReimbursement(item.share.id)}
                      >
                        Cobrar {money(item.pendingAmount)}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Historial de reembolsos recibidos vinculados */}
        {details.externalSharesWithStatus.some((s) => s.reimbursements.length > 0) && (
          <div className="shared-reimbursements-history">
            <h4>Reembolsos recibidos</h4>
            <div className="reimbursements-list">
              {details.externalSharesWithStatus.flatMap((s) =>
                s.reimbursements.map((r) => (
                  <div className="reimbursement-item" key={r.id}>
                    <div>
                      <strong>+{money(r.amount)}</strong>
                      <span>{r.description} · {shortDate(r.date)}</span>
                    </div>
                  </div>
                ))
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
  )
}

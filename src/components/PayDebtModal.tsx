import { useState, useMemo, useEffect } from 'react'
import type { Account, CashTransaction, ExpenseShare, Transaction } from '../models/finance'
import { money, shortDate } from '../utils/money'
import { selectPendingPayables, selectExpensePayableStatus } from '../utils/sharedExpenseSelectors'
import { AppIcon } from '../ui/icons'

interface PayDebtModalProps {
  open: boolean
  onClose: () => void
  accounts: Account[]
  transactions: Transaction[]
  expenseShares: ExpenseShare[]
  cashTransactions?: CashTransaction[]
  initialShareId?: string
  initialExpenseId?: string
  onSubmit: (input: {
    expenseShareId: string
    amount: number
    accountId?: string
    date?: string
    note?: string
    description?: string
    paymentMethod?: 'bank' | 'cash'
  }) => void
}

export function PayDebtModal({
  open,
  onClose,
  accounts,
  transactions,
  expenseShares,
  cashTransactions = [],
  initialShareId,
  initialExpenseId,
  onSubmit,
}: PayDebtModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<'bank' | 'cash'>('bank')
  const [selectedShareId, setSelectedShareId] = useState<string>(initialShareId || '')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState(() => accounts.find((a) => a.type === 'spending')?.id ?? accounts[0]?.id ?? 'daily')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')

  // Todas las deudas por pagar pendientes
  const pendingPayables = useMemo(() => {
    return selectPendingPayables(expenseShares, transactions, cashTransactions)
  }, [expenseShares, transactions, cashTransactions])

  const allPendingShares = useMemo(() => {
    return pendingPayables.flatMap((c) =>
      c.pendingShares.map((ps) => ({
        ...ps,
        creditorName: c.creditorName,
      }))
    )
  }, [pendingPayables])

  useEffect(() => {
    if (initialShareId) {
      const match = allPendingShares.find((p) => p.share.id === initialShareId)
      if (match) {
        setSelectedShareId(match.share.id)
        setAmount(String(match.pendingAmount).replace('.', ','))
      }
    } else if (initialExpenseId) {
      const match = allPendingShares.find((p) => p.share.expenseTransactionId === initialExpenseId)
      if (match) {
        setSelectedShareId(match.share.id)
        setAmount(String(match.pendingAmount).replace('.', ','))
      }
    } else if (allPendingShares.length > 0 && !selectedShareId) {
      setSelectedShareId(allPendingShares[0].share.id)
      setAmount(String(allPendingShares[0].pendingAmount).replace('.', ','))
    }
  }, [initialShareId, initialExpenseId, allPendingShares, open])

  if (!open) return null

  const selectedItem = allPendingShares.find((p) => p.share.id === selectedShareId)

  const handleSelectPayable = (shareId: string, pendingAmount: number) => {
    setSelectedShareId(shareId)
    setAmount(String(pendingAmount).replace('.', ','))
  }

  const handleSubmit = () => {
    const numericAmount = Number(amount.replace(',', '.'))
    if (!numericAmount || numericAmount <= 0) return
    if (!selectedShareId) return
    if (paymentMethod === 'bank' && !accountId) return

    const creditorName = selectedItem?.creditorName || 'Contacto'
    const expenseDesc = selectedItem?.expenseDescription || 'Gasto compartido'

    onSubmit({
      expenseShareId: selectedShareId,
      amount: numericAmount,
      accountId: paymentMethod === 'bank' ? accountId : undefined,
      date: new Date(date).toISOString(),
      description:
        paymentMethod === 'cash'
          ? `Pago efectivo a ${creditorName} · ${expenseDesc}`
          : `Pago Bizum a ${creditorName} · ${expenseDesc}`,
      note: note.trim() || undefined,
      paymentMethod,
    })

    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal pay-debt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Pagar Deuda Compartida</h3>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar">
            <AppIcon name="x" size={18} />
          </button>
        </div>

        {/* Selector de método de pago: Banco/Bizum vs Efectivo */}
        <div className="type-toggle" style={{ margin: '12px 0 16px 0' }}>
          <button
            type="button"
            className={paymentMethod === 'bank' ? 'active' : ''}
            onClick={() => setPaymentMethod('bank')}
          >
            💳 Bizum / Banco
          </button>
          <button
            type="button"
            className={paymentMethod === 'cash' ? 'active' : ''}
            onClick={() => setPaymentMethod('cash')}
          >
            💵 En Efectivo
          </button>
        </div>

        <div className="modal-form">
          {allPendingShares.length > 0 ? (
            <div className="pending-shares-list-section">
              <span className="field-group-title">Selecciona la deuda a saldar:</span>
              <div className="pending-reimb-cards">
                {allPendingShares.map((item) => {
                  const isSelected = item.share.id === selectedShareId
                  return (
                    <button
                      type="button"
                      key={item.share.id}
                      className={`reimb-card-btn ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectPayable(item.share.id, item.pendingAmount)}
                    >
                      <div className="reimb-card-info">
                        <strong>Deuda con {item.creditorName}</strong>
                        <span>
                          {item.expenseDescription} ({shortDate(item.expenseDate)})
                        </span>
                      </div>
                      <div className="reimb-card-amounts">
                        <strong className="pending-val">{money(item.pendingAmount)}</strong>
                        <small>de {money(item.share.expectedAmount)}</small>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="reimb-empty-note">
              <span>No tienes deudas pendientes registradas por pagar.</span>
            </div>
          )}

          <div className="form-group">
            <label>
              Importe a pagar (€)
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                autoFocus
              />
            </label>
          </div>

          {paymentMethod === 'bank' && (
            <div className="form-group">
              <label>
                Cuenta desde la que pagas
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.type === 'spending' ? 'Diaria' : 'Ahorro'})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="form-group">
            <label>
              Fecha del pago
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>

          <div className="form-group">
            <label>
              Nota (opcional)
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej. Transferencia hecha por la app"
              />
            </label>
          </div>

          <div className="modal-actions" style={{ marginTop: '20px' }}>
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleSubmit}
              disabled={!amount || Number(amount.replace(',', '.')) <= 0 || !selectedShareId}
            >
              Registrar pago
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

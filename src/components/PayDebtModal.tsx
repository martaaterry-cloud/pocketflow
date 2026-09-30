import { useState, useMemo, useEffect } from 'react'
import type { Account, CashTransaction, ExpenseShare, Transaction } from '../models/finance'
import { money, shortDate } from '../utils/money'
import { selectPendingPayables } from '../utils/sharedExpenseSelectors'
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
  const numericAmount = Number(amount.replace(',', '.')) || 0
  const pendingAmount = selectedItem?.pendingAmount ?? 0
  const isOverpaying = numericAmount > pendingAmount && pendingAmount > 0
  const extraAmount = isOverpaying ? Math.round((numericAmount - pendingAmount) * 100) / 100 : 0

  const handleSelectPayable = (shareId: string, itemPendingAmount: number) => {
    setSelectedShareId(shareId)
    setAmount(String(itemPendingAmount).replace('.', ','))
  }

  const handleSubmit = () => {
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
          <h3>Pagar deuda</h3>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar">
            <AppIcon name="x" size={18} />
          </button>
        </div>

        {/* Selector de método de pago: Banco/Bizum vs Efectivo */}
        <div className="form-group">
          <label className="section-label">¿Desde dónde pagas?</label>
          <div className="segmented" style={{ marginTop: 4 }}>
            <button
              type="button"
              className={paymentMethod === 'bank' ? 'active' : ''}
              onClick={() => setPaymentMethod('bank')}
            >
              Banco / Bizum
            </button>
            <button
              type="button"
              className={paymentMethod === 'cash' ? 'active' : ''}
              onClick={() => setPaymentMethod('cash')}
            >
              Efectivo
            </button>
          </div>
        </div>

        {/* Lista de deudas pendientes */}
        {allPendingShares.length > 0 ? (
          <div className="form-group">
            <label className="section-label">Deudas pendientes por pagar</label>
            <div className="debt-chip-list">
              {allPendingShares.map((item) => {
                const isSelected = item.share.id === selectedShareId
                return (
                  <button
                    key={item.share.id}
                    type="button"
                    className={`debt-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectPayable(item.share.id, item.pendingAmount)}
                  >
                    <div className="debt-chip-top">
                      <strong>Deuda con {item.creditorName}</strong>
                      <span className="debt-chip-amount" style={{ color: '#ef4444' }}>
                        debes {money(item.pendingAmount)}
                      </span>
                    </div>
                    <span className="debt-chip-subtitle">
                      {item.expenseDescription} · {shortDate(item.expenseDate)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="form-group">
            <div className="empty-state-box" style={{ padding: '16px 12px' }}>
              <p>No tienes deudas pendientes registradas por pagar.</p>
            </div>
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
          {isOverpaying && (
            <div className="field-hint" style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: '0.78rem' }}>
              Pendiente: {money(pendingAmount)} · Vas a pagar: {money(numericAmount)} · Extra: {money(extraAmount)}
              <div style={{ marginTop: 2 }}>
                Los {money(extraAmount)} adicionales se registrarán como salida real, pero no crearán saldo a tu favor.
              </div>
            </div>
          )}
          {!isOverpaying && numericAmount > 0 && selectedItem && numericAmount < pendingAmount && (
            <span className="field-hint">
              Pago parcial (quedará pendiente {money(Math.max(0, pendingAmount - numericAmount))})
            </span>
          )}
        </div>

        {paymentMethod === 'bank' ? (
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
        ) : (
          <div
            className="form-group"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 'var(--radius-md, 12px)',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#ef4444',
              fontSize: '0.88rem',
            }}
          >
            <AppIcon name="banknote" size={20} />
            <div>
              <strong>Disminuirá el saldo físico de Efectivo</strong>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {numericAmount > 0
                  ? `-${money(numericAmount)} en Efectivo · Tu banco no cambiará`
                  : 'Tu saldo bancario no cambiará'}
              </div>
            </div>
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
            Nota opcional
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ej. Bizum realizado por la app bancaria"
            />
          </label>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="primary-button"
            onClick={handleSubmit}
            disabled={!numericAmount || numericAmount <= 0 || !selectedShareId}
          >
            Registrar pago (-{numericAmount > 0 ? money(numericAmount) : '0,00 €'})
          </button>
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

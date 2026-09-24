import { useState, useMemo, useEffect } from 'react'
import type { Account, CashTransaction, ExpenseShare, Transaction } from '../models/finance'
import { money, shortDate } from '../utils/money'
import { selectPendingDebtors, selectExpenseShareStatus } from '../utils/sharedExpenseSelectors'
import { AppIcon } from '../ui/icons'

interface ReimbursementModalProps {
  open: boolean
  onClose: () => void
  accounts: Account[]
  transactions: Transaction[]
  expenseShares: ExpenseShare[]
  cashTransactions?: CashTransaction[]
  initialShareId?: string
  initialExpenseId?: string
  onSubmit: (input: {
    parentExpenseId?: string
    expenseShareId?: string
    amount: number
    accountId?: string
    date: string
    note?: string
    description?: string
    paymentMethod?: 'bank' | 'cash'
  }) => void
}

export function ReimbursementModal({
  open,
  onClose,
  accounts,
  transactions,
  expenseShares,
  cashTransactions = [],
  initialShareId,
  initialExpenseId,
  onSubmit,
}: ReimbursementModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<'bank' | 'cash'>('bank')
  const [selectedShareId, setSelectedShareId] = useState<string>(initialShareId || '')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState(() => accounts.find((a) => a.type === 'spending')?.id ?? accounts[0]?.id ?? 'daily')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [customDescription, setCustomDescription] = useState('')

  const pendingDebtors = useMemo(() => {
    return selectPendingDebtors(expenseShares, transactions, cashTransactions)
  }, [expenseShares, transactions, cashTransactions])

  // Todas las shares externas pendientes
  const pendingShares = useMemo(() => {
    const list: {
      share: ExpenseShare
      pendingAmount: number
      expense?: Transaction | CashTransaction
    }[] = []

    expenseShares.filter((s) => !s.isPayerShare).forEach((s) => {
      const parentTx =
        transactions.find((t) => t.id === s.expenseTransactionId) ||
        cashTransactions.find((c) => c.id === s.expenseTransactionId)
      const { pendingAmount } = selectExpenseShareStatus(s, transactions, cashTransactions)

      if (pendingAmount > 0) {
        list.push({ share: s, pendingAmount, expense: parentTx })
      }
    })

    return list
  }, [expenseShares, transactions, cashTransactions])

  useEffect(() => {
    if (initialShareId) {
      const match = pendingShares.find((ps) => ps.share.id === initialShareId)
      if (match) {
        setSelectedShareId(match.share.id)
        setAmount(String(match.pendingAmount).replace('.', ','))
        setIsCustom(false)
      }
    } else if (initialExpenseId) {
      const match = pendingShares.find((ps) => ps.share.expenseTransactionId === initialExpenseId)
      if (match) {
        setSelectedShareId(match.share.id)
        setAmount(String(match.pendingAmount).replace('.', ','))
        setIsCustom(false)
      }
    } else if (pendingShares.length > 0 && !selectedShareId && !isCustom) {
      setSelectedShareId(pendingShares[0].share.id)
      setAmount(String(pendingShares[0].pendingAmount).replace('.', ','))
    }
  }, [initialShareId, initialExpenseId, pendingShares, open])

  if (!open) return null

  const selectedItem = pendingShares.find((ps) => ps.share.id === selectedShareId)

  const handleSelectShare = (shareId: string, pendingAmount: number) => {
    setSelectedShareId(shareId)
    setAmount(String(pendingAmount).replace('.', ','))
    setIsCustom(false)
  }

  const handleSubmit = () => {
    const numericAmount = Number(amount.replace(',', '.'))
    if (!numericAmount || numericAmount <= 0) return
    if (paymentMethod === 'bank' && !accountId) return

    if (isCustom) {
      if (!customDescription.trim()) return
      onSubmit({
        amount: numericAmount,
        accountId: paymentMethod === 'bank' ? accountId : undefined,
        date: new Date(date).toISOString(),
        description:
          paymentMethod === 'cash'
            ? `Efectivo / Reembolso · ${customDescription.trim()}`
            : `Bizum / Reembolso · ${customDescription.trim()}`,
        note: note.trim() || undefined,
        paymentMethod,
      })
    } else if (selectedItem) {
      onSubmit({
        parentExpenseId: selectedItem.share.expenseTransactionId,
        expenseShareId: selectedItem.share.id,
        amount: numericAmount,
        accountId: paymentMethod === 'bank' ? accountId : undefined,
        date: new Date(date).toISOString(),
        description:
          paymentMethod === 'cash'
            ? `Efectivo ${selectedItem.share.participantName} · ${selectedItem.expense?.description || 'Gasto compartido'}`
            : `Bizum ${selectedItem.share.participantName} · ${selectedItem.expense?.description || 'Gasto compartido'}`,
        note: note.trim() || undefined,
        paymentMethod,
      })
    }

    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal reimbursement-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Registrar Bizum o Reembolso</h3>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar">
            <AppIcon name="x" size={18} />
          </button>
        </div>

        {/* Selector de Método de Cobro: Banco / Bizum vs Efectivo */}
        <div className="form-group">
          <label className="section-label">¿Dónde recibiste el dinero?</label>
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

        {/* Lista de gastos pendientes para selección rápida */}
        {!isCustom && pendingShares.length > 0 && (
          <div className="form-group">
            <label className="section-label">Cobros pendientes conocidos</label>
            <div className="debt-chip-list">
              {pendingShares.map((ps) => {
                const isSelected = selectedShareId === ps.share.id
                return (
                  <button
                    key={ps.share.id}
                    type="button"
                    className={`debt-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleSelectShare(ps.share.id, ps.pendingAmount)}
                  >
                    <div className="debt-chip-top">
                      <strong>{ps.share.participantName}</strong>
                      <span className="debt-chip-amount">falta {money(ps.pendingAmount)}</span>
                    </div>
                    <span className="debt-chip-subtitle">
                      {ps.expense?.description || 'Gasto'} · {shortDate(ps.expense?.date || ps.share.createdAt || '')}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Toggle para reembolso libre si no está en la lista */}
        <div className="reimbursement-toggle-row">
          <button
            type="button"
            className="text-button small"
            onClick={() => {
              setIsCustom(!isCustom)
              if (!isCustom) {
                setSelectedShareId('')
                setAmount('')
              } else if (pendingShares.length > 0) {
                handleSelectShare(pendingShares[0].share.id, pendingShares[0].pendingAmount)
              }
            }}
          >
            {isCustom ? '← Elegir de gastos compartidos' : '+ Registrar otro reembolso / persona'}
          </button>
        </div>

        {isCustom && (
          <div className="form-group">
            <label>
              Concepto / Persona
              <input
                type="text"
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                placeholder="Ej. Manuela cena, devolución taxi..."
                autoFocus
              />
            </label>
          </div>
        )}

        <div className="form-group">
          <label>
            Importe a cobrar (€)
            <input
              inputMode="decimal"
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
            />
          </label>
          {selectedItem && Number(amount.replace(',', '.')) < selectedItem.pendingAmount && (
            <span className="field-hint">
              Pago parcial (quedará pendiente {money(Math.max(0, selectedItem.pendingAmount - Number(amount.replace(',', '.'))))})
            </span>
          )}
        </div>

        {paymentMethod === 'bank' ? (
          <div className="form-group">
            <label>
              Ingresar en cuenta
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
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.25)',
              color: '#16a34a',
              fontSize: '0.88rem',
            }}
          >
            <AppIcon name="banknote" size={20} />
            <div>
              <strong>Aumentará el saldo físico de Efectivo</strong>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {amount && Number(amount.replace(',', '.')) > 0
                  ? `+${money(Number(amount.replace(',', '.')))} en Efectivo · Tu banco no cambiará`
                  : 'Tu saldo bancario no cambiará'}
              </div>
            </div>
          </div>
        )}

        <div className="form-group">
          <label>
            Fecha de recepción
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
              placeholder="Comentarios o referencia..."
            />
          </label>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="primary-button"
            onClick={handleSubmit}
            disabled={!amount || Number(amount.replace(',', '.')) <= 0}
          >
            Registrar cobro (+{amount ? money(Number(amount.replace(',', '.'))) : '0,00 €'})
          </button>
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

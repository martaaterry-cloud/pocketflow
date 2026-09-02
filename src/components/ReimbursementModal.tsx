import { useState, useMemo, useEffect } from 'react'
import type { Account, ExpenseShare, Transaction } from '../models/finance'
import { money, shortDate } from '../utils/money'
import { selectPendingDebtors } from '../utils/sharedExpenseSelectors'
import { AppIcon } from '../ui/icons'

interface ReimbursementModalProps {
  open: boolean
  onClose: () => void
  accounts: Account[]
  transactions: Transaction[]
  expenseShares: ExpenseShare[]
  initialShareId?: string
  initialExpenseId?: string
  onSubmit: (input: {
    parentExpenseId?: string
    expenseShareId?: string
    amount: number
    accountId: string
    date: string
    note?: string
    description?: string
  }) => void
}

export function ReimbursementModal({
  open,
  onClose,
  accounts,
  transactions,
  expenseShares,
  initialShareId,
  initialExpenseId,
  onSubmit,
}: ReimbursementModalProps) {
  const [selectedShareId, setSelectedShareId] = useState<string>(initialShareId || '')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState(() => accounts.find((a) => a.type === 'spending')?.id ?? accounts[0]?.id ?? 'daily')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [customDescription, setCustomDescription] = useState('')

  const pendingDebtors = useMemo(() => {
    return selectPendingDebtors(expenseShares, transactions)
  }, [expenseShares, transactions])

  // Todas las shares externas pendientes
  const pendingShares = useMemo(() => {
    const list: {
      share: ExpenseShare
      pendingAmount: number
      expense?: Transaction
    }[] = []

    expenseShares.filter((s) => !s.isPayerShare).forEach((s) => {
      const parentTx = transactions.find((t) => t.id === s.expenseTransactionId)
      const reimbursements = transactions.filter(
        (t) => t.type === 'income' && t.incomeKind === 'reimbursement' && t.expenseShareId === s.id
      )
      const received = reimbursements.reduce((sum, t) => sum + t.amount, 0)
      const pending = Math.max(0, Math.round((s.expectedAmount - received) * 100) / 100)
      if (pending > 0) {
        list.push({ share: s, pendingAmount: pending, expense: parentTx })
      }
    })

    return list
  }, [expenseShares, transactions])

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
    if (!accountId) return

    if (isCustom) {
      if (!customDescription.trim()) return
      onSubmit({
        amount: numericAmount,
        accountId,
        date: new Date(date).toISOString(),
        description: `Bizum / Reembolso · ${customDescription.trim()}`,
        note: note.trim() || undefined,
      })
    } else if (selectedItem) {
      onSubmit({
        parentExpenseId: selectedItem.share.expenseTransactionId,
        expenseShareId: selectedItem.share.id,
        amount: numericAmount,
        accountId,
        date: new Date(date).toISOString(),
        description: `Bizum ${selectedItem.share.participantName} · ${selectedItem.expense?.description || 'Gasto compartido'}`,
        note: note.trim() || undefined,
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

import { useState, useEffect } from 'react'
import type { Category, CashTransaction, UpdateCashTransactionInput } from '../models/finance'
import { money } from '../utils/money'
import { AppIcon } from '../ui/icons'

interface EditCashTransactionModalProps {
  open: boolean
  onClose: () => void
  transaction: CashTransaction | null
  categories: Category[]
  onUpdate: (id: string, patch: UpdateCashTransactionInput) => void
  onDelete: (id: string) => void
}

export function EditCashTransactionModal({
  open,
  onClose,
  transaction,
  categories,
  onUpdate,
  onDelete,
}: EditCashTransactionModalProps) {
  const [type, setType] = useState<'income' | 'expense' | 'adjustment'>('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (transaction) {
      setType(transaction.type)
      setAmount(String(Math.abs(transaction.amount)))
      setDescription(transaction.description || '')
      setDate(transaction.date ? transaction.date.slice(0, 10) : new Date().toISOString().slice(0, 10))
      setCategoryId(transaction.categoryId || '')
      setNote(transaction.note || '')
      setConfirmDelete(false)
      setError(null)
    }
  }, [transaction, open])

  if (!open || !transaction) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const numAmount = parseFloat(amount.replace(',', '.'))
    if (isNaN(numAmount)) {
      setError('Introduce un importe válido.')
      return
    }

    if (type !== 'adjustment' && numAmount <= 0) {
      setError('El importe debe ser mayor que 0.')
      return
    }

    if (type === 'adjustment' && numAmount === 0) {
      setError('El ajuste no puede ser 0.')
      return
    }

    // Si era adjustment y originalmente era negativo, conservar el signo o permitir ajustarlo
    const finalAmount =
      type === 'adjustment'
        ? transaction.amount < 0 && numAmount > 0
          ? -numAmount
          : numAmount
        : numAmount

    onUpdate(transaction.id, {
      type,
      amount: finalAmount,
      description: description.trim() || transaction.description,
      date: date || transaction.date,
      categoryId: categoryId || undefined,
      note: note.trim() || undefined,
    })

    onClose()
  }

  const handleDelete = () => {
    onDelete(transaction.id)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 440,
          width: '100%',
          padding: '24px 20px',
          boxSizing: 'border-box',
        }}
      >
        <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)' }}>
            Editar movimiento de efectivo
          </h3>
          <button type="button" className="btn-icon-subtle" onClick={onClose} aria-label="Cerrar modal">
            <AppIcon name="x" size={20} />
          </button>
        </div>

        {confirmDelete ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.94rem', lineHeight: 1.5 }}>
              ¿Seguro que quieres eliminar este movimiento de <strong>{transaction.description}</strong> ({money(transaction.amount)})?
            </p>
            <div className="modal-actions horizontal" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, width: '100%' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setConfirmDelete(false)}
                style={{ flex: 1, minHeight: 44, borderRadius: 'var(--radius-md, 12px)', fontWeight: 600 }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={handleDelete}
                style={{ flex: 1.2, minHeight: 44, borderRadius: 'var(--radius-md, 12px)', fontWeight: 600, background: '#dc2626' }}
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form" style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
            {error && (
              <div className="error-banner" style={{ padding: '10px 14px', borderRadius: 10, background: '#fee2e2', color: '#991b1b', fontSize: '0.88rem', width: '100%', boxSizing: 'border-box' }}>
                {error}
              </div>
            )}

            <div className="form-group" style={{ width: '100%', boxSizing: 'border-box' }}>
              <label htmlFor="edit-cash-amount" style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Importe (€) *
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                <input
                  id="edit-cash-amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="input-field"
                  style={{
                    width: '100%',
                    fontSize: '1.4rem',
                    fontWeight: 700,
                    padding: '12px 38px 12px 14px',
                    boxSizing: 'border-box',
                    borderRadius: 'var(--radius-md, 12px)',
                    border: '1px solid var(--border-strong, #d7d8d0)',
                  }}
                />
                <span style={{ position: 'absolute', right: 14, fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-muted)', pointerEvents: 'none' }}>
                  €
                </span>
              </div>
            </div>

            <div className="form-group" style={{ width: '100%', boxSizing: 'border-box' }}>
              <label htmlFor="edit-cash-desc" style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Descripción *
              </label>
              <input
                id="edit-cash-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                className="input-field"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md, 12px)',
                  border: '1px solid var(--border-strong, #d7d8d0)',
                  fontSize: '0.95rem',
                }}
              />
            </div>

            <div className="form-group" style={{ width: '100%', boxSizing: 'border-box' }}>
              <label htmlFor="edit-cash-date" style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Fecha
              </label>
              <input
                id="edit-cash-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input-field"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md, 12px)',
                  border: '1px solid var(--border-strong, #d7d8d0)',
                  fontSize: '0.95rem',
                }}
              />
            </div>

            {type !== 'adjustment' && (
              <div className="form-group" style={{ width: '100%', boxSizing: 'border-box' }}>
                <label htmlFor="edit-cash-cat" style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                  Categoría
                </label>
                <select
                  id="edit-cash-cat"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="input-field"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md, 12px)',
                    border: '1px solid var(--border-strong, #d7d8d0)',
                    fontSize: '0.95rem',
                    background: '#ffffff',
                  }}
                >
                  <option value="">Sin categoría / Ninguna</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group" style={{ width: '100%', boxSizing: 'border-box' }}>
              <label htmlFor="edit-cash-note" style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Nota adicional
              </label>
              <textarea
                id="edit-cash-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="input-field"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md, 12px)',
                  border: '1px solid var(--border-strong, #d7d8d0)',
                  fontSize: '0.92rem',
                  minHeight: 80,
                  resize: 'vertical',
                }}
              />
            </div>

            <div className="modal-actions horizontal" style={{ display: 'flex', gap: 10, marginTop: 8, justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <button
                type="button"
                className="danger-button text-only"
                onClick={() => setConfirmDelete(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626', background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 4px', fontSize: '0.9rem', fontWeight: 600 }}
              >
                <AppIcon name="trash-2" size={16} /> Eliminar
              </button>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={onClose}
                  style={{ minHeight: 44, padding: '10px 18px', borderRadius: 'var(--radius-md, 12px)', fontWeight: 600 }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  style={{ minHeight: 44, padding: '10px 20px', borderRadius: 'var(--radius-md, 12px)', fontWeight: 600 }}
                >
                  Guardar
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

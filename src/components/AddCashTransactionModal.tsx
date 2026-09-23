import { useState, useEffect } from 'react'
import type { Category, CreateCashTransactionInput } from '../models/finance'
import { AppIcon } from '../ui/icons'

interface AddCashTransactionModalProps {
  open: boolean
  onClose: () => void
  type: 'income' | 'expense'
  categories: Category[]
  onSave: (input: CreateCashTransactionInput) => void
}

export function AddCashTransactionModal({
  open,
  onClose,
  type: initialType,
  categories,
  onSave,
}: AddCashTransactionModalProps) {
  const [type, setType] = useState<'income' | 'expense'>(initialType)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [categoryId, setCategoryId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setType(initialType)
      setAmount('')
      setDescription('')
      setDate(new Date().toISOString().slice(0, 10))
      setCategoryId('')
      setNote('')
      setError(null)
    }
  }, [open, initialType])

  if (!open) return null

  const isIncome = type === 'income'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const numAmount = parseFloat(amount.replace(',', '.'))
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Introduce un importe mayor que 0.')
      return
    }

    const trimmedDesc = description.trim()
    if (!trimmedDesc) {
      setError('Introduce una descripción.')
      return
    }

    onSave({
      type,
      amount: numAmount,
      description: trimmedDesc,
      date: date || new Date().toISOString().slice(0, 10),
      categoryId: categoryId || undefined,
      note: note.trim() || undefined,
    })

    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
            {isIncome ? 'Nueva entrada de efectivo' : 'Nueva salida de efectivo'}
          </h3>
          <button type="button" className="btn-icon-subtle" onClick={onClose} aria-label="Cerrar modal">
            <AppIcon name="x" size={20} />
          </button>
        </div>

        {/* Selector de Tipo Entrada / Salida */}
        <div className="segmented-tabs" style={{ marginBottom: 20 }}>
          <button
            type="button"
            className={`tab-btn ${type === 'income' ? 'active' : ''}`}
            onClick={() => {
              setType('income')
              setError(null)
            }}
          >
            <AppIcon name="plus" size={15} /> Entrada (+€)
          </button>
          <button
            type="button"
            className={`tab-btn ${type === 'expense' ? 'active' : ''}`}
            onClick={() => {
              setType('expense')
              setError(null)
            }}
          >
            <AppIcon name="minus" size={15} /> Salida (-€)
          </button>
        </div>

        {error && (
          <div className="error-banner" style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: '#fee2e2', color: '#991b1b', fontSize: '0.88rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="modal-form" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label htmlFor="cash-amount" style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Importe (€) *
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                id="cash-amount"
                type="text"
                inputMode="decimal"
                autoFocus
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="input-field"
                style={{ fontSize: '1.4rem', fontWeight: 700, paddingLeft: 14 }}
              />
              <span style={{ position: 'absolute', right: 16, fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                €
              </span>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="cash-desc" style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Descripción *
            </label>
            <input
              id="cash-desc"
              type="text"
              placeholder={isIncome ? 'Ej. Reembolso cena, dinero guardado...' : 'Ej. Panadería, propina, quiosco...'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              className="input-field"
            />
          </div>

          <div className="form-group">
            <label htmlFor="cash-date" style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Fecha
            </label>
            <input
              id="cash-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input-field"
            />
          </div>

          <div className="form-group">
            <label htmlFor="cash-cat" style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Categoría (opcional)
            </label>
            <select
              id="cash-cat"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="input-field"
            >
              <option value="">Sin categoría / Ninguna</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="cash-note" style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              Nota adicional (opcional)
            </label>
            <textarea
              id="cash-note"
              placeholder="Detalles sobre este movimiento físico..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="input-field"
              style={{ resize: 'none' }}
            />
          </div>

          <div className="modal-actions horizontal" style={{ display: 'flex', gap: 10, marginTop: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className={isIncome ? 'primary-button' : 'danger-button'}
              style={{ minWidth: 140 }}
            >
              {isIncome ? 'Guardar entrada' : 'Guardar salida'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

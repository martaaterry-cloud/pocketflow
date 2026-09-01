import { useEffect, useState } from 'react'
import type {
  Account,
  Category,
  CreateRecurringPaymentInput,
  RecurringFrequency,
  RecurringPayment,
  UpdateRecurringPaymentInput,
} from '../models/finance'
import { AppIcon } from '../ui/icons'

interface RecurringPaymentModalProps {
  open: boolean
  onClose: () => void
  accounts: Account[]
  categories: Category[]
  payment?: RecurringPayment | null
  onSave: (data: CreateRecurringPaymentInput | UpdateRecurringPaymentInput, id?: string) => void
  onDelete?: (id: string) => void
}

export function RecurringPaymentModal({
  open,
  onClose,
  accounts,
  categories,
  payment,
  onSave,
  onDelete,
}: RecurringPaymentModalProps) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [nextDate, setNextDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [active, setActive] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isEditing = Boolean(payment)

  useEffect(() => {
    if (payment) {
      setName(payment.name)
      setAmount(String(payment.amount).replace('.', ','))
      setCategoryId(payment.categoryId)
      setAccountId(payment.accountId)
      setFrequency(payment.frequency)
      setNextDate(payment.nextDate)
      setActive(payment.active)
      setConfirmDelete(false)
    } else {
      setName('')
      setAmount('')
      setCategoryId(categories[0]?.id ?? '')
      setAccountId(accounts.find((a) => a.type === 'spending')?.id ?? accounts[0]?.id ?? '')
      setFrequency('monthly')
      setNextDate(new Date().toISOString().slice(0, 10))
      setActive(true)
      setConfirmDelete(false)
    }
  }, [payment, open, accounts, categories])

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const numericAmount = Number(amount.replace(',', '.'))
    if (!name.trim() || isNaN(numericAmount) || numericAmount <= 0) return

    const data: CreateRecurringPaymentInput = {
      name: name.trim(),
      amount: numericAmount,
      categoryId,
      accountId,
      frequency,
      nextDate,
      active,
    }

    if (isEditing && payment) {
      onSave(data, payment.id)
    } else {
      onSave(data)
    }
    onClose()
  }

  const handleDelete = () => {
    if (payment && onDelete) {
      onDelete(payment.id)
      onClose()
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEditing ? 'Editar pago recurrente' : 'Nuevo pago recurrente'}</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Cerrar">
            <AppIcon name="x" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>
              Concepto
              <input
                type="text"
                placeholder="Spotify, Gimnasio, Alquiler..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              Importe (€)
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              Frecuencia
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
              >
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
                <option value="yearly">Anual</option>
              </select>
            </label>
          </div>

          <div className="form-group">
            <label>
              Próxima fecha de cobro
              <input
                type="date"
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)}
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              Categoría
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-group">
            <label>
              Cuenta donde se cobra
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type === 'spending' ? 'Diaria' : 'Ahorro'})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="toggle-row">
            <span>Estado activo</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              <span className="slider round"></span>
            </label>
          </div>

          <div className="modal-actions" style={{ marginTop: 20 }}>
            <button type="submit" className="primary-button">
              {isEditing ? 'Guardar cambios' : 'Crear pago recurrente'}
            </button>

            {isEditing && onDelete && (
              <>
                {!confirmDelete ? (
                  <button
                    type="button"
                    className="danger-outline-button"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Eliminar pago recurrente
                  </button>
                ) : (
                  <div className="confirm-delete-box">
                    <p>¿Seguro que deseas eliminar este gasto recurrente?</p>
                    <div className="confirm-delete-actions">
                      <button
                        type="button"
                        className="danger-button"
                        onClick={handleDelete}
                      >
                        Sí, eliminar
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setConfirmDelete(false)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

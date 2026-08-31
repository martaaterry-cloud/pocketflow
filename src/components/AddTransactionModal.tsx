import { useEffect, useState } from 'react'
import type { Account, Category, CreateTransactionInput, Transaction, TransactionType } from '../models/finance'

interface AddTransactionModalProps {
  open: boolean
  onClose: () => void
  accounts: Account[]
  categories: Category[]
  initialTransaction?: Transaction | null
  onAdd?: (value: CreateTransactionInput) => void
  onUpdate?: (id: string, value: Partial<CreateTransactionInput>) => void
  onDelete?: (id: string) => void
}

export function AddTransactionModal({
  open,
  onClose,
  accounts,
  categories,
  initialTransaction,
  onAdd,
  onUpdate,
  onDelete,
}: AddTransactionModalProps) {
  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? 'food')
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? 'daily')
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? 'savings')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isEditing = Boolean(initialTransaction)

  useEffect(() => {
    if (initialTransaction) {
      setType(initialTransaction.type)
      setAmount(String(initialTransaction.amount).replace('.', ','))
      setDescription(initialTransaction.description)
      setCategoryId(initialTransaction.categoryId ?? categories[0]?.id ?? 'food')
      setAccountId(initialTransaction.accountId)
      setToAccountId(initialTransaction.toAccountId ?? accounts.find((a) => a.id !== initialTransaction.accountId)?.id ?? accounts[1]?.id ?? 'savings')
      setDate(initialTransaction.date.slice(0, 10))
      setConfirmDelete(false)
    } else {
      setType('expense')
      setAmount('')
      setDescription('')
      setCategoryId(categories[0]?.id ?? 'food')
      setAccountId(accounts[0]?.id ?? 'daily')
      setToAccountId(accounts.find((a) => a.id !== accounts[0]?.id)?.id ?? 'savings')
      setDate(new Date().toISOString().slice(0, 10))
      setConfirmDelete(false)
    }
  }, [initialTransaction, accounts, categories, open])

  if (!open) return null

  const submit = () => {
    const numeric = Number(amount.replace(',', '.'))
    if (!numeric || numeric <= 0 || !description.trim()) return

    const transactionData: CreateTransactionInput = {
      type,
      amount: numeric,
      description: description.trim(),
      categoryId: type === 'expense' ? categoryId : undefined,
      accountId,
      toAccountId: type === 'transfer' ? toAccountId : undefined,
      date: new Date(date).toISOString(),
    }

    if (isEditing && initialTransaction && onUpdate) {
      onUpdate(initialTransaction.id, transactionData)
    } else if (onAdd) {
      onAdd(transactionData)
    }

    onClose()
  }

  const handleDelete = () => {
    if (!initialTransaction || !onDelete) return
    onDelete(initialTransaction.id)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEditing ? 'Editar movimiento' : 'Añadir movimiento'}</h3>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        <div className="segmented">
          <button
            type="button"
            className={type === 'expense' ? 'active' : ''}
            onClick={() => setType('expense')}
          >
            Gasto
          </button>
          <button
            type="button"
            className={type === 'income' ? 'active' : ''}
            onClick={() => setType('income')}
          >
            Ingreso
          </button>
          <button
            type="button"
            className={type === 'transfer' ? 'active' : ''}
            onClick={() => setType('transfer')}
          >
            Transferencia
          </button>
        </div>

        <div className="form-group">
          <label>
            Importe (€)
            <input
              inputMode="decimal"
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              autoFocus={!isEditing}
            />
          </label>
        </div>

        <div className="form-group">
          <label>
            Concepto
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={type === 'expense' ? 'Mercadona, cena...' : type === 'income' ? 'Nómina, bizum...' : 'A ahorro...'}
            />
          </label>
        </div>

        <div className="form-group">
          <label>
            Fecha
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>

        {type === 'expense' && (
          <div className="form-group">
            <label>
              Categoría
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="form-group">
          <label>
            {type === 'transfer' ? 'Cuenta origen' : 'Cuenta'}
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.type === 'spending' ? 'Diaria' : 'Ahorro'})
                </option>
              ))}
            </select>
          </label>
        </div>

        {type === 'transfer' && (
          <div className="form-group">
            <label>
              Cuenta destino
              <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                {accounts
                  .filter((a) => a.id !== accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.type === 'spending' ? 'Diaria' : 'Ahorro'})
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="primary-button" onClick={submit}>
            {isEditing ? 'Guardar cambios' : 'Añadir movimiento'}
          </button>

          {isEditing && onDelete && (
            <>
              {!confirmDelete ? (
                <button
                  type="button"
                  className="danger-outline-button"
                  onClick={() => setConfirmDelete(true)}
                >
                  Eliminar movimiento
                </button>
              ) : (
                <div className="confirm-delete-box">
                  <p>¿Seguro que quieres eliminar este movimiento? El saldo se revertirá automáticamente.</p>
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
      </div>
    </div>
  )
}

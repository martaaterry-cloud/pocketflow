import { useEffect, useState, useMemo } from 'react'
import type {
  Account,
  Category,
  CreateTransactionInput,
  IncomeKind,
  SharedContact,
  Transaction,
} from '../models/finance'
import { money } from '../utils/money'
import { splitExpenseEqually } from '../utils/sharedExpenseSelectors'
import { AppIcon } from '../ui/icons'

interface AddTransactionModalProps {
  open: boolean
  onClose: () => void
  accounts: Account[]
  categories: Category[]
  sharedContacts?: SharedContact[]
  defaultType?: 'expense' | 'income' | 'transfer'
  initialTransaction?: Transaction | null
  onAdd?: (value: CreateTransactionInput) => void
  onAddShared?: (
    value: CreateTransactionInput,
    shares: { participantName: string; contactId?: string; isPayerShare: boolean; expectedAmount: number }[]
  ) => void
  onUpdate?: (id: string, value: Partial<CreateTransactionInput>) => void
  onDelete?: (id: string) => void
}

interface ParticipantEntry {
  id?: string
  name: string
  contactId?: string
  customAmount?: number
}

export function AddTransactionModal({
  open,
  onClose,
  accounts,
  categories,
  sharedContacts = [],
  defaultType = 'expense',
  initialTransaction,
  onAdd,
  onAddShared,
  onUpdate,
  onDelete,
}: AddTransactionModalProps) {
  const isEditing = Boolean(initialTransaction)

  const [type, setType] = useState<CreateTransactionInput['type']>(defaultType)
  const [incomeKind, setIncomeKind] = useState<IncomeKind>('income')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Estados para Gasto Compartido
  const [isShared, setIsShared] = useState(false)
  const [selfParticipates, setSelfParticipates] = useState(true)
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal')
  const [participants, setParticipants] = useState<ParticipantEntry[]>([])
  const [newParticipantInput, setNewParticipantInput] = useState('')

  useEffect(() => {
    if (initialTransaction) {
      setType(initialTransaction.type)
      setIncomeKind(initialTransaction.incomeKind || 'income')
      setAmount(String(initialTransaction.amount).replace('.', ','))
      setDescription(initialTransaction.description)
      setCategoryId(initialTransaction.categoryId ?? categories[0]?.id ?? '')
      setAccountId(initialTransaction.accountId)
      setToAccountId(initialTransaction.toAccountId ?? accounts.find((a) => a.id !== initialTransaction.accountId)?.id ?? '')
      setDate(initialTransaction.date.slice(0, 10))
      setNote(initialTransaction.note ?? '')
      setIsShared(Boolean(initialTransaction.isShared))
      setConfirmDelete(false)
    } else {
      setType(defaultType)
      setIncomeKind('income')
      setAmount('')
      setDescription('')
      setCategoryId(categories[0]?.id ?? '')
      setAccountId(accounts.find((a) => a.type === 'spending')?.id ?? accounts[0]?.id ?? '')
      setToAccountId(accounts.find((a) => a.type === 'savings')?.id ?? accounts[1]?.id ?? '')
      setDate(new Date().toISOString().slice(0, 10))
      setNote('')
      setIsShared(false)
      setSelfParticipates(true)
      setSplitType('equal')
      setParticipants([])
      setNewParticipantInput('')
      setConfirmDelete(false)
    }
  }, [initialTransaction, accounts, categories, open, defaultType])

  const numericAmount = Number(amount.replace(',', '.')) || 0

  // Cálculo de reparto en tiempo real con exactitud de céntimos
  const computedShares = useMemo(() => {
    if (!isShared || numericAmount <= 0) return []

    if (splitType === 'equal') {
      const externalList = participants.map((p) => ({
        name: p.name,
        contactId: p.contactId,
      }))
      return splitExpenseEqually(numericAmount, externalList, selfParticipates, 'Tú')
    } else {
      // Reparto personalizado
      const results = []
      if (selfParticipates) {
        const externalTotal = participants.reduce((s, p) => s + (p.customAmount || 0), 0)
        const payerAmount = Math.max(0, Math.round((numericAmount - externalTotal) * 100) / 100)
        results.push({
          participantName: 'Tú',
          isPayerShare: true,
          amount: payerAmount,
        })
      }
      participants.forEach((p) => {
        results.push({
          participantName: p.name,
          contactId: p.contactId,
          isPayerShare: false,
          amount: p.customAmount || 0,
        })
      })
      return results
    }
  }, [isShared, numericAmount, splitType, participants, selfParticipates])

  if (!open) return null

  const handleAddParticipant = (nameToAdd?: string) => {
    const rawName = (nameToAdd || newParticipantInput).trim()
    if (!rawName) return

    // Comprobar si ya está en la lista
    if (participants.some((p) => p.name.toLowerCase() === rawName.toLowerCase())) {
      setNewParticipantInput('')
      return
    }

    // Buscar si existe en contactos compartidos
    const matchedContact = sharedContacts.find(
      (c) => c.displayName.toLowerCase() === rawName.toLowerCase()
    )

    setParticipants([
      ...participants,
      {
        name: matchedContact ? matchedContact.displayName : rawName,
        contactId: matchedContact?.id,
        customAmount: 0,
      },
    ])
    setNewParticipantInput('')
  }

  const handleRemoveParticipant = (index: number) => {
    setParticipants(participants.filter((_, i) => i !== index))
  }

  const submit = () => {
    if (!numericAmount || numericAmount <= 0) return
    if (!description.trim()) return
    if (!accountId) return
    if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) return

    const payload: CreateTransactionInput = {
      type,
      amount: numericAmount,
      description: description.trim(),
      accountId,
      date: new Date(date).toISOString(),
      note: note.trim() || undefined,
      categoryId: type === 'expense' ? categoryId : undefined,
      toAccountId: type === 'transfer' ? toAccountId : undefined,
      incomeKind: type === 'income' ? incomeKind : undefined,
      isShared: type === 'expense' && isShared,
    }

    if (isEditing && initialTransaction && onUpdate) {
      onUpdate(initialTransaction.id, payload)
    } else if (type === 'expense' && isShared && onAddShared && computedShares.length > 0) {
      const sharesInput = computedShares.map((s) => ({
        participantName: s.participantName,
        contactId: s.contactId,
        isPayerShare: s.isPayerShare,
        expectedAmount: s.amount,
      }))
      onAddShared(payload, sharesInput)
    } else if (onAdd) {
      onAdd(payload)
    }
    onClose()
  }

  const handleDelete = () => {
    if (initialTransaction && onDelete) {
      onDelete(initialTransaction.id)
      onClose()
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEditing ? 'Editar movimiento' : 'Añadir movimiento'}</h3>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar">
            <AppIcon name="x" size={18} />
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

        {/* Sub-selector para Ingreso: Real vs Reembolso */}
        {type === 'income' && (
          <div className="income-kind-selector">
            <label className={`income-kind-pill ${incomeKind === 'income' ? 'active' : ''}`}>
              <input
                type="radio"
                name="incomeKind"
                value="income"
                checked={incomeKind === 'income'}
                onChange={() => setIncomeKind('income')}
              />
              <span>Ingreso real (nómina, regalo)</span>
            </label>
            <label className={`income-kind-pill ${incomeKind === 'reimbursement' ? 'active' : ''}`}>
              <input
                type="radio"
                name="incomeKind"
                value="reimbursement"
                checked={incomeKind === 'reimbursement'}
                onChange={() => setIncomeKind('reimbursement')}
              />
              <span>Reembolso / Bizum recibido</span>
            </label>
          </div>
        )}

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
              placeholder={
                type === 'expense'
                  ? 'Mercadona, cena...'
                  : type === 'income'
                  ? incomeKind === 'reimbursement'
                    ? 'Bizum Manuela cena...'
                    : 'Nómina, ingreso...'
                  : 'A ahorro...'
              }
            />
          </label>
        </div>

        <div className="form-group">
          <label>
            Fecha
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>

        {type === 'expense' && (
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
        )}

        {/* Sección Gasto Compartido (discreta, OFF por defecto) */}
        {type === 'expense' && !isEditing && (
          <div className="shared-expense-section">
            <div className="shared-toggle-row">
              <div className="shared-toggle-text">
                <strong>Gasto compartido</strong>
                <span>Repartir con amigos y registrar quién te debe</span>
              </div>
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={isShared}
                  onChange={(e) => setIsShared(e.target.checked)}
                />
                <span className="switch-slider" />
              </label>
            </div>

            {isShared && (
              <div className="shared-config-box">
                {/* Checkbox Yo participo */}
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={selfParticipates}
                    onChange={(e) => setSelfParticipates(e.target.checked)}
                  />
                  <span>Yo también participo en este gasto</span>
                </label>

                {/* Añadir personas */}
                <div className="participant-input-row">
                  <input
                    type="text"
                    placeholder="Escribe nombre (ej. Manuela)..."
                    value={newParticipantInput}
                    onChange={(e) => setNewParticipantInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddParticipant()
                      }
                    }}
                    list="shared-contacts-list"
                  />
                  <datalist id="shared-contacts-list">
                    {sharedContacts.map((c) => (
                      <option key={c.id} value={c.displayName} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    className="secondary-button add-participant-btn"
                    onClick={() => handleAddParticipant()}
                  >
                    + Añadir
                  </button>
                </div>

                {/* Chips de participantes añadidos */}
                {participants.length > 0 && (
                  <div className="participant-chips">
                    {participants.map((p, idx) => (
                      <span className="participant-chip" key={idx}>
                        {p.name}
                        <button
                          type="button"
                          onClick={() => handleRemoveParticipant(idx)}
                          aria-label={`Quitar ${p.name}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Previsualización del reparto con céntimos exactos */}
                {computedShares.length > 0 && (
                  <div className="split-preview">
                    <span className="split-preview-title">Reparto exacto de céntimos:</span>
                    <div className="split-preview-list">
                      {computedShares.map((s, idx) => (
                        <div className="split-preview-item" key={idx}>
                          <span>{s.participantName}</span>
                          <strong>{money(s.amount)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
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

        <div className="form-group">
          <label>
            Nota opcional
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Detalles adicionales..."
            />
          </label>
        </div>

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
                    <button type="button" className="danger-button" onClick={handleDelete}>
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

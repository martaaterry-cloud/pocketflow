import { useEffect, useState, useMemo } from 'react'
import type {
  Account,
  Category,
  CreateRecurringPaymentInput,
  RecurringFrequency,
  RecurringPayment,
  SharedContact,
  UpdateRecurringPaymentInput,
} from '../models/finance'
import { money } from '../utils/money'
import { splitExpenseEqually } from '../utils/sharedExpenseSelectors'
import { AppIcon } from '../ui/icons'

interface RecurringPaymentModalProps {
  open: boolean
  onClose: () => void
  accounts: Account[]
  categories: Category[]
  sharedContacts?: SharedContact[]
  payment?: RecurringPayment | null
  onSave: (data: CreateRecurringPaymentInput | UpdateRecurringPaymentInput, id?: string) => void
  onDelete?: (id: string) => void
}

interface ParticipantEntry {
  name: string
  contactId?: string
  customAmount?: number
}

export function RecurringPaymentModal({
  open,
  onClose,
  accounts,
  categories,
  sharedContacts = [],
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

  // Estados para Gasto Compartido
  const [isShared, setIsShared] = useState(false)
  const [selfParticipates, setSelfParticipates] = useState(true)
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal')
  const [participants, setParticipants] = useState<ParticipantEntry[]>([])
  const [newParticipantInput, setNewParticipantInput] = useState('')

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
      setIsShared(Boolean(payment.isShared))
      setSelfParticipates(payment.sharingTemplate?.includePayer ?? true)
      setSplitType(payment.sharingTemplate?.splitType ?? 'equal')
      setParticipants(
        payment.sharingTemplate?.participants.map((p) => ({
          name: p.name,
          contactId: p.contactId,
          customAmount: p.amount,
        })) ?? []
      )
      setNewParticipantInput('')
      setConfirmDelete(false)
    } else {
      setName('')
      setAmount('')
      setCategoryId(categories[0]?.id ?? '')
      setAccountId(accounts.find((a) => a.type === 'spending')?.id ?? accounts[0]?.id ?? '')
      setFrequency('monthly')
      setNextDate(new Date().toISOString().slice(0, 10))
      setActive(true)
      setIsShared(false)
      setSelfParticipates(true)
      setSplitType('equal')
      setParticipants([])
      setNewParticipantInput('')
      setConfirmDelete(false)
    }
  }, [payment, open, accounts, categories])

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

    // Evitar duplicados por nombre
    if (participants.some((p) => p.name.toLowerCase() === rawName.toLowerCase())) {
      setNewParticipantInput('')
      return
    }

    // Buscar si existe en contactos compartidos existentes
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

  const handleCustomAmountChange = (index: number, val: string) => {
    const num = Number(val.replace(',', '.')) || 0
    setParticipants(
      participants.map((p, i) => (i === index ? { ...p, customAmount: num } : p))
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || isNaN(numericAmount) || numericAmount <= 0) return

    // Si es compartido pero no hay participantes, desactivar o conservar
    const hasExternal = participants.length > 0
    const finalIsShared = isShared && hasExternal

    const data: CreateRecurringPaymentInput = {
      name: name.trim(),
      amount: numericAmount,
      categoryId,
      accountId,
      frequency,
      nextDate,
      active,
      isShared: finalIsShared,
      sharingTemplate: finalIsShared
        ? {
            includePayer: selfParticipates,
            splitType,
            participants: computedShares
              .filter((s) => !s.isPayerShare)
              .map((s) => ({
                contactId: s.contactId,
                name: s.participantName,
                amount: s.amount,
              })),
          }
        : undefined,
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
                placeholder="Spotify, Gimnasio, Crunchyroll..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              Importe total (€)
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

          {/* Sección Gasto Compartido (discreto, OFF por defecto) */}
          <div className="shared-expense-section" style={{ marginTop: 14 }}>
            <div className="shared-toggle-row">
              <div className="shared-toggle-text">
                <strong>Gasto compartido</strong>
                <span>Plantilla de reparto automático al confirmar cada ciclo</span>
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

                {/* Tipo de reparto */}
                <div className="split-type-selector" style={{ margin: '8px 0' }}>
                  <label className={`split-pill ${splitType === 'equal' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="splitType"
                      checked={splitType === 'equal'}
                      onChange={() => setSplitType('equal')}
                    />
                    <span>A partes iguales</span>
                  </label>
                  <label className={`split-pill ${splitType === 'custom' ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="splitType"
                      checked={splitType === 'custom'}
                      onChange={() => setSplitType('custom')}
                    />
                    <span>Personalizado</span>
                  </label>
                </div>

                {/* Añadir personas */}
                <div className="participant-input-row">
                  <input
                    type="text"
                    placeholder="Escribe nombre (ej. Manuela, Pepa)..."
                    value={newParticipantInput}
                    onChange={(e) => setNewParticipantInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddParticipant()
                      }
                    }}
                    list="shared-recurring-contacts-list"
                  />
                  <datalist id="shared-recurring-contacts-list">
                    {sharedContacts.map((c) => (
                      <option key={c.id} value={c.displayName} />
                    ))}
                  </datalist>
                  <button
                    type="button"
                    className="secondary-button add-participant-btn"
                    onClick={() => handleAddParticipant()}
                  >
                    + Añadir persona
                  </button>
                </div>

                {/* Chips / Lista de participantes */}
                {participants.length > 0 && (
                  <div className="participant-chips">
                    {participants.map((p, idx) => (
                      <div className="participant-chip-detailed" key={idx}>
                        <span className="participant-name">{p.name}</span>
                        {splitType === 'custom' && (
                          <input
                            type="text"
                            inputMode="decimal"
                            className="participant-custom-input"
                            value={String(p.customAmount ?? 0).replace('.', ',')}
                            onChange={(e) => handleCustomAmountChange(idx, e.target.value)}
                            placeholder="0,00"
                          />
                        )}
                        <button
                          type="button"
                          className="chip-remove-btn"
                          onClick={() => handleRemoveParticipant(idx)}
                          aria-label={`Quitar ${p.name}`}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Previsualización del reparto con céntimos exactos */}
                {computedShares.length > 0 && (
                  <div className="split-preview">
                    <span className="split-preview-title">Reparto plantilla exacto:</span>
                    <div className="split-preview-list">
                      {computedShares.map((s, idx) => (
                        <div className="split-preview-item" key={idx}>
                          <span>{s.participantName}</span>
                          <strong>{money(s.amount)}</strong>
                        </div>
                      ))}
                    </div>
                    <small className="muted-text" style={{ marginTop: 6, display: 'block', fontSize: 11 }}>
                      Nota: Esta plantilla no crea deudas ahora. Las cuotas se generarán en "Por cobrar" cada vez que pulses "Confirmar cobro".
                    </small>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="toggle-row" style={{ marginTop: 16 }}>
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

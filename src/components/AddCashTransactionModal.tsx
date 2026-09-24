import { useState, useEffect, useMemo } from 'react'
import type { Category, CreateCashTransactionInput, SharedContact } from '../models/finance'
import { money } from '../utils/money'
import { splitExpenseEqually } from '../utils/sharedExpenseSelectors'
import { AppIcon } from '../ui/icons'
import { SharedExpenseSection } from './SharedExpenseSection'

interface AddCashTransactionModalProps {
  open: boolean
  onClose: () => void
  type: 'income' | 'expense'
  categories: Category[]
  sharedContacts?: SharedContact[]
  onSave: (
    input: CreateCashTransactionInput,
    shares?: { participantName: string; contactId?: string; isPayerShare: boolean; expectedAmount: number }[]
  ) => void
}

interface ParticipantEntry {
  name: string
  contactId?: string
  customAmount?: number
}

export function AddCashTransactionModal({
  open,
  onClose,
  type: initialType,
  categories,
  sharedContacts = [],
  onSave,
}: AddCashTransactionModalProps) {
  const [type, setType] = useState<'income' | 'expense'>(initialType)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [categoryId, setCategoryId] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Estados para Gasto Compartido en Efectivo
  const [isShared, setIsShared] = useState(false)
  const [selfParticipates, setSelfParticipates] = useState(true)
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal')
  const [participants, setParticipants] = useState<ParticipantEntry[]>([])
  const [newParticipantInput, setNewParticipantInput] = useState('')

  useEffect(() => {
    if (open) {
      setType(initialType)
      setAmount('')
      setDescription('')
      setDate(new Date().toISOString().slice(0, 10))
      setCategoryId('')
      setNote('')
      setError(null)
      setIsShared(false)
      setSelfParticipates(true)
      setSplitType('equal')
      setParticipants([])
      setNewParticipantInput('')
    }
  }, [open, initialType])

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

  const isIncome = type === 'income'

  const handleAddParticipant = (nameToAdd?: string) => {
    const rawName = (nameToAdd || newParticipantInput).trim()
    if (!rawName) return

    if (participants.some((p) => p.name.toLowerCase() === rawName.toLowerCase())) {
      setNewParticipantInput('')
      return
    }

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

    if (type === 'expense' && isShared) {
      if (participants.length === 0) {
        setError('Añade al menos una persona para compartir el gasto.')
        return
      }

      const sharesInput = computedShares.map((s) => ({
        participantName: s.participantName,
        contactId: s.contactId,
        isPayerShare: s.isPayerShare,
        expectedAmount: s.amount,
      }))

      onSave(
        {
          type,
          amount: numAmount,
          description: trimmedDesc,
          date: date || new Date().toISOString().slice(0, 10),
          categoryId: categoryId || undefined,
          note: note.trim() || undefined,
          isShared: true,
        },
        sharesInput
      )
    } else {
      onSave({
        type,
        amount: numAmount,
        description: trimmedDesc,
        date: date || new Date().toISOString().slice(0, 10),
        categoryId: categoryId || undefined,
        note: note.trim() || undefined,
        isShared: false,
      })
    }

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
            {isIncome ? 'Nueva entrada de efectivo' : 'Nueva salida de efectivo'}
          </h3>
          <button type="button" className="btn-icon-subtle" onClick={onClose} aria-label="Cerrar modal">
            <AppIcon name="x" size={20} />
          </button>
        </div>

        {/* Selector de Tipo Entrada / Salida (Segmented Control) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            background: 'var(--bg-app, #ecece7)',
            borderRadius: 12,
            padding: 4,
            marginBottom: 18,
            gap: 4,
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setType('income')
              setError(null)
            }}
            style={{
              border: 'none',
              padding: '10px 12px',
              borderRadius: 9,
              fontSize: '0.92rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.15s ease',
              background: type === 'income' ? '#ffffff' : 'transparent',
              color: type === 'income' ? '#16a34a' : 'var(--text-muted)',
              boxShadow: type === 'income' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <AppIcon name="plus" size={16} /> Entrada
          </button>
          <button
            type="button"
            onClick={() => {
              setType('expense')
              setError(null)
            }}
            style={{
              border: 'none',
              padding: '10px 12px',
              borderRadius: 9,
              fontSize: '0.92rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.15s ease',
              background: type === 'expense' ? '#ffffff' : 'transparent',
              color: type === 'expense' ? '#dc2626' : 'var(--text-muted)',
              boxShadow: type === 'expense' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            <AppIcon name="minus" size={16} /> Salida
          </button>
        </div>

        {error && (
          <div className="error-banner" style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: '#fee2e2', color: '#991b1b', fontSize: '0.88rem', width: '100%', boxSizing: 'border-box' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="modal-form" style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
          <div className="form-group" style={{ width: '100%', boxSizing: 'border-box' }}>
            <label htmlFor="cash-amount" style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Importe (€) *
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
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
            <label htmlFor="cash-desc" style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
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
            <label htmlFor="cash-date" style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Fecha
            </label>
            <input
              id="cash-date"
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

          <div className="form-group" style={{ width: '100%', boxSizing: 'border-box' }}>
            <label htmlFor="cash-cat" style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Categoría (opcional)
            </label>
            <select
              id="cash-cat"
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

          {type === 'expense' && (
            <SharedExpenseSection
              isShared={isShared}
              onToggleShared={setIsShared}
              selfParticipates={selfParticipates}
              onToggleSelfParticipates={setSelfParticipates}
              newParticipantInput={newParticipantInput}
              onNewParticipantInputChange={setNewParticipantInput}
              onAddParticipant={handleAddParticipant}
              participants={participants}
              onRemoveParticipant={handleRemoveParticipant}
              sharedContacts={sharedContacts}
              computedShares={computedShares}
              datalistId="cash-shared-contacts-list"
              placeholder="Escribe nombre (ej. Sergi)..."
            />
          )}

          <div className="form-group" style={{ width: '100%', boxSizing: 'border-box' }}>
            <label htmlFor="cash-note" style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              Nota adicional (opcional)
            </label>
            <textarea
              id="cash-note"
              placeholder="Detalles sobre este movimiento físico..."
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

          <div className="modal-actions horizontal" style={{ display: 'flex', gap: 12, marginTop: 8, justifyContent: 'flex-end', width: '100%' }}>
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 'var(--radius-md, 12px)',
                fontWeight: 600,
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={isIncome ? 'primary-button' : 'danger-button'}
              style={{
                flex: 1.3,
                minHeight: 44,
                borderRadius: 'var(--radius-md, 12px)',
                fontWeight: 600,
                background: isIncome ? '#16a34a' : '#dc2626',
              }}
            >
              {isIncome ? 'Guardar entrada' : 'Guardar salida'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

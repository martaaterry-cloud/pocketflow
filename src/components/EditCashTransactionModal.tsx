import { useState, useEffect, useMemo } from 'react'
import type { Category, CashTransaction, UpdateCashTransactionInput, ExpenseShare, SharedContact } from '../models/finance'
import { money } from '../utils/money'
import { splitExpenseEqually } from '../utils/sharedExpenseSelectors'
import { AppIcon } from '../ui/icons'

interface EditCashTransactionModalProps {
  open: boolean
  onClose: () => void
  transaction: CashTransaction | null
  categories: Category[]
  expenseShares?: ExpenseShare[]
  sharedContacts?: SharedContact[]
  onUpdate: (
    id: string,
    patch: UpdateCashTransactionInput,
    shares?: { participantName: string; contactId?: string; isPayerShare: boolean; expectedAmount: number }[]
  ) => void
  onDelete: (id: string) => void
}

interface ParticipantEntry {
  id?: string
  name: string
  contactId?: string
  customAmount?: number
}

export function EditCashTransactionModal({
  open,
  onClose,
  transaction,
  categories,
  expenseShares = [],
  sharedContacts = [],
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

  // Estados para Gasto Compartido en Efectivo
  const [isShared, setIsShared] = useState(false)
  const [selfParticipates, setSelfParticipates] = useState(true)
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal')
  const [participants, setParticipants] = useState<ParticipantEntry[]>([])
  const [newParticipantInput, setNewParticipantInput] = useState('')
  const [confirmUnshare, setConfirmUnshare] = useState(false)

  useEffect(() => {
    if (transaction && open) {
      setType(transaction.type)
      setAmount(String(Math.abs(transaction.amount)))
      setDescription(transaction.description || '')
      setDate(transaction.date ? transaction.date.slice(0, 10) : new Date().toISOString().slice(0, 10))
      setCategoryId(transaction.categoryId || '')
      setNote(transaction.note || '')
      setConfirmDelete(false)
      setConfirmUnshare(false)
      setError(null)
      setNewParticipantInput('')

      const existingShares = expenseShares.filter((s) => s.expenseTransactionId === transaction.id)
      if (existingShares.length > 0) {
        setIsShared(true)
        const payer = existingShares.find((s) => s.isPayerShare)
        setSelfParticipates(Boolean(payer))
        const ext = existingShares
          .filter((s) => !s.isPayerShare)
          .map((s) => ({
            id: s.id,
            name: s.participantName,
            contactId: s.contactId,
            customAmount: s.expectedAmount,
          }))
        setParticipants(ext)
      } else {
        setIsShared(Boolean(transaction.isShared))
        setSelfParticipates(true)
        setParticipants([])
      }
    }
  }, [transaction, expenseShares, open])

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

  if (!open || !transaction) return null

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

  const handleToggleShared = (checked: boolean) => {
    const existingShares = expenseShares.filter((s) => s.expenseTransactionId === transaction.id)
    if (!checked && existingShares.length > 0) {
      setConfirmUnshare(true)
    } else {
      setIsShared(checked)
    }
  }

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

      onUpdate(
        transaction.id,
        {
          type,
          amount: finalAmount,
          description: description.trim() || transaction.description,
          date: date || transaction.date,
          categoryId: categoryId || undefined,
          note: note.trim() || undefined,
          isShared: true,
        },
        sharesInput
      )
    } else {
      const sharesInput = type === 'expense' ? [] : undefined
      onUpdate(
        transaction.id,
        {
          type,
          amount: finalAmount,
          description: description.trim() || transaction.description,
          date: date || transaction.date,
          categoryId: categoryId || undefined,
          note: note.trim() || undefined,
          isShared: false,
        },
        sharesInput
      )
    }

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

            {type === 'expense' && (
              <div className="shared-expense-section">
                <div className="shared-toggle-row">
                  <div className="shared-toggle-text">
                    <strong>Gasto compartido</strong>
                    <span>Divide este gasto con otras personas</span>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={isShared}
                      onChange={(e) => handleToggleShared(e.target.checked)}
                    />
                    <span className="switch-slider" />
                  </label>
                </div>

                {isShared && (
                  <div
                    className="shared-config-box"
                    style={{
                      padding: '14px',
                      background: 'rgba(0,0,0,0.02)',
                      borderRadius: 'var(--radius-md, 14px)',
                      border: '1px solid var(--border-light, #eaeae4)',
                      marginTop: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                      boxSizing: 'border-box',
                      width: '100%',
                    }}
                  >
                    <label
                      className="checkbox-row"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        cursor: 'pointer',
                        fontSize: '0.92rem',
                        fontWeight: 500,
                        color: 'var(--text-main)',
                        userSelect: 'none',
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selfParticipates}
                        onChange={(e) => setSelfParticipates(e.target.checked)}
                        style={{
                          width: 18,
                          height: 18,
                          flexShrink: 0,
                          cursor: 'pointer',
                          margin: 0,
                        }}
                      />
                      <span>Yo también participo en este gasto</span>
                    </label>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', boxSizing: 'border-box' }}>
                      <label style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                        Participantes
                      </label>
                      <input
                        type="text"
                        placeholder="Escribe nombre (ej. Sergi)..."
                        value={newParticipantInput}
                        onChange={(e) => setNewParticipantInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleAddParticipant()
                          }
                        }}
                        list="edit-cash-shared-contacts-list"
                        className="input-field"
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '10px 14px',
                          borderRadius: 'var(--radius-md, 12px)',
                          border: '1px solid var(--border-strong, #d7d8d0)',
                          fontSize: '0.92rem',
                          background: '#ffffff',
                        }}
                      />
                      <datalist id="edit-cash-shared-contacts-list">
                        {sharedContacts.map((c) => (
                          <option key={c.id} value={c.displayName} />
                        ))}
                      </datalist>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => handleAddParticipant()}
                        style={{
                          width: '100%',
                          minHeight: 40,
                          borderRadius: 'var(--radius-md, 12px)',
                          fontWeight: 600,
                          fontSize: '0.88rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          boxSizing: 'border-box',
                        }}
                      >
                        + Añadir participante
                      </button>
                    </div>

                    {participants.length > 0 && (
                      <div
                        className="participant-chips"
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 8,
                          width: '100%',
                          boxSizing: 'border-box',
                        }}
                      >
                        {participants.map((p, idx) => (
                          <span
                            className="participant-chip"
                            key={idx}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '6px 12px',
                              borderRadius: 9999,
                              background: 'rgba(124, 58, 237, 0.1)',
                              color: '#7c3aed',
                              fontWeight: 600,
                              fontSize: '0.85rem',
                            }}
                          >
                            {p.name}
                            <button
                              type="button"
                              onClick={() => handleRemoveParticipant(idx)}
                              aria-label={`Quitar ${p.name}`}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#7c3aed',
                                cursor: 'pointer',
                                padding: 0,
                                fontWeight: 700,
                                fontSize: '1rem',
                                lineHeight: 1,
                              }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {computedShares.length > 0 && (
                      <div
                        className="split-preview"
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                        }}
                      >
                        <span
                          className="split-preview-title"
                          style={{
                            fontSize: '0.84rem',
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                            display: 'block',
                            marginBottom: 8,
                          }}
                        >
                          Reparto exacto de céntimos:
                        </span>
                        <div
                          className="split-preview-list"
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 4,
                            width: '100%',
                            background: '#ffffff',
                            border: '1px solid var(--border-light, #eaeae4)',
                            borderRadius: 'var(--radius-md, 12px)',
                            padding: '10px 14px',
                            boxSizing: 'border-box',
                          }}
                        >
                          {computedShares.map((s, idx) => (
                            <div
                              className="split-preview-item"
                              key={idx}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: '0.92rem',
                                padding: '5px 0',
                                borderBottom:
                                  idx < computedShares.length - 1
                                    ? '1px solid rgba(0,0,0,0.05)'
                                    : 'none',
                              }}
                            >
                              <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>
                                {s.participantName}
                              </span>
                              <strong style={{ color: 'var(--text-main)' }}>
                                {money(s.amount)}
                              </strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
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

            {/* Modal de confirmación para desmarcar compartido */}
            {confirmUnshare && (
              <div
                className="modal-backdrop"
                style={{ zIndex: 1100 }}
                onClick={() => setConfirmUnshare(false)}
              >
                <div
                  className="modal-card"
                  onClick={(e) => e.stopPropagation()}
                  style={{ maxWidth: 380 }}
                >
                  <h4 style={{ margin: '0 0 8px', fontSize: 16 }}>¿Dejar de compartir este gasto?</h4>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    Se eliminarán los repartos asociados a este movimiento de efectivo y volverá a computar como un gasto 100% propio.
                  </p>
                  <div className="modal-actions horizontal" style={{ marginTop: 16 }}>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setConfirmUnshare(false)}
                    >
                      Mantener compartido
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => {
                        setIsShared(false)
                        setParticipants([])
                        setConfirmUnshare(false)
                      }}
                    >
                      Sí, dejar de compartir
                    </button>
                  </div>
                </div>
              </div>
            )}

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

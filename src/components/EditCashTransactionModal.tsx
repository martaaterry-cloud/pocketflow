import { useState, useEffect, useMemo, useRef } from 'react'
import type { Category, CashTransaction, UpdateCashTransactionInput, ExpenseShare, SharedContact, AttachmentMetadata } from '../models/finance'
import { money } from '../utils/money'
import {
  splitExpenseEqually,
  calculateCustomSplit,
  type SplitMode,
  type CustomParticipantInput,
} from '../utils/sharedExpenseSelectors'
import { AppIcon } from '../ui/icons'
import { SharedExpenseSection } from './SharedExpenseSection'
import { AttachmentSection, type StagedAttachment } from './AttachmentSection'
import { uploadAttachment, deleteAttachment } from '../services/supabase/attachmentService'

interface EditCashTransactionModalProps {
  open: boolean
  onClose: () => void
  transaction: CashTransaction | null
  categories: Category[]
  expenseShares?: ExpenseShare[]
  sharedContacts?: SharedContact[]
  userId?: string | null
  onUpdate: (
    id: string,
    patch: UpdateCashTransactionInput,
    shares?: { participantName: string; contactId?: string; isPayerShare: boolean; isUserShare?: boolean; expectedAmount: number }[]
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
  userId,
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

  // Estados para Justificantes / Adjuntos
  const [existingAttachments, setExistingAttachments] = useState<AttachmentMetadata[]>([])
  const [stagedAttachments, setStagedAttachments] = useState<StagedAttachment[]>([])
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<Set<string>>(new Set())
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false)

  // Estados para Gasto Compartido en Efectivo
  const [isShared, setIsShared] = useState(false)
  const [paidBy, setPaidBy] = useState<'user' | 'contact'>('user')
  const [payerName, setPayerName] = useState('')
  const [payerContactId, setPayerContactId] = useState<string | undefined>(undefined)
  const [selfParticipates, setSelfParticipates] = useState(true)
  const [splitType, setSplitType] = useState<SplitMode>('equal')
  const [participants, setParticipants] = useState<ParticipantEntry[]>([])
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({})
  const [newParticipantInput, setNewParticipantInput] = useState('')
  const [confirmUnshare, setConfirmUnshare] = useState(false)

  const lastInitializedIdentityRef = useRef<string | null>(null)
  const currentIdentity = open && transaction ? `edit_cash:${transaction.id}` : null

  // Cleanup de Object URLs al desmontar el componente
  useEffect(() => {
    return () => {
      setStagedAttachments((prev) => {
        prev.forEach((s) => URL.revokeObjectURL(s.localUrl))
        return []
      })
    }
  }, [])

  useEffect(() => {
    if (!open || !currentIdentity || !transaction) {
      if (lastInitializedIdentityRef.current !== null) {
        setStagedAttachments((prev) => {
          prev.forEach((s) => URL.revokeObjectURL(s.localUrl))
          return []
        })
        lastInitializedIdentityRef.current = null
      }
      return
    }

    if (lastInitializedIdentityRef.current === currentIdentity) {
      return
    }

    lastInitializedIdentityRef.current = currentIdentity

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

    // Cargar adjuntos existentes y limpiar temporales previos
    setExistingAttachments(transaction.attachments ?? [])
    setRemovedAttachmentIds(new Set())
    setAttachmentError(null)
    setStagedAttachments((prev) => {
      prev.forEach((s) => URL.revokeObjectURL(s.localUrl))
      return []
    })

    const initialPaidBy = transaction.paidBy || 'user'
    setPaidBy(initialPaidBy)
    setPayerName(transaction.payerName || '')
    setPayerContactId(transaction.payerContactId)

    const existingShares = expenseShares.filter((s) => s.expenseTransactionId === transaction.id)
    if (existingShares.length > 0) {
      setIsShared(true)
      const amountsMap: Record<string, string> = {}
      existingShares.forEach((s) => {
        const key = s.isUserShare || s.participantName.toLowerCase() === 'tú' ? 'user' : s.participantName
        amountsMap[key] = String(s.expectedAmount).replace('.', ',')
      })
      setCustomAmounts(amountsMap)

      if (initialPaidBy === 'contact') {
        const userShare = existingShares.find((s) => s.isUserShare || s.participantName.toLowerCase() === 'tú')
        setSelfParticipates(Boolean(userShare))
        const ext = existingShares
          .filter((s) => !s.isPayerShare && !s.isUserShare && s.participantName.toLowerCase() !== 'tú')
          .map((s) => ({
            id: s.id,
            name: s.participantName,
            contactId: s.contactId,
            customAmount: s.expectedAmount,
          }))
        setParticipants(ext)
      } else {
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
      }

      const isUnequal = existingShares.some((s, _, arr) => Math.abs(s.expectedAmount - arr[0].expectedAmount) > 0.01)
      setSplitType(isUnequal ? 'custom' : 'equal')
    } else {
      setIsShared(Boolean(transaction.isShared))
      setSelfParticipates(true)
      setSplitType('equal')
      setParticipants([])
      setCustomAmounts({})
    }
  }, [open, currentIdentity, transaction])

  const numericAmount = Number(amount.replace(',', '.')) || 0

  const handleCustomAmountChange = (key: string, val: string) => {
    setCustomAmounts((prev) => ({ ...prev, [key]: val }))
  }

  // Cálculo de reparto personalizado con comprobación al céntimo
  const customSplitSummary = useMemo(() => {
    if (!isShared || splitType !== 'custom' || numericAmount <= 0) return undefined

    const customInputs: CustomParticipantInput[] = []
    if (selfParticipates) {
      const userVal = Number((customAmounts['user'] || '0').replace(',', '.')) || 0
      customInputs.push({
        name: 'Tú',
        amount: userVal,
        isPayerShare: paidBy === 'user',
        isUserShare: paidBy === 'contact',
      })
    }

    participants.forEach((p) => {
      const pVal = Number((customAmounts[p.name] || '0').replace(',', '.')) || 0
      customInputs.push({
        name: p.name,
        contactId: p.contactId,
        amount: pVal,
        isPayerShare: false,
        isUserShare: false,
      })
    })

    return calculateCustomSplit(
      numericAmount,
      customInputs,
      paidBy,
      payerName,
      payerContactId
    )
  }, [isShared, splitType, numericAmount, selfParticipates, customAmounts, participants, paidBy, payerName, payerContactId])

  // Cálculo de reparto en tiempo real con exactitud de céntimos
  const computedShares = useMemo(() => {
    if (!isShared || numericAmount <= 0) return []

    if (splitType === 'equal') {
      const externalList = participants.map((p) => ({
        name: p.name,
        contactId: p.contactId,
      }))
      return splitExpenseEqually(
        numericAmount,
        externalList,
        selfParticipates,
        'Tú',
        paidBy,
        payerName,
        payerContactId
      )
    } else {
      return customSplitSummary?.shares ?? []
    }
  }, [isShared, numericAmount, splitType, participants, selfParticipates, paidBy, payerName, payerContactId, customSplitSummary])

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

  const handleAddStagedAttachments = (newStaged: StagedAttachment[]) => {
    setStagedAttachments((prev) => [...prev, ...newStaged])
  }

  const handleRemoveStagedAttachment = (index: number) => {
    setStagedAttachments((prev) => {
      const target = prev[index]
      if (target) {
        URL.revokeObjectURL(target.localUrl)
      }
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleRemoveExistingAttachment = (attachmentId: string) => {
    setRemovedAttachmentIds((prev) => {
      const next = new Set(prev)
      next.add(attachmentId)
      return next
    })
  }

  const processAttachmentsForSave = async (
    movementDate: string
  ): Promise<{ success: boolean; attachments: AttachmentMetadata[] | undefined; error?: string }> => {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
    const activeExisting = existingAttachments.filter((a) => !removedAttachmentIds.has(a.id))

    // Eliminar de Storage los archivos que se marcaron para borrar
    if (!isOffline && removedAttachmentIds.size > 0) {
      existingAttachments
        .filter((a) => removedAttachmentIds.has(a.id))
        .forEach((a) => {
          deleteAttachment(a.storagePath).catch((err) => {
            console.warn('[EditCashTransactionModal] Error al borrar adjunto de Storage:', err)
          })
        })
    }

    if (stagedAttachments.length === 0) {
      return { success: true, attachments: activeExisting }
    }

    if (isOffline) {
      const err = 'No hay conexión a internet para subir el justificante.'
      setAttachmentError(err)
      return { success: false, attachments: activeExisting, error: err }
    }

    setIsUploadingAttachments(true)
    setAttachmentError(null)
    const uploaded: AttachmentMetadata[] = []
    let uploadErrorMsg: string | null = null

    for (const staged of stagedAttachments) {
      try {
        const meta = await uploadAttachment(staged.blob, {
          userId: userId || undefined,
          fileName: staged.fileName,
          mimeType: staged.mimeType,
          date: movementDate,
        })
        uploaded.push(meta)
      } catch (err: any) {
        console.error('[EditCashTransactionModal] Fallo al subir justificante:', err)
        uploadErrorMsg = err?.message || 'Error al subir el justificante a Storage'
        break
      }
    }

    setIsUploadingAttachments(false)

    if (uploadErrorMsg || uploaded.length < stagedAttachments.length) {
      const errMsg = uploadErrorMsg || 'No se pudo subir el justificante. Comprueba tu conexión e inténtalo de nuevo.'
      setAttachmentError(errMsg)
      // Si alguno se subió antes de fallar otro, intentar limpiarlo para evitar huérfanos
      uploaded.forEach((u) => deleteAttachment(u.storagePath).catch(() => {}))
      return { success: false, attachments: undefined, error: errMsg }
    }

    const finalAttachments = [...activeExisting, ...uploaded]
    return { success: true, attachments: finalAttachments }
  }

  const handleModalClose = () => {
    stagedAttachments.forEach((s) => URL.revokeObjectURL(s.localUrl))
    setStagedAttachments([])
    lastInitializedIdentityRef.current = null
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
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

    const { success, attachments: finalAttachments } = await processAttachmentsForSave(date || transaction?.date || new Date().toISOString())
    if (!success) {
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
      if (splitType === 'custom' && (!customSplitSummary || !customSplitSummary.isValid)) {
        setError(customSplitSummary?.errorMessage || 'El reparto personalizado no está cuadrado al céntimo.')
        return
      }
      if (participants.length === 0 && !paidBy) {
        setError('Añade al menos una persona para compartir el gasto.')
        return
      }

      const sharesInput = computedShares.map((s) => ({
        participantName: s.participantName,
        contactId: s.contactId,
        isPayerShare: Boolean(s.isPayerShare),
        isUserShare: Boolean(s.isUserShare),
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
          paidBy,
          payerName: paidBy === 'contact' && payerName.trim() ? payerName.trim() : undefined,
          payerContactId: paidBy === 'contact' ? payerContactId : undefined,
          attachments: finalAttachments,
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
          attachments: finalAttachments,
        },
        sharesInput
      )
    }

    handleModalClose()
  }

  const handleDelete = () => {
    onDelete(transaction.id)
    onClose()
  }

  const selectableCategories = useMemo(() => {
    return categories.filter((c) => {
      const isAtm = c.id === 'atm' || c.name.toLowerCase() === 'cajero' || c.isHistorical
      if (isAtm) {
        return transaction?.categoryId === c.id
      }
      return true
    })
  }, [categories, transaction])

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
                  {selectableCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {type === 'expense' && (
              <SharedExpenseSection
                isShared={isShared}
                onToggleShared={handleToggleShared}
                paidBy={paidBy}
                onPaidByChange={setPaidBy}
                payerName={payerName}
                onPayerNameChange={(name, cId) => {
                  setPayerName(name)
                  setPayerContactId(cId)
                }}
                payerContactId={payerContactId}
                selfParticipates={selfParticipates}
                onToggleSelfParticipates={setSelfParticipates}
                newParticipantInput={newParticipantInput}
                onNewParticipantInputChange={setNewParticipantInput}
                onAddParticipant={handleAddParticipant}
                participants={participants}
                onRemoveParticipant={handleRemoveParticipant}
                sharedContacts={sharedContacts}
                computedShares={computedShares}
                datalistId="edit-cash-shared-contacts-list"
                placeholder="Escribe nombre (ej. Sergi)..."
                splitMode={splitType}
                onSplitModeChange={setSplitType}
                customAmounts={customAmounts}
                onCustomAmountChange={handleCustomAmountChange}
                customSplitSummary={customSplitSummary}
                totalExpenseAmount={numericAmount}
              />
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

            {/* Sección de Justificantes / Adjuntos */}
            {type !== 'adjustment' && (
              <AttachmentSection
                existingAttachments={existingAttachments.filter((a) => !removedAttachmentIds.has(a.id))}
                stagedAttachments={stagedAttachments}
                onAddStaged={handleAddStagedAttachments}
                onRemoveStaged={handleRemoveStagedAttachment}
                onRemoveExisting={handleRemoveExistingAttachment}
                error={attachmentError}
                disabled={isUploadingAttachments}
              />
            )}

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

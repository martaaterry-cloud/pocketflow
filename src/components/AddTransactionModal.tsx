import { useEffect, useState, useMemo } from 'react'
import type {
  Account,
  Category,
  CreateTransactionInput,
  ExpenseNature,
  IncomeKind,
  SharedContact,
  SpecialMovementType,
  Transaction,
  CashTransaction,
  CreateCashTransactionInput,
  UpdateCashTransactionInput,
} from '../models/finance'
import { money } from '../utils/money'
import { splitExpenseEqually } from '../utils/sharedExpenseSelectors'
import { AppIcon } from '../ui/icons'

interface AddTransactionModalProps {
  open: boolean
  onClose: () => void
  accounts: Account[]
  categories: Category[]
  transactions?: Transaction[]
  sharedContacts?: SharedContact[]
  cashTransactions?: CashTransaction[]
  defaultType?: 'expense' | 'income' | 'transfer'
  initialTransaction?: Transaction | null
  onAdd?: (value: CreateTransactionInput) => Transaction | void
  onAddShared?: (
    value: CreateTransactionInput,
    shares: { participantName: string; contactId?: string; isPayerShare: boolean; expectedAmount: number }[]
  ) => void
  onUpdate?: (id: string, value: Partial<CreateTransactionInput>) => void
  onDelete?: (id: string) => void
  onAddCashTransaction?: (input: CreateCashTransactionInput) => void
  onUpdateCashTransaction?: (id: string, patch: UpdateCashTransactionInput) => void
  onDeleteCashTransaction?: (id: string) => void
  onPromptWithdrawalLink?: (tx: Transaction) => void
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
  transactions = [],
  sharedContacts = [],
  cashTransactions = [],
  defaultType = 'expense',
  initialTransaction,
  onAdd,
  onAddShared,
  onUpdate,
  onDelete,
  onAddCashTransaction,
  onUpdateCashTransaction,
  onDeleteCashTransaction,
  onPromptWithdrawalLink,
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

  // Sub-modal / Confirmación de edición de retirada vinculada
  const [pendingLinkedUpdatePayload, setPendingLinkedUpdatePayload] = useState<CreateTransactionInput | null>(null)

  // Estados para Tipo Especial y Naturaleza
  const [isCashWithdrawal, setIsCashWithdrawal] = useState(false)
  const [prevCategoryId, setPrevCategoryId] = useState<string>('')
  const [expenseNature, setExpenseNature] = useState<ExpenseNature>('variable')
  const [giftRecipient, setGiftRecipient] = useState('')

  // Identificar si la transacción actual tiene un movimiento de efectivo vinculado
  const linkedCashTx = useMemo(() => {
    if (!initialTransaction || initialTransaction.specialType !== 'cash_withdrawal') return undefined
    return cashTransactions.find((c) => c.bankTransactionId === initialTransaction.id)
  }, [initialTransaction, cashTransactions])

  // Destinatarios usados previamente en transacciones de regalos
  const previousRecipients = useMemo(() => {
    if (!transactions || transactions.length === 0) return []
    const seen = new Set<string>()
    const result: string[] = []
    const sorted = [...transactions]
      .filter((t) => t.type === 'expense' && t.giftRecipient && t.giftRecipient.trim().length > 0)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    for (const t of sorted) {
      const recipient = t.giftRecipient?.trim()
      if (recipient && !seen.has(recipient.toLowerCase())) {
        seen.add(recipient.toLowerCase())
        result.push(recipient)
      }
    }
    return result
  }, [transactions])

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
      const initialIsWithdrawal = initialTransaction.specialType === 'cash_withdrawal'
      setIsCashWithdrawal(initialIsWithdrawal)
      const atmCat = categories.find((c) => c.id === 'atm' || c.name.toLowerCase() === 'cajero')
      if (initialIsWithdrawal) {
        setCategoryId(initialTransaction.categoryId ?? atmCat?.id ?? 'atm')
      } else {
        setCategoryId(initialTransaction.categoryId ?? categories[0]?.id ?? '')
      }
      setPrevCategoryId(initialTransaction.categoryId && initialTransaction.categoryId !== 'atm' ? initialTransaction.categoryId : categories[0]?.id ?? '')
      setAccountId(initialTransaction.accountId)
      setToAccountId(initialTransaction.toAccountId ?? accounts.find((a) => a.id !== initialTransaction.accountId)?.id ?? '')
      setDate(initialTransaction.date.slice(0, 10))
      setNote(initialTransaction.note ?? '')
      setIsShared(Boolean(initialTransaction.isShared))
      setExpenseNature(initialTransaction.expenseNature || 'variable')
      setGiftRecipient(initialTransaction.giftRecipient ?? '')
      setConfirmDelete(false)
      setPendingLinkedUpdatePayload(null)
    } else {
      setType(defaultType)
      setIncomeKind('income')
      setAmount('')
      setDescription('')
      setCategoryId(categories[0]?.id ?? '')
      setPrevCategoryId(categories[0]?.id ?? '')
      setAccountId(accounts.find((a) => a.type === 'spending')?.id ?? accounts[0]?.id ?? '')
      setToAccountId(accounts.find((a) => a.type === 'savings')?.id ?? accounts[1]?.id ?? '')
      setDate(new Date().toISOString().slice(0, 10))
      setNote('')
      setIsCashWithdrawal(false)
      setExpenseNature('variable')
      setGiftRecipient('')
      setIsShared(false)
      setSelfParticipates(true)
      setSplitType('equal')
      setParticipants([])
      setNewParticipantInput('')
      setConfirmDelete(false)
      setPendingLinkedUpdatePayload(null)
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

  const handleLinkExistingWithdrawal = () => {
    if (!initialTransaction || !onAddCashTransaction) return
    const alreadyLinked = cashTransactions.some((c) => c.bankTransactionId === initialTransaction.id)
    if (alreadyLinked) return

    onAddCashTransaction({
      type: 'income',
      amount: initialTransaction.amount,
      date: initialTransaction.date,
      description: 'Retirada de cajero',
      bankTransactionId: initialTransaction.id,
      note: 'Transferido desde Banco',
    })
  }

  const submit = () => {
    if (!numericAmount || numericAmount <= 0) return
    if (!description.trim()) return
    if (!accountId) return
    if (type === 'transfer' && (!toAccountId || toAccountId === accountId)) return

    const isGiftsCategory =
      type === 'expense' &&
      (categoryId === 'gifts' || categories.find((c) => c.id === categoryId)?.name.toLowerCase().includes('regalo'))

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
      specialType: type === 'expense' ? (isCashWithdrawal ? 'cash_withdrawal' : 'normal') : undefined,
      expenseNature: type === 'expense' ? expenseNature : undefined,
      giftRecipient: isGiftsCategory && giftRecipient.trim() ? giftRecipient.trim() : undefined,
    }

    if (isEditing && initialTransaction && onUpdate) {
      // Si la retirada está vinculada y ha cambiado el importe o la fecha, preguntar
      if (linkedCashTx) {
        const amountChanged = numericAmount !== initialTransaction.amount
        const dateChanged = date !== initialTransaction.date.slice(0, 10)
        if (amountChanged || dateChanged) {
          setPendingLinkedUpdatePayload(payload)
          return
        }
      }
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
      const created = onAdd(payload)
      if (created && payload.type === 'expense' && payload.specialType === 'cash_withdrawal' && onPromptWithdrawalLink) {
        onPromptWithdrawalLink(created)
      }
    }
    onClose()
  }

  const executeLinkedUpdate = (updateCash: boolean) => {
    if (!pendingLinkedUpdatePayload || !initialTransaction || !onUpdate) return

    onUpdate(initialTransaction.id, pendingLinkedUpdatePayload)

    if (updateCash && linkedCashTx && onUpdateCashTransaction) {
      onUpdateCashTransaction(linkedCashTx.id, {
        amount: pendingLinkedUpdatePayload.amount,
        date: pendingLinkedUpdatePayload.date,
      })
    }

    setPendingLinkedUpdatePayload(null)
    onClose()
  }

  const handleDelete = (deleteBoth: boolean = false) => {
    if (initialTransaction && onDelete) {
      onDelete(initialTransaction.id)
      if (deleteBoth && linkedCashTx && onDeleteCashTransaction) {
        onDeleteCashTransaction(linkedCashTx.id)
      }
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
                  ? 'Mercadona, cena, cajero...'
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

        {/* Campo contextual Para quién (solo para categoría Regalos) */}
        {type === 'expense' &&
          (categoryId === 'gifts' ||
            categories.find((c) => c.id === categoryId)?.name.toLowerCase().includes('regalo')) && (
            <div className="form-group">
              <label>
                Para quién (opcional)
                <input
                  type="text"
                  list="gift-recipients-list"
                  placeholder="Nombre del destinatario..."
                  value={giftRecipient}
                  onChange={(e) => setGiftRecipient(e.target.value)}
                />
                {previousRecipients.length > 0 && (
                  <datalist id="gift-recipients-list">
                    {previousRecipients.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                )}
              </label>
              {previousRecipients.length > 0 && (
                <div
                  className="gift-suggestion-pills"
                  style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}
                >
                  {previousRecipients.slice(0, 8).map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      className={`chip-button mini ${giftRecipient === sug ? 'active' : ''}`}
                      style={{
                        fontSize: 12,
                        padding: '3px 10px',
                        borderRadius: 14,
                        border: '1px solid var(--border, #e2e8f0)',
                        background: giftRecipient === sug ? 'var(--primary, #1e293b)' : 'var(--card-bg, #fff)',
                        color: giftRecipient === sug ? '#fff' : 'inherit',
                        cursor: 'pointer',
                      }}
                      onClick={() => setGiftRecipient(giftRecipient === sug ? '' : sug)}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

        {/* Clasificación de Naturaleza del Gasto (Fijo / Variable / Extraordinario) */}
        {type === 'expense' && (
          <div className="form-group">
            <span className="field-group-title">Tipo de gasto</span>
            <div className="nature-segmented-selector" role="group" aria-label="Tipo de gasto">
              <button
                type="button"
                className={`nature-seg-btn ${expenseNature === 'variable' ? 'active' : ''}`}
                onClick={() => setExpenseNature('variable')}
              >
                Variable
              </button>
              <button
                type="button"
                className={`nature-seg-btn ${expenseNature === 'fixed' ? 'active' : ''}`}
                onClick={() => setExpenseNature('fixed')}
              >
                Fijo / Comprometido
              </button>
              <button
                type="button"
                className={`nature-seg-btn ${expenseNature === 'extraordinary' ? 'active' : ''}`}
                onClick={() => setExpenseNature('extraordinary')}
              >
                Extraordinario
              </button>
            </div>
          </div>
        )}

        {/* Opción Retirada de Cajero / Efectivo */}
        {type === 'expense' && (
          <div className="form-group">
            <label className="checkbox-row-clean">
              <input
                type="checkbox"
                checked={isCashWithdrawal}
                onChange={(e) => {
                  const checked = e.target.checked
                  setIsCashWithdrawal(checked)
                  if (checked) {
                    if (!description || description === 'Mercadona' || description === 'Cena') {
                      setDescription('Retirada cajero')
                    }
                    if (categoryId !== 'atm') {
                      setPrevCategoryId(categoryId)
                    }
                    const atmCat = categories.find((c) => c.id === 'atm' || c.name.toLowerCase() === 'cajero')
                    setCategoryId(atmCat?.id ?? 'atm')
                  } else {
                    const atmCat = categories.find((c) => c.id === 'atm' || c.name.toLowerCase() === 'cajero')
                    if (categoryId === 'atm' || (atmCat && categoryId === atmCat.id)) {
                      setCategoryId(prevCategoryId || categories[0]?.id || '')
                    }
                  }
                }}
              />
              <span className="checkbox-label-text">
                <strong>Retirada de efectivo / Cajero</strong>
                <small>Registra la salida en cuenta sin obligar a anotar cada gasto en metálico</small>
              </span>
            </label>

            {/* Banner de estado de vínculo con Efectivo en edición */}
            {isEditing && isCashWithdrawal && (
              <div style={{ marginTop: 8 }}>
                {linkedCashTx ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md, 12px)',
                      background: 'rgba(34, 197, 94, 0.1)',
                      border: '1px solid rgba(34, 197, 94, 0.25)',
                      color: '#16a34a',
                      fontSize: '0.86rem',
                    }}
                  >
                    <AppIcon name="banknote" size={18} />
                    <div style={{ flex: 1 }}>
                      <strong>Registrado en Efectivo (+{money(linkedCashTx.amount)})</strong>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Movimiento vinculado sin duplicidad en consumo total
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md, 12px)',
                      background: 'rgba(37, 99, 235, 0.08)',
                      border: '1px solid rgba(37, 99, 235, 0.2)',
                      fontSize: '0.86rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2563eb' }}>
                      <AppIcon name="banknote" size={16} />
                      <span>No está añadida a Efectivo</span>
                    </div>
                    <button
                      type="button"
                      className="primary-button"
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.82rem',
                        borderRadius: 9999,
                        background: '#2563eb',
                      }}
                      onClick={handleLinkExistingWithdrawal}
                    >
                      + Añadir a Efectivo
                    </button>
                  </div>
                )}
              </div>
            )}
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
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={selfParticipates}
                    onChange={(e) => setSelfParticipates(e.target.checked)}
                  />
                  <span>Yo también participo en este gasto</span>
                </label>

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

        {/* Modal / Diálogo de confirmación para actualización de retirada vinculada */}
        {pendingLinkedUpdatePayload && linkedCashTx && (
          <div
            className="modal-backdrop"
            style={{ zIndex: 1100 }}
            onClick={() => setPendingLinkedUpdatePayload(null)}
          >
            <div
              className="modal-card"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 440, padding: 24 }}
            >
              <h4 style={{ margin: '0 0 10px', fontSize: '1.15rem', fontWeight: 700 }}>
                Actualizar movimiento vinculado
              </h4>
              <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: '0.92rem', lineHeight: 1.5 }}>
                Esta retirada está vinculada a Efectivo. ¿Quieres actualizar también la entrada de efectivo de{' '}
                <strong>{money(linkedCashTx.amount)}</strong> a <strong>{money(pendingLinkedUpdatePayload.amount)}</strong>?
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  type="button"
                  className="primary-button"
                  style={{ width: '100%', padding: '12px', background: '#16a34a' }}
                  onClick={() => executeLinkedUpdate(true)}
                >
                  Actualizar ambos (Banco y Efectivo)
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ width: '100%', padding: '12px' }}
                  onClick={() => executeLinkedUpdate(false)}
                >
                  Solo Banco
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ width: '100%', padding: '10px', background: 'transparent', border: 'none', color: 'var(--text-muted)' }}
                  onClick={() => setPendingLinkedUpdatePayload(null)}
                >
                  Cancelar
                </button>
              </div>
            </div>
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
                  <p>
                    {linkedCashTx
                      ? `Esta retirada tiene un movimiento vinculado en Efectivo (+${money(linkedCashTx.amount)}).`
                      : '¿Seguro que quieres eliminar este movimiento? El saldo se revertirá automáticamente.'}
                  </p>
                  <div className="confirm-delete-actions" style={{ flexDirection: linkedCashTx ? 'column' : 'row' }}>
                    {linkedCashTx ? (
                      <>
                        <button
                          type="button"
                          className="danger-button"
                          style={{ width: '100%', padding: '10px' }}
                          onClick={() => handleDelete(true)}
                        >
                          Borrar ambos (Banco y Efectivo)
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          style={{ width: '100%', padding: '10px' }}
                          onClick={() => handleDelete(false)}
                        >
                          Borrar solo de Banco
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          style={{ width: '100%', padding: '8px', background: 'transparent', border: 'none' }}
                          onClick={() => setConfirmDelete(false)}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="danger-button" onClick={() => handleDelete(false)}>
                          Sí, eliminar
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => setConfirmDelete(false)}
                        >
                          Cancelar
                        </button>
                      </>
                    )}
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

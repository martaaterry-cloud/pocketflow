import { useEffect, useState, useMemo } from 'react'
import type {
  Account,
  Category,
  CreateTransactionInput,
  ExpenseNature,
  ExpenseShare,
  IncomeKind,
  SharedContact,
  Transaction,
  CashTransaction,
  CreateCashTransactionInput,
  UpdateCashTransactionInput,
} from '../models/finance'
import { money } from '../utils/money'
import {
  splitExpenseEqually,
  calculateCustomSplit,
  type SplitMode,
  type CustomParticipantInput,
} from '../utils/sharedExpenseSelectors'
import { AppIcon } from '../ui/icons'
import { SharedExpenseSection } from './SharedExpenseSection'

interface AddTransactionModalProps {
  open: boolean
  onClose: () => void
  accounts: Account[]
  categories: Category[]
  transactions?: Transaction[]
  expenseShares?: ExpenseShare[]
  sharedContacts?: SharedContact[]
  cashTransactions?: CashTransaction[]
  defaultType?: 'expense' | 'income' | 'transfer'
  initialTransaction?: Transaction | CashTransaction | null
  onAdd?: (value: CreateTransactionInput) => Transaction | void
  onAddShared?: (
    value: CreateTransactionInput,
    shares: { participantName: string; contactId?: string; isPayerShare: boolean; isUserShare?: boolean; expectedAmount: number }[]
  ) => void
  onUpdate?: (
    id: string,
    value: Partial<CreateTransactionInput>,
    shares?: { participantName: string; contactId?: string; isPayerShare: boolean; isUserShare?: boolean; expectedAmount: number }[]
  ) => void
  onDelete?: (id: string) => void
  onAddCashTransaction?: (
    input: CreateCashTransactionInput,
    shares?: { participantName: string; contactId?: string; isPayerShare: boolean; isUserShare?: boolean; expectedAmount: number }[]
  ) => void
  onUpdateCashTransaction?: (
    id: string,
    patch: UpdateCashTransactionInput,
    shares?: { participantName: string; contactId?: string; isPayerShare: boolean; isUserShare?: boolean; expectedAmount: number }[]
  ) => void
  onDeleteCashTransaction?: (id: string) => void
  onRecordTransfer?: (input: {
    fromType: 'account' | 'cash'
    fromAccountId?: string
    toType: 'account' | 'cash'
    toAccountId?: string
    amount: number
    date?: string
    note?: string
    description?: string
  }) => void
  onSwitchMedium?: (params: {
    from: 'bank' | 'cash'
    id: string
    to: 'bank' | 'cash'
    transactionData: CreateTransactionInput | CreateCashTransactionInput
    shares?: { participantName: string; contactId?: string; isPayerShare: boolean; isUserShare?: boolean; expectedAmount: number }[]
  }) => void
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
  expenseShares = [],
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
  onRecordTransfer,
  onSwitchMedium,
  onPromptWithdrawalLink,
}: AddTransactionModalProps) {
  const isEditing = Boolean(initialTransaction)
  const isInitialCash = Boolean(
    initialTransaction &&
      (!('accountId' in initialTransaction) ||
        (initialTransaction as any).source === 'cash' ||
        initialTransaction.paymentMethod === 'cash' ||
        initialTransaction.id.startsWith('cash_'))
  )

  const [type, setType] = useState<'expense' | 'income' | 'transfer'>(defaultType)
  const [sourceMedium, setSourceMedium] = useState<'bank' | 'cash'>('bank')
  const [incomeKind, setIncomeKind] = useState<IncomeKind>('income')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [transferFrom, setTransferFrom] = useState<string>('')
  const [transferTo, setTransferTo] = useState<string>('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Sub-modal / Confirmación de edición de retirada vinculada
  const [pendingLinkedUpdatePayload, setPendingLinkedUpdatePayload] = useState<CreateTransactionInput | null>(null)

  // Confirmación al desmarcar gasto compartido con datos existentes
  const [showUnshareConfirm, setShowUnshareConfirm] = useState(false)
  const [unshareHasReimbursements, setUnshareHasReimbursements] = useState(false)

  // Estados para Bizum, Retirada y Naturaleza
  const [isBizum, setIsBizum] = useState(false)
  const [isCashWithdrawal, setIsCashWithdrawal] = useState(false)
  const [prevCategoryId, setPrevCategoryId] = useState<string>('')
  const [expenseNature, setExpenseNature] = useState<ExpenseNature>('variable')
  const [giftRecipient, setGiftRecipient] = useState('')

  // Identificar si la transacción actual tiene un movimiento de efectivo vinculado
  const linkedCashTx = useMemo(() => {
    if (!initialTransaction || ('specialType' in initialTransaction && initialTransaction.specialType !== 'cash_withdrawal')) return undefined
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
  const [paidBy, setPaidBy] = useState<'user' | 'contact'>('user')
  const [payerName, setPayerName] = useState('')
  const [payerContactId, setPayerContactId] = useState<string | undefined>(undefined)
  const [selfParticipates, setSelfParticipates] = useState(true)
  const [splitType, setSplitType] = useState<SplitMode>('equal')
  const [participants, setParticipants] = useState<ParticipantEntry[]>([])
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({})
  const [newParticipantInput, setNewParticipantInput] = useState('')

  useEffect(() => {
    if (initialTransaction) {
      const isCash =
        !('accountId' in initialTransaction) ||
        (initialTransaction as any).source === 'cash' ||
        initialTransaction.paymentMethod === 'cash' ||
        initialTransaction.id.startsWith('cash_')

      setSourceMedium(isCash ? 'cash' : 'bank')
      setType(initialTransaction.type === 'adjustment' ? 'expense' : initialTransaction.type)
      setIncomeKind(('incomeKind' in initialTransaction && initialTransaction.incomeKind) ? initialTransaction.incomeKind : 'income')
      setAmount(String(initialTransaction.amount).replace('.', ','))
      setDescription(initialTransaction.description)

      const initialIsWithdrawal = 'specialType' in initialTransaction && initialTransaction.specialType === 'cash_withdrawal'
      setIsCashWithdrawal(initialIsWithdrawal)

      const atmCat = categories.find((c) => c.id === 'atm' || c.name.toLowerCase() === 'cajero')
      if (initialIsWithdrawal) {
        setCategoryId(initialTransaction.categoryId ?? atmCat?.id ?? 'atm')
      } else {
        setCategoryId(initialTransaction.categoryId ?? categories[0]?.id ?? '')
      }
      setPrevCategoryId(
        initialTransaction.categoryId && initialTransaction.categoryId !== 'atm'
          ? initialTransaction.categoryId
          : categories[0]?.id ?? ''
      )

      const initialAccId = 'accountId' in initialTransaction && initialTransaction.accountId ? initialTransaction.accountId : accounts[0]?.id ?? 'daily'
      setAccountId(initialAccId)
      setToAccountId(('toAccountId' in initialTransaction && initialTransaction.toAccountId) ? initialTransaction.toAccountId : accounts.find((a) => a.id !== initialAccId)?.id ?? '')
      
      setTransferFrom(initialAccId)
      setTransferTo(('toAccountId' in initialTransaction && initialTransaction.toAccountId) ? initialTransaction.toAccountId : 'cash')

      setDate(initialTransaction.date.slice(0, 10))
      setNote(initialTransaction.note ?? '')

      const sharesForTx = (expenseShares || []).filter((s) => s.expenseTransactionId === initialTransaction.id)
      const initialIsShared = Boolean(initialTransaction.isShared) || sharesForTx.length > 0
      const initialPaidBy = initialTransaction.paidBy || 'user'
      setIsShared(initialIsShared)
      setPaidBy(initialPaidBy)
      setPayerName(initialTransaction.payerName || '')
      setPayerContactId(initialTransaction.payerContactId)

      if (initialIsShared && sharesForTx.length > 0) {
        const amountsMap: Record<string, string> = {}
        sharesForTx.forEach((s) => {
          const key = s.isUserShare || s.participantName.toLowerCase() === 'tú' ? 'user' : s.participantName
          amountsMap[key] = String(s.expectedAmount).replace('.', ',')
        })
        setCustomAmounts(amountsMap)

        if (initialPaidBy === 'contact') {
          const userShare = sharesForTx.find((s) => s.isUserShare || s.participantName.toLowerCase() === 'tú')
          setSelfParticipates(Boolean(userShare))
          const extParticipants = sharesForTx
            .filter((s) => !s.isPayerShare && !s.isUserShare && s.participantName.toLowerCase() !== 'tú')
            .map((s) => ({
              id: s.id,
              name: s.participantName,
              contactId: s.contactId,
              customAmount: s.expectedAmount,
            }))
          setParticipants(extParticipants)
        } else {
          const payerShare = sharesForTx.find((s) => s.isPayerShare)
          setSelfParticipates(Boolean(payerShare))
          const extParticipants = sharesForTx
            .filter((s) => !s.isPayerShare)
            .map((s) => ({
              id: s.id,
              name: s.participantName,
              contactId: s.contactId,
              customAmount: s.expectedAmount,
            }))
          setParticipants(extParticipants)
        }

        const isUnequal = sharesForTx.some((s, _, arr) => Math.abs(s.expectedAmount - arr[0].expectedAmount) > 0.01)
        setSplitType(isUnequal ? 'custom' : 'equal')
      } else {
        setSelfParticipates(true)
        setSplitType('equal')
        setParticipants([])
        setCustomAmounts({})
      }

      setExpenseNature(('expenseNature' in initialTransaction && initialTransaction.expenseNature) ? initialTransaction.expenseNature : 'variable')
      setGiftRecipient(('giftRecipient' in initialTransaction && initialTransaction.giftRecipient) ? initialTransaction.giftRecipient : '')
      setIsBizum(initialTransaction.paymentMethod === 'bizum')
      setConfirmDelete(false)
      setPendingLinkedUpdatePayload(null)
      setShowUnshareConfirm(false)
    } else {
      setType(defaultType)
      setSourceMedium('bank')
      setIncomeKind('income')
      setAmount('')
      setDescription('')
      setCategoryId(categories[0]?.id ?? '')
      setPrevCategoryId(categories[0]?.id ?? '')
      const firstSpending = accounts.find((a) => a.type === 'spending')?.id ?? accounts[0]?.id ?? ''
      setAccountId(firstSpending)
      setToAccountId(accounts.find((a) => a.type === 'savings')?.id ?? accounts[1]?.id ?? '')
      setTransferFrom(firstSpending)
      setTransferTo('cash')
      setDate(new Date().toISOString().slice(0, 10))
      setNote('')
      setIsBizum(false)
      setIsCashWithdrawal(false)
      setExpenseNature('variable')
      setGiftRecipient('')
      setIsShared(false)
      setPaidBy('user')
      setPayerName('')
      setPayerContactId(undefined)
      setSelfParticipates(true)
      setSplitType('equal')
      setParticipants([])
      setCustomAmounts({})
      setNewParticipantInput('')
      setConfirmDelete(false)
      setPendingLinkedUpdatePayload(null)
    }
  }, [initialTransaction, accounts, categories, open, defaultType])

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
    }

    if (splitType === 'custom' && customSplitSummary?.isValid) {
      return customSplitSummary.shares
    }

    return []
  }, [isShared, numericAmount, splitType, participants, selfParticipates, paidBy, payerName, payerContactId, customSplitSummary])

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

    setParticipants((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: matchedContact ? matchedContact.displayName : rawName,
        contactId: matchedContact?.id,
        customAmount: 0,
      },
    ])
    setNewParticipantInput('')
  }

  const handleRemoveParticipant = (index: number) => {
    const target = participants[index]
    setParticipants((prev) => prev.filter((_, i) => i !== index))
    if (target) {
      setCustomAmounts((prev) => {
        const next = { ...prev }
        if (target.id) delete next[target.id]
        delete next[target.name]
        return next
      })
    }
  }

  const handleLinkExistingWithdrawal = () => {
    if (!initialTransaction || !onAddCashTransaction) return
    onAddCashTransaction({
      type: 'income',
      amount: initialTransaction.amount,
      date: initialTransaction.date,
      description: 'Retirada de cajero',
      bankTransactionId: initialTransaction.id,
      note: 'Transferido desde Banco',
      paymentMethod: 'cash',
    })
  }

  const handleToggleShared = (checked: boolean) => {
    if (
      !checked &&
      isEditing &&
      (initialTransaction?.isShared || (expenseShares || []).some((s) => s.expenseTransactionId === initialTransaction?.id))
    ) {
      const sharesForTx = (expenseShares || []).filter((s) => s.expenseTransactionId === initialTransaction?.id)
      const hasReimb =
        transactions.some(
          (t) =>
            t.type === 'income' &&
            t.incomeKind === 'reimbursement' &&
            (t.parentExpenseId === initialTransaction?.id || sharesForTx.some((s) => s.id === t.expenseShareId))
        ) ||
        cashTransactions.some(
          (c) =>
            c.type === 'income' &&
            c.bankTransactionId === initialTransaction?.id
        )
      setUnshareHasReimbursements(hasReimb)
      setShowUnshareConfirm(true)
      return
    }
    setIsShared(checked)
  }

  const submit = () => {
    if (!numericAmount || numericAmount <= 0) return
    if (!description.trim()) return

    // CASO TRANSFERENCIA
    if (type === 'transfer') {
      if (!transferFrom || !transferTo || transferFrom === transferTo) return

      if (onRecordTransfer) {
        const fromType = transferFrom === 'cash' ? 'cash' : 'account'
        const toType = transferTo === 'cash' ? 'cash' : 'account'
        onRecordTransfer({
          fromType,
          fromAccountId: fromType === 'account' ? transferFrom : undefined,
          toType,
          toAccountId: toType === 'account' ? transferTo : undefined,
          amount: numericAmount,
          date: new Date(date).toISOString(),
          description: description.trim() || undefined,
          note: note.trim() || undefined,
        })
      }
      onClose()
      return
    }

    if (type === 'expense' && isShared) {
      if (splitType === 'custom' && (!customSplitSummary || !customSplitSummary.isValid)) {
        return
      }
      if (participants.length === 0) return
    }

    const isGiftsCategory =
      type === 'expense' &&
      (categoryId === 'gifts' || categories.find((c) => c.id === categoryId)?.name.toLowerCase().includes('regalo'))

    const sharesInput = (type === 'expense' && isShared && computedShares.length > 0)
      ? computedShares.map((s) => ({
          participantName: s.participantName,
          contactId: s.contactId,
          isPayerShare: Boolean(s.isPayerShare),
          isUserShare: Boolean(s.isUserShare),
          expectedAmount: s.amount,
        }))
      : []

    // CASO EFECTIVO
    if (sourceMedium === 'cash') {
      const cashPayload: CreateCashTransactionInput = {
        type: type === 'expense' ? 'expense' : 'income',
        amount: numericAmount,
        description: description.trim(),
        date: new Date(date).toISOString(),
        categoryId: type === 'expense' ? categoryId : undefined,
        note: note.trim() || undefined,
        isShared: type === 'expense' && isShared,
        paidBy: type === 'expense' && isShared ? paidBy : undefined,
        payerName: type === 'expense' && isShared && paidBy === 'contact' && payerName.trim() ? payerName.trim() : undefined,
        payerContactId: type === 'expense' && isShared && paidBy === 'contact' ? payerContactId : undefined,
        paymentMethod: 'cash',
      }

      if (isEditing && initialTransaction) {
        if (!isInitialCash && onSwitchMedium) {
          // Cambio Bank -> Cash
          onSwitchMedium({
            from: 'bank',
            id: initialTransaction.id,
            to: 'cash',
            transactionData: cashPayload,
            shares: sharesInput,
          })
        } else if (onUpdateCashTransaction) {
          onUpdateCashTransaction(initialTransaction.id, cashPayload, sharesInput)
        }
      } else if (onAddCashTransaction) {
        onAddCashTransaction(cashPayload, sharesInput)
      }
      onClose()
      return
    }

    // CASO BANCO / BIZUM
    if (!accountId) return

    const bankPayload: CreateTransactionInput = {
      type,
      amount: numericAmount,
      description: description.trim(),
      accountId,
      date: new Date(date).toISOString(),
      note: note.trim() || undefined,
      categoryId: type === 'expense' ? categoryId : undefined,
      toAccountId: undefined,
      incomeKind: type === 'income' ? incomeKind : undefined,
      isShared: type === 'expense' && isShared,
      paidBy: type === 'expense' && isShared ? paidBy : undefined,
      payerName: type === 'expense' && isShared && paidBy === 'contact' && payerName.trim() ? payerName.trim() : undefined,
      payerContactId: type === 'expense' && isShared && paidBy === 'contact' ? payerContactId : undefined,
      specialType: type === 'expense' ? (isCashWithdrawal ? 'cash_withdrawal' : 'normal') : undefined,
      expenseNature: type === 'expense' ? expenseNature : undefined,
      giftRecipient: isGiftsCategory && giftRecipient.trim() ? giftRecipient.trim() : undefined,
      paymentMethod: isBizum ? 'bizum' : 'bank',
    }

    if (isEditing && initialTransaction) {
      if (isInitialCash && onSwitchMedium) {
        // Cambio Cash -> Bank
        onSwitchMedium({
          from: 'cash',
          id: initialTransaction.id,
          to: 'bank',
          transactionData: bankPayload,
          shares: sharesInput,
        })
      } else if (onUpdate) {
        if (linkedCashTx) {
          const amountChanged = numericAmount !== initialTransaction.amount
          const dateChanged = date !== initialTransaction.date.slice(0, 10)
          if (amountChanged || dateChanged) {
            setPendingLinkedUpdatePayload(bankPayload)
            return
          }
        }

        if (type === 'expense' && isShared && sharesInput.length > 0) {
          onUpdate(initialTransaction.id, { ...bankPayload, isShared: true }, sharesInput)
        } else if (type === 'expense' && !isShared && initialTransaction.isShared) {
          onUpdate(initialTransaction.id, { ...bankPayload, isShared: false }, [])
        } else {
          onUpdate(initialTransaction.id, bankPayload)
        }
      }
    } else if (type === 'expense' && isShared && onAddShared && sharesInput.length > 0) {
      onAddShared(bankPayload, sharesInput)
    } else if (onAdd) {
      const createdTx = onAdd(bankPayload)
      if (isCashWithdrawal && createdTx && onPromptWithdrawalLink) {
        onPromptWithdrawalLink(createdTx)
      }
    }

    onClose()
  }

  const handleDelete = () => {
    if (!initialTransaction) return
    if (isInitialCash && onDeleteCashTransaction) {
      onDeleteCashTransaction(initialTransaction.id)
    } else if (onDelete) {
      onDelete(initialTransaction.id)
    }
    onClose()
  }

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {isEditing
              ? type === 'transfer'
                ? 'Editar transferencia'
                : type === 'income'
                ? 'Editar ingreso'
                : 'Editar gasto'
              : type === 'transfer'
              ? 'Transferir dinero'
              : type === 'income'
              ? 'Nuevo ingreso'
              : 'Nuevo gasto'}
          </h3>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar">
            <AppIcon name="x" size={18} />
          </button>
        </div>

        {/* Selector de Tipo si es nuevo movimiento */}
        {!isEditing && (
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
              Transferir
            </button>
          </div>
        )}

        {/* Selector de Medio: Cuenta vs Efectivo (para Gasto e Ingreso) */}
        {type !== 'transfer' && (
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {type === 'expense' ? 'Origen del dinero' : 'Destino del dinero'}
            </label>
            <div className="segmented-control" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button
                type="button"
                className={`segmented-btn ${sourceMedium === 'bank' ? 'active' : ''}`}
                onClick={() => setSourceMedium('bank')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <AppIcon name="landmark" size={15} />
                <span>Cuenta bancaria</span>
              </button>
              <button
                type="button"
                className={`segmented-btn ${sourceMedium === 'cash' ? 'active' : ''}`}
                onClick={() => {
                  setSourceMedium('cash')
                  setIsBizum(false)
                }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <AppIcon name="wallet" size={15} />
                <span>Efectivo</span>
              </button>
            </div>
          </div>
        )}

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
              <span>Reembolso / Devolución</span>
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
                  ? 'Mercadona, cena, peluquería...'
                  : type === 'income'
                  ? incomeKind === 'reimbursement'
                    ? 'Bizum cena, devolución...'
                    : 'Nómina, regalo, venta...'
                  : 'Traspaso a ahorro, retirada...'
              }
            />
          </label>
        </div>

        {/* Toggle discreto de Bizum (solo cuando el origen/destino es Cuenta bancaria) */}
        {sourceMedium === 'bank' && type !== 'transfer' && !isCashWithdrawal && (
          <div className="form-group" style={{ marginTop: -4, marginBottom: 12 }}>
            <button
              type="button"
              className={`bizum-toggle-chip ${isBizum ? 'active' : ''}`}
              onClick={() => setIsBizum((prev) => !prev)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 9999,
                border: isBizum ? '1px solid #10b981' : '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
                background: isBizum ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-card-light, rgba(255, 255, 255, 0.05))',
                color: isBizum ? '#10b981' : 'var(--text-muted, #888)',
                fontSize: '0.84rem',
                fontWeight: isBizum ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <AppIcon name="smartphone" size={14} color={isBizum ? '#10b981' : 'currentColor'} />
              <span>
                {type === 'income'
                  ? isBizum
                    ? 'Bizum recibido'
                    : 'Marcar como Bizum'
                  : isBizum
                  ? 'Pagado por Bizum'
                  : 'Bizum'}
              </span>
              {isBizum && <AppIcon name="check" size={12} color="#10b981" />}
            </button>
          </div>
        )}

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

        {/* Retirada de Cajero (solo si es Cuenta Bancaria) */}
        {type === 'expense' && sourceMedium === 'bank' && (
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

        {/* Sección Gasto Compartido */}
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
            datalistId="shared-contacts-list"
            placeholder="Escribe nombre (ej. Sergi)..."
            splitMode={splitType}
            onSplitModeChange={setSplitType}
            customAmounts={customAmounts}
            onCustomAmountChange={handleCustomAmountChange}
            customSplitSummary={customSplitSummary}
            totalExpenseAmount={numericAmount}
          />
        )}

        {/* Selector de Cuenta si origen es Banco */}
        {type !== 'transfer' && sourceMedium === 'bank' && (
          <div className="form-group">
            <label>
              Cuenta bancaria
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type === 'spending' ? 'Diaria' : 'Ahorro'})
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* Info cuando el origen es Efectivo */}
        {type !== 'transfer' && sourceMedium === 'cash' && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              background: 'var(--bg-card-light, #f8fafc)',
              border: '1px solid var(--border-color, #e2e8f0)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
              marginBottom: 12,
            }}
          >
            <AppIcon name="wallet" size={16} />
            <span>
              {type === 'expense'
                ? 'Se descontará de la caja de efectivo'
                : 'Se sumará a la caja de efectivo'}
            </span>
          </div>
        )}

        {/* Campos de Transferir */}
        {type === 'transfer' && (
          <>
            <div className="form-group">
              <label>
                Desde (Origen)
                <select value={transferFrom} onChange={(e) => setTransferFrom(e.target.value)}>
                  <optgroup label="Cuentas bancarias">
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.type === 'spending' ? 'Diaria' : 'Ahorro'})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Físico">
                    <option value="cash">Efectivo</option>
                  </optgroup>
                </select>
              </label>
            </div>

            <div className="form-group">
              <label>
                Hacia (Destino)
                <select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                  <optgroup label="Cuentas bancarias">
                    {accounts
                      .filter((a) => a.id !== transferFrom)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.type === 'spending' ? 'Diaria' : 'Ahorro'})
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Físico">
                    {transferFrom !== 'cash' && <option value="cash">Efectivo</option>}
                  </optgroup>
                </select>
              </label>
            </div>
          </>
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

        {/* Sub-modal confirmación desmarcar compartido */}
        {showUnshareConfirm && (
          <div
            className="modal-backdrop"
            style={{ zIndex: 1100 }}
            onClick={() => setShowUnshareConfirm(false)}
          >
            <div
              className="modal-card"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 440, padding: 24 }}
            >
              <h4 style={{ margin: '0 0 10px', fontSize: '1.15rem', fontWeight: 700 }}>
                {unshareHasReimbursements ? '¿Desmarcar gasto compartido con cobros?' : '¿Desmarcar gasto compartido?'}
              </h4>
              <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: '0.92rem', lineHeight: 1.5 }}>
                {unshareHasReimbursements
                  ? 'Este gasto ya tiene cobros o reembolsos registrados. Si lo desmarcas como compartido, se eliminarán las cuotas pendientes de los participantes y el gasto pasará a ser 100% tuyo personal.'
                  : 'Al desmarcarlo como compartido, se eliminarán las cuotas de los participantes y volverá a ser un gasto 100% individual.'}
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowUnshareConfirm(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ background: '#ef4444', borderColor: '#ef4444' }}
                  onClick={() => {
                    setIsShared(false)
                    setShowUnshareConfirm(false)
                  }}
                >
                  Sí, desmarcar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="modal-actions" style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          {isEditing && (
            <button
              type="button"
              className="btn btn-danger"
              style={{ marginRight: 'auto' }}
              onClick={() => {
                if (confirmDelete) {
                  handleDelete()
                } else {
                  setConfirmDelete(true)
                }
              }}
            >
              {confirmDelete ? '¿Seguro que deseas eliminar?' : 'Eliminar'}
            </button>
          )}

          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={
              !numericAmount ||
              numericAmount <= 0 ||
              !description.trim() ||
              (type === 'transfer' && (!transferFrom || !transferTo || transferFrom === transferTo)) ||
              (type !== 'transfer' && sourceMedium === 'bank' && !accountId)
            }
          >
            {isEditing ? 'Guardar cambios' : 'Añadir'}
          </button>
        </div>
      </div>
    </div>
  )
}

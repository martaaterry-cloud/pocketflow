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
import { money, shortDate } from '../utils/money'
import {
  splitExpenseEqually,
  calculateCustomSplit,
  selectPendingDebtors,
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
  initialReimbursementShareId?: string
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
  onRecordReimbursement?: (input: {
    parentExpenseId?: string
    expenseShareId?: string
    amount: number
    accountId?: string
    date?: string
    note?: string
    description?: string
    paymentMethod?: 'bank' | 'bizum' | 'cash'
  }) => void
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
  initialReimbursementShareId,
  onAdd,
  onAddShared,
  onUpdate,
  onDelete,
  onAddCashTransaction,
  onUpdateCashTransaction,
  onDeleteCashTransaction,
  onRecordTransfer,
  onSwitchMedium,
  onRecordReimbursement,
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
  const [selectedReceivableShareId, setSelectedReceivableShareId] = useState<string>('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [transferFrom, setTransferFrom] = useState<string>('')
  const [transferTo, setTransferTo] = useState<string>('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Confirmación al desmarcar gasto compartido con datos existentes
  const [showUnshareConfirm, setShowUnshareConfirm] = useState(false)
  const [unshareHasReimbursements, setUnshareHasReimbursements] = useState(false)

  // Estados para Bizum y Naturaleza
  const [isBizum, setIsBizum] = useState(false)
  const [expenseNature, setExpenseNature] = useState<ExpenseNature>('variable')
  const [giftRecipient, setGiftRecipient] = useState('')

  // Lista canónica de cuotas por cobrar pendientes (excluyendo deudas de terceros y pagador)
  const pendingReceivablesList = useMemo(() => {
    const debtors = selectPendingDebtors(expenseShares, transactions, cashTransactions)
    const list: {
      shareId: string
      debtorName: string
      expenseDescription: string
      pendingAmount: number
      expenseTransactionId: string
      date: string
    }[] = []

    debtors.forEach((d) => {
      d.pendingShares.forEach((ps) => {
        list.push({
          shareId: ps.share.id,
          debtorName: d.name,
          expenseDescription: ps.expenseDescription,
          pendingAmount: ps.pendingAmount,
          expenseTransactionId: ps.share.expenseTransactionId,
          date: ps.expenseDate,
        })
      })
    })

    return list
  }, [expenseShares, transactions, cashTransactions])

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
      setCategoryId(initialTransaction.categoryId ?? categories[0]?.id ?? '')

      const initialAccId = 'accountId' in initialTransaction && initialTransaction.accountId ? initialTransaction.accountId : accounts[0]?.id ?? 'daily'
      setAccountId(initialAccId)
      
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
      setShowUnshareConfirm(false)
      setSelectedReceivableShareId('')
    } else {
      setType(defaultType)
      setSourceMedium('bank')
      setIncomeKind(initialReimbursementShareId ? 'reimbursement' : 'income')
      setSelectedReceivableShareId(initialReimbursementShareId || '')
      setAmount('')
      setDescription('')
      setCategoryId(categories[0]?.id ?? '')
      const firstSpending = accounts.find((a) => a.type === 'spending')?.id ?? accounts[0]?.id ?? ''
      setAccountId(firstSpending)
      setTransferFrom(firstSpending)
      setTransferTo('cash')
      setDate(new Date().toISOString().slice(0, 10))
      setNote('')
      setIsBizum(false)
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

      if (initialReimbursementShareId) {
        const targetShare = pendingReceivablesList.find((p) => p.shareId === initialReimbursementShareId)
        if (targetShare) {
          setAmount(String(targetShare.pendingAmount).replace('.', ','))
          setDescription(`Reembolso ${targetShare.debtorName} · ${targetShare.expenseDescription}`)
        }
      }
    }
  }, [initialTransaction, accounts, categories, open, defaultType, initialReimbursementShareId, pendingReceivablesList])

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
            (t.parentExpenseId === initialTransaction?.id ||
              sharesForTx.some((s) => s.id === t.expenseShareId))
        ) ||
        cashTransactions.some(
          (c) =>
            c.type === 'income' &&
            (c.bankTransactionId === initialTransaction?.id ||
              sharesForTx.some((s) => c.note?.includes(`[share:${s.id}]`)))
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

      const fromType = transferFrom === 'cash' ? 'cash' : 'account'
      const fromAccountId = transferFrom === 'cash' ? undefined : transferFrom
      const toType = transferTo === 'cash' ? 'cash' : 'account'
      const toAccountId = transferTo === 'cash' ? undefined : transferTo

      if (onRecordTransfer) {
        onRecordTransfer({
          fromType,
          fromAccountId,
          toType,
          toAccountId,
          amount: numericAmount,
          date: new Date(date).toISOString(),
          description: description.trim() || 'Transferencia',
          note: note.trim() || undefined,
        })
      }
      onClose()
      return
    }

    // Preparar cuotas de gasto compartido si aplica
    const sharesInput =
      type === 'expense' && isShared && computedShares.length > 0
        ? computedShares.map((s) => ({
            participantName: s.participantName,
            contactId: s.contactId,
            isPayerShare: Boolean(s.isPayerShare),
            isUserShare: Boolean(s.isUserShare),
            expectedAmount: s.amount,
          }))
        : undefined

    // CASO INGRESO: Devolución / Cobro pendiente vinculado
    if (type === 'income' && incomeKind === 'reimbursement' && selectedReceivableShareId) {
      const selectedShare = pendingReceivablesList.find((p) => p.shareId === selectedReceivableShareId)
      if (selectedShare) {
        if (onRecordReimbursement) {
          onRecordReimbursement({
            parentExpenseId: selectedShare.expenseTransactionId,
            expenseShareId: selectedShare.shareId,
            amount: numericAmount,
            accountId: sourceMedium === 'bank' ? accountId : undefined,
            date: new Date(date).toISOString(),
            description: description.trim(),
            note: note.trim() || undefined,
            paymentMethod: sourceMedium === 'cash' ? 'cash' : (isBizum ? 'bizum' : 'bank'),
          })
          onClose()
          return
        }
      }
    }

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
      parentExpenseId: type === 'income' && incomeKind === 'reimbursement' && selectedReceivableShareId ? pendingReceivablesList.find((p) => p.shareId === selectedReceivableShareId)?.expenseTransactionId : undefined,
      expenseShareId: type === 'income' && incomeKind === 'reimbursement' && selectedReceivableShareId ? selectedReceivableShareId : undefined,
      isShared: type === 'expense' && isShared,
      paidBy: type === 'expense' && isShared ? paidBy : undefined,
      payerName: type === 'expense' && isShared && paidBy === 'contact' && payerName.trim() ? payerName.trim() : undefined,
      payerContactId: type === 'expense' && isShared && paidBy === 'contact' ? payerContactId : undefined,
      specialType: 'normal',
      expenseNature: type === 'expense' ? expenseNature : undefined,
      giftRecipient: isGiftsCategory && giftRecipient.trim() ? giftRecipient.trim() : undefined,
      paymentMethod: isBizum ? 'bizum' : 'bank',
    }

    if (isEditing && initialTransaction) {
      if (isInitialCash && onSwitchMedium) {
        onSwitchMedium({
          from: 'cash',
          id: initialTransaction.id,
          to: 'bank',
          transactionData: bankPayload,
          shares: sharesInput,
        })
      } else if (onUpdate) {
        onUpdate(initialTransaction.id, bankPayload, sharesInput)
      }
    } else {
      if (type === 'expense' && isShared && sharesInput && onAddShared) {
        onAddShared(bankPayload, sharesInput)
      } else if (onAdd) {
        onAdd(bankPayload)
      }
    }

    onClose()
  }

  const isGiftsCategory =
    categoryId === 'gifts' ||
    categories.find((c) => c.id === categoryId)?.name.toLowerCase().includes('regalo')

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

  // Texto dinámico para botón principal
  const getPrimaryButtonText = () => {
    if (isEditing) return 'Guardar cambios'
    if (type === 'expense') return 'Añadir gasto'
    if (type === 'income') return 'Añadir ingreso'
    return 'Transferir'
  }

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

        {/* Selector de Medio: Cuenta vs Efectivo (para Gasto e Ingreso) */}
        {type !== 'transfer' && (
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              {type === 'expense' ? 'Origen del dinero' : 'Destino del dinero'}
            </label>
            <div className="segmented-control">
              <button
                type="button"
                className={`segmented-btn ${sourceMedium === 'bank' ? 'active' : ''}`}
                onClick={() => setSourceMedium('bank')}
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
              >
                <AppIcon name="wallet" size={15} />
                <span>Efectivo</span>
              </button>
            </div>
          </div>
        )}

        {/* Segmented selector para Ingreso: Ingreso normal vs Devolución / Cobro pendiente */}
        {type === 'income' && (
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Tipo de ingreso</label>
            <div className="income-kind-selector">
              <label className={`income-kind-pill ${incomeKind === 'income' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="incomeKind"
                  value="income"
                  checked={incomeKind === 'income'}
                  onChange={() => {
                    setIncomeKind('income')
                    setSelectedReceivableShareId('')
                  }}
                />
                <span>Ingreso</span>
              </label>
              <label className={`income-kind-pill ${incomeKind === 'reimbursement' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="incomeKind"
                  value="reimbursement"
                  checked={incomeKind === 'reimbursement'}
                  onChange={() => setIncomeKind('reimbursement')}
                />
                <span>Devolución / cobro pendiente</span>
              </label>
            </div>
          </div>
        )}

        {/* Lista opcional de cobros pendientes (solo si es Devolución / Cobro pendiente) */}
        {type === 'income' && incomeKind === 'reimbursement' && pendingReceivablesList.length > 0 && (
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              ¿Está asociado a un cobro pendiente?
            </label>
            <div className="debt-chip-list">
              <button
                type="button"
                className={`debt-chip ${!selectedReceivableShareId ? 'selected' : ''}`}
                onClick={() => setSelectedReceivableShareId('')}
              >
                <div className="debt-chip-top">
                  <strong>Ninguno</strong>
                  <span className="debt-chip-subtitle">Sin vincular a cobro pendiente</span>
                </div>
              </button>

              {pendingReceivablesList.map((pr) => {
                const isSelected = selectedReceivableShareId === pr.shareId
                return (
                  <button
                    key={pr.shareId}
                    type="button"
                    className={`debt-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedReceivableShareId(pr.shareId)
                      setAmount(String(pr.pendingAmount).replace('.', ','))
                      setDescription(`Reembolso ${pr.debtorName} · ${pr.expenseDescription}`)
                    }}
                  >
                    <div className="debt-chip-top">
                      <strong>{pr.debtorName}</strong>
                      <span className="debt-chip-amount">falta {money(pr.pendingAmount)}</span>
                    </div>
                    <span className="debt-chip-subtitle">
                      {pr.expenseDescription} · {shortDate(pr.date)}
                    </span>
                  </button>
                )
              })}
            </div>
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
                    ? 'Reembolso cena, devolución...'
                    : 'Nómina, regalo, venta...'
                  : 'Traspaso a ahorro, cajero...'
              }
            />
          </label>
        </div>

        {/* Toggle discreto de Bizum (solo cuando el origen/destino es Cuenta bancaria) */}
        {sourceMedium === 'bank' && type !== 'transfer' && (
          <div className="form-group" style={{ marginTop: -4, marginBottom: 12 }}>
            <button
              type="button"
              className={`bizum-toggle-chip ${isBizum ? 'active' : ''}`}
              onClick={() => setIsBizum((prev) => !prev)}
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
        {type === 'expense' && isGiftsCategory && (
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
                      border: '1px solid var(--border-light, #eaeae4)',
                      background: giftRecipient === sug ? 'var(--accent-dark, #1c1d1a)' : 'var(--bg-card, #fff)',
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

        {/* Sección de Gasto Compartido (solo para Gastos) */}
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
              background: 'var(--bg-card-subtle, #f8f8f5)',
              border: '1px solid var(--border-light, #eaeae4)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '0.85rem',
              color: 'var(--text-muted, #82847c)',
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
                  className="btn btn-danger"
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

        <div className="modal-actions" style={{ display: 'flex', flexDirection: 'row', gap: 10, marginTop: 16 }}>
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
              {confirmDelete ? '¿Confirmar?' : 'Eliminar'}
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
            {getPrimaryButtonText()}
          </button>
        </div>
      </div>
    </div>
  )
}

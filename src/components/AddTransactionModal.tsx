import { useEffect, useState, useMemo, useRef } from 'react'
import type {
  Account,
  AttachmentMetadata,
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
import { AttachmentSection, type StagedAttachment } from './AttachmentSection'
import { uploadAttachment, deleteAttachment } from '../services/supabase/attachmentService'

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
  userId?: string | null
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
  onConvertMovementType?: (params: {
    id: string
    fromMedium: 'bank' | 'cash'
    targetType: 'expense' | 'income' | 'transfer'
    targetMedium?: 'bank' | 'cash'
    targetData: {
      amount: number
      description: string
      date: string
      note?: string
      categoryId?: string
      accountId?: string
      expenseNature?: ExpenseNature
      giftRecipient?: string
      isShared?: boolean
      paidBy?: 'user' | 'contact'
      payerName?: string
      payerContactId?: string
      isBizum?: boolean
      incomeKind?: IncomeKind
      parentExpenseId?: string
      expenseShareId?: string
      fromType?: 'account' | 'cash'
      fromAccountId?: string
      toType?: 'account' | 'cash'
      toAccountId?: string
      attachments?: AttachmentMetadata[]
    }
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
  userId,
  onAdd,
  onAddShared,
  onUpdate,
  onDelete,
  onAddCashTransaction,
  onUpdateCashTransaction,
  onDeleteCashTransaction,
  onRecordTransfer,
  onSwitchMedium,
  onConvertMovementType,
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

  // Estados para Justificantes / Adjuntos
  const [existingAttachments, setExistingAttachments] = useState<AttachmentMetadata[]>([])
  const [stagedAttachments, setStagedAttachments] = useState<StagedAttachment[]>([])
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<Set<string>>(new Set())
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false)

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

  // Categorías seleccionables para nuevo gasto / edición (Cajero no seleccionable para nuevos)
  const selectableCategories = useMemo(() => {
    return categories.filter((c) => {
      const isHistorical = c.isHistorical || c.id === 'atm' || c.name.toLowerCase() === 'cajero'
      if (isHistorical) {
        return isEditing && initialTransaction?.categoryId === c.id
      }
      return true
    })
  }, [categories, isEditing, initialTransaction])

  // Comprobación de dependencias financieras que impidan cambiar el tipo arbitrariamente
  const typeConversionBlockReason = useMemo(() => {
    if (!isEditing || !initialTransaction) return null
    const initialRealType =
      initialTransaction.type === 'transfer' || (initialTransaction as any).specialType === 'cash_withdrawal'
        ? 'transfer'
        : initialTransaction.type === 'income'
        ? 'income'
        : 'expense'

    if (type === initialRealType) return null

    const sharesForTx = (expenseShares || []).filter((s) => s.expenseTransactionId === initialTransaction.id)
    const hasExternalShares = sharesForTx.some(
      (s) => !s.isPayerShare && !s.isUserShare && s.participantName.toLowerCase() !== 'tú'
    )
    const hasLinkedReimbursements =
      transactions.some(
        (t) =>
          t.type === 'income' &&
          t.incomeKind === 'reimbursement' &&
          (t.parentExpenseId === initialTransaction.id || sharesForTx.some((s) => s.id === t.expenseShareId))
      ) ||
      cashTransactions.some(
        (c) =>
          c.type === 'income' &&
          (c.bankTransactionId === initialTransaction.id || sharesForTx.some((s) => c.note?.includes(`[share:${s.id}]`)))
      )

    if (hasLinkedReimbursements) {
      return 'Este movimiento tiene cobros o reembolsos vinculados. Para cambiar su tipo, primero elimina o desvincula esos cobros.'
    }
    if (hasExternalShares) {
      return 'Este gasto tiene participantes compartidos. Para cambiar su tipo a transferencia o ingreso, primero desmarca el reparto compartido.'
    }

    if (
      'incomeKind' in initialTransaction &&
      initialTransaction.incomeKind === 'reimbursement' &&
      (initialTransaction.parentExpenseId || initialTransaction.expenseShareId)
    ) {
      return 'Este ingreso está vinculado como reembolso de una deuda o gasto. Para cambiar su tipo, elimínalo o desvincula la cuota.'
    }

    return null
  }, [isEditing, initialTransaction, type, expenseShares, transactions, cashTransactions])

  const lastInitializedIdentityRef = useRef<string | null>(null)
  const currentIdentity = open
    ? initialTransaction?.id
      ? `edit:${initialTransaction.id}`
      : `new:${defaultType || 'expense'}:${initialReimbursementShareId || ''}`
    : null

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
    if (!open || !currentIdentity) {
      if (lastInitializedIdentityRef.current !== null) {
        setStagedAttachments((prev) => {
          prev.forEach((s) => URL.revokeObjectURL(s.localUrl))
          return []
        })
        lastInitializedIdentityRef.current = null
      }
      return
    }

    // Si ya inicializamos este formulario para esta identidad exacta, NO reinicializar el draft del usuario
    if (lastInitializedIdentityRef.current === currentIdentity) {
      return
    }

    // Es una apertura inicial o un cambio REAL de movimiento/identidad:
    lastInitializedIdentityRef.current = currentIdentity

    if (initialTransaction) {
      const isCash =
        !('accountId' in initialTransaction) ||
        (initialTransaction as any).source === 'cash' ||
        initialTransaction.paymentMethod === 'cash' ||
        initialTransaction.id.startsWith('cash_')

      const isInitialTransfer =
        initialTransaction.type === 'transfer' ||
        (initialTransaction as any).specialType === 'cash_withdrawal'

      const initialType = isInitialTransfer
        ? 'transfer'
        : initialTransaction.type === 'income'
        ? 'income'
        : 'expense'

      setSourceMedium(isCash ? 'cash' : 'bank')
      setType(initialType)
      setIncomeKind(('incomeKind' in initialTransaction && initialTransaction.incomeKind) ? initialTransaction.incomeKind : 'income')
      setAmount(String(initialTransaction.amount).replace('.', ','))
      setDescription(initialTransaction.description)
      setCategoryId(initialTransaction.categoryId ?? selectableCategories[0]?.id ?? 'food')

      const initialAccId = 'accountId' in initialTransaction && initialTransaction.accountId ? initialTransaction.accountId : accounts[0]?.id ?? 'daily'
      setAccountId(initialAccId)
      
      if (isCash) {
        setTransferFrom('cash')
        setTransferTo(accounts[0]?.id || 'daily')
      } else if ((initialTransaction as any).specialType === 'cash_withdrawal') {
        setTransferFrom(initialAccId)
        setTransferTo('cash')
      } else if (initialTransaction.type === 'transfer') {
        setTransferFrom(initialAccId)
        setTransferTo(('toAccountId' in initialTransaction && initialTransaction.toAccountId) ? initialTransaction.toAccountId : (accounts.find((a) => a.id !== initialAccId)?.id ?? 'savings'))
      } else {
        setTransferFrom(initialAccId)
        setTransferTo('cash')
      }

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
      const matchedShareId =
        ('expenseShareId' in initialTransaction ? initialTransaction.expenseShareId : undefined) ||
        (initialTransaction.note && initialTransaction.note.match(/\[share:([^\]]+)\]/)?.[1]) ||
        ''
      setSelectedReceivableShareId(matchedShareId)

      // Cargar adjuntos existentes y limpiar temporales previos
      setExistingAttachments(initialTransaction.attachments ?? [])
      setRemovedAttachmentIds(new Set())
      setAttachmentError(null)
      setStagedAttachments((prev) => {
        prev.forEach((s) => URL.revokeObjectURL(s.localUrl))
        return []
      })
    } else {
      setType(defaultType)
      setSourceMedium('bank')
      setIncomeKind(initialReimbursementShareId ? 'reimbursement' : 'income')
      setSelectedReceivableShareId(initialReimbursementShareId || '')
      setAmount('')
      setDescription('')
      setCategoryId(selectableCategories[0]?.id ?? 'food')
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

      // Resetear adjuntos para nuevo gasto
      setExistingAttachments([])
      setRemovedAttachmentIds(new Set())
      setAttachmentError(null)
      setStagedAttachments((prev) => {
        prev.forEach((s) => URL.revokeObjectURL(s.localUrl))
        return []
      })

      if (initialReimbursementShareId) {
        const targetShare = pendingReceivablesList.find((p) => p.shareId === initialReimbursementShareId)
        if (targetShare) {
          setAmount(String(targetShare.pendingAmount).replace('.', ','))
          setDescription(`Reembolso ${targetShare.debtorName} · ${targetShare.expenseDescription}`)
        }
      }
    }
  }, [open, currentIdentity, initialTransaction, defaultType, initialReimbursementShareId])

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

    console.log(
      `[ATTACHMENT DEBUG] Etapa 7: Guardar cambios pulsado · txId=${initialTransaction?.id || 'new'}, stagedCount=${stagedAttachments.length}, activeExistingCount=${activeExisting.length}, removedCount=${removedAttachmentIds.size}`
    )

    // Eliminar de Storage los archivos que se marcaron para borrar
    if (!isOffline && removedAttachmentIds.size > 0) {
      existingAttachments
        .filter((a) => removedAttachmentIds.has(a.id))
        .forEach((a) => {
          console.log(`[ATTACHMENT DEBUG] Eliminando adjunto borrado de Storage: ${a.storagePath}`)
          deleteAttachment(a.storagePath).catch((err) => {
            console.warn('[AddTransactionModal] Error al borrar adjunto de Storage:', err)
          })
        })
    }

    if (stagedAttachments.length === 0) {
      console.log('[ATTACHMENT DEBUG] Sin archivos pendientes de subir (staged=0), conservando existentes')
      return { success: true, attachments: activeExisting }
    }

    if (isOffline) {
      const err = 'No hay conexión a internet para subir el justificante. · ETAPA: RED'
      console.error('[ATTACHMENT DEBUG] ERROR Etapa 8: Dispositivo offline')
      setAttachmentError(err)
      return { success: false, attachments: activeExisting, error: err }
    }

    setIsUploadingAttachments(true)
    setAttachmentError(null)
    const uploaded: AttachmentMetadata[] = []
    let uploadErrorMsg: string | null = null

    for (let i = 0; i < stagedAttachments.length; i++) {
      const staged = stagedAttachments[i]
      console.log(
        `[ATTACHMENT DEBUG] Etapa 8: Iniciando upload a Storage [${i + 1}/${stagedAttachments.length}] · name=${staged.fileName}, size=${staged.fileSize}, mime=${staged.mimeType}, txId=${initialTransaction?.id || 'new'}`
      )
      try {
        const meta = await uploadAttachment(staged.blob, {
          userId: userId || undefined,
          fileName: staged.fileName,
          mimeType: staged.mimeType,
          date: movementDate,
        })
        console.log(
          `[ATTACHMENT DEBUG] Etapa 9/10: Storage respondió OK · storagePath=${meta.storagePath}, attachmentId=${meta.id}`
        )
        uploaded.push(meta)
      } catch (err: any) {
        console.error('[ATTACHMENT DEBUG] ERROR Etapa 8/9: Fallo al subir justificante a Storage:', err)
        uploadErrorMsg = `No se pudo subir el justificante · ETAPA: UPLOAD STORAGE · ${err?.message || 'Error desconocido'}`
        break
      }
    }

    setIsUploadingAttachments(false)

    if (uploadErrorMsg || uploaded.length < stagedAttachments.length) {
      const errMsg = uploadErrorMsg || 'No se pudo subir el justificante · ETAPA: UPLOAD · Error desconocido'
      setAttachmentError(errMsg)
      // Si alguno se subió antes de fallar otro, intentar limpiarlo para evitar huérfanos
      uploaded.forEach((u) => deleteAttachment(u.storagePath).catch(() => {}))
      return { success: false, attachments: undefined, error: errMsg }
    }

    const finalAttachments = [...activeExisting, ...uploaded]
    console.log(`[ATTACHMENT DEBUG] Etapa 10: Metadata final preparada con ${finalAttachments.length} adjuntos`)
    return { success: true, attachments: finalAttachments }
  }

  const handleModalClose = () => {
    stagedAttachments.forEach((s) => URL.revokeObjectURL(s.localUrl))
    setStagedAttachments([])
    lastInitializedIdentityRef.current = null
    onClose()
  }

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

  const submit = async () => {
    if (typeConversionBlockReason) return
    if (!numericAmount || numericAmount <= 0) return
    if (!description.trim()) return

    // Procesar y subir adjuntos antes de guardar
    const { success, attachments: finalAttachments } = await processAttachmentsForSave(new Date(date).toISOString())
    if (!success) {
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

    // MODO EDICIÓN: Conversión de Tipo o cambio complejo
    if (isEditing && initialTransaction) {
      const initialRealType =
        initialTransaction.type === 'transfer' || (initialTransaction as any).specialType === 'cash_withdrawal'
          ? 'transfer'
          : initialTransaction.type === 'income'
          ? 'income'
          : 'expense'

      const isTypeChanged = type !== initialRealType

      if (isTypeChanged || (type === 'transfer' && onConvertMovementType)) {
        if (onConvertMovementType) {
          onConvertMovementType({
            id: initialTransaction.id,
            fromMedium: isInitialCash ? 'cash' : 'bank',
            targetType: type,
            targetMedium: sourceMedium,
            targetData: {
              amount: numericAmount,
              description: description.trim(),
              date: new Date(date).toISOString(),
              note: note.trim() || undefined,
              categoryId: type === 'expense' ? categoryId : undefined,
              accountId: sourceMedium === 'bank' ? accountId : undefined,
              expenseNature: type === 'expense' ? expenseNature : undefined,
              giftRecipient: isGiftsCategory && giftRecipient.trim() ? giftRecipient.trim() : undefined,
              isShared: type === 'expense' && isShared,
              paidBy: type === 'expense' && isShared ? paidBy : undefined,
              payerName: type === 'expense' && isShared && paidBy === 'contact' && payerName.trim() ? payerName.trim() : undefined,
              payerContactId: type === 'expense' && isShared && paidBy === 'contact' ? payerContactId : undefined,
              isBizum: sourceMedium === 'bank' ? isBizum : false,
              incomeKind: type === 'income' ? incomeKind : undefined,
              parentExpenseId: type === 'income' && incomeKind === 'reimbursement' && selectedReceivableShareId ? pendingReceivablesList.find((p) => p.shareId === selectedReceivableShareId)?.expenseTransactionId : undefined,
              expenseShareId: type === 'income' && incomeKind === 'reimbursement' && selectedReceivableShareId ? selectedReceivableShareId : undefined,
              fromType: type === 'transfer' ? (transferFrom === 'cash' ? 'cash' : 'account') : undefined,
              fromAccountId: type === 'transfer' && transferFrom !== 'cash' ? transferFrom : undefined,
              toType: type === 'transfer' ? (transferTo === 'cash' ? 'cash' : 'account') : undefined,
              toAccountId: type === 'transfer' && transferTo !== 'cash' ? transferTo : undefined,
              attachments: finalAttachments,
            },
            shares: sharesInput,
          })
          handleModalClose()
          return
        }
      }
    }

    // CASO TRANSFERENCIA (NUEVA)
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
      handleModalClose()
      return
    }

    // CASO INGRESO: Devolución / Cobro pendiente vinculado (NUEVO)
    if (!isEditing && type === 'income' && incomeKind === 'reimbursement' && selectedReceivableShareId) {
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
          handleModalClose()
          return
        }
      }
    }

    const finalParentExpenseId =
      type === 'income' && incomeKind === 'reimbursement'
        ? (selectedReceivableShareId
            ? pendingReceivablesList.find((p) => p.shareId === selectedReceivableShareId)?.expenseTransactionId || (initialTransaction as Transaction)?.parentExpenseId || (initialTransaction as CashTransaction)?.bankTransactionId
            : (initialTransaction as Transaction)?.parentExpenseId || (initialTransaction as CashTransaction)?.bankTransactionId)
        : type === 'expense'
        ? ((initialTransaction as Transaction)?.parentExpenseId || (initialTransaction as CashTransaction)?.bankTransactionId)
        : undefined

    const finalExpenseShareId =
      type === 'income' && incomeKind === 'reimbursement'
        ? (selectedReceivableShareId || (initialTransaction as Transaction)?.expenseShareId || (initialTransaction as CashTransaction)?.note?.match(/\[share:([^\]]+)\]/)?.[1])
        : type === 'expense'
        ? ((initialTransaction as Transaction)?.expenseShareId || (initialTransaction as CashTransaction)?.note?.match(/\[share:([^\]]+)\]/)?.[1])
        : undefined

    // CASO EFECTIVO
    if (sourceMedium === 'cash') {
      const cashNoteParts: string[] = []
      if (note.trim()) cashNoteParts.push(note.trim())
      if (finalExpenseShareId && !cashNoteParts.some((p) => p.includes(`[share:${finalExpenseShareId}]`))) {
        cashNoteParts.push(`[share:${finalExpenseShareId}]`)
      }
      const finalCashNote = cashNoteParts.join(' ') || undefined

      const cashPayload: CreateCashTransactionInput = {
        type: type === 'expense' ? 'expense' : 'income',
        amount: numericAmount,
        description: description.trim(),
        date: new Date(date).toISOString(),
        categoryId: type === 'expense' ? categoryId : undefined,
        note: finalCashNote,
        bankTransactionId: finalParentExpenseId,
        isShared: type === 'expense' && isShared,
        paidBy: type === 'expense' && isShared ? paidBy : undefined,
        payerName: type === 'expense' && isShared && paidBy === 'contact' && payerName.trim() ? payerName.trim() : undefined,
        payerContactId: type === 'expense' && isShared && paidBy === 'contact' ? payerContactId : undefined,
        paymentMethod: 'cash',
        attachments: finalAttachments,
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
      handleModalClose()
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
      parentExpenseId: finalParentExpenseId,
      expenseShareId: finalExpenseShareId,
      recurringPaymentId: (initialTransaction as Transaction)?.recurringPaymentId,
      isShared: type === 'expense' && isShared,
      paidBy: type === 'expense' && isShared ? paidBy : undefined,
      payerName: type === 'expense' && isShared && paidBy === 'contact' && payerName.trim() ? payerName.trim() : undefined,
      payerContactId: type === 'expense' && isShared && paidBy === 'contact' ? payerContactId : undefined,
      specialType: 'normal',
      expenseNature: type === 'expense' ? expenseNature : undefined,
      giftRecipient: isGiftsCategory && giftRecipient.trim() ? giftRecipient.trim() : undefined,
      paymentMethod: isBizum ? 'bizum' : 'bank',
      attachments: finalAttachments,
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

    handleModalClose()
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

        {/* Selector de Tipo de Movimiento (SOLO en modo edición) */}
        {isEditing && (
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Tipo de movimiento</label>
            <div className="segmented-control">
              <button
                type="button"
                className={`segmented-btn ${type === 'expense' ? 'active' : ''}`}
                onClick={() => setType('expense')}
              >
                <AppIcon name="trending-down" size={15} />
                <span>Gasto</span>
              </button>
              <button
                type="button"
                className={`segmented-btn ${type === 'income' ? 'active' : ''}`}
                onClick={() => setType('income')}
              >
                <AppIcon name="trending-up" size={15} />
                <span>Ingreso</span>
              </button>
              <button
                type="button"
                className={`segmented-btn ${type === 'transfer' ? 'active' : ''}`}
                onClick={() => {
                  setType('transfer')
                  if (!transferFrom) setTransferFrom(accountId || accounts[0]?.id || 'daily')
                  if (!transferTo) setTransferTo('cash')
                }}
              >
                <AppIcon name="arrow-left-right" size={15} />
                <span>Transferencia</span>
              </button>
            </div>
          </div>
        )}

        {/* Mensaje explicativo si la conversión de tipo está bloqueada por dependencias */}
        {typeConversionBlockReason && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontSize: '0.84rem',
              color: 'var(--text-danger, #ef4444)',
              marginBottom: 14,
              lineHeight: 1.45,
            }}
          >
            <span style={{ flexShrink: 0, marginTop: 2, display: 'inline-flex' }}>
              <AppIcon name="circle-alert" size={16} />
            </span>
            <span>{typeConversionBlockReason}</span>
          </div>
        )}

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
                {selectableCategories.map((c) => (
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

        {/* Sección de Justificantes / Adjuntos */}
        {type !== 'transfer' && (
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
              Boolean(typeConversionBlockReason) ||
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

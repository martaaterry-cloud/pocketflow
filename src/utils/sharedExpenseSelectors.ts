import { classifyEconomicMovements, economicDate, inEconomicMonth, inEconomicRange, isPersonalExpense, roundMoney, type EconomicMovement, type EconomicSource } from './economicClassification'
import type {
  Category,
  ExpenseShare,
  ExpenseShareStatus,
  Transaction,
  CashTransaction,
  RecurringPayment,
  RecurringSharingTemplate,
  RecurringSharingParticipant,
} from '../models/finance'
import { normalizeCategoryAlias } from './categoryNormalization'
import { toUnifiedMovements, type UnifiedMovement } from './unifiedMovementSelectors'

export interface SplitResult {
  participantName: string
  contactId?: string
  isPayerShare: boolean
  isUserShare?: boolean
  amount: number
}

export interface NetCategoryExpense {
  id: string
  name: string
  color: string
  icon: string
  amount: number
  percentage: number
}

/**
 * Reembolsos vinculados a un gasto concreto (por parentExpenseId / bankTransactionId),
 * sumando tanto reembolsos bancarios (Bizum) como reembolsos recibidos en efectivo.
 *
 * Si se dispone de las partes (ExpenseShare):
 * - Suma únicamente el appliedAmount de las partes de terceros (min(expected, received)).
 * - El extra recibido por sobrepago de un tercero NUNCA reduce el gasto propio del usuario.
 */
export function selectLinkedReimbursementsForExpense(
  expenseId: string,
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = [],
  expenseShares: ExpenseShare[] = []
): number {
  const bankExpense = transactions.find((t) => t.id === expenseId)
  if (bankExpense && (bankExpense.type === 'transfer' || bankExpense.specialType === 'cash_withdrawal' || bankExpense.specialType === 'transfer' || bankExpense.specialType === 'account_adjustment')) {
    return 0
  }

  // 1. Si disponemos de las cuotas de reparto de este gasto
  const sharesForExpense = (expenseShares || []).filter((s) => s.expenseTransactionId === expenseId)
  const otherShares = sharesForExpense.filter(
    (s) => !s.isPayerShare && !s.isUserShare && s.participantName.toLowerCase() !== 'tú'
  )

  if (otherShares.length > 0) {
    let totalApplied = 0
    otherShares.forEach((share) => {
      const { appliedAmount } = selectExpenseShareStatus(share, transactions, cashTransactions)
      totalApplied += appliedAmount
    })
    return Math.round(totalApplied * 100) / 100
  }

  // 2. Fallback para gastos antiguos sin registro explícito en expenseShares
  const bankReimbursements = transactions.filter(
    (t) => t.type === 'income' && t.specialType !== 'account_adjustment' &&
      (t.incomeKind === 'reimbursement' || t.specialType === 'reimbursement') && t.parentExpenseId === expenseId
  )
  const cashReimbursements = cashTransactions.filter(
    (c) => c.type === 'income' && c.bankTransactionId === expenseId
  )
  const rawSum =
    bankReimbursements.reduce((acc, t) => acc + t.amount, 0) +
    cashReimbursements.reduce((acc, c) => acc + c.amount, 0)

  const expenseAmount = bankExpense?.amount ?? cashTransactions.find((c) => c.id === expenseId)?.amount ?? rawSum
  return Math.round(Math.min(expenseAmount, rawSum) * 100) / 100
}

export interface GrossExpenseItem {
  id: string
  description: string
  amount: number
  date: string
  categoryId?: string
  paymentMethod: 'bank' | 'bizum' | 'cash'
  isCash?: boolean
  payerName?: string
  rawTx: Transaction | CashTransaction
}

export interface GrossExpensesBreakdown {
  total: number
  bank: number
  bizum: number
  cash: number
  items: GrossExpenseItem[]
}

/**
 * Desglose canónico de gasto bruto por medio de pago (Banco/tarjeta, Bizum, Efectivo).
 * Reutiliza exactamente el mismo universo de movimientos que el gasto bruto del periodo.
 */
export function selectGrossExpensesByPaymentMethod(
  transactions: Transaction[] = [], cashTransactions: CashTransaction[] = [],
  referenceDate: Date = new Date(), scope: 'month' | 'all' = 'month',
  source: EconomicSource = 'total'
): GrossExpensesBreakdown {
  const items: GrossExpenseItem[] = classifyEconomicMovements(transactions, cashTransactions)
    .filter((m) => isPersonalExpense(m) && (source === 'total' || m.source === source) && inEconomicMonth(m.transaction.date, referenceDate, scope))
    .map((movement) => {
      const t = movement.transaction
      const gross = roundMoney(Math.abs(Number(t.amount) || 0))
      return { id: t.id, description: t.description, amount: gross, date: t.date,
        categoryId: t.categoryId, paymentMethod: t.paymentMethod || (movement.source === 'cash' ? 'cash' : 'bank'),
        isCash: movement.source === 'cash', payerName: t.payerName, rawTx: t }
    }).sort((a, b) => economicDate(b.date).getTime() - economicDate(a.date).getTime())
  const sum = (method: 'bank' | 'bizum' | 'cash') => roundMoney(items.filter((i) => i.paymentMethod === method).reduce((acc, i) => acc + i.amount, 0))
  const bank = sum('bank'), bizum = sum('bizum'), cash = sum('cash')
  return { items, bank, bizum, cash, total: roundMoney(bank + bizum + cash) }
}

/**
 * Gasto bruto del periodo = suma de todos los gastos (expense) realizados en el periodo.
 * Si un gasto compartido fue pagado por otra persona (paidBy === 'contact'), no cuenta como desembolso bancario inicial del usuario.
 */
export function selectGrossExpensesForPeriod(
  transactions: Transaction[], referenceDate: Date = new Date(), scope: 'month' | 'all' = 'month',
  cashTransactions: CashTransaction[] = []
): number {
  return selectGrossExpensesByPaymentMethod(transactions, cashTransactions, referenceDate, scope).total
}

export const selectGrossExpenses = selectGrossExpensesForPeriod

/**
 * Reembolsos vinculados a los gastos de este periodo.
 * Solo descuenta reembolsos asociados a gastos cuya fecha pertenece al periodo,
 * independientemente de la fecha en que se recibió el Bizum o efectivo.
 */
export function selectLinkedReimbursementsForPeriod(
  transactions: Transaction[], referenceDate: Date = new Date(), scope: 'month' | 'all' = 'month',
  cashTransactions: CashTransaction[] = [], expenseShares: ExpenseShare[] = [], source: EconomicSource = 'total'
): number {
  return selectEconomicSummary(transactions, cashTransactions, referenceDate, scope, expenseShares, source).linkedReimbursements
}

/**
 * Reembolsos recibidos en el periodo (flujo de caja de entrada total, banco + efectivo).
 * Incluye cualquier ingreso de reembolso que entró en este mes.
 */
export function selectReimbursementsReceived(
  transactions: Transaction[], referenceDate: Date = new Date(), scope: 'month' | 'all' = 'month',
  cashTransactions: CashTransaction[] = [], source: EconomicSource = 'total'
): number {
  return selectEconomicSummary(transactions, cashTransactions, referenceDate, scope, [], source).reimbursements
}

/**
 * Gasto neto personal del periodo:
 * Para cada gasto realizado en el periodo: net = max(0, expense.amount - linkedReimbursements).
 * Suma matemática de todos los netos.
 */
export function selectNetPersonalExpensesForPeriod(
  transactions: Transaction[], referenceDate: Date = new Date(), scope: 'month' | 'all' = 'month',
  cashTransactions: CashTransaction[] = [], expenseShares: ExpenseShare[] = []
): number {
  // Esta API conserva su ámbito bancario. Total utiliza selectEconomicSummary.
  return selectEconomicSummary(transactions, cashTransactions, referenceDate, scope, expenseShares, 'bank').netExpenses
}

export const selectNetPersonalExpenses = selectNetPersonalExpensesForPeriod

/**
 * Gasto neto personal agrupado por categoría para el periodo.
 * Hereda la categoría del gasto original y nunca produce importes negativos.
 */
export function selectNetExpensesByCategory(
  transactions: Transaction[], categories: Category[], referenceDate: Date = new Date(), scope: 'month' | 'all' = 'month',
  cashTransactions: CashTransaction[] = [], expenseShares: ExpenseShare[] = [], source: EconomicSource = 'total'
): NetCategoryExpense[] {
  return selectEconomicCategoryExpenses(transactions, cashTransactions, categories, referenceDate, scope, expenseShares, source)
}

/**
 * Reparto de un gasto a partes iguales con precisión exacta de céntimos.
 * Si hay resto de división, el pagador asume la diferencia para que los contactos
 * tengan importes redondeados (o viceversa), garantizando que la suma matemática
 * de las partes coincida exactamente con el importe total.
 *
 * Soporta tanto "Yo pagué" (paidBy === 'user') como "Pagó otra persona" (paidBy === 'contact').
 */
export function splitExpenseEqually(
  totalAmount: number,
  participants: { name: string; contactId?: string }[],
  includeSelf: boolean,
  payerName = 'Tú',
  paidBy: 'user' | 'contact' = 'user',
  actualPayerName = 'Contacto',
  actualPayerContactId?: string
): SplitResult[] {
  const cleanTotal = Math.round(Number(totalAmount) * 100) / 100
  if (cleanTotal <= 0) return []

  const totalCents = Math.round(cleanTotal * 100)
  const isUserPayer = paidBy !== 'contact'

  // Si el usuario pagó (comportamiento canónico original):
  if (isUserPayer) {
    const count = participants.length + (includeSelf ? 1 : 0)
    if (count === 0) return []

    const baseCents = Math.floor(totalCents / count)
    let remainder = totalCents % count

    const results: SplitResult[] = []

    participants.forEach((p) => {
      let cents = baseCents
      if (remainder > 0) {
        cents += 1
        remainder -= 1
      }
      results.push({
        participantName: p.name.trim(),
        contactId: p.contactId,
        isPayerShare: false,
        isUserShare: false,
        amount: Math.round(cents) / 100,
      })
    })

    if (includeSelf) {
      let payerCents = baseCents
      if (remainder > 0) {
        payerCents += remainder
      }
      results.unshift({
        participantName: payerName,
        isPayerShare: true,
        isUserShare: false,
        amount: Math.round(payerCents) / 100,
      })
    }

    return results
  }

  // Si pagó otra persona (paidBy === 'contact'):
  const effectivePayerName = actualPayerName.trim() || 'Contacto'
  const filteredOthers = participants.filter(
    (p) =>
      p.name.trim().toLowerCase() !== effectivePayerName.toLowerCase() &&
      p.name.trim().toLowerCase() !== 'tú'
  )

  const count = 1 + (includeSelf ? 1 : 0) + filteredOthers.length
  if (count === 0) return []

  const baseCents = Math.floor(totalCents / count)
  let remainder = totalCents % count

  const results: SplitResult[] = []

  // Cuota del usuario ('Tú')
  if (includeSelf) {
    results.push({
      participantName: 'Tú',
      isPayerShare: false,
      isUserShare: true,
      amount: Math.round(baseCents) / 100,
    })
  }

  // Otros participantes
  filteredOthers.forEach((p) => {
    results.push({
      participantName: p.name.trim(),
      contactId: p.contactId,
      isPayerShare: false,
      isUserShare: false,
      amount: Math.round(baseCents) / 100,
    })
  })

  // Cuota del pagador externo (asume el resto de la división para cuadre total exacto)
  let payerCents = baseCents
  if (remainder > 0) {
    payerCents += remainder
  }
  results.unshift({
    participantName: effectivePayerName,
    contactId: actualPayerContactId,
    isPayerShare: true,
    isUserShare: false,
    amount: Math.round(payerCents) / 100,
  })

  return results
}

export type SplitMode = 'equal' | 'custom'

export interface CustomParticipantInput {
  name: string
  contactId?: string
  amount: number
  isPayerShare?: boolean
  isUserShare?: boolean
}

export interface CustomSplitCalculation {
  isValid: boolean
  totalCents: number
  assignedCents: number
  remainingCents: number
  remainingAmount: number
  errorMessage?: string
  shares: SplitResult[]
}

/**
 * Calcula y valida un reparto personalizado de gasto compartido.
 * Trabaja en céntimos enteros para evitar problemas de precisión flotante.
 */
export function calculateCustomSplit(
  totalExpenseAmount: number,
  participants: CustomParticipantInput[],
  paidBy: 'user' | 'contact' = 'user',
  actualPayerName = 'Contacto',
  actualPayerContactId?: string
): CustomSplitCalculation {
  const cleanTotal = Math.round(Number(totalExpenseAmount) * 100) / 100
  const totalCents = Math.round(cleanTotal * 100)

  let assignedCents = 0
  const shares: SplitResult[] = []

  participants.forEach((p) => {
    const pCents = Math.round((Number(p.amount) || 0) * 100)
    assignedCents += pCents

    shares.push({
      participantName: p.name.trim(),
      contactId: p.contactId,
      isPayerShare: Boolean(p.isPayerShare),
      isUserShare: Boolean(p.isUserShare),
      amount: Math.round(pCents) / 100,
    })
  })

  const remainingCents = totalCents - assignedCents
  const remainingAmount = Math.round(remainingCents) / 100

  let errorMessage: string | undefined
  if (remainingCents > 0) {
    errorMessage = `Faltan ${remainingAmount.toFixed(2).replace('.', ',')} € por asignar.`
  } else if (remainingCents < 0) {
    errorMessage = `Has asignado ${(Math.abs(remainingAmount)).toFixed(2).replace('.', ',')} € de más.`
  }

  return {
    isValid: remainingCents === 0 && participants.length > 0 && totalCents > 0,
    totalCents,
    assignedCents,
    remainingCents,
    remainingAmount,
    errorMessage,
    shares,
  }
}

export interface CanonicalRecurringSharesResult {
  shares: SplitResult[]
  userShareAmount: number
  payerShareAmount: number
  totalAmount: number
  isValid: boolean
  errorMessage?: string
}

/**
 * Normaliza y deduplica semánticamente una plantilla de reparto recurrente.
 * Garantiza:
 * 1) Exactamente una representación canónica de la usuaria ("Tú"), si includePayer es true.
 * 2) Exactamente una representación del pagador real (si paidBy === 'contact').
 * 3) Contactos externos deduplicados respetando IDs estables (dos contactos con mismo nombre pero distinto ID se conservan).
 * 4) Suma de cuotas == importe total bruto (con redondeo a céntimos).
 */
export function normalizeRecurringSharingTemplate(
  template: RecurringSharingTemplate | undefined,
  totalAmount: number,
  paidBy: 'user' | 'contact' = 'user',
  payerName?: string,
  payerContactId?: string
): RecurringSharingTemplate {
  const cleanAmount = Math.max(0, Math.round(Number(totalAmount) * 100) / 100)
  const isContactPaid = paidBy === 'contact' || template?.payer === 'contact'
  const effectivePayerName = (payerName || template?.payerName || 'Contacto').trim()
  const effectivePayerContactId = payerContactId || template?.payerContactId

  const rawParticipants = template?.participants ?? []
  const splitType = template?.splitType || 'equal'
  const includePayer = template?.includePayer ?? true

  // 1. Separar representaciones de la usuaria, pagador y otros participantes
  const userEntries = rawParticipants.filter(
    (p) => p.isUserShare || p.name.trim().toLowerCase() === 'tú' || p.contactId === 'user'
  )

  // Participantes puramente externos (ni Tú ni el pagador externo)
  const rawOthers = rawParticipants.filter((p) => {
    const isUser = p.isUserShare || p.name.trim().toLowerCase() === 'tú' || p.contactId === 'user'
    if (isUser) return false
    if (isContactPaid) {
      const isPayer =
        (Boolean(effectivePayerContactId) && p.contactId === effectivePayerContactId) ||
        p.name.trim().toLowerCase() === effectivePayerName.toLowerCase()
      if (isPayer) return false
    }
    return true
  })

  // Deduplicar otros participantes respetando contactId
  const cleanOthers: RecurringSharingParticipant[] = []
  rawOthers.forEach((p) => {
    const trimmedName = p.name.trim()
    if (!trimmedName) return
    const exists = cleanOthers.some((existing) => {
      if (p.contactId && existing.contactId) {
        return p.contactId === existing.contactId
      }
      if (!p.contactId && !existing.contactId) {
        return existing.name.trim().toLowerCase() === trimmedName.toLowerCase()
      }
      return false
    })
    if (!exists) {
      cleanOthers.push({
        name: trimmedName,
        contactId: p.contactId,
        amount: Math.round(Number(p.amount || 0) * 100) / 100,
        isUserShare: false,
      })
    } else {
      // Si existe duplicado en custom, sumamos el importe para no perder dinero
      const existingIdx = cleanOthers.findIndex((existing) => {
        if (p.contactId && existing.contactId) return p.contactId === existing.contactId
        return existing.name.trim().toLowerCase() === trimmedName.toLowerCase()
      })
      if (existingIdx >= 0) {
        cleanOthers[existingIdx].amount =
          Math.round((cleanOthers[existingIdx].amount + Number(p.amount || 0)) * 100) / 100
      }
    }
  })

  if (splitType === 'equal') {
    // Calculamos cuotas iguales limpias
    const splitResults = splitExpenseEqually(
      cleanAmount,
      cleanOthers,
      includePayer,
      'Tú',
      isContactPaid ? 'contact' : 'user',
      effectivePayerName,
      effectivePayerContactId
    )

    // Almacenamos los participantes externos en la plantilla
    const normalizedParticipants: RecurringSharingParticipant[] = cleanOthers.map((p) => {
      const share = splitResults.find(
        (s) =>
          (p.contactId && s.contactId === p.contactId) ||
          s.participantName.trim().toLowerCase() === p.name.trim().toLowerCase()
      )
      return {
        name: p.name,
        contactId: p.contactId,
        amount: share?.amount ?? 0,
        isUserShare: false,
      }
    })

    return {
      splitType: 'equal',
      includePayer,
      payer: isContactPaid ? 'contact' : 'user',
      payerName: isContactPaid ? effectivePayerName : undefined,
      payerContactId: isContactPaid ? effectivePayerContactId : undefined,
      settlementPaymentMethod: template?.settlementPaymentMethod,
      settlementAccountId: template?.settlementAccountId,
      participants: normalizedParticipants,
    }
  }

  // splitType === 'custom'
  let userAmount = 0
  if (includePayer) {
    userAmount = userEntries.reduce((sum, u) => sum + Number(u.amount || 0), 0)
    userAmount = Math.round(userAmount * 100) / 100
  }

  const normalizedParticipants: RecurringSharingParticipant[] = cleanOthers.map((p) => ({
    name: p.name,
    contactId: p.contactId,
    amount: Math.round(Number(p.amount || 0) * 100) / 100,
    isUserShare: false,
  }))

  if (includePayer && userAmount > 0) {
    normalizedParticipants.unshift({
      name: 'Tú',
      amount: userAmount,
      isUserShare: true,
    })
  }

  return {
    splitType: 'custom',
    includePayer,
    payer: isContactPaid ? 'contact' : 'user',
    payerName: isContactPaid ? effectivePayerName : undefined,
    payerContactId: isContactPaid ? effectivePayerContactId : undefined,
    settlementPaymentMethod: template?.settlementPaymentMethod,
    settlementAccountId: template?.settlementAccountId,
    participants: normalizedParticipants,
  }
}

/**
 * Obtiene el desglose canónico completo de cuotas para un gasto recurrente,
 * deduplicando la usuaria y el pagador y garantizando la invariante de suma = total.
 */
export function getCanonicalRecurringShares(
  rec: Pick<RecurringPayment, 'amount' | 'isShared' | 'paidBy' | 'payerName' | 'payerContactId' | 'sharingTemplate'>,
  monthsCount = 1
): CanonicalRecurringSharesResult {
  const effectiveMonths = Math.max(1, monthsCount)
  const totalAmount = Math.max(0, Math.round((Number(rec.amount) || 0) * effectiveMonths * 100) / 100)

  if (!rec.isShared || totalAmount <= 0) {
    return {
      shares: [
        {
          participantName: 'Tú',
          isPayerShare: true,
          isUserShare: false,
          amount: totalAmount,
        },
      ],
      userShareAmount: totalAmount,
      payerShareAmount: totalAmount,
      totalAmount,
      isValid: true,
    }
  }

  const isContactPaid = rec.paidBy === 'contact' || rec.sharingTemplate?.payer === 'contact'
  const payerName = (rec.payerName || rec.sharingTemplate?.payerName || 'Contacto').trim()
  const payerContactId = rec.payerContactId || rec.sharingTemplate?.payerContactId
  const normTpl = normalizeRecurringSharingTemplate(
    rec.sharingTemplate,
    totalAmount,
    isContactPaid ? 'contact' : 'user',
    payerName,
    payerContactId
  )

  const splitType = normTpl.splitType
  const includePayer = normTpl.includePayer

  if (splitType === 'equal') {
    const externalParticipants = normTpl.participants.filter(
      (p) => !p.isUserShare && p.name.trim().toLowerCase() !== 'tú'
    )
    const shares = splitExpenseEqually(
      totalAmount,
      externalParticipants,
      includePayer,
      'Tú',
      isContactPaid ? 'contact' : 'user',
      payerName,
      payerContactId
    )

    const userShare = shares.find(
      (s) => s.isUserShare || s.participantName.toLowerCase() === 'tú'
    )
    const payerShare = shares.find((s) => s.isPayerShare)

    const sum = shares.reduce((acc, s) => acc + s.amount, 0)
    const isValid = Math.abs(sum - totalAmount) < 0.015

    return {
      shares,
      userShareAmount: includePayer ? (userShare?.amount ?? (isContactPaid ? 0 : totalAmount)) : 0,
      payerShareAmount: payerShare?.amount ?? totalAmount,
      totalAmount,
      isValid,
    }
  }

  // splitType === 'custom'
  const rawParticipants = normTpl.participants
  const userEntry = rawParticipants.find((p) => p.isUserShare || p.name.trim().toLowerCase() === 'tú')
  const userAmount = userEntry ? userEntry.amount : 0

  const externalList = rawParticipants.filter(
    (p) =>
      !p.isUserShare &&
      p.name.trim().toLowerCase() !== 'tú' &&
      p.name.trim().toLowerCase() !== payerName.toLowerCase()
  )

  const shares: SplitResult[] = []

  if (isContactPaid) {
    if (includePayer && userAmount > 0) {
      shares.push({
        participantName: 'Tú',
        isPayerShare: false,
        isUserShare: true,
        amount: userAmount,
      })
    }

    externalList.forEach((p) => {
      shares.push({
        participantName: p.name,
        contactId: p.contactId,
        isPayerShare: false,
        isUserShare: false,
        amount: p.amount,
      })
    })

    const othersTotal = shares.reduce((acc, s) => acc + s.amount, 0)
    const payerAmount = Math.max(0, Math.round((totalAmount - othersTotal) * 100) / 100)

    shares.unshift({
      participantName: payerName,
      contactId: payerContactId,
      isPayerShare: true,
      isUserShare: false,
      amount: payerAmount,
    })

    const sum = shares.reduce((acc, s) => acc + s.amount, 0)
    const isValid = Math.abs(sum - totalAmount) < 0.015

    return {
      shares,
      userShareAmount: includePayer ? userAmount : 0,
      payerShareAmount: payerAmount,
      totalAmount,
      isValid,
      errorMessage: !isValid ? `El reparto no suma ${totalAmount.toFixed(2)} €` : undefined,
    }
  } else {
    // Paga usuario
    externalList.forEach((p) => {
      shares.push({
        participantName: p.name,
        contactId: p.contactId,
        isPayerShare: false,
        isUserShare: false,
        amount: p.amount,
      })
    })

    const externalTotal = shares.reduce((acc, s) => acc + s.amount, 0)
    const userAmountCalculated =
      userAmount > 0 ? userAmount : Math.max(0, Math.round((totalAmount - externalTotal) * 100) / 100)

    if (includePayer) {
      shares.unshift({
        participantName: 'Tú',
        isPayerShare: true,
        isUserShare: false,
        amount: userAmountCalculated,
      })
    }

    const sum = shares.reduce((acc, s) => acc + s.amount, 0)
    const isValid = Math.abs(sum - totalAmount) < 0.015

    return {
      shares,
      userShareAmount: includePayer ? userAmountCalculated : 0,
      payerShareAmount: userAmountCalculated,
      totalAmount,
      isValid,
    }
  }
}

/**
 * Ingresos reales = suma de transacciones income que NO son reembolsos.
 */
export function selectRealIncome(
  transactions: Transaction[], referenceDate: Date = new Date(), scope: 'month' | 'all' = 'month',
  cashTransactions: CashTransaction[] = [], source: EconomicSource = 'total'
): number {
  return selectEconomicSummary(transactions, cashTransactions, referenceDate, scope, [], source).realIncome
}

/**
 * Calcula el estado de una parte de gasto (ExpenseShare) en base a los reembolsos recibidos (banco o efectivo)
 * y a los importes perdonados/ajustados explícitos.
 */
export function selectExpenseShareStatus(
  share: ExpenseShare,
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = []
): {
  expectedAmount: number
  receivedAmount: number
  appliedAmount: number
  extraAmount: number
  forgivenAmount: number
  pendingAmount: number
  status: ExpenseShareStatus
  reimbursements: (Transaction | CashTransaction)[]
} {
  const bankReimbursements = transactions.filter(
    (t) =>
      t.type === 'income' &&
      t.incomeKind === 'reimbursement' &&
      (t.expenseShareId === share.id ||
        (t.parentExpenseId === share.expenseTransactionId && !t.expenseShareId && !share.isPayerShare))
  )

  const cashReimbursements = cashTransactions.filter(
    (c) =>
      c.type === 'income' &&
      c.bankTransactionId === share.expenseTransactionId &&
      (!c.note?.includes('[share:') || c.note.includes(`[share:${share.id}]`))
  )

  const allReimbursements: (Transaction | CashTransaction)[] = [...bankReimbursements, ...cashReimbursements]
  const receivedAmount = Math.round(allReimbursements.reduce((sum, t) => sum + t.amount, 0) * 100) / 100
  const expectedAmount = Math.round(share.expectedAmount * 100) / 100
  const appliedAmount = Math.min(expectedAmount, receivedAmount)
  const extraAmount = Math.max(0, Math.round((receivedAmount - expectedAmount) * 100) / 100)
  const forgivenAmount = Math.max(0, Math.round((share.forgivenAmount ?? 0) * 100) / 100)
  const pendingAmount = Math.max(0, Math.round((expectedAmount - appliedAmount - forgivenAmount) * 100) / 100)

  let status: ExpenseShareStatus = 'pending'
  if (pendingAmount <= 0) {
    status = 'received'
  } else if (receivedAmount > 0 || forgivenAmount > 0) {
    status = 'partial'
  }

  return {
    expectedAmount,
    receivedAmount,
    appliedAmount,
    extraAmount,
    forgivenAmount,
    pendingAmount,
    status,
    reimbursements: allReimbursements,
  }
}

/**
 * Calcula el estado de una parte por pagar del usuario ante un acreedor (quien pagó el gasto).
 * Descuenta los pagos reales efectuados por el usuario hacia dicho gasto o cuota y los importes perdonados/ajustados.
 * Si el usuario paga más del importe debido (sobrepago), salda la deuda a 0 € sin generar deudas negativas ni inversas.
 */
export function selectExpensePayableStatus(
  share: ExpenseShare,
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = []
): {
  expectedAmount: number
  paidAmount: number
  appliedAmount: number
  extraAmount: number
  forgivenAmount: number
  pendingAmount: number
  status: 'pending' | 'partial' | 'settled'
  payments: (Transaction | CashTransaction)[]
} {
  // Transacciones bancarias de pago al acreedor vinculadas a la cuota o al gasto origen
  const bankPayments = transactions.filter(
    (t) =>
      t.type === 'expense' &&
      (t.expenseShareId === share.id ||
        (t.parentExpenseId === share.expenseTransactionId && !t.isShared))
  )

  // Transacciones de efectivo de pago al acreedor
  const cashPayments = cashTransactions.filter(
    (c) =>
      c.type === 'expense' &&
      (c.bankTransactionId === share.expenseTransactionId &&
        (!c.note?.includes('[share:') || c.note.includes(`[share:${share.id}]`)))
  )

  const allPayments = [...bankPayments, ...cashPayments]
  const paidAmount = Math.round(allPayments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100
  const expectedAmount = Math.round(share.expectedAmount * 100) / 100
  const forgivenAmount = Math.max(0, Math.round((share.forgivenAmount ?? 0) * 100) / 100)
  const effectiveDue = Math.max(0, Math.round((expectedAmount - forgivenAmount) * 100) / 100)
  const appliedAmount = Math.min(effectiveDue, paidAmount)
  const extraAmount = Math.max(0, Math.round((paidAmount - effectiveDue) * 100) / 100)
  const pendingAmount = Math.max(0, Math.round((effectiveDue - appliedAmount) * 100) / 100)

  let status: 'pending' | 'partial' | 'settled' = 'pending'
  if (pendingAmount <= 0) {
    status = 'settled'
  } else if (paidAmount > 0 || forgivenAmount > 0) {
    status = 'partial'
  }

  return {
    expectedAmount,
    paidAmount,
    appliedAmount,
    extraAmount,
    forgivenAmount,
    pendingAmount,
    status,
    payments: allPayments,
  }
}

/**
 * Detecta cuotas compartidas (ExpenseShare) huérfanas cuyo gasto origen
 * no existe ni en transacciones bancarias ni en transacciones de efectivo.
 */
export function selectOrphanExpenseShares(
  expenseShares: ExpenseShare[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = []
): ExpenseShare[] {
  const txIds = new Set(transactions.map((t) => t.id))
  const cashIds = new Set(cashTransactions.map((c) => c.id))
  return expenseShares.filter(
    (s) => !txIds.has(s.expenseTransactionId) && !cashIds.has(s.expenseTransactionId)
  )
}

/**
 * Pendiente total por recuperar de todas las partes de gastos compartidos ("Por cobrar").
 */
export function selectPendingReimbursements(
  shares: ExpenseShare[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = []
): number {
  const debtors = selectPendingDebtors(shares, transactions, cashTransactions)
  const total = debtors.reduce((sum, d) => sum + d.totalPending, 0)
  return Math.round(total * 100) / 100
}

/**
 * Detalle completo de un gasto compartido (banco o efectivo).
 */
export function selectExpenseShareDetails(
  expenseTransactionId: string,
  transactions: Transaction[] = [],
  shares: ExpenseShare[] = [],
  cashTransactions: CashTransaction[] = []
) {
  const expenseTx =
    transactions.find((t) => t.id === expenseTransactionId) ||
    cashTransactions.find((c) => c.id === expenseTransactionId)
  const expenseShares = shares.filter((s) => s.expenseTransactionId === expenseTransactionId)

  const isContactPaid = expenseTx?.paidBy === 'contact'
  const payerShare = expenseShares.find((s) => s.isPayerShare)
  const externalShares = expenseShares.filter((s) => !s.isPayerShare)

  const externalSharesWithStatus = externalShares.map((s) => {
    const isUserShare = Boolean(s.isUserShare) || s.participantName.toLowerCase() === 'tú' || (!s.isPayerShare && !s.contactId)

    if (isContactPaid && isUserShare) {
      const payableStatus = selectExpensePayableStatus(s, transactions, cashTransactions)
      return {
        share: s,
        isPayable: true,
        expectedAmount: payableStatus.expectedAmount,
        receivedAmount: payableStatus.paidAmount,
        paidAmount: payableStatus.paidAmount,
        appliedAmount: payableStatus.appliedAmount,
        extraAmount: payableStatus.extraAmount,
        forgivenAmount: payableStatus.forgivenAmount,
        pendingAmount: payableStatus.pendingAmount,
        status: (payableStatus.status === 'settled' ? 'received' : payableStatus.status) as ExpenseShareStatus,
        payableRawStatus: payableStatus.status,
        reimbursements: payableStatus.payments,
        payments: payableStatus.payments,
      }
    }

    const shareStatus = selectExpenseShareStatus(s, transactions, cashTransactions)
    return {
      share: s,
      isPayable: false,
      ...shareStatus,
      paidAmount: shareStatus.receivedAmount,
      payableRawStatus: shareStatus.status === 'received' ? 'settled' : shareStatus.status,
      payments: shareStatus.reimbursements,
    }
  })

  const userShare = expenseShares.find(
    (s) => s.isUserShare || s.participantName.toLowerCase() === 'tú' || (!s.isPayerShare && !s.contactId)
  )
  const userPayableStatus = userShare
    ? selectExpensePayableStatus(userShare, transactions, cashTransactions)
    : null

  const totalExpected = Math.round(expenseShares.reduce((acc, s) => acc + s.expectedAmount, 0) * 100) / 100
  const totalRecovered = Math.round(
    externalSharesWithStatus.reduce((acc, s) => acc + s.appliedAmount, 0) * 100
  ) / 100
  const totalForgiven = Math.round(
    externalSharesWithStatus.reduce((acc, s) => acc + s.forgivenAmount, 0) * 100
  ) / 100
  const totalPendingToRecover = Math.round(
    externalSharesWithStatus.reduce((acc, s) => acc + s.pendingAmount, 0) * 100
  ) / 100

  return {
    expenseTx,
    isContactPaid,
    payerShare,
    externalSharesWithStatus,
    userShare,
    userPayableStatus,
    totalExpected,
    totalRecovered,
    totalForgiven,
    totalPendingToRecover,
    isFullyReimbursed: totalPendingToRecover <= 0,
  }
}

/**
 * Lista agrupada de deudores con saldo pendiente para selector rápido ("Por cobrar").
 */
export function selectPendingDebtors(
  shares: ExpenseShare[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = []
) {
  const map = new Map<string, {
    contactId?: string
    name: string
    totalPending: number
    pendingShares: {
      share: ExpenseShare
      expectedAmount: number
      appliedAmount: number
      forgivenAmount: number
      pendingAmount: number
      expenseDescription: string
      expenseDate: string
    }[]
  }>()

  shares.forEach((s) => {
    const tx =
      transactions.find((t) => t.id === s.expenseTransactionId) ||
      cashTransactions.find((c) => c.id === s.expenseTransactionId)
    if (!tx) return // Defensa: ignorar cuota cuyo gasto origen no existe

    // Si el gasto lo pagó un tercero, los demás no le deben al usuario
    if (tx.paidBy === 'contact') return

    // La cuota del propio usuario o pagador no es una deuda por cobrar
    if (s.isPayerShare || s.isUserShare || s.participantName.toLowerCase() === 'tú') return

    const { expectedAmount, appliedAmount, forgivenAmount, pendingAmount } = selectExpenseShareStatus(s, transactions, cashTransactions)
    if (pendingAmount > 0) {
      const key = s.contactId || s.participantName.toLowerCase().trim()
      const existing = map.get(key) ?? {
        contactId: s.contactId,
        name: s.participantName,
        totalPending: 0,
        pendingShares: [],
      }

      existing.totalPending = Math.round((existing.totalPending + pendingAmount) * 100) / 100
      existing.pendingShares.push({
        share: s,
        expectedAmount,
        appliedAmount,
        forgivenAmount,
        pendingAmount,
        expenseDescription: tx.description || 'Gasto compartido',
        expenseDate: tx.date || s.createdAt || new Date().toISOString(),
      })
      map.set(key, existing)
    }
  })

  return Array.from(map.values()).sort((a, b) => b.totalPending - a.totalPending)
}

export const selectPendingReimbursementsByContact = selectPendingDebtors

/**
 * Lista agrupada de deudas que el usuario tiene pendientes de pagar a otras personas ("Por pagar").
 */
export function selectPendingPayables(
  shares: ExpenseShare[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = []
): {
  creditorContactId?: string
  creditorName: string
  totalPending: number
  pendingShares: {
    share: ExpenseShare
    expectedAmount: number
    appliedAmount: number
    forgivenAmount: number
    pendingAmount: number
    expenseDescription: string
    expenseDate: string
  }[]
}[] {
  const map = new Map<string, {
    creditorContactId?: string
    creditorName: string
    totalPending: number
    pendingShares: {
      share: ExpenseShare
      expectedAmount: number
      appliedAmount: number
      forgivenAmount: number
      pendingAmount: number
      expenseDescription: string
      expenseDate: string
    }[]
  }>()

  shares.forEach((s) => {
    const parentTx =
      transactions.find((t) => t.id === s.expenseTransactionId) ||
      cashTransactions.find((c) => c.id === s.expenseTransactionId)
    if (!parentTx) return

    // Solo cuotas de gastos pagados por un tercero (paidBy === 'contact') que correspondan a la parte del usuario
    const isContactPaid = parentTx.paidBy === 'contact'
    const isUserShare = Boolean(s.isUserShare) || s.participantName.toLowerCase() === 'tú' || (!s.isPayerShare && !s.contactId)
    if (!isContactPaid || !isUserShare) return

    const { expectedAmount, appliedAmount, forgivenAmount, pendingAmount } = selectExpensePayableStatus(s, transactions, cashTransactions)
    if (pendingAmount > 0) {
      const creditorName = parentTx.payerName || 'Contacto'
      const creditorKey = parentTx.payerContactId || creditorName.toLowerCase().trim()

      const existing = map.get(creditorKey) ?? {
        creditorContactId: parentTx.payerContactId,
        creditorName,
        totalPending: 0,
        pendingShares: [],
      }

      existing.totalPending = Math.round((existing.totalPending + pendingAmount) * 100) / 100
      existing.pendingShares.push({
        share: s,
        expectedAmount,
        appliedAmount,
        forgivenAmount,
        pendingAmount,
        expenseDescription: parentTx.description || 'Gasto compartido',
        expenseDate: parentTx.date || s.createdAt || new Date().toISOString(),
      })
      map.set(creditorKey, existing)
    }
  })

  return Array.from(map.values()).sort((a, b) => b.totalPending - a.totalPending)
}

/**
 * Total de deudas pendientes por pagar del usuario.
 */
export function selectTotalPendingPayables(
  shares: ExpenseShare[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = []
): number {
  const payables = selectPendingPayables(shares, transactions, cashTransactions)
  const total = payables.reduce((acc, p) => acc + p.totalPending, 0)
  return Math.round(total * 100) / 100
}

/**
 * Lista de cuotas externas ya cobradas / recuperadas en su totalidad ("Por cobrar" cobrado).
 */
export function selectSettledReimbursements(
  shares: ExpenseShare[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = []
) {
  const settledList: {
    share: ExpenseShare
    participantName: string
    expectedAmount: number
    appliedAmount: number
    forgivenAmount: number
    amount: number
    expenseDescription: string
    settledDate: string
  }[] = []

  shares.forEach((s) => {
    const tx =
      transactions.find((t) => t.id === s.expenseTransactionId) ||
      cashTransactions.find((c) => c.id === s.expenseTransactionId)
    if (!tx) return // Defensa: ignorar cuota cuyo gasto origen no existe
    if (tx.paidBy === 'contact') return
    if (s.isPayerShare || s.isUserShare || s.participantName.toLowerCase() === 'tú') return

    const status = selectExpenseShareStatus(s, transactions, cashTransactions)
    if (status.status === 'received') {
      const lastReimb = status.reimbursements[status.reimbursements.length - 1]
      settledList.push({
        share: s,
        participantName: s.participantName,
        expectedAmount: status.expectedAmount,
        appliedAmount: status.appliedAmount,
        forgivenAmount: status.forgivenAmount,
        amount: status.expectedAmount,
        expenseDescription: tx.description || 'Gasto compartido',
        settledDate: lastReimb?.date || tx.date || s.createdAt || new Date().toISOString(),
      })
    }
  })

  return settledList.sort((a, b) => new Date(b.settledDate).getTime() - new Date(a.settledDate).getTime())
}

/**
 * Lista de deudas propias ya liquidadas / pagadas en su totalidad al acreedor ("Por pagar" pagado).
 */
export function selectSettledPayables(
  shares: ExpenseShare[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = []
) {
  const settledList: {
    share: ExpenseShare
    creditorName: string
    expectedAmount: number
    paidAmount: number
    appliedAmount: number
    extraAmount: number
    forgivenAmount: number
    amount: number
    expenseDescription: string
    settledDate: string
  }[] = []

  shares.forEach((s) => {
    const parentTx =
      transactions.find((t) => t.id === s.expenseTransactionId) ||
      cashTransactions.find((c) => c.id === s.expenseTransactionId)
    if (!parentTx) return

    const isContactPaid = parentTx.paidBy === 'contact'
    const isUserShare = Boolean(s.isUserShare) || s.participantName.toLowerCase() === 'tú' || (!s.isPayerShare && !s.contactId)
    if (!isContactPaid || !isUserShare) return

    const status = selectExpensePayableStatus(s, transactions, cashTransactions)
    if (status.status === 'settled') {
      const lastPayment = status.payments[status.payments.length - 1]
      settledList.push({
        share: s,
        creditorName: parentTx.payerName || 'Contacto',
        expectedAmount: status.expectedAmount,
        paidAmount: status.paidAmount,
        appliedAmount: status.appliedAmount,
        extraAmount: status.extraAmount,
        forgivenAmount: status.forgivenAmount,
        amount: status.expectedAmount,
        expenseDescription: parentTx.description || 'Gasto compartido',
        settledDate: lastPayment?.date || parentTx.date || s.createdAt || new Date().toISOString(),
      })
    }
  })

  return settledList.sort((a, b) => new Date(b.settledDate).getTime() - new Date(a.settledDate).getTime())
}

/**
 * Gasto neto personal de efectivo del periodo:
 * Para cada gasto de efectivo (expense) realizado en el periodo:
 * net = max(0, expense.amount - linkedReimbursements).
 */
export function selectNetCashExpensesForPeriod(
  cashTransactions: CashTransaction[] = [], transactions: Transaction[] = [], referenceDate: Date = new Date(),
  scope: 'month' | 'all' = 'month', expenseShares: ExpenseShare[] = []
): number {
  return selectEconomicSummary(transactions, cashTransactions, referenceDate, scope, expenseShares, 'cash').netExpenses
}

export const selectNetCashExpenses = selectNetCashExpensesForPeriod

/**
 * Gasto neto de efectivo agrupado por categoría para el periodo.
 */
export function selectNetCashExpensesByCategory(
  cashTransactions: CashTransaction[] = [], transactions: Transaction[] = [], categories: Category[] = [],
  referenceDate: Date = new Date(), scope: 'month' | 'all' = 'month', expenseShares: ExpenseShare[] = []
): NetCategoryExpense[] {
  return selectEconomicCategoryExpenses(transactions, cashTransactions, categories, referenceDate, scope, expenseShares, 'cash')
}

export interface DayNetStats {
  netExpenses: number
  grossExpenses: number
  realIncome: number
  reimbursements: number
  netBalance: number
}

/**
 * Calcula estadísticas financieras netas de un día específico,
 * descontando reembolsos vinculados de cada gasto del día y excluyendo transferencias.
 */
export function selectDayNetFinanceStats(
  transactions: Transaction[], year: number, month: number, day: number,
  cashTransactions: CashTransaction[] = [], expenseShares: ExpenseShare[] = []
): DayNetStats {
  return selectEconomicSummaryForRange(transactions, cashTransactions,
    { start: new Date(year, month, day), end: new Date(year, month, day, 23, 59, 59, 999) }, expenseShares)
}

/**
 * Genera el mapa diario de estadísticas netas para cada día del mes.
 */
export function selectMonthDailyNetStats(
  transactions: Transaction[], year: number, month: number,
  cashTransactions: CashTransaction[] = [], expenseShares: ExpenseShare[] = []
): Map<number, DayNetStats> {
  const map = new Map<number, DayNetStats>()
  for (let day = 1; day <= new Date(year, month + 1, 0).getDate(); day++) {
    const stats = selectDayNetFinanceStats(transactions, year, month, day, cashTransactions, expenseShares)
    if (stats.grossExpenses > 0 || stats.realIncome > 0 || stats.reimbursements > 0) map.set(day, stats)
  }
  return map
}

/**
 * Total de importe perdonado por el usuario a otros contactos en gastos compartidos pagados por el usuario.
 */
export function selectTotalForgivenByUser(
  shares: ExpenseShare[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = [],
  scope: 'all' | 'month' = 'all',
  referenceDate: Date = new Date()
): number {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  let total = 0
  shares.forEach((s) => {
    const parentTx =
      transactions.find((t) => t.id === s.expenseTransactionId) ||
      cashTransactions.find((c) => c.id === s.expenseTransactionId)
    if (!parentTx) return
    // Solo gastos pagados por el usuario
    if (parentTx.paidBy === 'contact') return
    // Solo cuotas de terceros (no la del propio usuario/pagador)
    if (s.isPayerShare || s.isUserShare || s.participantName.toLowerCase() === 'tú') return

    if (scope === 'month') {
      const txDate = new Date(parentTx.date || s.createdAt || '')
      if (isNaN(txDate.getTime()) || txDate.getMonth() !== currentMonth || txDate.getFullYear() !== currentYear) {
        return
      }
    }

    const forgiven = Math.max(0, Number(s.forgivenAmount ?? 0))
    total += forgiven
  })

  return Math.round(total * 100) / 100
}

/**
 * Total de importe perdonado AL usuario por otros contactos en gastos compartidos pagados por ellos.
 */
export function selectTotalForgivenToUser(
  shares: ExpenseShare[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = [],
  scope: 'all' | 'month' = 'all',
  referenceDate: Date = new Date()
): number {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  let total = 0
  shares.forEach((s) => {
    const parentTx =
      transactions.find((t) => t.id === s.expenseTransactionId) ||
      cashTransactions.find((c) => c.id === s.expenseTransactionId)
    if (!parentTx) return
    // Solo gastos pagados por un tercero
    if (parentTx.paidBy !== 'contact') return
    // Solo la cuota del usuario
    const isUserShare = Boolean(s.isUserShare) || s.participantName.toLowerCase() === 'tú' || (!s.isPayerShare && !s.contactId)
    if (!isUserShare) return

    if (scope === 'month') {
      const txDate = new Date(parentTx.date || s.createdAt || '')
      if (isNaN(txDate.getTime()) || txDate.getMonth() !== currentMonth || txDate.getFullYear() !== currentYear) {
        return
      }
    }

    const forgiven = Math.max(0, Number(s.forgivenAmount ?? 0))
    total += forgiven
  })

  return Math.round(total * 100) / 100
}

/**
 * Resumen de Por Cobrar: pendiente, cobrado real, perdonado por ti y esperado total.
 */
export function selectSharedReceivablesSummary(
  shares: ExpenseShare[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = [],
  scope: 'all' | 'month' = 'all',
  referenceDate: Date = new Date()
) {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  let totalExpected = 0
  let totalReceived = 0
  let totalForgiven = 0
  let totalPending = 0

  shares.forEach((s) => {
    const parentTx =
      transactions.find((t) => t.id === s.expenseTransactionId) ||
      cashTransactions.find((c) => c.id === s.expenseTransactionId)
    if (!parentTx) return
    if (parentTx.paidBy === 'contact') return
    if (s.isPayerShare || s.isUserShare || s.participantName.toLowerCase() === 'tú') return

    if (scope === 'month') {
      const txDate = new Date(parentTx.date || s.createdAt || '')
      if (isNaN(txDate.getTime()) || txDate.getMonth() !== currentMonth || txDate.getFullYear() !== currentYear) {
        return
      }
    }

    const status = selectExpenseShareStatus(s, transactions, cashTransactions)
    totalExpected += status.expectedAmount
    totalReceived += status.appliedAmount
    totalForgiven += status.forgivenAmount
    totalPending += status.pendingAmount
  })

  return {
    totalExpected: Math.round(totalExpected * 100) / 100,
    totalReceived: Math.round(totalReceived * 100) / 100,
    totalForgiven: Math.round(totalForgiven * 100) / 100,
    totalPending: Math.round(totalPending * 100) / 100,
  }
}

/**
 * Resumen de Por Pagar: pendiente, pagado real, perdonado a ti y esperado total.
 */
export function selectSharedPayablesSummary(
  shares: ExpenseShare[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = [],
  scope: 'all' | 'month' = 'all',
  referenceDate: Date = new Date()
) {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  let totalExpected = 0
  let totalPaid = 0
  let totalForgiven = 0
  let totalPending = 0

  shares.forEach((s) => {
    const parentTx =
      transactions.find((t) => t.id === s.expenseTransactionId) ||
      cashTransactions.find((c) => c.id === s.expenseTransactionId)
    if (!parentTx) return
    if (parentTx.paidBy !== 'contact') return
    const isUserShare = Boolean(s.isUserShare) || s.participantName.toLowerCase() === 'tú' || (!s.isPayerShare && !s.contactId)
    if (!isUserShare) return

    if (scope === 'month') {
      const txDate = new Date(parentTx.date || s.createdAt || '')
      if (isNaN(txDate.getTime()) || txDate.getMonth() !== currentMonth || txDate.getFullYear() !== currentYear) {
        return
      }
    }

    const status = selectExpensePayableStatus(s, transactions, cashTransactions)
    totalExpected += status.expectedAmount
    totalPaid += status.appliedAmount
    totalForgiven += status.forgivenAmount
    totalPending += status.pendingAmount
  })

  return {
    totalExpected: Math.round(totalExpected * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalForgiven: Math.round(totalForgiven * 100) / 100,
    totalPending: Math.round(totalPending * 100) / 100,
  }
}

/**
 * Resumen histórico y por persona de deudas compartidas (por cobrar y por pagar).
 */
export function selectSharedSummaryByContact(
  shares: ExpenseShare[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = [],
  scope: 'all' | 'month' = 'all',
  referenceDate: Date = new Date()
) {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  const map = new Map<string, {
    contactId?: string
    name: string
    // Por cobrar (usuario prestó / pagó por el contacto)
    expectedReceivable: number
    receivedReal: number
    forgivenByUser: number
    pendingReceivable: number
    // Por pagar (contacto pagó por el usuario)
    expectedPayable: number
    paidReal: number
    forgivenToUser: number
    pendingPayable: number
  }>()

  const getOrCreate = (key: string, name: string, contactId?: string) => {
    let existing = map.get(key)
    if (!existing) {
      existing = {
        contactId,
        name,
        expectedReceivable: 0,
        receivedReal: 0,
        forgivenByUser: 0,
        pendingReceivable: 0,
        expectedPayable: 0,
        paidReal: 0,
        forgivenToUser: 0,
        pendingPayable: 0,
      }
      map.set(key, existing)
    }
    return existing
  }

  shares.forEach((s) => {
    const parentTx =
      transactions.find((t) => t.id === s.expenseTransactionId) ||
      cashTransactions.find((c) => c.id === s.expenseTransactionId)
    if (!parentTx) return

    if (scope === 'month') {
      const txDate = new Date(parentTx.date || s.createdAt || '')
      if (isNaN(txDate.getTime()) || txDate.getMonth() !== currentMonth || txDate.getFullYear() !== currentYear) {
        return
      }
    }

    if (parentTx.paidBy !== 'contact') {
      // Por cobrar: usuario pagó
      if (s.isPayerShare || s.isUserShare || s.participantName.toLowerCase() === 'tú') return
      const key = s.contactId || s.participantName.toLowerCase().trim()
      const item = getOrCreate(key, s.participantName, s.contactId)
      const status = selectExpenseShareStatus(s, transactions, cashTransactions)
      item.expectedReceivable = Math.round((item.expectedReceivable + status.expectedAmount) * 100) / 100
      item.receivedReal = Math.round((item.receivedReal + status.appliedAmount) * 100) / 100
      item.forgivenByUser = Math.round((item.forgivenByUser + status.forgivenAmount) * 100) / 100
      item.pendingReceivable = Math.round((item.pendingReceivable + status.pendingAmount) * 100) / 100
    } else {
      // Por pagar: contacto pagó
      const isUserShare = Boolean(s.isUserShare) || s.participantName.toLowerCase() === 'tú' || (!s.isPayerShare && !s.contactId)
      if (!isUserShare) return
      const creditorName = parentTx.payerName || 'Contacto'
      const key = parentTx.payerContactId || creditorName.toLowerCase().trim()
      const item = getOrCreate(key, creditorName, parentTx.payerContactId)
      const status = selectExpensePayableStatus(s, transactions, cashTransactions)
      item.expectedPayable = Math.round((item.expectedPayable + status.expectedAmount) * 100) / 100
      item.paidReal = Math.round((item.paidReal + status.appliedAmount) * 100) / 100
      item.forgivenToUser = Math.round((item.forgivenToUser + status.forgivenAmount) * 100) / 100
      item.pendingPayable = Math.round((item.pendingPayable + status.pendingAmount) * 100) / 100
    }
  })

  return Array.from(map.values()).sort(
    (a, b) =>
      b.pendingReceivable + b.pendingPayable - (a.pendingReceivable + a.pendingPayable) ||
      b.forgivenByUser + b.forgivenToUser - (a.forgivenByUser + a.forgivenToUser)
  )
}

export interface CategoryMonthlyPoint {
  date: Date
  monthKey: string
  monthLabel: string
  shortMonthLabel: string
  amount: number
  isCurrent: boolean
}

export interface CategoryMonthlyStats {
  categoryId: string
  categoryName: string
  categoryColor: string
  categoryIcon: string
  currentMonthAmount: number
  currentMonthPercentage: number
  totalMonthExpenses: number
  recentAverage: number
  monthsEvaluated: number
  history: CategoryMonthlyPoint[]
  movements: UnifiedMovement[]
}

/**
 * Estadísticas canónicas de una categoría concreta en el mes de referencia,
 * incluyendo total del mes, porcentaje respecto al gasto total, media de los últimos N meses
 * y evolución mensual histórica sin librerías pesadas.
 */
export function selectCategoryMonthlyStats(
  categoryId: string,
  categories: Category[] = [],
  transactions: Transaction[] = [],
  cashTransactions: CashTransaction[] = [],
  expenseShares: ExpenseShare[] = [],
  referenceDate: Date = new Date(),
  monthsCount = 3
): CategoryMonthlyStats {
  const normCatId = normalizeCategoryAlias(categoryId)
  const category = categories.find((c) => normalizeCategoryAlias(c.id) === normCatId)
  const categoryName = category?.name ?? (normCatId === 'other' ? 'Otros' : categoryId)
  const categoryColor = category?.color ?? '#8B70A0'
  const categoryIcon = category?.iconKey || category?.icon || 'ellipsis'

  const refYear = referenceDate.getFullYear()
  const refMonth = referenceDate.getMonth()

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ]
  const shortMonthNames = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
  ]

  const history: CategoryMonthlyPoint[] = []
  let historySum = 0

  for (let i = monthsCount - 1; i >= 0; i--) {
    const pointDate = new Date(refYear, refMonth - i, 1)
    const pYear = pointDate.getFullYear()
    const pMonth = pointDate.getMonth()
    const monthKey = `${pYear}-${String(pMonth + 1).padStart(2, '0')}`
    const isCurrent = i === 0

    const catExpenses = selectNetExpensesByCategory(
      transactions,
      categories,
      pointDate,
      'month',
      cashTransactions,
      expenseShares
    )
    const found = catExpenses.find((c) => normalizeCategoryAlias(c.id) === normCatId)
    const amount = found ? found.amount : 0

    historySum += amount
    history.push({
      date: pointDate,
      monthKey,
      monthLabel: `${monthNames[pMonth]} ${pYear}`,
      shortMonthLabel: shortMonthNames[pMonth],
      amount,
      isCurrent,
    })
  }

  const currentMonthAmount = history[history.length - 1]?.amount ?? 0
  const recentAverage = monthsCount > 0 ? Math.round((historySum / monthsCount) * 100) / 100 : currentMonthAmount

  const allMonthCategories = selectNetExpensesByCategory(
    transactions,
    categories,
    referenceDate,
    'month',
    cashTransactions,
    expenseShares
  )
  const totalMonthExpenses = allMonthCategories.reduce((sum, c) => sum + c.amount, 0)
  const currentMonthPercentage = totalMonthExpenses > 0 ? Math.round((currentMonthAmount / totalMonthExpenses) * 100) : 0

  const allUnified = toUnifiedMovements(transactions, cashTransactions, expenseShares)
  const movements = allUnified.filter((m) => {
    if (m.economicKind !== 'expense' || (m.isShared && m.paidBy === 'contact')) return false
    const d = economicDate(m.date)
    if (d.getFullYear() !== refYear || d.getMonth() !== refMonth) return false
    return normalizeCategoryAlias(m.categoryId || 'other') === normCatId
  })

  return {
    categoryId: normCatId,
    categoryName,
    categoryColor,
    categoryIcon,
    currentMonthAmount,
    currentMonthPercentage,
    totalMonthExpenses: Math.round(totalMonthExpenses * 100) / 100,
    recentAverage,
    monthsEvaluated: monthsCount,
    history,
    movements,
  }
}

export interface IncomeCategoryBreakdownItem {
  id: string
  name: string
  color: string
  icon: string
  amount: number
  percentage: number
}

export interface IncomeCategoryBreakdown {
  total: number
  items: IncomeCategoryBreakdownItem[]
  movements: UnifiedMovement[]
}

/**
 * Desglose canónico de ingresos económicos del periodo agrupados por categoría/fuente,
 * garantizando que NUNCA se incluyan devoluciones ni cobros de deudas de terceros.
 */
export function selectIncomeCategoryBreakdown(
  transactions: Transaction[] = [],
  categories: Category[] = [],
  referenceDate: Date = new Date(),
  scope: 'month' | 'all' = 'month',
  cashTransactions: CashTransaction[] = [],
  expenseShares: ExpenseShare[] = []
): IncomeCategoryBreakdown {
  const refYear = referenceDate.getFullYear()
  const refMonth = referenceDate.getMonth()

  const allUnified = toUnifiedMovements(transactions, cashTransactions, expenseShares)
  const periodIncomes = allUnified.filter((m) => {
    if (m.economicKind !== 'income') return false
    if (scope === 'all') return true
    const d = economicDate(m.date)
    return d.getFullYear() === refYear && d.getMonth() === refMonth
  })

  const total = periodIncomes.reduce((acc, m) => acc + m.amount, 0)
  const groupMap = new Map<string, { name: string; color: string; icon: string; amount: number }>()

  periodIncomes.forEach((m) => {
    const rawCatId = m.categoryId || 'income'
    const cat = categories.find((c) => c.id === rawCatId)
    const groupId = cat ? cat.id : rawCatId
    const groupName = cat ? cat.name : m.description || 'Ingreso'
    const groupColor = cat?.color || '#5D9C74'
    const groupIcon = cat?.iconKey || cat?.icon || 'arrow-down-left'

    const existing = groupMap.get(groupId) || {
      name: groupName,
      color: groupColor,
      icon: groupIcon,
      amount: 0,
    }
    existing.amount = Math.round((existing.amount + m.amount) * 100) / 100
    groupMap.set(groupId, existing)
  })

  const items: IncomeCategoryBreakdownItem[] = []
  groupMap.forEach((val, id) => {
    const percentage = total > 0 ? Math.round((val.amount / total) * 100) : 0
    items.push({
      id,
      name: val.name,
      color: val.color,
      icon: val.icon,
      amount: val.amount,
      percentage,
    })
  })

  items.sort((a, b) => b.amount - a.amount)

  return {
    total: Math.round(total * 100) / 100,
    items,
    movements: periodIncomes,
  }
}




export interface EconomicExpense {
  movement: EconomicMovement
  gross: number
  linked: number
  net: number
}

/** Universo común de compras; mantiene los registros originales y el contexto completo de reembolsos. */
export function selectEconomicExpenses(
  transactions: Transaction[] = [], cashTransactions: CashTransaction[] = [], expenseShares: ExpenseShare[] = [],
  source: EconomicSource = 'total', includes: (date: string) => boolean = () => true
): EconomicExpense[] {
  return classifyEconomicMovements(transactions, cashTransactions)
    .filter((m) => (source === 'total' || m.source === source) && isPersonalExpense(m) && includes(m.transaction.date))
    .map((movement) => {
      const t = movement.transaction
      const gross = roundMoney(Math.abs(Number(t.amount) || 0))
      const linked = Math.min(gross, selectLinkedReimbursementsForExpense(t.id, transactions, cashTransactions, expenseShares))
      return { movement, gross, linked, net: roundMoney(Math.max(0, gross - linked)) }
    })
}

function summarizeEconomicMovements(
  transactions: Transaction[], cashTransactions: CashTransaction[], expenseShares: ExpenseShare[],
  source: EconomicSource, includes: (date: string) => boolean
) {
  const expenses = selectEconomicExpenses(transactions, cashTransactions, expenseShares, source, includes)
  const movements = classifyEconomicMovements(transactions, cashTransactions)
    .filter((m) => (source === 'total' || m.source === source) && includes(m.transaction.date))
  const sumKind = (kind: 'income' | 'reimbursement') => roundMoney(movements.filter((m) => m.kind === kind)
    .reduce((sum, m) => sum + Math.abs(Number(m.transaction.amount) || 0), 0))
  const grossExpenses = roundMoney(expenses.reduce((sum, e) => sum + e.gross, 0))
  const netExpenses = roundMoney(expenses.reduce((sum, e) => sum + e.net, 0))
  const linkedReimbursements = roundMoney(expenses.reduce((sum, e) => sum + e.linked, 0))
  const realIncome = sumKind('income'), reimbursements = sumKind('reimbursement')
  return { grossExpenses, netExpenses, linkedReimbursements, realIncome, reimbursements, netBalance: roundMoney(realIncome - netExpenses) }
}

export function selectEconomicSummary(
  transactions: Transaction[] = [], cashTransactions: CashTransaction[] = [], referenceDate: Date = new Date(),
  scope: 'month' | 'all' = 'month', expenseShares: ExpenseShare[] = [], source: EconomicSource = 'total'
) {
  return summarizeEconomicMovements(transactions, cashTransactions, expenseShares, source,
    (date) => inEconomicMonth(date, referenceDate, scope))
}

export function selectEconomicSummaryForRange(
  transactions: Transaction[], cashTransactions: CashTransaction[], range: { start: Date; end: Date },
  expenseShares: ExpenseShare[] = [], source: EconomicSource = 'total'
) {
  return summarizeEconomicMovements(transactions, cashTransactions, expenseShares, source,
    (date) => inEconomicRange(date, range))
}

export function selectEconomicCategoryExpenses(
  transactions: Transaction[], cashTransactions: CashTransaction[], categories: Category[], referenceDate: Date = new Date(),
  scope: 'month' | 'all' = 'month', expenseShares: ExpenseShare[] = [], source: EconomicSource = 'total',
  mode: 'net' | 'gross' = 'net', range?: { start: Date; end: Date }
): NetCategoryExpense[] {
  const amounts = new Map<string, number>()
  selectEconomicExpenses(transactions, cashTransactions, expenseShares, source,
    (date) => range ? inEconomicRange(date, range) : inEconomicMonth(date, referenceDate, scope))
    .forEach((e) => {
      const id = normalizeCategoryAlias(e.movement.transaction.categoryId || 'other')
      amounts.set(id, roundMoney((amounts.get(id) || 0) + (mode === 'gross' ? e.gross : e.net)))
    })
  const total = roundMoney([...amounts.values()].reduce((sum, amount) => sum + amount, 0))
  return [...amounts].filter(([, amount]) => amount > 0).map(([id, amount]) => {
    const category = categories.find((c) => normalizeCategoryAlias(c.id) === id)
    return { id, amount, percentage: total > 0 ? Math.round(amount / total * 100) : 0,
      name: id === 'other' ? 'Otros' : category?.name || id, color: category?.color || '#B9B9B9', icon: category?.iconKey || category?.icon || 'ellipsis' }
  }).sort((a, b) => b.amount - a.amount)
}

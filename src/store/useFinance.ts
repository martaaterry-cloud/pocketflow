import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  accounts as seedAccounts,
  budgets as seedBudgets,
  categories as seedCategories,
  cleanAccounts,
  cleanInitialFinanceState,
  cleanPlanSettings,
  goals as seedGoals,
  initialProfile,
  planSettings as seedPlanSettings,
  recurring as seedRecurring,
  reserves as seedReserves,
  specialPeriods as seedSpecialPeriods,
  transactions as seedTransactions,
} from '../data/seed'
import type {
  Account,
  Budget,
  CreateBudgetInput,
  CreateRecurringPaymentInput,
  CreateReserveInput,
  CreateSavingsGoalInput,
  CreateSpecialPeriodInput,
  CreateTransactionInput,
  FinancialPlanSettings,
  RecurringPayment,
  Reserve,
  SavingsGoal,
  SpecialPeriod,
  Transaction,
  UpdateBudgetInput,
  UpdatePlanSettingsInput,
  UpdateProfileInput,
  UpdateRecurringPaymentInput,
  UpdateReserveInput,
  UpdateSavingsGoalInput,
  UpdateSpecialPeriodInput,
  UpdateTransactionInput,
  UserProfile,
  VariableExpenseEstimate,
  CreateVariableExpenseEstimateInput,
  UpdateVariableExpenseEstimateInput,
  SharedContact,
  ExpenseShare,
  CreateSharedContactInput,
  CreateExpenseShareInput,
  CashTransaction,
  CreateCashTransactionInput,
  UpdateCashTransactionInput,
  PaymentMethod,
  ExpenseNature,
  IncomeKind,
} from '../models/finance'
import { selectCashBalance, createCashAdjustmentInput } from '../utils/cashSelectors'
import { defaultAppStorage, createIndexedDbAdapter } from '../services/storage/indexedDbAdapter'
import { defaultStorage } from '../services/storage/localStorageAdapter'
import { isValidUserId } from '../services/storage/userStorageKeys'
import type { PersistedState, StorageAdapter } from '../services/storage/storageAdapter'
import { selectBudgetsSummary } from '../utils/budgetSelectors'
import { ensureAccountInitialBalance, reconcileAccounts } from '../utils/balance'
import { calculateVariableEstimatesSummary } from '../utils/variableEstimates'
import {
  selectGrossExpenses,
  selectGrossExpensesForPeriod,
  selectGrossExpensesByPaymentMethod,
  type GrossExpensesBreakdown,
  selectLinkedReimbursementsForPeriod,
  selectReimbursementsReceived,
  selectNetPersonalExpenses,
  selectNetPersonalExpensesForPeriod,
  selectNetExpensesByCategory,
  selectRealIncome,
  selectPendingReimbursements,
  selectTotalPendingPayables,
  selectPendingPayables,
  selectExpenseShareStatus,
  selectExpensePayableStatus,
  selectExpenseShareDetails,
  selectPendingDebtors,
  selectOrphanExpenseShares,
  splitExpenseEqually,
} from '../utils/sharedExpenseSelectors'
import { getSupabase } from '../services/supabase/supabaseClient'
import {
  enqueueOfflineMutation,
  type OfflineMutation,
} from '../services/supabase/offlineQueue'
import { markLocalMutation } from '../services/supabase/supabaseRealtime'
import {
  syncDeleteBudget,
  syncDeleteCashTransaction,
  syncDeleteGoal,
  syncDeleteRecurring,
  syncDeleteReserve,
  syncDeleteSpecialPeriod,
  syncDeleteTransaction,
  syncDeleteVariableExpenseEstimate,
  syncDeleteSharedContact,
  syncDeleteExpenseShare,
  syncInsertTransaction,
  syncUpdateTransaction,
  syncUpsertAccount,
  syncUpsertBudget,
  syncUpsertCashTransaction,
  syncUpsertGoal,
  syncUpsertPlanSettings,
  syncUpsertProfile,
  syncUpsertRecurring,
  syncUpsertReserve,
  syncUpsertSpecialPeriod,
  syncUpsertVariableExpenseEstimate,
  syncUpsertSharedContact,
  syncUpsertExpenseShare,
} from '../services/supabase/supabaseSync'
import {
  logPerfMutationStart,
  logPerfUiUpdated,
  logPerfCloudConfirmed,
  logPerfRealtimeReceived,
  logPerfCacheApplied,
} from '../utils/syncPerfTracker'
import {
  calculateNextRecurringDate,
  formatCoverageDescription,
  isRecurringCoveredInMonth,
  recalculateRecurringNextDate,
  selectAssignedSavings,
  selectCommittedAmount,
  selectFreeSavings,
  selectMonthExpenses,
  selectPendingRecurringPayments,
  selectProjectedAvailable,
  selectRealAvailable,
  selectSavingsBalance,
  selectSpendableBalance,
  selectTotalMoney,
} from '../utils/financeSelectors'
import {
  selectActualFixedMonthlyExpenses,
  selectActualExtraordinaryMonthlyExpenses,
  selectActualMonthlySavings,
  selectActualVariableMonthlyExpenses,
  selectAdjustedMonthlySpendingExpectation,
  selectEmergencyFundMonthsCovered,
  selectEmergencyFundTarget,
  selectEssentialMonthlyExpenses,
  selectExpectedCommittedExpenses,
  selectExpectedMonthlyIncome,
  selectExpectedMonthlyIncomeDetail,
  selectExpectedVariableMonthlyExpenses,
  selectFreeSavingsWithReserves,
  selectMonthlyIncome,
  selectMonthlyPlanCardSummary,
  selectMonthlySpendingControl,
  selectTargetMonthlySavings,
  selectTotalAllocatedToReserves,
  selectVariableMonthlyExpenses,
} from '../utils/planSelectors'

export const demoFinanceState: PersistedState = {
  accounts: seedAccounts,
  transactions: seedTransactions,
  goals: seedGoals,
  recurring: seedRecurring,
  categories: seedCategories,
  budgets: seedBudgets,
  reserves: seedReserves,
  specialPeriods: seedSpecialPeriods,
  planSettings: seedPlanSettings,
  profile: initialProfile,
  variableExpenseEstimates: [],
  sharedContacts: [],
  expenseShares: [],
  cashTransactions: [],
}

export const initialFinanceState: PersistedState = demoFinanceState

export function useFinance(storage: StorageAdapter = defaultAppStorage) {
  const isCustomStorage = storage !== defaultAppStorage
  const activeStorageRef = useRef<StorageAdapter | null>(isCustomStorage ? storage : null)

  const [state, setState] = useState<PersistedState>(() => {
    return cleanInitialFinanceState
  })

  const [storageHydrated, setStorageHydrated] = useState(false)
  const [syncUserId, setSyncUserId] = useState<string | null>(null)

  // Carga asíncrona cuando se suministra un StorageAdapter personalizado (ej. en tests)
  useEffect(() => {
    if (!isCustomStorage) return
    let mounted = true
    storage
      .load()
      .then((loaded) => {
        if (!mounted) return
        if (loaded) {
          const txs = loaded.transactions ?? []
          const accountsWithInitial = (loaded.accounts ?? initialFinanceState.accounts).map((acc) =>
            ensureAccountInitialBalance(acc, txs)
          )

          setState({
            accounts: accountsWithInitial,
            transactions: txs,
            goals: loaded.goals ?? [],
            recurring: loaded.recurring ?? [],
            categories: loaded.categories?.length ? loaded.categories : initialFinanceState.categories,
            budgets: loaded.budgets ?? [],
            reserves: loaded.reserves ?? [],
            specialPeriods: loaded.specialPeriods ?? [],
            planSettings: loaded.planSettings ?? initialFinanceState.planSettings,
            profile: loaded.profile ?? initialProfile,
            variableExpenseEstimates: loaded.variableExpenseEstimates ?? [],
            sharedContacts: loaded.sharedContacts ?? [],
            expenseShares: loaded.expenseShares ?? [],
            cashTransactions: loaded.cashTransactions ?? [],
          })
        }
        setStorageHydrated(true)
      })
      .catch((err) => {
        console.warn('[Pocketflow] Error cargando almacenamiento personalizado:', err)
        if (mounted) setStorageHydrated(true)
      })
    return () => {
      mounted = false
    }
  }, [isCustomStorage, storage])

  const onSyncStatusChangeRef = useRef<((status: 'syncing' | 'up_to_date' | 'offline' | 'error') => void) | null>(null)

  const setOnSyncStatusChange = useCallback(
    (cb: ((status: 'syncing' | 'up_to_date' | 'offline' | 'error') => void) | null) => {
      onSyncStatusChangeRef.current = cb
    },
    []
  )

  const setSyncUser = useCallback(
    (userId: string | null) => {
      if (!isValidUserId(userId)) {
        setSyncUserId(null)
        if (!isCustomStorage) {
          activeStorageRef.current = null
          // Limpiar el estado en memoria de la sesión actual (aislamiento total en logout)
          setState(cleanInitialFinanceState)
          setStorageHydrated(true)
        }
        return
      }

      const cleanUid = userId.trim()
      setSyncUserId(cleanUid)

      if (!isCustomStorage) {
        setStorageHydrated(false)
        const userAdapter = createIndexedDbAdapter(cleanUid)
        activeStorageRef.current = userAdapter
        userAdapter
          .load()
          .then((loaded) => {
            if (loaded) {
              const txs = loaded.transactions ?? []
              const accountsWithInitial = (loaded.accounts ?? initialFinanceState.accounts).map((acc) =>
                ensureAccountInitialBalance(acc, txs)
              )

              setState({
                accounts: accountsWithInitial,
                transactions: txs,
                goals: loaded.goals ?? [],
                recurring: loaded.recurring ?? [],
                categories: loaded.categories?.length ? loaded.categories : initialFinanceState.categories,
                budgets: loaded.budgets ?? [],
                reserves: loaded.reserves ?? [],
                specialPeriods: loaded.specialPeriods ?? [],
                planSettings: loaded.planSettings ?? initialFinanceState.planSettings,
                profile: loaded.profile ?? initialProfile,
                variableExpenseEstimates: loaded.variableExpenseEstimates ?? [],
                sharedContacts: loaded.sharedContacts ?? [],
                expenseShares: loaded.expenseShares ?? [],
                cashTransactions: loaded.cashTransactions ?? [],
              })
            } else {
              setState(cleanInitialFinanceState)
            }
            setStorageHydrated(true)
          })
          .catch((err) => {
            console.warn('[Pocketflow] Error cargando almacenamiento del usuario:', err)
            setState(cleanInitialFinanceState)
            setStorageHydrated(true)
          })
      }
    },
    [isCustomStorage]
  )

  const resetSession = useCallback(() => {
    setSyncUserId(null)
    activeStorageRef.current = null
    setState(cleanInitialFinanceState)
    setStorageHydrated(true)
  }, [])

  const dispatchSync = useCallback(
    (
      entity: OfflineMutation['entity'],
      action: 'insert' | 'update' | 'delete',
      id: string,
      data: unknown,
      remoteFn: (supabase: any, userId: string) => Promise<void>
    ) => {
      logPerfMutationStart(entity, action, id)
      markLocalMutation(entity === 'transaction' ? 'transactions' : entity, id)
      if (!syncUserId) return

      onSyncStatusChangeRef.current?.('syncing')
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const supabase = getSupabase()
        remoteFn(supabase, syncUserId)
          .then(() => {
            logPerfCloudConfirmed(id)
            onSyncStatusChangeRef.current?.('up_to_date')
          })
          .catch((err) => {
            const isNetworkError =
              !navigator.onLine ||
              (err instanceof TypeError && err.message.toLowerCase().includes('fetch')) ||
              (typeof err?.message === 'string' && (
                err.message.toLowerCase().includes('network') ||
                err.message.toLowerCase().includes('failed to fetch') ||
                err.message.toLowerCase().includes('connection')
              ))

            console.error(`[Supabase Sync Error] Fallo en ${action} ${entity} (id: ${id}):`, {
              code: err?.code,
              message: err?.message,
              details: err?.details,
              hint: err?.hint,
              error: err,
            })
            enqueueOfflineMutation(syncUserId, { entity, action, data })
            if (isNetworkError) {
              onSyncStatusChangeRef.current?.('offline')
            } else {
              onSyncStatusChangeRef.current?.('error')
            }
          })
      } else {
        enqueueOfflineMutation(syncUserId, { entity, action, data })
        onSyncStatusChangeRef.current?.('offline')
      }
    },
    [syncUserId]
  )

  const persistStateAsync = useCallback(
    (next: PersistedState, correlationId?: string) => {
      const currentStorage = activeStorageRef.current ?? (isCustomStorage ? storage : null)
      if (!currentStorage) return
      queueMicrotask(() => {
        currentStorage
          .save(next)
          .then(() => {
            if (correlationId) logPerfCacheApplied(correlationId)
          })
          .catch((err) => {
            console.error('[Pocketflow] Error persistiendo estado financiero:', err)
          })
      })
    },
    [isCustomStorage, storage]
  )

  const commit = useCallback(
    (next: PersistedState, correlationId?: string) => {
      setState(next)
      if (correlationId) {
        logPerfUiUpdated(correlationId)
      }
      persistStateAsync(next, correlationId)
    },
    [persistStateAsync]
  )

  // Cuentas reconciliadas: los saldos son 100% derivados del histórico de transacciones
  const reconciledAccounts = useMemo(() => {
    return reconcileAccounts(state.accounts, state.transactions)
  }, [state.accounts, state.transactions])

  /* ==========================================================================
     Transacciones
     ========================================================================== */

  const addTransaction = useCallback(
    (input: CreateTransactionInput): Transaction => {
      const newTx: Transaction = {
        ...input,
        id: crypto.randomUUID(),
        amount: Number(input.amount),
      }
      commit(
        {
          ...state,
          transactions: [newTx, ...state.transactions],
        },
        newTx.id
      )
      dispatchSync('transaction', 'insert', newTx.id, newTx, (sb, uid) =>
        syncInsertTransaction(sb, uid, newTx)
      )
      return newTx
    },
    [state, commit, dispatchSync]
  )

  const addSharedExpense = useCallback(
    (
      input: CreateTransactionInput,
      shares: { participantName: string; contactId?: string; isPayerShare: boolean; isUserShare?: boolean; expectedAmount: number }[]
    ) => {
      const txId = crypto.randomUUID()
      const newTx: Transaction = {
        ...input,
        id: txId,
        amount: Number(input.amount),
        isShared: true,
      }

      const createdShares: ExpenseShare[] = shares.map((s) => ({
        id: crypto.randomUUID(),
        expenseTransactionId: txId,
        contactId: s.contactId,
        participantName: s.participantName.trim(),
        isPayerShare: s.isPayerShare,
        isUserShare: s.isUserShare,
        expectedAmount: Number(s.expectedAmount),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }))

      // Auto-guardar participantes externos y pagador externo en sharedContacts para autocompletado
      const currentContacts = state.sharedContacts ?? []
      const newContacts: SharedContact[] = []
      const namesToSave = new Set<string>()

      shares.forEach((s) => {
        if (!s.isUserShare && s.participantName.toLowerCase() !== 'tú') {
          namesToSave.add(s.participantName.trim())
        }
      })
      if (input.payerName && input.payerName.toLowerCase() !== 'tú') {
        namesToSave.add(input.payerName.trim())
      }

      namesToSave.forEach((name) => {
        const exists =
          currentContacts.some((c) => c.displayName.toLowerCase() === name.toLowerCase()) ||
          newContacts.some((c) => c.displayName.toLowerCase() === name.toLowerCase())
        if (!exists && name.length > 0) {
          newContacts.push({
            id: crypto.randomUUID(),
            displayName: name,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        }
      })

      const nextContacts = [...newContacts, ...currentContacts]
      const nextShares = [...createdShares, ...(state.expenseShares ?? [])]

      commit(
        {
          ...state,
          transactions: [newTx, ...state.transactions],
          expenseShares: nextShares,
          sharedContacts: nextContacts,
        },
        newTx.id
      )

      dispatchSync('transaction', 'insert', newTx.id, newTx, (sb, uid) =>
        syncInsertTransaction(sb, uid, newTx)
      )
      createdShares.forEach((share) => {
        dispatchSync('expense_share', 'insert', share.id, share, (sb, uid) =>
          syncUpsertExpenseShare(sb, uid, share)
        )
      })
      newContacts.forEach((c) => {
        dispatchSync('shared_contact', 'insert', c.id, c, (sb, uid) =>
          syncUpsertSharedContact(sb, uid, c)
        )
      })

      return { transaction: newTx, shares: createdShares }
    },
    [state, commit, dispatchSync]
  )

  const recordPayablePayment = useCallback(
    (input: {
      expenseShareId: string
      amount: number
      accountId?: string
      date?: string
      note?: string
      description?: string
      paymentMethod?: 'bank' | 'bizum' | 'cash'
    }) => {
      const paymentMethod = input.paymentMethod || 'bank'
      const share = (state.expenseShares ?? []).find((s) => s.id === input.expenseShareId)
      const targetExpenseId = share?.expenseTransactionId
      const parentTx =
        state.transactions.find((t) => t.id === targetExpenseId) ||
        state.cashTransactions?.find((c) => c.id === targetExpenseId)

      const creditorName = parentTx?.payerName || 'Contacto'
      const fallbackAccountId = state.accounts[0]?.id || 'daily'

      if (paymentMethod === 'cash') {
        const desc =
          input.description ||
          `Pago efectivo a ${creditorName} · ${parentTx?.description || 'Gasto compartido'}`

        const cashNoteParts: string[] = []
        if (input.note) cashNoteParts.push(input.note)
        if (input.expenseShareId) cashNoteParts.push(`[share:${input.expenseShareId}]`)
        const finalNote = cashNoteParts.join(' ') || undefined

        const newCashTx: CashTransaction = {
          id: `cash_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          type: 'expense',
          amount: Number(input.amount),
          date: input.date || new Date().toISOString(),
          description: desc,
          categoryId: parentTx?.categoryId,
          note: finalNote,
          bankTransactionId: targetExpenseId,
          paymentMethod: 'cash',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        commit(
          {
            ...state,
            cashTransactions: [newCashTx, ...(state.cashTransactions ?? [])],
          },
          newCashTx.id
        )

        dispatchSync('cash_transaction', 'insert', newCashTx.id, newCashTx, (sb, uid) =>
          syncUpsertCashTransaction(sb, uid, newCashTx)
        )

        return newCashTx
      }

      const desc =
        input.description ||
        (paymentMethod === 'bizum'
          ? `Pago Bizum a ${creditorName} · ${parentTx?.description || 'Gasto compartido'}`
          : `Pago a ${creditorName} · ${parentTx?.description || 'Gasto compartido'}`)

      const parentRecurringId =
        parentTx && 'recurringPaymentId' in parentTx && parentTx.recurringPaymentId
          ? parentTx.recurringPaymentId
          : undefined

      const newTx: Transaction = {
        id: crypto.randomUUID(),
        type: 'expense',
        amount: Number(input.amount),
        accountId: input.accountId || fallbackAccountId,
        categoryId: parentTx?.categoryId,
        date: input.date || new Date().toISOString(),
        description: desc,
        note: input.note,
        parentExpenseId: targetExpenseId,
        expenseShareId: input.expenseShareId,
        recurringPaymentId: parentRecurringId,
        paymentMethod: paymentMethod === 'bizum' ? 'bizum' : 'bank',
      }

      commit(
        {
          ...state,
          transactions: [newTx, ...state.transactions],
        },
        newTx.id
      )

      dispatchSync('transaction', 'insert', newTx.id, newTx, (sb, uid) =>
        syncInsertTransaction(sb, uid, newTx)
      )

      return newTx
    },
    [state, commit, dispatchSync]
  )

  const recordReimbursement = useCallback(
    (input: {
      parentExpenseId?: string
      expenseShareId?: string
      amount: number
      accountId?: string
      date?: string
      note?: string
      description?: string
      paymentMethod?: PaymentMethod
    }) => {
      const paymentMethod = input.paymentMethod || 'bank'
      const share = (state.expenseShares ?? []).find((s) => s.id === input.expenseShareId)
      const targetExpenseId = input.parentExpenseId || share?.expenseTransactionId
      const parentTx =
        state.transactions.find((t) => t.id === targetExpenseId) ||
        state.cashTransactions?.find((c) => c.id === targetExpenseId)

      if (paymentMethod === 'cash') {
        const desc =
          input.description ||
          (share
            ? `Efectivo ${share.participantName} · ${parentTx?.description || 'Reembolso'}`
            : `Reembolso efectivo · ${parentTx?.description || 'Gasto'}`)

        const cashNoteParts: string[] = []
        if (input.note) cashNoteParts.push(input.note)
        if (input.expenseShareId) cashNoteParts.push(`[share:${input.expenseShareId}]`)
        const finalNote = cashNoteParts.join(' ') || undefined

        const newCashTx: CashTransaction = {
          id: crypto.randomUUID(),
          type: 'income',
          amount: Number(input.amount),
          date: input.date || new Date().toISOString(),
          description: desc,
          note: finalNote,
          bankTransactionId: targetExpenseId,
          paymentMethod: 'cash',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        commit(
          {
            ...state,
            cashTransactions: [newCashTx, ...(state.cashTransactions ?? [])],
          },
          newCashTx.id
        )

        dispatchSync('cash_transaction', 'insert', newCashTx.id, newCashTx, (sb, uid) =>
          syncUpsertCashTransaction(sb, uid, newCashTx)
        )

        return newCashTx
      }

      const desc =
        input.description ||
        (share
          ? `${paymentMethod === 'bizum' ? 'Bizum' : 'Reembolso'} ${share.participantName} · ${parentTx?.description || 'Reembolso'}`
          : `Reembolso · ${parentTx?.description || 'Gasto'}`)

      const fallbackAccountId = parentTx && 'accountId' in parentTx && parentTx.accountId ? parentTx.accountId : 'daily'

      const newTx: Transaction = {
        id: crypto.randomUUID(),
        type: 'income',
        incomeKind: 'reimbursement',
        amount: Number(input.amount),
        accountId: input.accountId || fallbackAccountId,
        date: input.date || new Date().toISOString(),
        description: desc,
        note: input.note,
        parentExpenseId: targetExpenseId,
        expenseShareId: input.expenseShareId,
        paymentMethod: paymentMethod === 'bizum' ? 'bizum' : 'bank',
      }

      commit(
        {
          ...state,
          transactions: [newTx, ...state.transactions],
        },
        newTx.id
      )

      dispatchSync('transaction', 'insert', newTx.id, newTx, (sb, uid) =>
        syncInsertTransaction(sb, uid, newTx)
      )

      return newTx
    },
    [state, commit, dispatchSync]
  )

  const adjustDebt = useCallback(
    (shareId: string, forgivenAmountToAdd: number) => {
      const share = (state.expenseShares ?? []).find((s) => s.id === shareId)
      if (!share) {
        throw new Error('Cuota no encontrada.')
      }
      const toAdd = Math.round(Number(forgivenAmountToAdd) * 100) / 100
      if (isNaN(toAdd) || toAdd <= 0) {
        throw new Error('El importe a invitar/ajustar debe ser mayor que 0.')
      }

      const status = selectExpenseShareStatus(
        share,
        state.transactions ?? [],
        state.cashTransactions ?? []
      )
      if (toAdd > status.pendingAmount) {
        throw new Error(
          `No puedes invitar/ajustar más de lo pendiente (${status.pendingAmount.toFixed(2)} €).`
        )
      }

      const currentForgiven = Math.round(Number(share.forgivenAmount ?? 0) * 100) / 100
      const nextForgiven = Math.round((currentForgiven + toAdd) * 100) / 100
      const nowIso = new Date().toISOString()

      const updatedShare: ExpenseShare = {
        ...share,
        forgivenAmount: nextForgiven,
        updatedAt: nowIso,
      }

      const nextExpenseShares = (state.expenseShares ?? []).map((s) =>
        s.id === shareId ? updatedShare : s
      )

      commit(
        {
          ...state,
          expenseShares: nextExpenseShares,
        },
        shareId
      )

      dispatchSync('expense_share', 'update', shareId, updatedShare, (sb, uid) =>
        syncUpsertExpenseShare(sb, uid, updatedShare)
      )

      return updatedShare
    },
    [state, commit, dispatchSync]
  )

  const addSharedContact = useCallback(
    (displayName: string) => {
      const trimmed = displayName.trim()
      if (!trimmed) return null
      const existing = (state.sharedContacts ?? []).find(
        (c) => c.displayName.toLowerCase() === trimmed.toLowerCase()
      )
      if (existing) return existing

      const newContact: SharedContact = {
        id: crypto.randomUUID(),
        displayName: trimmed,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      commit({
        ...state,
        sharedContacts: [newContact, ...(state.sharedContacts ?? [])],
      })
      dispatchSync('shared_contact', 'insert', newContact.id, newContact, (sb, uid) =>
        syncUpsertSharedContact(sb, uid, newContact)
      )
      return newContact
    },
    [state, commit, dispatchSync]
  )

  const deleteSharedContact = useCallback(
    (id: string) => {
      commit({
        ...state,
        sharedContacts: (state.sharedContacts ?? []).filter((c) => c.id !== id),
      })
      dispatchSync('shared_contact', 'delete', id, { id }, (sb, uid) =>
        syncDeleteSharedContact(sb, uid, id)
      )
    },
    [state, commit, dispatchSync]
  )

  const updateTransaction = useCallback(
    (
      id: string,
      updates: UpdateTransactionInput,
      shares?: { participantName: string; contactId?: string; isPayerShare: boolean; isUserShare?: boolean; expectedAmount: number }[]
    ) => {
      const existingIndex = state.transactions.findIndex((t) => t.id === id)
      if (existingIndex === -1) return

      const existingTx = state.transactions[existingIndex]
      const isSameType = !updates.type || updates.type === existingTx.type

      const updatedTx: Transaction = {
        ...existingTx,
        ...updates,
        amount: updates.amount !== undefined ? Number(updates.amount) : existingTx.amount,
        parentExpenseId: updates.parentExpenseId !== undefined ? updates.parentExpenseId : (isSameType ? existingTx.parentExpenseId : undefined),
        expenseShareId: updates.expenseShareId !== undefined ? updates.expenseShareId : (isSameType ? existingTx.expenseShareId : undefined),
        recurringPaymentId: updates.recurringPaymentId !== undefined ? updates.recurringPaymentId : existingTx.recurringPaymentId,
        incomeKind: updates.incomeKind !== undefined ? updates.incomeKind : (isSameType ? existingTx.incomeKind : undefined),
        paidBy: updates.paidBy !== undefined ? updates.paidBy : existingTx.paidBy,
        payerName: updates.payerName !== undefined ? updates.payerName : existingTx.payerName,
        payerContactId: updates.payerContactId !== undefined ? updates.payerContactId : existingTx.payerContactId,
      }

      let nextExpenseShares = state.expenseShares ?? []
      let nextSharedContacts = state.sharedContacts ?? []
      const sharesToDelete: string[] = []
      const sharesToUpsert: ExpenseShare[] = []
      const contactsToUpsert: SharedContact[] = []

      if (shares !== undefined) {
        const existingSharesForTx = nextExpenseShares.filter((s) => s.expenseTransactionId === id)
        const otherShares = nextExpenseShares.filter((s) => s.expenseTransactionId !== id)

        if (shares.length > 0) {
          updatedTx.isShared = true
          const usedExistingIds = new Set<string>()

          const finalShares: ExpenseShare[] = shares.map((s) => {
            const nameTrimmed = s.participantName.trim()
            // Reutilizar ID de share previo si coincide para no romper enlaces de reembolsos existentes
            const matchedExisting = existingSharesForTx.find(
              (ex) =>
                !usedExistingIds.has(ex.id) &&
                ((s.isPayerShare && ex.isPayerShare) ||
                  (!s.isPayerShare && !ex.isPayerShare && ex.participantName.toLowerCase() === nameTrimmed.toLowerCase()))
            )

            if (matchedExisting) {
              usedExistingIds.add(matchedExisting.id)
              const updatedShare: ExpenseShare = {
                ...matchedExisting,
                participantName: nameTrimmed,
                contactId: s.contactId,
                isPayerShare: s.isPayerShare,
                isUserShare: s.isUserShare,
                expectedAmount: Number(s.expectedAmount),
                updatedAt: new Date().toISOString(),
              }
              sharesToUpsert.push(updatedShare)
              return updatedShare
            } else {
              const newShare: ExpenseShare = {
                id: crypto.randomUUID(),
                expenseTransactionId: id,
                contactId: s.contactId,
                participantName: nameTrimmed,
                isPayerShare: s.isPayerShare,
                isUserShare: s.isUserShare,
                expectedAmount: Number(s.expectedAmount),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
              sharesToUpsert.push(newShare)
              return newShare
            }
          })

          // Eliminar las que ya no están en la lista
          existingSharesForTx.forEach((ex) => {
            if (!usedExistingIds.has(ex.id)) {
              sharesToDelete.push(ex.id)
            }
          })

          // Guardar contactos nuevos
          shares.forEach((s) => {
            if (!s.isPayerShare) {
              const name = s.participantName.trim()
              const exists =
                nextSharedContacts.some((c) => c.displayName.toLowerCase() === name.toLowerCase()) ||
                contactsToUpsert.some((c) => c.displayName.toLowerCase() === name.toLowerCase())
              if (!exists && name.length > 0) {
                const newC: SharedContact = {
                  id: s.contactId || crypto.randomUUID(),
                  displayName: name,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                }
                contactsToUpsert.push(newC)
              }
            }
          })

          nextExpenseShares = [...finalShares, ...otherShares]
          nextSharedContacts = [...contactsToUpsert, ...nextSharedContacts]
        } else {
          // Si shares es [] o se desmarca compartido
          updatedTx.isShared = false
          existingSharesForTx.forEach((ex) => {
            sharesToDelete.push(ex.id)
          })
          nextExpenseShares = otherShares
        }
      } else if (updates.isShared === false && existingTx.isShared) {
        const existingSharesForTx = nextExpenseShares.filter((s) => s.expenseTransactionId === id)
        existingSharesForTx.forEach((ex) => {
          sharesToDelete.push(ex.id)
        })
        nextExpenseShares = nextExpenseShares.filter((s) => s.expenseTransactionId !== id)
      }

      const nextTransactions = [...state.transactions]
      nextTransactions[existingIndex] = updatedTx

      const affectedRecIds = new Set<string>()
      if (existingTx.recurringPaymentId) affectedRecIds.add(existingTx.recurringPaymentId)
      if (updatedTx.recurringPaymentId) affectedRecIds.add(updatedTx.recurringPaymentId)

      let nextRecurring = state.recurring
      const recsToSync: RecurringPayment[] = []

      for (const recId of affectedRecIds) {
        const rec = nextRecurring.find((r) => r.id === recId)
        if (rec && rec.type !== 'income' && rec.frequency === 'monthly') {
          const recalculatedDate = recalculateRecurringNextDate(rec, nextTransactions)
          if (recalculatedDate !== rec.nextDate) {
            const updatedRec: RecurringPayment = {
              ...rec,
              nextDate: recalculatedDate,
            }
            nextRecurring = nextRecurring.map((r) => (r.id === rec.id ? updatedRec : r))
            recsToSync.push(updatedRec)
          }
        }
      }

      commit(
        {
          ...state,
          transactions: nextTransactions,
          expenseShares: nextExpenseShares,
          sharedContacts: nextSharedContacts,
          recurring: nextRecurring,
        },
        updatedTx.id
      )
      dispatchSync('transaction', 'update', updatedTx.id, updatedTx, (sb, uid) =>
        syncUpdateTransaction(sb, uid, updatedTx)
      )
      sharesToDelete.forEach((sId) => {
        dispatchSync('expense_share', 'delete', sId, { id: sId }, (sb, uid) =>
          syncDeleteExpenseShare(sb, uid, sId)
        )
      })
      sharesToUpsert.forEach((share) => {
        dispatchSync('expense_share', 'insert', share.id, share, (sb, uid) =>
          syncUpsertExpenseShare(sb, uid, share)
        )
      })
      contactsToUpsert.forEach((c) => {
        dispatchSync('shared_contact', 'insert', c.id, c, (sb, uid) =>
          syncUpsertSharedContact(sb, uid, c)
        )
      })
      recsToSync.forEach((rToSync) => {
        dispatchSync('recurring', 'update', rToSync.id, rToSync, (sb, uid) =>
          syncUpsertRecurring(sb, uid, rToSync)
        )
      })
    },
    [state, commit, dispatchSync]
  )

  const deleteTransaction = useCallback(
    (id: string) => {
      const txToDelete = state.transactions.find((t) => t.id === id)
      const sharesToDelete = (state.expenseShares ?? []).filter((s) => s.expenseTransactionId === id)
      const remainingShares = (state.expenseShares ?? []).filter(
        (s) => s.expenseTransactionId !== id
      )
      const nextTransactions = state.transactions.filter((t) => t.id !== id)

      let nextRecurring = state.recurring
      let updatedRecToSync: RecurringPayment | null = null

      if (txToDelete?.recurringPaymentId) {
        const rec = state.recurring.find((r) => r.id === txToDelete.recurringPaymentId)
        if (rec && rec.type !== 'income' && rec.frequency === 'monthly') {
          const recalculatedDate = recalculateRecurringNextDate(rec, nextTransactions)
          if (recalculatedDate !== rec.nextDate) {
            const updatedRec: RecurringPayment = {
              ...rec,
              nextDate: recalculatedDate,
            }
            nextRecurring = state.recurring.map((r) => (r.id === rec.id ? updatedRec : r))
            updatedRecToSync = updatedRec
          }
        }
      }

      commit(
        {
          ...state,
          transactions: nextTransactions,
          expenseShares: remainingShares,
          recurring: nextRecurring,
        },
        id
      )
      dispatchSync('transaction', 'delete', id, { id }, (sb, uid) =>
        syncDeleteTransaction(sb, uid, id)
      )
      sharesToDelete.forEach((share) => {
        dispatchSync('expense_share', 'delete', share.id, { id: share.id }, (sb, uid) =>
          syncDeleteExpenseShare(sb, uid, share.id)
        )
      })
      if (updatedRecToSync) {
        const rToSync: RecurringPayment = updatedRecToSync
        dispatchSync('recurring', 'update', rToSync.id, rToSync, (sb, uid) =>
          syncUpsertRecurring(sb, uid, rToSync)
        )
      }
    },
    [state, commit, dispatchSync]
  )

  /* ==========================================================================
     Cuentas
     ========================================================================== */

  const updateAccountInitialBalance = useCallback(
    (accountId: string, newInitialBalance: number) => {
      const sanitized = isNaN(newInitialBalance) ? 0 : Math.round(newInitialBalance * 100) / 100
      const nextAccounts = state.accounts.map((acc) =>
        acc.id === accountId ? { ...acc, initialBalance: sanitized } : acc
      )
      commit({
        ...state,
        accounts: nextAccounts,
      })
      const updated = nextAccounts.find((a) => a.id === accountId)
      if (updated) {
        dispatchSync('account', 'update', accountId, updated, (sb, uid) =>
          syncUpsertAccount(sb, uid, updated)
        )
      }
    },
    [state, commit, dispatchSync]
  )

  /* ==========================================================================
     Objetivos de Ahorro
     ========================================================================== */

  const addSavingsGoal = useCallback(
    (input: CreateSavingsGoalInput) => {
      const newGoal: SavingsGoal = {
        ...input,
        id: crypto.randomUUID(),
        target: Number(input.target),
        current: Number(input.current ?? 0),
        completed: Boolean(input.completed),
      }
      commit({
        ...state,
        goals: [...state.goals, newGoal],
      })
      dispatchSync('goal', 'insert', newGoal.id, newGoal, (sb, uid) =>
        syncUpsertGoal(sb, uid, newGoal)
      )
    },
    [state, commit, dispatchSync]
  )

  const updateSavingsGoal = useCallback(
    (id: string, updates: UpdateSavingsGoalInput) => {
      const nextGoals = state.goals.map((g) => {
        if (g.id !== id) return g
        return {
          ...g,
          ...updates,
          target: updates.target !== undefined ? Number(updates.target) : g.target,
          current: updates.current !== undefined ? Number(updates.current) : g.current,
        }
      })
      commit({
        ...state,
        goals: nextGoals,
      })
      const updated = nextGoals.find((g) => g.id === id)
      if (updated) {
        dispatchSync('goal', 'update', id, updated, (sb, uid) =>
          syncUpsertGoal(sb, uid, updated)
        )
      }
    },
    [state, commit, dispatchSync]
  )

  const deleteSavingsGoal = useCallback(
    (id: string) => {
      commit({
        ...state,
        goals: state.goals.filter((g) => g.id !== id),
      })
      dispatchSync('goal', 'delete', id, { id }, (sb, uid) =>
        syncDeleteGoal(sb, uid, id)
      )
    },
    [state, commit, dispatchSync]
  )

  /**
   * Asignar ahorro libre a un objetivo existente.
   */
  const allocateSavingsToGoal = useCallback(
    (goalId: string, amount: number): boolean => {
      const numericAmount = Math.round(amount * 100) / 100
      if (numericAmount <= 0) return false

      const savingsBalance = selectSavingsBalance(reconciledAccounts)
      const currentAssigned = selectAssignedSavings(state.goals)
      const reservesAllocated = selectTotalAllocatedToReserves(state.reserves)
      const emergencyAllocated = state.planSettings.emergencyFundCurrent || 0
      const freeSavings = selectFreeSavingsWithReserves(
        savingsBalance,
        emergencyAllocated,
        currentAssigned,
        reservesAllocated
      )

      if (numericAmount > freeSavings) {
        return false
      }

      let updatedGoal: SavingsGoal | undefined
      const nextGoals = state.goals.map((g) => {
        if (g.id !== goalId) return g
        const updatedCurrent = Math.round((g.current + numericAmount) * 100) / 100
        updatedGoal = {
          ...g,
          current: updatedCurrent,
          completed: updatedCurrent >= g.target,
        }
        return updatedGoal
      })

      commit({
        ...state,
        goals: nextGoals,
      })
      if (updatedGoal) {
        dispatchSync('goal', 'update', goalId, updatedGoal, (sb, uid) =>
          syncUpsertGoal(sb, uid, updatedGoal!)
        )
      }
      return true
    },
    [state, reconciledAccounts, commit, dispatchSync]
  )

  /**
   * Retirar/desasignar ahorro de un objetivo para devolverlo a Ahorro libre.
   */
  const deallocateSavingsFromGoal = useCallback(
    (goalId: string, amount: number): boolean => {
      const numericAmount = Math.round(amount * 100) / 100
      if (numericAmount <= 0) return false

      const goal = state.goals.find((g) => g.id === goalId)
      if (!goal || goal.current <= 0) return false

      const effectiveDealloc = Math.min(goal.current, numericAmount)
      let updatedGoal: SavingsGoal | undefined
      const nextGoals = state.goals.map((g) => {
        if (g.id !== goalId) return g
        const updatedCurrent = Math.round((g.current - effectiveDealloc) * 100) / 100
        updatedGoal = {
          ...g,
          current: updatedCurrent,
          completed: updatedCurrent >= g.target,
        }
        return updatedGoal
      })

      commit({
        ...state,
        goals: nextGoals,
      })
      if (updatedGoal) {
        dispatchSync('goal', 'update', goalId, updatedGoal, (sb, uid) =>
          syncUpsertGoal(sb, uid, updatedGoal!)
        )
      }
      return true
    },
    [state, commit, dispatchSync]
  )

  /* ==========================================================================
     Gastos Recurrentes
     ========================================================================== */

  const addRecurringPayment = useCallback(
    (input: CreateRecurringPaymentInput) => {
      const newRec: RecurringPayment = {
        ...input,
        id: crypto.randomUUID(),
        amount: Number(input.amount),
        active: input.active !== undefined ? input.active : true,
      }
      commit({
        ...state,
        recurring: [...state.recurring, newRec],
      })
      dispatchSync('recurring', 'insert', newRec.id, newRec, (sb, uid) =>
        syncUpsertRecurring(sb, uid, newRec)
      )
    },
    [state, commit, dispatchSync]
  )

  const updateRecurringPayment = useCallback(
    (id: string, updates: UpdateRecurringPaymentInput) => {
      const nextRecurring = state.recurring.map((r) => {
        if (r.id !== id) return r
        return {
          ...r,
          ...updates,
          amount: updates.amount !== undefined ? Number(updates.amount) : r.amount,
        }
      })
      commit({
        ...state,
        recurring: nextRecurring,
      })
      const updated = nextRecurring.find((r) => r.id === id)
      if (updated) {
        dispatchSync('recurring', 'update', id, updated, (sb, uid) =>
          syncUpsertRecurring(sb, uid, updated)
        )
      }
    },
    [state, commit, dispatchSync]
  )

  const deleteRecurringPayment = useCallback(
    (id: string) => {
      commit({
        ...state,
        recurring: state.recurring.filter((r) => r.id !== id),
      })
      dispatchSync('recurring', 'delete', id, { id }, (sb, uid) =>
        syncDeleteRecurring(sb, uid, id)
      )
    },
    [state, commit, dispatchSync]
  )

  const toggleRecurringPayment = useCallback(
    (id: string) => {
      const nextRecurring = state.recurring.map((r) =>
        r.id === id ? { ...r, active: !r.active } : r
      )
      commit({
        ...state,
        recurring: nextRecurring,
      })
      const updated = nextRecurring.find((r) => r.id === id)
      if (updated) {
        dispatchSync('recurring', 'update', id, updated, (sb, uid) =>
          syncUpsertRecurring(sb, uid, updated)
        )
      }
    },
    [state, commit, dispatchSync]
  )

  const confirmRecurringPayment = useCallback(
    (
      id: string,
      monthsCountOrDate: number | string = 1,
      confirmationDate?: string,
      overridePaymentMethod?: PaymentMethod,
      overrideAccountId?: string
    ): Transaction | null => {
      const rec = state.recurring.find((r) => r.id === id)
      if (!rec) return null

      let monthsCount = 1
      let dateStr = new Date().toISOString()

      if (typeof monthsCountOrDate === 'number') {
        monthsCount = Math.max(1, Math.round(monthsCountOrDate))
        if (confirmationDate) dateStr = confirmationDate
      } else if (typeof monthsCountOrDate === 'string') {
        dateStr = monthsCountOrDate
      }

      const d = new Date(dateStr)
      const currentMonth = d.getMonth()
      const currentYear = d.getFullYear()

      // Idempotencia: Verificar si ya existe una transacción para este recurrente en este mes
      if (isRecurringCoveredInMonth(rec, state.transactions, currentYear, currentMonth)) {
        console.warn(`[useFinance] El pago recurrente ${id} ya fue confirmado/cubierto para este ciclo`)
        return null
      }

      const isMonthlyExpense = rec.type !== 'income' && rec.frequency === 'monthly'
      const effectiveMonths = isMonthlyExpense ? monthsCount : 1
      const totalAmount = Math.round(rec.amount * effectiveMonths * 100) / 100
      const description = isMonthlyExpense
        ? formatCoverageDescription(rec.name, dateStr, effectiveMonths)
        : rec.name

      const isContactPaid = rec.paidBy === 'contact' || rec.sharingTemplate?.payer === 'contact'
      const payerName = rec.payerName || rec.sharingTemplate?.payerName || 'Contacto'
      const payerContactId = rec.payerContactId || rec.sharingTemplate?.payerContactId || undefined

      const effectivePaymentMethod = overridePaymentMethod || rec.expensePaymentMethod || rec.paymentMethod || 'bank'
      const effectiveAccountId = effectivePaymentMethod === 'cash' ? 'cash' : (overrideAccountId || rec.accountId || 'daily')

      // 1. Crear transacción real vinculada con recurringPaymentId
      const newTx: Transaction = {
        id: `tx_${crypto.randomUUID()}`,
        type: 'expense',
        amount: totalAmount,
        description,
        categoryId: rec.categoryId,
        accountId: effectiveAccountId,
        date: dateStr,
        recurringPaymentId: rec.id,
        isShared: Boolean(rec.isShared),
        paymentMethod: effectivePaymentMethod,
        paidBy: isContactPaid ? 'contact' : 'user',
        payerName: isContactPaid ? payerName : undefined,
        payerContactId: isContactPaid ? payerContactId : undefined,
      }

      // Si es un recurrente compartido, crear las partes independientes para ESTE ciclo
      let cycleShares: ExpenseShare[] = []
      if (rec.isShared && rec.sharingTemplate) {
        if (isContactPaid) {
          if (rec.sharingTemplate.splitType === 'equal') {
            const splitResults = splitExpenseEqually(
              totalAmount,
              rec.sharingTemplate.participants,
              rec.sharingTemplate.includePayer,
              'Tú'
            )
            cycleShares = splitResults.map((s) => {
              const isPayer =
                s.participantName.toLowerCase() === payerName.toLowerCase() ||
                (Boolean(payerContactId) && s.contactId === payerContactId)
              const isUser = s.participantName.toLowerCase() === 'tú' || s.isPayerShare
              return {
                id: crypto.randomUUID(),
                expenseTransactionId: newTx.id,
                contactId: s.contactId,
                participantName: s.participantName,
                isPayerShare: isPayer,
                isUserShare: isUser && !isPayer,
                expectedAmount: s.amount,
                createdAt: dateStr,
                updatedAt: dateStr,
              }
            })
          } else {
            const rawShares: ExpenseShare[] = rec.sharingTemplate.participants.map((p) => {
              const isPayer =
                p.name.toLowerCase() === payerName.toLowerCase() ||
                (Boolean(payerContactId) && p.contactId === payerContactId)
              return {
                id: crypto.randomUUID(),
                expenseTransactionId: newTx.id,
                contactId: p.contactId,
                participantName: p.name,
                isPayerShare: isPayer,
                isUserShare: !isPayer && (Boolean(p.isUserShare) || p.name.toLowerCase() === 'tú'),
                expectedAmount: Math.round(Number(p.amount) * effectiveMonths * 100) / 100,
                createdAt: dateStr,
                updatedAt: dateStr,
              }
            })

            if (rec.sharingTemplate.includePayer && !rawShares.some((s) => s.isUserShare)) {
              const externalTotal = rawShares.reduce((s, sh) => s + sh.expectedAmount, 0)
              const userAmount = Math.max(0, Math.round((totalAmount - externalTotal) * 100) / 100)
              rawShares.unshift({
                id: crypto.randomUUID(),
                expenseTransactionId: newTx.id,
                participantName: 'Tú',
                isPayerShare: false,
                isUserShare: true,
                expectedAmount: userAmount,
                createdAt: dateStr,
                updatedAt: dateStr,
              })
            }

            if (!rawShares.some((s) => s.isPayerShare)) {
              const othersTotal = rawShares
                .filter((s) => !s.isPayerShare)
                .reduce((s, sh) => s + sh.expectedAmount, 0)
              const payerShareAmount = Math.max(0, Math.round((totalAmount - othersTotal) * 100) / 100)
              rawShares.push({
                id: crypto.randomUUID(),
                expenseTransactionId: newTx.id,
                contactId: payerContactId,
                participantName: payerName,
                isPayerShare: true,
                isUserShare: false,
                expectedAmount: payerShareAmount,
                createdAt: dateStr,
                updatedAt: dateStr,
              })
            }

            cycleShares = rawShares
          }
        } else {
          if (rec.sharingTemplate.splitType === 'equal') {
            const splitResults = splitExpenseEqually(
              totalAmount,
              rec.sharingTemplate.participants,
              rec.sharingTemplate.includePayer,
              'Tú'
            )
            cycleShares = splitResults.map((s) => ({
              id: crypto.randomUUID(),
              expenseTransactionId: newTx.id,
              contactId: s.contactId,
              participantName: s.participantName,
              isPayerShare: s.isPayerShare,
              expectedAmount: s.amount,
              createdAt: dateStr,
              updatedAt: dateStr,
            }))
          } else {
            cycleShares = rec.sharingTemplate.participants.map((p) => ({
              id: crypto.randomUUID(),
              expenseTransactionId: newTx.id,
              contactId: p.contactId,
              participantName: p.name,
              isPayerShare: false,
              expectedAmount: Math.round(Number(p.amount) * effectiveMonths * 100) / 100,
              createdAt: dateStr,
              updatedAt: dateStr,
            }))

            if (rec.sharingTemplate.includePayer) {
              const externalTotal = cycleShares.reduce((s, sh) => s + sh.expectedAmount, 0)
              const payerAmount = Math.max(0, Math.round((totalAmount - externalTotal) * 100) / 100)
              cycleShares.unshift({
                id: crypto.randomUUID(),
                expenseTransactionId: newTx.id,
                participantName: 'Tú',
                isPayerShare: true,
                expectedAmount: payerAmount,
                createdAt: dateStr,
                updatedAt: dateStr,
              })
            }
          }
        }
      }

      // 2. Avanzar nextDate según los ciclos cubiertos
      let nextDate = rec.nextDate
      for (let i = 0; i < effectiveMonths; i++) {
        nextDate = calculateNextRecurringDate(nextDate, rec.frequency)
      }
      const updatedRec: RecurringPayment = {
        ...rec,
        nextDate,
      }

      const nextRecurring = state.recurring.map((r) => (r.id === id ? updatedRec : r))
      const nextTxs = [newTx, ...state.transactions]
      const nextShares = [...cycleShares, ...(state.expenseShares ?? [])]

      // Commit atómico local optimista
      commit({
        ...state,
        transactions: nextTxs,
        recurring: nextRecurring,
        expenseShares: nextShares,
      })

      // Sincronización atómica/granular: primero la transacción, luego shares, luego el recurrente
      dispatchSync('transaction', 'insert', newTx.id, newTx, (sb, uid) =>
        syncInsertTransaction(sb, uid, newTx)
      )
      cycleShares.forEach((share) => {
        dispatchSync('expense_share', 'insert', share.id, share, (sb, uid) =>
          syncUpsertExpenseShare(sb, uid, share)
        )
      })
      dispatchSync('recurring', 'update', rec.id, updatedRec, (sb, uid) =>
        syncUpsertRecurring(sb, uid, updatedRec)
      )

      return newTx
    },
    [state, commit, dispatchSync]
  )

  const postponeRecurringPayment = useCallback(
    (id: string, daysToPostpone = 7) => {
      const rec = state.recurring.find((r) => r.id === id)
      if (!rec) return
      const parts = rec.nextDate.split('-').map(Number)
      const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
      d.setUTCDate(d.getUTCDate() + daysToPostpone)
      const newNextDate = d.toISOString().slice(0, 10)

      const updatedRec: RecurringPayment = {
        ...rec,
        nextDate: newNextDate,
      }

      const nextRecurring = state.recurring.map((r) => (r.id === id ? updatedRec : r))
      commit({
        ...state,
        recurring: nextRecurring,
      })
      dispatchSync('recurring', 'update', rec.id, updatedRec, (sb, uid) =>
        syncUpsertRecurring(sb, uid, updatedRec)
      )
    },
    [state, commit, dispatchSync]
  )


  /* ==========================================================================
     Presupuestos por Categoría
     ========================================================================== */

  const addBudget = useCallback(
    (input: CreateBudgetInput) => {
      const newBudget: Budget = {
        ...input,
        id: crypto.randomUUID(),
        amountLimit: Number(input.amountLimit),
        period: input.period ?? 'monthly',
        monthlyLimit: Number(input.amountLimit),
      }
      commit({
        ...state,
        budgets: [...state.budgets, newBudget],
      })
      dispatchSync('budget', 'insert', newBudget.id, newBudget, (sb, uid) =>
        syncUpsertBudget(sb, uid, newBudget)
      )
    },
    [state, commit, dispatchSync]
  )

  const updateBudget = useCallback(
    (id: string, updates: UpdateBudgetInput) => {
      const nextBudgets = state.budgets.map((b) => {
        if (b.id !== id) return b
        const amount = updates.amountLimit !== undefined ? Number(updates.amountLimit) : b.amountLimit
        return {
          ...b,
          ...updates,
          amountLimit: amount,
          monthlyLimit: amount,
        }
      })
      commit({
        ...state,
        budgets: nextBudgets,
      })
      const updated = nextBudgets.find((b) => b.id === id)
      if (updated) {
        dispatchSync('budget', 'update', id, updated, (sb, uid) =>
          syncUpsertBudget(sb, uid, updated)
        )
      }
    },
    [state, commit, dispatchSync]
  )

  const deleteBudget = useCallback(
    (id: string) => {
      commit({
        ...state,
        budgets: state.budgets.filter((b) => b.id !== id),
      })
      dispatchSync('budget', 'delete', id, { id }, (sb, uid) =>
        syncDeleteBudget(sb, uid, id)
      )
    },
    [state, commit, dispatchSync]
  )

  /* ==========================================================================
     Plan Financiero y Fondo de Emergencia
     ========================================================================== */

  const updatePlanSettings = useCallback(
    (updates: UpdatePlanSettingsInput) => {
      const nextSettings = {
        ...state.planSettings,
        ...updates,
      }
      commit({
        ...state,
        planSettings: nextSettings,
      })
      dispatchSync('planSettings', 'update', 'settings', nextSettings, (sb, uid) =>
        syncUpsertPlanSettings(sb, uid, nextSettings)
      )
    },
    [state, commit, dispatchSync]
  )

  /**
   * Asignar ahorro libre al fondo de emergencia.
   */
  const allocateEmergencyFund = useCallback(
    (amount: number): boolean => {
      const num = Math.round(amount * 100) / 100
      if (num <= 0) return false

      const savingsBalance = selectSavingsBalance(reconciledAccounts)
      const currentAssigned = selectAssignedSavings(state.goals)
      const reservesAllocated = selectTotalAllocatedToReserves(state.reserves)
      const emergencyAllocated = state.planSettings.emergencyFundCurrent || 0
      const freeSavings = selectFreeSavingsWithReserves(
        savingsBalance,
        emergencyAllocated,
        currentAssigned,
        reservesAllocated
      )

      if (num > freeSavings) return false

      const nextCurrent = Math.round((emergencyAllocated + num) * 100) / 100
      const nextSettings = {
        ...state.planSettings,
        emergencyFundCurrent: nextCurrent,
      }
      commit({
        ...state,
        planSettings: nextSettings,
      })
      dispatchSync('planSettings', 'update', 'settings', nextSettings, (sb, uid) =>
        syncUpsertPlanSettings(sb, uid, nextSettings)
      )
      return true
    },
    [state, reconciledAccounts, commit, dispatchSync]
  )

  /**
   * Retirar ahorro del fondo de emergencia al ahorro libre.
   */
  const deallocateEmergencyFund = useCallback(
    (amount: number): boolean => {
      const num = Math.round(amount * 100) / 100
      if (num <= 0) return false

      const current = state.planSettings.emergencyFundCurrent || 0
      if (current <= 0) return false

      const effectiveDealloc = Math.min(current, num)
      const nextCurrent = Math.round((current - effectiveDealloc) * 100) / 100
      const nextSettings = {
        ...state.planSettings,
        emergencyFundCurrent: nextCurrent,
      }
      commit({
        ...state,
        planSettings: nextSettings,
      })
      dispatchSync('planSettings', 'update', 'settings', nextSettings, (sb, uid) =>
        syncUpsertPlanSettings(sb, uid, nextSettings)
      )
      return true
    },
    [state, commit, dispatchSync]
  )

  /* ==========================================================================
     Reservas (Gastos Previstos de Medio Plazo)
     ========================================================================== */

  const addReserve = useCallback(
    (input: CreateReserveInput) => {
      const newReserve: Reserve = {
        ...input,
        id: crypto.randomUUID(),
        targetAmount: Number(input.targetAmount),
        currentAllocated: Number(input.currentAllocated ?? 0),
        active: input.active !== undefined ? input.active : true,
        specialPeriodId: input.specialPeriodId || undefined,
      }
      commit({
        ...state,
        reserves: [...state.reserves, newReserve],
      })
      dispatchSync('reserve', 'insert', newReserve.id, newReserve, (sb, uid) =>
        syncUpsertReserve(sb, uid, newReserve)
      )
    },
    [state, commit, dispatchSync]
  )

  const updateReserve = useCallback(
    (id: string, updates: UpdateReserveInput) => {
      const nextReserves = state.reserves.map((r) => {
        if (r.id !== id) return r
        let specialPeriodId = r.specialPeriodId
        if (updates.specialPeriodId !== undefined) {
          specialPeriodId = updates.specialPeriodId || undefined
        }
        return {
          ...r,
          ...updates,
          targetAmount: updates.targetAmount !== undefined ? Number(updates.targetAmount) : r.targetAmount,
          currentAllocated:
            updates.currentAllocated !== undefined ? Number(updates.currentAllocated) : r.currentAllocated,
          specialPeriodId,
        }
      })
      commit({
        ...state,
        reserves: nextReserves,
      })
      const updated = nextReserves.find((r) => r.id === id)
      if (updated) {
        dispatchSync('reserve', 'update', id, updated, (sb, uid) =>
          syncUpsertReserve(sb, uid, updated)
        )
      }
    },
    [state, commit, dispatchSync]
  )

  /**
   * Eliminar reserva: Al eliminarla, su dinero asignado queda liberado automáticamente a ahorro libre.
   */
  const deleteReserve = useCallback(
    (id: string) => {
      commit({
        ...state,
        reserves: state.reserves.filter((r) => r.id !== id),
      })
      dispatchSync('reserve', 'delete', id, { id }, (sb, uid) =>
        syncDeleteReserve(sb, uid, id)
      )
    },
    [state, commit, dispatchSync]
  )

  /**
   * Asignar ahorro libre a una reserva.
   */
  const allocateToReserve = useCallback(
    (reserveId: string, amount: number): boolean => {
      const num = Math.round(amount * 100) / 100
      if (num <= 0) return false

      const savingsBalance = selectSavingsBalance(reconciledAccounts)
      const currentAssigned = selectAssignedSavings(state.goals)
      const reservesAllocated = selectTotalAllocatedToReserves(state.reserves)
      const emergencyAllocated = state.planSettings.emergencyFundCurrent || 0
      const freeSavings = selectFreeSavingsWithReserves(
        savingsBalance,
        emergencyAllocated,
        currentAssigned,
        reservesAllocated
      )

      if (num > freeSavings) return false

      let updatedRes: Reserve | undefined
      const nextReserves = state.reserves.map((r) => {
        if (r.id !== reserveId) return r
        const updated = Math.round((r.currentAllocated + num) * 100) / 100
        updatedRes = { ...r, currentAllocated: updated }
        return updatedRes
      })

      commit({
        ...state,
        reserves: nextReserves,
      })
      if (updatedRes) {
        dispatchSync('reserve', 'update', reserveId, updatedRes, (sb, uid) =>
          syncUpsertReserve(sb, uid, updatedRes!)
        )
      }
      return true
    },
    [state, reconciledAccounts, commit, dispatchSync]
  )

  /**
   * Desasignar ahorro de una reserva para devolverlo al ahorro libre.
   */
  const deallocateFromReserve = useCallback(
    (reserveId: string, amount: number): boolean => {
      const num = Math.round(amount * 100) / 100
      if (num <= 0) return false

      const reserve = state.reserves.find((r) => r.id === reserveId)
      if (!reserve || reserve.currentAllocated <= 0) return false

      const effectiveDealloc = Math.min(reserve.currentAllocated, num)
      let updatedRes: Reserve | undefined
      const nextReserves = state.reserves.map((r) => {
        if (r.id !== reserveId) return r
        const updated = Math.round((r.currentAllocated - effectiveDealloc) * 100) / 100
        updatedRes = { ...r, currentAllocated: updated }
        return updatedRes
      })

      commit({
        ...state,
        reserves: nextReserves,
      })
      if (updatedRes) {
        dispatchSync('reserve', 'update', reserveId, updatedRes, (sb, uid) =>
          syncUpsertReserve(sb, uid, updatedRes!)
        )
      }
      return true
    },
    [state, commit, dispatchSync]
  )

  /* ==========================================================================
     Periodos Especiales / Estacionalidad
     ========================================================================== */

  const addSpecialPeriod = useCallback(
    (input: CreateSpecialPeriodInput) => {
      const rawBudget = input.expectedExtraBudget
      const parsedBudget =
        rawBudget === undefined || rawBudget === null || (typeof rawBudget === 'string' && (rawBudget as string).trim() === '')
          ? undefined
          : Number(rawBudget)

      const newPeriod: SpecialPeriod = {
        ...input,
        id: crypto.randomUUID(),
        expectedExtraBudget: parsedBudget !== undefined && !isNaN(parsedBudget) ? parsedBudget : undefined,
      }
      commit({
        ...state,
        specialPeriods: [...state.specialPeriods, newPeriod],
      })
      dispatchSync('specialPeriod', 'insert', newPeriod.id, newPeriod, (sb, uid) =>
        syncUpsertSpecialPeriod(sb, uid, newPeriod)
      )
    },
    [state, commit, dispatchSync]
  )

  const updateSpecialPeriod = useCallback(
    (id: string, updates: UpdateSpecialPeriodInput) => {
      const nextPeriods = state.specialPeriods.map((p) => {
        if (p.id !== id) return p
        let expectedExtraBudget = p.expectedExtraBudget
        if (updates.expectedExtraBudget !== undefined) {
          if (
            updates.expectedExtraBudget === null ||
            (typeof updates.expectedExtraBudget === 'string' && (updates.expectedExtraBudget as string).trim() === '')
          ) {
            expectedExtraBudget = undefined
          } else {
            const num = Number(updates.expectedExtraBudget)
            expectedExtraBudget = !isNaN(num) ? num : undefined
          }
        }
        return {
          ...p,
          ...updates,
          expectedExtraBudget,
        }
      })
      commit({
        ...state,
        specialPeriods: nextPeriods,
      })
      const updated = nextPeriods.find((p) => p.id === id)
      if (updated) {
        dispatchSync('specialPeriod', 'update', id, updated, (sb, uid) =>
          syncUpsertSpecialPeriod(sb, uid, updated)
        )
      }
    },
    [state, commit, dispatchSync]
  )

  const deleteSpecialPeriod = useCallback(
    (id: string) => {
      // Desvincular de forma segura las reservas asociadas sin borrarlas
      const affectedReserves: Reserve[] = []
      const nextReserves = state.reserves.map((r) => {
        if (r.specialPeriodId === id) {
          const unlinked: Reserve = { ...r, specialPeriodId: undefined }
          affectedReserves.push(unlinked)
          return unlinked
        }
        return r
      })

      commit({
        ...state,
        reserves: nextReserves,
        specialPeriods: state.specialPeriods.filter((p) => p.id !== id),
      })
      dispatchSync('specialPeriod', 'delete', id, { id }, (sb, uid) =>
        syncDeleteSpecialPeriod(sb, uid, id)
      )
      affectedReserves.forEach((r) => {
        dispatchSync('reserve', 'update', r.id, r, (sb, uid) =>
          syncUpsertReserve(sb, uid, r)
        )
      })
    },
    [state, commit, dispatchSync]
  )

  /* ==========================================================================
     Perfil de Usuario
     ========================================================================== */

  const updateProfile = useCallback(
    (updates: UpdateProfileInput) => {
      const nextProfile: UserProfile = {
        ...(state.profile ?? initialProfile),
        ...updates,
        displayName: updates.displayName !== undefined ? updates.displayName.trim() : (state.profile?.displayName ?? ''),
      }
      commit(
        {
          ...state,
          profile: nextProfile,
        },
        'profile'
      )
      dispatchSync('profile', 'update', syncUserId || 'profile', nextProfile, (sb, uid) =>
        syncUpsertProfile(sb, uid, nextProfile)
      )
    },
    [state, commit, dispatchSync, syncUserId]
  )

  /* ==========================================================================
     Gastos Variables Previstos (por uso o sesión periódica)
     ========================================================================== */

  const addVariableExpenseEstimate = useCallback(
    (input: CreateVariableExpenseEstimateInput) => {
      const newEstimate: VariableExpenseEstimate = {
        ...input,
        id: `est_${crypto.randomUUID()}`,
        unitCost: Number(input.unitCost),
        frequencyValue: Number(input.frequencyValue),
        active: input.active !== false,
      }
      commit({
        ...state,
        variableExpenseEstimates: [...(state.variableExpenseEstimates ?? []), newEstimate],
      })
      dispatchSync('variable_expense_estimate', 'insert', newEstimate.id, newEstimate, (sb, uid) =>
        syncUpsertVariableExpenseEstimate(sb, uid, newEstimate)
      )
    },
    [state, commit, dispatchSync]
  )

  const updateVariableExpenseEstimate = useCallback(
    (id: string, updates: UpdateVariableExpenseEstimateInput) => {
      const nextEstimates = (state.variableExpenseEstimates ?? []).map((e) => {
        if (e.id !== id) return e
        return {
          ...e,
          ...updates,
          unitCost: updates.unitCost !== undefined ? Number(updates.unitCost) : e.unitCost,
          frequencyValue: updates.frequencyValue !== undefined ? Number(updates.frequencyValue) : e.frequencyValue,
          active: updates.active !== undefined ? updates.active : e.active,
        }
      })
      commit({
        ...state,
        variableExpenseEstimates: nextEstimates,
      })
      const updated = nextEstimates.find((e) => e.id === id)
      if (updated) {
        dispatchSync('variable_expense_estimate', 'update', id, updated, (sb, uid) =>
          syncUpsertVariableExpenseEstimate(sb, uid, updated)
        )
      }
    },
    [state, commit, dispatchSync]
  )

  const deleteVariableExpenseEstimate = useCallback(
    (id: string) => {
      commit({
        ...state,
        variableExpenseEstimates: (state.variableExpenseEstimates ?? []).filter((e) => e.id !== id),
      })
      dispatchSync('variable_expense_estimate', 'delete', id, { id }, (sb, uid) =>
        syncDeleteVariableExpenseEstimate(sb, uid, id)
      )
    },
    [state, commit, dispatchSync]
  )

  const toggleVariableExpenseEstimate = useCallback(
    (id: string) => {
      const current = (state.variableExpenseEstimates ?? []).find((e) => e.id === id)
      if (current) {
        updateVariableExpenseEstimate(id, { active: !current.active })
      }
    },
    [state.variableExpenseEstimates, updateVariableExpenseEstimate]
  )

  /* ==========================================================================
     Módulo de Efectivo (Dinero físico independiente)
     ========================================================================== */

  const addCashTransaction = useCallback(
    (
      input: CreateCashTransactionInput,
      shares?: { participantName: string; contactId?: string; isPayerShare: boolean; isUserShare?: boolean; expectedAmount: number }[]
    ): CashTransaction => {
      const amount = Number(input.amount)
      if (isNaN(amount) || !isFinite(amount)) {
        throw new Error('El importe debe ser un número válido.')
      }
      if ((input.type === 'income' || input.type === 'expense') && amount <= 0) {
        throw new Error('El importe de un ingreso o gasto de efectivo debe ser mayor que 0.')
      }
      if (input.type === 'adjustment' && amount === 0) {
        throw new Error('El importe de un ajuste de efectivo no puede ser 0.')
      }

      const nowIso = new Date().toISOString()
      const isShared = Boolean(input.type === 'expense' && shares && shares.length > 0)
      const newCashTx: CashTransaction = {
        ...input,
        id: `cash_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        amount,
        isShared,
        createdAt: nowIso,
        updatedAt: nowIso,
      }

      let createdShares: ExpenseShare[] = []
      let newContacts: SharedContact[] = []
      const currentContacts = state.sharedContacts ?? []

      if (isShared && shares) {
        createdShares = shares.map((s) => ({
          id: crypto.randomUUID(),
          expenseTransactionId: newCashTx.id,
          contactId: s.contactId,
          participantName: s.participantName.trim(),
          isPayerShare: s.isPayerShare,
          isUserShare: s.isUserShare,
          expectedAmount: Number(s.expectedAmount),
          createdAt: nowIso,
          updatedAt: nowIso,
        }))

        shares.forEach((s) => {
          if (!s.isUserShare && s.participantName.toLowerCase() !== 'tú') {
            const name = s.participantName.trim()
            const exists =
              currentContacts.some((c) => c.displayName.toLowerCase() === name.toLowerCase()) ||
              newContacts.some((c) => c.displayName.toLowerCase() === name.toLowerCase())
            if (!exists && name.length > 0) {
              newContacts.push({
                id: s.contactId || crypto.randomUUID(),
                displayName: name,
                createdAt: nowIso,
                updatedAt: nowIso,
              })
            }
          }
        })
      }

      const nextContacts = [...newContacts, ...currentContacts]
      const nextShares = [...createdShares, ...(state.expenseShares ?? [])]

      commit(
        {
          ...state,
          cashTransactions: [newCashTx, ...(state.cashTransactions ?? [])],
          expenseShares: nextShares,
          sharedContacts: nextContacts,
        },
        newCashTx.id
      )

      dispatchSync('cash_transaction', 'insert', newCashTx.id, newCashTx, (sb, uid) =>
        syncUpsertCashTransaction(sb, uid, newCashTx)
      )
      createdShares.forEach((share) => {
        dispatchSync('expense_share', 'insert', share.id, share, (sb, uid) =>
          syncUpsertExpenseShare(sb, uid, share)
        )
      })
      newContacts.forEach((c) => {
        dispatchSync('shared_contact', 'insert', c.id, c, (sb, uid) =>
          syncUpsertSharedContact(sb, uid, c)
        )
      })

      return newCashTx
    },
    [state, commit, dispatchSync]
  )

  const updateCashTransaction = useCallback(
    (
      id: string,
      patch: UpdateCashTransactionInput,
      shares?: { participantName: string; contactId?: string; isPayerShare: boolean; isUserShare?: boolean; expectedAmount: number }[]
    ): CashTransaction | null => {
      const existing = (state.cashTransactions ?? []).find((tx) => tx.id === id)
      if (!existing) return null

      const isSameType = !patch.type || patch.type === existing.type

      const merged = {
        ...existing,
        ...patch,
        bankTransactionId: patch.bankTransactionId !== undefined ? patch.bankTransactionId : (isSameType ? existing.bankTransactionId : undefined),
        paidBy: patch.paidBy !== undefined ? patch.paidBy : existing.paidBy,
        payerName: patch.payerName !== undefined ? patch.payerName : existing.payerName,
        payerContactId: patch.payerContactId !== undefined ? patch.payerContactId : existing.payerContactId,
      }
      const amount = merged.amount !== undefined ? Number(merged.amount) : existing.amount
      if (isNaN(amount) || !isFinite(amount)) {
        throw new Error('El importe debe ser un número válido.')
      }
      if ((merged.type === 'income' || merged.type === 'expense') && amount <= 0) {
        throw new Error('El importe de un ingreso o gasto de efectivo debe ser mayor que 0.')
      }
      if (merged.type === 'adjustment' && amount === 0) {
        throw new Error('El importe de un ajuste de efectivo no puede ser 0.')
      }

      const nowIso = new Date().toISOString()
      const updatedTx: CashTransaction = {
        ...merged,
        amount,
        updatedAt: nowIso,
      }

      let nextExpenseShares = state.expenseShares ?? []
      let nextSharedContacts = state.sharedContacts ?? []
      const sharesToDelete: string[] = []
      const sharesToUpsert: ExpenseShare[] = []
      const contactsToUpsert: SharedContact[] = []

      if (shares !== undefined) {
        const existingSharesForTx = nextExpenseShares.filter((s) => s.expenseTransactionId === id)
        const otherShares = nextExpenseShares.filter((s) => s.expenseTransactionId !== id)

        if (shares.length > 0) {
          updatedTx.isShared = true
          const usedExistingIds = new Set<string>()

          const finalShares: ExpenseShare[] = shares.map((s) => {
            const nameTrimmed = s.participantName.trim()
            const matchedExisting = existingSharesForTx.find(
              (ex) =>
                !usedExistingIds.has(ex.id) &&
                ((s.isPayerShare && ex.isPayerShare) ||
                  (!s.isPayerShare && !ex.isPayerShare && ex.participantName.toLowerCase() === nameTrimmed.toLowerCase()))
            )

            if (matchedExisting) {
              usedExistingIds.add(matchedExisting.id)
              const updatedShare: ExpenseShare = {
                ...matchedExisting,
                participantName: nameTrimmed,
                contactId: s.contactId,
                isPayerShare: s.isPayerShare,
                isUserShare: s.isUserShare,
                expectedAmount: Number(s.expectedAmount),
                updatedAt: nowIso,
              }
              sharesToUpsert.push(updatedShare)
              return updatedShare
            } else {
              const newShare: ExpenseShare = {
                id: crypto.randomUUID(),
                expenseTransactionId: id,
                contactId: s.contactId,
                participantName: nameTrimmed,
                isPayerShare: s.isPayerShare,
                isUserShare: s.isUserShare,
                expectedAmount: Number(s.expectedAmount),
                createdAt: nowIso,
                updatedAt: nowIso,
              }
              sharesToUpsert.push(newShare)

              if (!s.isUserShare && s.participantName.toLowerCase() !== 'tú') {
                const exists =
                  nextSharedContacts.some((c) => c.displayName.toLowerCase() === nameTrimmed.toLowerCase()) ||
                  contactsToUpsert.some((c) => c.displayName.toLowerCase() === nameTrimmed.toLowerCase())
                if (!exists && nameTrimmed.length > 0) {
                  const newContact: SharedContact = {
                    id: s.contactId || crypto.randomUUID(),
                    displayName: nameTrimmed,
                    createdAt: nowIso,
                    updatedAt: nowIso,
                  }
                  contactsToUpsert.push(newContact)
                }
              }
              return newShare
            }
          })

          existingSharesForTx.forEach((oldShare) => {
            if (!usedExistingIds.has(oldShare.id)) {
              sharesToDelete.push(oldShare.id)
            }
          })

          nextExpenseShares = [...finalShares, ...otherShares]
          nextSharedContacts = [...contactsToUpsert, ...nextSharedContacts]
        } else {
          updatedTx.isShared = false
          existingSharesForTx.forEach((oldShare) => {
            sharesToDelete.push(oldShare.id)
          })
          nextExpenseShares = otherShares
        }
      }

      const nextCashTxs = (state.cashTransactions ?? []).map((tx) => (tx.id === id ? updatedTx : tx))
      commit(
        {
          ...state,
          cashTransactions: nextCashTxs,
          expenseShares: nextExpenseShares,
          sharedContacts: nextSharedContacts,
        },
        id
      )

      dispatchSync('cash_transaction', 'update', id, updatedTx, (sb, uid) =>
        syncUpsertCashTransaction(sb, uid, updatedTx)
      )
      sharesToDelete.forEach((shareId) => {
        dispatchSync('expense_share', 'delete', shareId, { id: shareId }, (sb, uid) =>
          syncDeleteExpenseShare(sb, uid, shareId)
        )
      })
      sharesToUpsert.forEach((share) => {
        dispatchSync('expense_share', 'insert', share.id, share, (sb, uid) =>
          syncUpsertExpenseShare(sb, uid, share)
        )
      })
      contactsToUpsert.forEach((contact) => {
        dispatchSync('shared_contact', 'insert', contact.id, contact, (sb, uid) =>
          syncUpsertSharedContact(sb, uid, contact)
        )
      })

      return updatedTx
    },
    [state, commit, dispatchSync]
  )

  const deleteCashTransaction = useCallback(
    (id: string) => {
      const sharesToDelete = (state.expenseShares ?? []).filter((s) => s.expenseTransactionId === id)
      const remainingShares = (state.expenseShares ?? []).filter((s) => s.expenseTransactionId !== id)
      const nextCashTxs = (state.cashTransactions ?? []).filter((tx) => tx.id !== id)

      commit({
        ...state,
        cashTransactions: nextCashTxs,
        expenseShares: remainingShares,
      }, id)

      dispatchSync('cash_transaction', 'delete', id, { id }, (sb, uid) =>
        syncDeleteCashTransaction(sb, uid, id)
      )
      sharesToDelete.forEach((share) => {
        dispatchSync('expense_share', 'delete', share.id, { id: share.id }, (sb, uid) =>
          syncDeleteExpenseShare(sb, uid, share.id)
        )
      })
    },
    [state, commit, dispatchSync]
  )

  const adjustCashToAmount = useCallback(
    (countedAmount: number, date?: string, note?: string): CashTransaction | null => {
      const currentBalance = selectCashBalance(state.cashTransactions ?? [])
      const input = createCashAdjustmentInput(currentBalance, countedAmount, date, note)
      if (!input) return null
      return addCashTransaction(input)
    },
    [state.cashTransactions, addCashTransaction]
  )

  const adjustAccountToAmount = useCallback(
    (accountId: string, realAmount: number, date?: string, note?: string): Transaction | null => {
      const targetAcc = reconciledAccounts.find((a) => a.id === accountId)
      if (!targetAcc) throw new Error('Cuenta no encontrada.')

      const currentBalance = targetAcc.balance ?? 0
      const diff = Math.round((Number(realAmount) - currentBalance) * 100) / 100

      if (diff === 0) return null

      const dateStr = date || new Date().toISOString()
      const desc = diff > 0 ? 'Ajuste de saldo (positivo)' : 'Ajuste de saldo (negativo)'
      const finalNote = note ? `Ajuste: ${note}` : 'Corrección de saldo bancario'

      if (diff > 0) {
        return addTransaction({
          type: 'income',
          amount: diff,
          accountId,
          date: dateStr,
          description: desc,
          note: finalNote,
          specialType: 'account_adjustment',
        })
      } else {
        return addTransaction({
          type: 'expense',
          amount: Math.abs(diff),
          accountId,
          date: dateStr,
          description: desc,
          note: finalNote,
          specialType: 'account_adjustment',
        })
      }
    },
    [reconciledAccounts, addTransaction]
  )

  const recordTransfer = useCallback(
    (input: {
      fromType: 'account' | 'cash'
      fromAccountId?: string
      toType: 'account' | 'cash'
      toAccountId?: string
      amount: number
      date?: string
      note?: string
      description?: string
    }) => {
      const amt = Math.round(Number(input.amount) * 100) / 100
      if (isNaN(amt) || amt <= 0) {
        throw new Error('El importe de la transferencia debe ser mayor que 0.')
      }
      const date = input.date || new Date().toISOString()
      const note = input.note?.trim() || undefined

      // Caso 1: Cuenta -> Cuenta
      if (input.fromType === 'account' && input.toType === 'account') {
        if (!input.fromAccountId || !input.toAccountId) {
          throw new Error('Debes seleccionar cuenta de origen y destino.')
        }
        if (input.fromAccountId === input.toAccountId) {
          throw new Error('La cuenta de origen y destino no pueden ser la misma.')
        }
        const toAcc = state.accounts.find((a) => a.id === input.toAccountId)
        const desc = input.description || `Transferencia a ${toAcc?.name || 'otra cuenta'}`
        return addTransaction({
          type: 'transfer',
          amount: amt,
          accountId: input.fromAccountId,
          toAccountId: input.toAccountId,
          date,
          description: desc,
          note,
        })
      }

      // Caso 2: Cuenta -> Efectivo (Retirada cajero)
      if (input.fromType === 'account' && input.toType === 'cash') {
        if (!input.fromAccountId) {
          throw new Error('Debes seleccionar la cuenta bancaria de origen.')
        }
        const fromAcc = state.accounts.find((a) => a.id === input.fromAccountId)
        const desc = input.description || `Retirada de efectivo · ${fromAcc?.name || 'Banco'}`
        const bankTx = addTransaction({
          type: 'expense',
          specialType: 'cash_withdrawal',
          amount: amt,
          accountId: input.fromAccountId,
          date,
          description: desc,
          note,
        })
        const cashTx = addCashTransaction({
          type: 'income',
          amount: amt,
          date,
          description: 'Retirada de cajero',
          bankTransactionId: bankTx.id,
          note: note || `Transferido desde ${fromAcc?.name || 'Banco'}`,
          paymentMethod: 'cash',
        })
        return { bankTx, cashTx }
      }

      // Caso 3: Efectivo -> Cuenta (Ingreso en cajero / banco)
      if (input.fromType === 'cash' && input.toType === 'account') {
        if (!input.toAccountId) {
          throw new Error('Debes seleccionar la cuenta bancaria de destino.')
        }
        const toAcc = state.accounts.find((a) => a.id === input.toAccountId)
        const desc = input.description || `Ingreso en cuenta desde efectivo`
        const bankTx = addTransaction({
          type: 'income',
          incomeKind: 'reimbursement',
          specialType: 'reimbursement',
          amount: amt,
          accountId: input.toAccountId,
          date,
          description: desc,
          note: note || 'Transferido desde Efectivo',
          paymentMethod: 'bank',
        })
        const cashTx = addCashTransaction({
          type: 'expense',
          amount: amt,
          date,
          description: `Ingreso en ${toAcc?.name || 'cuenta bancaria'}`,
          bankTransactionId: bankTx.id,
          note,
          paymentMethod: 'cash',
        })
        return { bankTx, cashTx }
      }

      throw new Error('Origen y destino no válidos para la transferencia.')
    },
    [state.accounts, addTransaction, addCashTransaction]
  )

  const switchMovementMedium = useCallback(
    (params: {
      from: 'bank' | 'cash'
      id: string
      to: 'bank' | 'cash'
      transactionData: CreateTransactionInput | CreateCashTransactionInput
      shares?: { participantName: string; contactId?: string; isPayerShare: boolean; isUserShare?: boolean; expectedAmount: number }[]
    }) => {
      const { from, id, to, transactionData, shares } = params

      if (from === 'bank' && to === 'cash') {
        const existingBankTx = state.transactions.find((t) => t.id === id)
        const targetShareId = (transactionData as any).expenseShareId || existingBankTx?.expenseShareId
        const parentExpId =
          (transactionData as any).bankTransactionId ||
          (transactionData as any).parentExpenseId ||
          existingBankTx?.parentExpenseId

        let noteText = transactionData.note || existingBankTx?.note || ''
        if (targetShareId && !noteText.includes(`[share:${targetShareId}]`)) {
          noteText = `${noteText} [share:${targetShareId}]`.trim()
        }

        const newCashId = `cash_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        const nowIso = new Date().toISOString()
        const newCashTx: CashTransaction = {
          id: newCashId,
          type: (transactionData.type === 'expense' || transactionData.type === 'income' || transactionData.type === 'adjustment')
            ? transactionData.type
            : (existingBankTx?.type === 'income' ? 'income' : 'expense'),
          amount: Number(transactionData.amount !== undefined ? transactionData.amount : existingBankTx?.amount || 0),
          description: transactionData.description || existingBankTx?.description || 'Movimiento',
          date: transactionData.date || existingBankTx?.date || nowIso,
          categoryId: transactionData.categoryId !== undefined ? transactionData.categoryId : existingBankTx?.categoryId,
          note: noteText || undefined,
          bankTransactionId: parentExpId,
          paymentMethod: 'cash',
          isShared: Boolean(transactionData.isShared ?? existingBankTx?.isShared),
          paidBy: transactionData.paidBy ?? existingBankTx?.paidBy,
          payerName: transactionData.payerName ?? existingBankTx?.payerName,
          payerContactId: transactionData.payerContactId ?? existingBankTx?.payerContactId,
          createdAt: existingBankTx?.date || nowIso,
          updatedAt: nowIso,
        }

        // Re-parentar ExpenseShares existentes si este gasto era compartido
        const nextExpenseShares = (state.expenseShares ?? []).map((s) =>
          s.expenseTransactionId === id ? { ...s, expenseTransactionId: newCashId, updatedAt: nowIso } : s
        )
        // Re-parentar cualquier transacción hija que apuntara a este gasto
        const nextTransactions = state.transactions
          .filter((t) => t.id !== id)
          .map((t) => (t.parentExpenseId === id ? { ...t, parentExpenseId: newCashId } : t))
        const nextCashTransactions = [
          newCashTx,
          ...(state.cashTransactions ?? []).map((c) =>
            c.bankTransactionId === id ? { ...c, bankTransactionId: newCashId } : c
          ),
        ]

        commit(
          {
            ...state,
            transactions: nextTransactions,
            cashTransactions: nextCashTransactions,
            expenseShares: nextExpenseShares,
          },
          newCashId
        )

        dispatchSync('transaction', 'delete', id, { id }, (sb, uid) =>
          syncDeleteTransaction(sb, uid, id)
        )
        dispatchSync('cash_transaction', 'insert', newCashId, newCashTx, (sb, uid) =>
          syncUpsertCashTransaction(sb, uid, newCashTx)
        )
        nextExpenseShares
          .filter((s) => s.expenseTransactionId === newCashId)
          .forEach((s) => {
            dispatchSync('expense_share', 'update', s.id, s, (sb, uid) =>
              syncUpsertExpenseShare(sb, uid, s)
            )
          })

        return newCashTx
      }

      if (from === 'cash' && to === 'bank') {
        const existingCashTx = state.cashTransactions?.find((c) => c.id === id)
        const parentExpId =
          (transactionData as any).parentExpenseId ||
          (transactionData as any).bankTransactionId ||
          existingCashTx?.bankTransactionId
        const targetShareId =
          (transactionData as any).expenseShareId ||
          existingCashTx?.note?.match(/\[share:([^\]]+)\]/)?.[1]
        const isReimb =
          (transactionData as any).incomeKind === 'reimbursement' ||
          (existingCashTx?.type === 'income' && Boolean(parentExpId))

        const newBankId = crypto.randomUUID()
        const nowIso = new Date().toISOString()
        const newBankTx: Transaction = {
          id: newBankId,
          type: (transactionData.type === 'expense' || transactionData.type === 'income' || transactionData.type === 'transfer')
            ? transactionData.type
            : (existingCashTx?.type === 'income' ? 'income' : 'expense'),
          amount: Number(transactionData.amount !== undefined ? transactionData.amount : existingCashTx?.amount || 0),
          accountId: (transactionData as any).accountId || 'daily',
          categoryId: transactionData.categoryId !== undefined ? transactionData.categoryId : existingCashTx?.categoryId,
          description: transactionData.description || existingCashTx?.description || 'Movimiento',
          date: transactionData.date || existingCashTx?.date || nowIso,
          note: transactionData.note !== undefined ? transactionData.note : existingCashTx?.note,
          paymentMethod: (transactionData as any).paymentMethod === 'bizum' ? 'bizum' : 'bank',
          incomeKind: isReimb ? 'reimbursement' : ((transactionData as any).incomeKind || undefined),
          parentExpenseId: parentExpId,
          expenseShareId: targetShareId,
          isShared: Boolean(transactionData.isShared ?? existingCashTx?.isShared),
          paidBy: transactionData.paidBy ?? existingCashTx?.paidBy,
          payerName: transactionData.payerName ?? existingCashTx?.payerName,
          payerContactId: transactionData.payerContactId ?? existingCashTx?.payerContactId,
          specialType: 'normal',
        }

        // Re-parentar ExpenseShares si era compartido
        const nextExpenseShares = (state.expenseShares ?? []).map((s) =>
          s.expenseTransactionId === id ? { ...s, expenseTransactionId: newBankId, updatedAt: nowIso } : s
        )
        // Re-parentar transacciones hijas
        const nextTransactions = [
          newBankTx,
          ...state.transactions.map((t) => (t.parentExpenseId === id ? { ...t, parentExpenseId: newBankId } : t)),
        ]
        const nextCashTransactions = (state.cashTransactions ?? [])
          .filter((c) => c.id !== id)
          .map((c) => (c.bankTransactionId === id ? { ...c, bankTransactionId: newBankId } : c))

        commit(
          {
            ...state,
            transactions: nextTransactions,
            cashTransactions: nextCashTransactions,
            expenseShares: nextExpenseShares,
          },
          newBankId
        )

        dispatchSync('cash_transaction', 'delete', id, { id }, (sb, uid) =>
          syncDeleteCashTransaction(sb, uid, id)
        )
        dispatchSync('transaction', 'insert', newBankId, newBankTx, (sb, uid) =>
          syncInsertTransaction(sb, uid, newBankTx)
        )
        nextExpenseShares
          .filter((s) => s.expenseTransactionId === newBankId)
          .forEach((s) => {
            dispatchSync('expense_share', 'update', s.id, s, (sb, uid) =>
              syncUpsertExpenseShare(sb, uid, s)
            )
          })

        return newBankTx
      }
    },
    [state, commit, dispatchSync]
  )

  const convertMovementType = useCallback(
    (params: {
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
      }
      shares?: { participantName: string; contactId?: string; isPayerShare: boolean; isUserShare?: boolean; expectedAmount: number }[]
    }) => {
      const { id, fromMedium, targetType, targetMedium = 'bank', targetData, shares } = params
      const amt = Math.round(Number(targetData.amount) * 100) / 100
      if (isNaN(amt) || amt <= 0) {
        throw new Error('El importe debe ser mayor que 0.')
      }
      const date = targetData.date || new Date().toISOString()
      const desc = targetData.description.trim() || 'Movimiento'
      const note = targetData.note?.trim() || undefined

      // CASE 1: TARGET IS TRANSFER
      if (targetType === 'transfer') {
        const fromType = targetData.fromType || (fromMedium === 'cash' ? 'cash' : 'account')
        const toType = targetData.toType || 'cash'
        const fromAccountId = fromType === 'account' ? (targetData.fromAccountId || 'daily') : undefined
        const toAccountId = toType === 'account' ? (targetData.toAccountId || 'savings') : undefined

        if (fromType === 'account' && toType === 'account') {
          if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
            throw new Error('Debes seleccionar cuentas distintas de origen y destino.')
          }
        }

        // 1A: From Account -> To Cash (Retirada de efectivo / Cajero)
        if (fromType === 'account' && toType === 'cash') {
          if (fromMedium === 'bank') {
            const updatedBankTx: Transaction = {
              id,
              type: 'expense',
              specialType: 'cash_withdrawal',
              amount: amt,
              accountId: fromAccountId || 'daily',
              date,
              description: desc,
              note,
              categoryId: undefined,
              isShared: false,
              toAccountId: undefined,
            }

            const existingCash = (state.cashTransactions ?? []).find((c) => c.bankTransactionId === id)
            let nextCashTxs = state.cashTransactions ?? []
            let newOrUpdatedCash: CashTransaction

            if (existingCash) {
              newOrUpdatedCash = {
                ...existingCash,
                type: 'income',
                amount: amt,
                date,
                description: desc || 'Retirada de cajero',
                note: note || existingCash.note,
                paymentMethod: 'cash',
              }
              nextCashTxs = nextCashTxs.map((c) => (c.id === existingCash.id ? newOrUpdatedCash : c))
            } else {
              newOrUpdatedCash = {
                id: crypto.randomUUID(),
                type: 'income',
                amount: amt,
                date,
                description: desc || 'Retirada de cajero',
                bankTransactionId: id,
                paymentMethod: 'cash',
                note: note || 'Transferido desde Banco',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
              nextCashTxs = [newOrUpdatedCash, ...nextCashTxs]
            }

            const nextTxs = state.transactions.map((t) => (t.id === id ? updatedBankTx : t))
            const nextShares = (state.expenseShares ?? []).filter((s) => s.expenseTransactionId !== id)

            commit({
              ...state,
              transactions: nextTxs,
              cashTransactions: nextCashTxs,
              expenseShares: nextShares,
            }, id)

            dispatchSync('transaction', 'update', id, updatedBankTx, (sb, uid) =>
              syncUpdateTransaction(sb, uid, updatedBankTx)
            )
            dispatchSync('cash_transaction', existingCash ? 'update' : 'insert', newOrUpdatedCash.id, newOrUpdatedCash, (sb, uid) =>
              syncUpsertCashTransaction(sb, uid, newOrUpdatedCash)
            )
            return { bankTx: updatedBankTx, cashTx: newOrUpdatedCash }
          } else {
            deleteCashTransaction(id)
            return recordTransfer({
              fromType: 'account',
              fromAccountId,
              toType: 'cash',
              amount: amt,
              date,
              description: desc,
              note,
            })
          }
        }

        // 1B: From Account -> To Account (Transferencia bancaria interna)
        if (fromType === 'account' && toType === 'account') {
          if (fromMedium === 'bank') {
            const updatedBankTx: Transaction = {
              id,
              type: 'transfer',
              amount: amt,
              accountId: fromAccountId!,
              toAccountId: toAccountId!,
              date,
              description: desc,
              note,
              categoryId: undefined,
              isShared: false,
              specialType: undefined,
            }

            const linkedCash = (state.cashTransactions ?? []).find((c) => c.bankTransactionId === id)
            const nextCashTxs = (state.cashTransactions ?? []).filter((c) => c.bankTransactionId !== id)
            const nextTxs = state.transactions.map((t) => (t.id === id ? updatedBankTx : t))
            const nextShares = (state.expenseShares ?? []).filter((s) => s.expenseTransactionId !== id)

            commit({
              ...state,
              transactions: nextTxs,
              cashTransactions: nextCashTxs,
              expenseShares: nextShares,
            }, id)

            dispatchSync('transaction', 'update', id, updatedBankTx, (sb, uid) =>
              syncUpdateTransaction(sb, uid, updatedBankTx)
            )
            if (linkedCash) {
              dispatchSync('cash_transaction', 'delete', linkedCash.id, { id: linkedCash.id }, (sb, uid) =>
                syncDeleteCashTransaction(sb, uid, linkedCash.id)
              )
            }
            return updatedBankTx
          } else {
            deleteCashTransaction(id)
            return recordTransfer({
              fromType: 'account',
              fromAccountId,
              toType: 'account',
              toAccountId,
              amount: amt,
              date,
              description: desc,
              note,
            })
          }
        }

        // 1C: From Cash -> To Account (Ingreso en cuenta desde efectivo)
        if (fromType === 'cash' && toType === 'account') {
          if (fromMedium === 'bank') {
            deleteTransaction(id)
          } else {
            deleteCashTransaction(id)
          }
          return recordTransfer({
            fromType: 'cash',
            toType: 'account',
            toAccountId,
            amount: amt,
            date,
            description: desc,
            note,
          })
        }
      }

      // CASE 2: TARGET IS EXPENSE
      if (targetType === 'expense') {
        const isTargetCash = targetMedium === 'cash'

        if (isTargetCash) {
          if (fromMedium === 'bank') {
            deleteTransaction(id)
            const linkedCash = (state.cashTransactions ?? []).find((c) => c.bankTransactionId === id)
            if (linkedCash) deleteCashTransaction(linkedCash.id)

            const cashPayload: CreateCashTransactionInput = {
              type: 'expense',
              amount: amt,
              description: desc,
              date,
              categoryId: targetData.categoryId,
              note,
              paymentMethod: 'cash',
              isShared: Boolean(targetData.isShared),
              paidBy: targetData.isShared ? targetData.paidBy : undefined,
              payerName: targetData.isShared && targetData.paidBy === 'contact' ? targetData.payerName : undefined,
              payerContactId: targetData.isShared && targetData.paidBy === 'contact' ? targetData.payerContactId : undefined,
            }
            return addCashTransaction(cashPayload, shares)
          } else {
            const patch: UpdateCashTransactionInput = {
              type: 'expense',
              amount: amt,
              description: desc,
              date,
              categoryId: targetData.categoryId,
              note,
              paymentMethod: 'cash',
              isShared: Boolean(targetData.isShared),
              paidBy: targetData.isShared ? targetData.paidBy : undefined,
              payerName: targetData.isShared && targetData.paidBy === 'contact' ? targetData.payerName : undefined,
              payerContactId: targetData.isShared && targetData.paidBy === 'contact' ? targetData.payerContactId : undefined,
            }
            return updateCashTransaction(id, patch, shares)
          }
        } else {
          // Destino: Banco
          if (fromMedium === 'bank') {
            const linkedCash = (state.cashTransactions ?? []).find((c) => c.bankTransactionId === id)
            if (linkedCash) {
              deleteCashTransaction(linkedCash.id)
            }

            const bankPayload: Partial<CreateTransactionInput> = {
              type: 'expense',
              specialType: 'normal',
              toAccountId: undefined,
              incomeKind: undefined,
              parentExpenseId: undefined,
              expenseShareId: undefined,
              amount: amt,
              accountId: targetData.accountId || 'daily',
              categoryId: targetData.categoryId,
              date,
              description: desc,
              note,
              expenseNature: targetData.expenseNature || 'variable',
              giftRecipient: targetData.giftRecipient,
              paymentMethod: targetData.isBizum ? 'bizum' : 'bank',
              isShared: Boolean(targetData.isShared),
              paidBy: targetData.isShared ? targetData.paidBy : undefined,
              payerName: targetData.isShared && targetData.paidBy === 'contact' ? targetData.payerName : undefined,
              payerContactId: targetData.isShared && targetData.paidBy === 'contact' ? targetData.payerContactId : undefined,
            }
            return updateTransaction(id, bankPayload, shares)
          } else {
            deleteCashTransaction(id)
            const bankPayload: CreateTransactionInput = {
              type: 'expense',
              amount: amt,
              accountId: targetData.accountId || 'daily',
              categoryId: targetData.categoryId,
              date,
              description: desc,
              note,
              specialType: 'normal',
              expenseNature: targetData.expenseNature || 'variable',
              giftRecipient: targetData.giftRecipient,
              paymentMethod: targetData.isBizum ? 'bizum' : 'bank',
              isShared: Boolean(targetData.isShared),
              paidBy: targetData.isShared ? targetData.paidBy : undefined,
              payerName: targetData.isShared && targetData.paidBy === 'contact' ? targetData.payerName : undefined,
              payerContactId: targetData.isShared && targetData.paidBy === 'contact' ? targetData.payerContactId : undefined,
            }
            if (targetData.isShared && shares && shares.length > 0) {
              return addSharedExpense(bankPayload, shares)
            }
            return addTransaction(bankPayload)
          }
        }
      }

      // CASE 3: TARGET IS INCOME
      if (targetType === 'income') {
        const isTargetCash = targetMedium === 'cash'

        if (isTargetCash) {
          if (fromMedium === 'bank') {
            deleteTransaction(id)
            const linkedCash = (state.cashTransactions ?? []).find((c) => c.bankTransactionId === id)
            if (linkedCash) deleteCashTransaction(linkedCash.id)

            const cashPayload: CreateCashTransactionInput = {
              type: 'income',
              amount: amt,
              description: desc,
              date,
              note,
              paymentMethod: 'cash',
            }
            return addCashTransaction(cashPayload)
          } else {
            const patch: UpdateCashTransactionInput = {
              type: 'income',
              amount: amt,
              description: desc,
              date,
              categoryId: undefined,
              note,
              paymentMethod: 'cash',
              isShared: false,
            }
            return updateCashTransaction(id, patch)
          }
        } else {
          // Destino: Banco
          if (fromMedium === 'bank') {
            const linkedCash = (state.cashTransactions ?? []).find((c) => c.bankTransactionId === id)
            if (linkedCash) deleteCashTransaction(linkedCash.id)

            const bankPayload: Partial<CreateTransactionInput> = {
              type: 'income',
              incomeKind: targetData.incomeKind || 'income',
              parentExpenseId: targetData.parentExpenseId,
              expenseShareId: targetData.expenseShareId,
              amount: amt,
              accountId: targetData.accountId || 'daily',
              categoryId: undefined,
              expenseNature: undefined,
              giftRecipient: undefined,
              isShared: false,
              toAccountId: undefined,
              specialType: 'normal',
              date,
              description: desc,
              note,
              paymentMethod: targetData.isBizum ? 'bizum' : 'bank',
            }
            return updateTransaction(id, bankPayload)
          } else {
            deleteCashTransaction(id)
            const bankPayload: CreateTransactionInput = {
              type: 'income',
              incomeKind: targetData.incomeKind || 'income',
              parentExpenseId: targetData.parentExpenseId,
              expenseShareId: targetData.expenseShareId,
              amount: amt,
              accountId: targetData.accountId || 'daily',
              date,
              description: desc,
              note,
              specialType: 'normal',
              paymentMethod: targetData.isBizum ? 'bizum' : 'bank',
            }
            return addTransaction(bankPayload)
          }
        }
      }
    },
    [
      state,
      commit,
      dispatchSync,
      deleteTransaction,
      deleteCashTransaction,
      recordTransfer,
      addCashTransaction,
      updateCashTransaction,
      updateTransaction,
      addTransaction,
      addSharedExpense,
    ]
  )

  /* ==========================================================================
     Totales y Conceptos Financieros Centralizados
     ========================================================================== */

  const totals = useMemo(() => {
    const now = new Date()
    const spendable = selectSpendableBalance(reconciledAccounts)
    const savings = selectSavingsBalance(reconciledAccounts)
    const totalMoney = selectTotalMoney(reconciledAccounts)

    // Clasificación del ahorro
    const goalsAllocated = selectAssignedSavings(state.goals)
    const reservesAllocated = selectTotalAllocatedToReserves(state.reserves)
    const emergencyAllocated = state.planSettings?.emergencyFundCurrent || 0
    const freeSavings = selectFreeSavingsWithReserves(
      savings,
      emergencyAllocated,
      goalsAllocated,
      reservesAllocated
    )

    const pendingRecurring = selectPendingRecurringPayments(
      state.recurring,
      state.transactions,
      now,
      'daily'
    )
    const committed = selectCommittedAmount(state.recurring, state.transactions, now, 'daily')
    const realAvailable = selectRealAvailable(spendable, committed)
    const monthExpenses = selectMonthExpenses(state.transactions, now)

    const budgetsSummary = selectBudgetsSummary(
      state.budgets,
      state.transactions,
      state.categories,
      now
    )

    // Métricas del plan financiero (Fase 3: Unificación canónica)
    const expectedIncomeDetail = selectExpectedMonthlyIncomeDetail(
      state.planSettings,
      state.recurring,
      state.transactions,
      state.cashTransactions ?? [],
      now
    )
    const monthlyIncome = expectedIncomeDetail.amount
    const expectedCommittedExpenses = selectExpectedCommittedExpenses(state.recurring)
    const actualFixedExpenses = selectActualFixedMonthlyExpenses(state.transactions, now)
    const expectedVariableExpenses = selectExpectedVariableMonthlyExpenses(
      state.variableExpenseEstimates ?? [],
      state.budgets ?? []
    )
    const actualVariableExpenses = selectActualVariableMonthlyExpenses(state.transactions, now)
    const actualExtraordinaryExpenses = selectActualExtraordinaryMonthlyExpenses(state.transactions, now)
    const targetMonthlySavings = selectTargetMonthlySavings(state.planSettings, monthlyIncome)
    const actualMonthlySavings = selectActualMonthlySavings(state.transactions, reconciledAccounts, now)
    const emergencyFundBaseExpenses =
      expectedCommittedExpenses > 0
        ? expectedCommittedExpenses
        : selectEssentialMonthlyExpenses(state.categories, state.transactions, state.planSettings, now)
    const emergencyFundTarget = selectEmergencyFundTarget(state.planSettings, emergencyFundBaseExpenses)
    const emergencyFundMonthsCovered = selectEmergencyFundMonthsCovered(emergencyAllocated, emergencyFundBaseExpenses)
    const adjustedSpending = selectAdjustedMonthlySpendingExpectation(
      expectedCommittedExpenses + (expectedVariableExpenses ?? actualVariableExpenses),
      state.specialPeriods,
      now
    )

    const currentMonthKey = now.toISOString().slice(0, 7)
    const variableEstimatesSummary = calculateVariableEstimatesSummary(
      state.variableExpenseEstimates ?? [],
      state.transactions,
      currentMonthKey
    )
    const pendingVariableExpenses = variableEstimatesSummary.totalPendingEstimated
    const projectedAvailable = Math.round((realAvailable - pendingVariableExpenses) * 100) / 100

    // Métricas de gastos brutos vs netos e ingresos reales vs reembolsos
    const grossExpensesBreakdown = selectGrossExpensesByPaymentMethod(
      state.transactions,
      state.cashTransactions ?? [],
      now,
      'month'
    )
    const grossMonthExpenses = grossExpensesBreakdown.total
    const linkedReimbursementsMonth = selectLinkedReimbursementsForPeriod(
      state.transactions,
      now,
      'month',
      state.cashTransactions ?? [],
      state.expenseShares ?? []
    )
    const reimbursementsMonth = selectReimbursementsReceived(
      state.transactions,
      now,
      'month',
      state.cashTransactions ?? []
    )
    const netMonthExpenses = selectNetPersonalExpensesForPeriod(
      state.transactions,
      now,
      'month',
      state.cashTransactions ?? [],
      state.expenseShares ?? []
    )
    const netCategoryExpenses = selectNetExpensesByCategory(
      state.transactions,
      state.categories,
      now,
      'month',
      state.cashTransactions ?? [],
      state.expenseShares ?? []
    )
    const realMonthIncome = selectRealIncome(state.transactions, now)
    const pendingReimbursements = selectPendingReimbursements(
      state.expenseShares ?? [],
      state.transactions,
      state.cashTransactions ?? []
    )
    const pendingPayables = selectTotalPendingPayables(
      state.expenseShares ?? [],
      state.transactions,
      state.cashTransactions ?? []
    )

    const monthlyPlanSummary = selectMonthlyPlanCardSummary(
      state.planSettings,
      state.recurring,
      state.transactions,
      state.specialPeriods,
      state.reserves,
      state.variableExpenseEstimates,
      state.budgets,
      committed,
      now,
      state.cashTransactions ?? []
    )

    const estimatedMonthlyMargin = monthlyPlanSummary.plannedMargin

    const spendingControl = selectMonthlySpendingControl(
      state.planSettings,
      state.recurring,
      state.transactions,
      state.cashTransactions ?? [],
      state.expenseShares ?? [],
      state.specialPeriods,
      state.reserves,
      state.variableExpenseEstimates,
      state.budgets,
      now
    )

    return {
      // Compatibilidad y concepto neto principal
      daily: spendable,
      savings,
      total: totalMoney,
      committed,
      available: realAvailable,
      monthExpenses: netMonthExpenses, // "Gastado este mes" representa el gasto neto personal

      // Previsión de gastos variables
      pendingVariableExpenses,
      projectedAvailable,
      variableEstimatesSummary,

      // Gastos compartidos y reembolsos
      grossMonthExpenses,
      grossExpensesBreakdown,
      linkedReimbursementsMonth,
      reimbursementsMonth,
      netMonthExpenses,
      netCategoryExpenses,
      realMonthIncome,
      pendingReimbursements,
      pendingPayables,

      // Conceptos explícitos de dominio
      totalMoney,
      spendableBalance: spendable,
      savingsBalance: savings,
      assignedSavings: goalsAllocated,
      goalsAllocated,
      reservesAllocated,
      emergencyAllocated,
      freeSavings,
      committedAmount: committed,
      realAvailable,
      pendingRecurring,
      budgetsSummary,

      // Plan financiero y Control del mes
      spendingControl,
      planMetrics: {
        monthlyIncome,
        incomeDetail: expectedIncomeDetail,
        expectedCommittedExpenses,
        actualFixedExpenses,
        expectedVariableExpenses,
        actualVariableExpenses,
        actualExtraordinaryExpenses,
        // Compatibilidad:
        essentialMonthlyExpenses: expectedCommittedExpenses,
        variableMonthlyExpenses: actualVariableExpenses,
        targetMonthlySavings,
        actualMonthlySavings,
        emergencyFundTarget,
        emergencyFundMonthsCovered,
        estimatedMonthlyMargin,
        plannedMonthlyMargin: estimatedMonthlyMargin,
        currentRemainingMargin: monthlyPlanSummary.freeToSpend,
        adjustedSpending,
        monthlyPlanSummary,
        spendingControl,
      },
      monthlyPlanSummary,
    }
  }, [
    reconciledAccounts,
    state.goals,
    state.recurring,
    state.transactions,
    state.budgets,
    state.categories,
    state.reserves,
    state.specialPeriods,
    state.planSettings,
    state.variableExpenseEstimates,
    state.expenseShares,
    state.cashTransactions,
  ])

  /* ==========================================================================
     Manejadores Remotos (Realtime sin echo loops)
     ========================================================================== */

  const applyRemoteInsertTransaction = useCallback(
    (tx: Transaction) => {
      logPerfRealtimeReceived(tx.id)
      setState((prev) => {
        if (prev.transactions.some((t) => t.id === tx.id)) return prev
        const next = { ...prev, transactions: [tx, ...prev.transactions] }
        persistStateAsync(next, tx.id)
        return next
      })
      logPerfUiUpdated(tx.id)
    },
    [persistStateAsync]
  )

  const applyRemoteUpdateTransaction = useCallback(
    (tx: Transaction) => {
      logPerfRealtimeReceived(tx.id)
      setState((prev) => {
        const next = {
          ...prev,
          transactions: prev.transactions.map((t) => (t.id === tx.id ? tx : t)),
        }
        persistStateAsync(next, tx.id)
        return next
      })
      logPerfUiUpdated(tx.id)
    },
    [persistStateAsync]
  )

  const applyRemoteDeleteTransaction = useCallback(
    (txId: string) => {
      logPerfRealtimeReceived(txId)
      setState((prev) => {
        if (!prev.transactions.some((t) => t.id === txId)) return prev
        const next = {
          ...prev,
          transactions: prev.transactions.filter((t) => t.id !== txId),
        }
        persistStateAsync(next, txId)
        return next
      })
      logPerfUiUpdated(txId)
    },
    [persistStateAsync]
  )

  const applyRemoteUpdateAccount = useCallback(
    (acc: Account) => {
      setState((prev) => {
        const next = {
          ...prev,
          accounts: prev.accounts.map((a) => (a.id === acc.id ? acc : a)),
        }
        persistStateAsync(next)
        return next
      })
    },
    [persistStateAsync]
  )

  const applyRemoteUpsertBudget = useCallback(
    (b: Budget) => {
      setState((prev) => {
        const exists = prev.budgets.some((x) => x.id === b.id)
        const next = {
          ...prev,
          budgets: exists ? prev.budgets.map((x) => (x.id === b.id ? b : x)) : [...prev.budgets, b],
        }
        persistStateAsync(next)
        return next
      })
    },
    [persistStateAsync]
  )

  const applyRemoteDeleteBudget = useCallback(
    (budgetId: string) => {
      setState((prev) => {
        const next = {
          ...prev,
          budgets: prev.budgets.filter((b) => b.id !== budgetId),
        }
        persistStateAsync(next)
        return next
      })
    },
    [persistStateAsync]
  )

  const applyRemoteUpsertGoal = useCallback(
    (g: SavingsGoal) => {
      setState((prev) => {
        const exists = prev.goals.some((x) => x.id === g.id)
        const next = {
          ...prev,
          goals: exists ? prev.goals.map((x) => (x.id === g.id ? g : x)) : [...prev.goals, g],
        }
        persistStateAsync(next)
        return next
      })
    },
    [persistStateAsync]
  )

  const applyRemoteDeleteGoal = useCallback(
    (goalId: string) => {
      setState((prev) => {
        const next = {
          ...prev,
          goals: prev.goals.filter((g) => g.id !== goalId),
        }
        persistStateAsync(next)
        return next
      })
    },
    [persistStateAsync]
  )

  const applyRemoteUpsertReserve = useCallback(
    (r: Reserve) => {
      setState((prev) => {
        const exists = prev.reserves.some((x) => x.id === r.id)
        const next = {
          ...prev,
          reserves: exists ? prev.reserves.map((x) => (x.id === r.id ? r : x)) : [...prev.reserves, r],
        }
        persistStateAsync(next)
        return next
      })
    },
    [persistStateAsync]
  )

  const applyRemoteDeleteReserve = useCallback(
    (reserveId: string) => {
      setState((prev) => {
        const next = {
          ...prev,
          reserves: prev.reserves.filter((r) => r.id !== reserveId),
        }
        persistStateAsync(next)
        return next
      })
    },
    [persistStateAsync]
  )

  const applyRemoteUpsertRecurring = useCallback(
    (rec: RecurringPayment) => {
      setState((prev) => {
        const exists = prev.recurring.some((x) => x.id === rec.id)
        const next = {
          ...prev,
          recurring: exists ? prev.recurring.map((x) => (x.id === rec.id ? rec : x)) : [...prev.recurring, rec],
        }
        persistStateAsync(next)
        return next
      })
    },
    [persistStateAsync]
  )

  const applyRemoteDeleteRecurring = useCallback(
    (recId: string) => {
      setState((prev) => {
        const next = {
          ...prev,
          recurring: prev.recurring.filter((r) => r.id !== recId),
        }
        persistStateAsync(next)
        return next
      })
    },
    [persistStateAsync]
  )

  const applyRemoteUpsertSpecialPeriod = useCallback(
    (sp: SpecialPeriod) => {
      setState((prev) => {
        const exists = prev.specialPeriods.some((x) => x.id === sp.id)
        const next = {
          ...prev,
          specialPeriods: exists
            ? prev.specialPeriods.map((x) => (x.id === sp.id ? sp : x))
            : [...prev.specialPeriods, sp],
        }
        persistStateAsync(next)
        return next
      })
    },
    [persistStateAsync]
  )

  const applyRemoteDeleteSpecialPeriod = useCallback(
    (periodId: string) => {
      setState((prev) => {
        const next = {
          ...prev,
          specialPeriods: prev.specialPeriods.filter((p) => p.id !== periodId),
        }
        persistStateAsync(next)
        return next
      })
    },
    [persistStateAsync]
  )

  const applyRemoteUpdatePlanSettings = useCallback(
    (ps: FinancialPlanSettings) => {
      setState((prev) => {
        const next = { ...prev, planSettings: ps }
        persistStateAsync(next)
        return next
      })
    },
    [persistStateAsync]
  )

  const applyRemoteUpdateProfile = useCallback(
    (p: UserProfile) => {
      logPerfRealtimeReceived('profile')
      setState((prev) => {
        const next = { ...prev, profile: p }
        persistStateAsync(next, 'profile')
        return next
      })
      logPerfUiUpdated('profile')
    },
    [persistStateAsync]
  )

  const applyRemoteUpsertVariableExpenseEstimate = useCallback(
    (est: VariableExpenseEstimate) => {
      setState((prev) => {
        const existing = prev.variableExpenseEstimates ?? []
        const exists = existing.some((e) => e.id === est.id)
        const nextEstimates = exists
          ? existing.map((e) => (e.id === est.id ? est : e))
          : [...existing, est]
        const next = { ...prev, variableExpenseEstimates: nextEstimates }
        persistStateAsync(next)
        return next
      })
    },
    [persistStateAsync]
  )

  const applyRemoteDeleteVariableExpenseEstimate = useCallback(
    (estimateId: string) => {
      setState((prev) => {
        const next = {
          ...prev,
          variableExpenseEstimates: (prev.variableExpenseEstimates ?? []).filter((e) => e.id !== estimateId),
        }
        persistStateAsync(next)
        return next
      })
    },
    [persistStateAsync]
  )

  const applyRemoteUpsertSharedContact = useCallback(
    (contact: SharedContact) => {
      setState((prev) => {
        const existing = prev.sharedContacts ?? []
        const exists = existing.some((c) => c.id === contact.id)
        const nextContacts = exists
          ? existing.map((c) => (c.id === contact.id ? contact : c))
          : [contact, ...existing]
        const next = { ...prev, sharedContacts: nextContacts }
        persistStateAsync(next)
        return next
      })
    },
    [persistStateAsync]
  )

  const applyRemoteDeleteSharedContact = useCallback(
    (contactId: string) => {
      setState((prev) => {
        const next = {
          ...prev,
          sharedContacts: (prev.sharedContacts ?? []).filter((c) => c.id !== contactId),
        }
        persistStateAsync(next)
        return next
      })
    },
    [persistStateAsync]
  )

  const applyRemoteUpsertExpenseShare = useCallback(
    (share: ExpenseShare) => {
      setState((prev) => {
        const existing = prev.expenseShares ?? []
        const exists = existing.some((s) => s.id === share.id)
        const nextShares = exists
          ? existing.map((s) => (s.id === share.id ? share : s))
          : [share, ...existing]
        const next = { ...prev, expenseShares: nextShares }
        persistStateAsync(next)
        return next
      })
    },
    [persistStateAsync]
  )

  const applyRemoteDeleteExpenseShare = useCallback(
    (shareId: string) => {
      setState((prev) => {
        const next = {
          ...prev,
          expenseShares: (prev.expenseShares ?? []).filter((s) => s.id !== shareId),
        }
        persistStateAsync(next)
        return next
      })
    },
    [persistStateAsync]
  )

  const applyRemoteInsertCashTransaction = useCallback(
    (tx: CashTransaction) => {
      setState((prev) => {
        const existing = prev.cashTransactions ?? []
        const exists = existing.some((x) => x.id === tx.id)
        const nextCash = exists
          ? existing.map((x) => (x.id === tx.id ? tx : x))
          : [tx, ...existing]
        const next = { ...prev, cashTransactions: nextCash }
        persistStateAsync(next)
        return next
      })
    },
    [persistStateAsync]
  )

  const applyRemoteUpdateCashTransaction = useCallback(
    (tx: CashTransaction) => {
      setState((prev) => {
        const existing = prev.cashTransactions ?? []
        const exists = existing.some((x) => x.id === tx.id)
        const nextCash = exists
          ? existing.map((x) => (x.id === tx.id ? tx : x))
          : [tx, ...existing]
        const next = { ...prev, cashTransactions: nextCash }
        persistStateAsync(next)
        return next
      })
    },
    [persistStateAsync]
  )

  const applyRemoteDeleteCashTransaction = useCallback(
    (cashTxId: string) => {
      setState((prev) => {
        const next = {
          ...prev,
          cashTransactions: (prev.cashTransactions ?? []).filter((tx) => tx.id !== cashTxId),
        }
        persistStateAsync(next)
        return next
      })
    },
    [persistStateAsync]
  )

  const restoreState = useCallback(
    async (newState: PersistedState) => {
      const txs = newState.transactions ?? []
      const cashTxs = newState.cashTransactions ?? []
      const rawShares = newState.expenseShares ?? []

      // Detección y purga segura de huérfanos confirmados tras reconciliación completa
      const orphans = selectOrphanExpenseShares(rawShares, txs, cashTxs)
      if (orphans.length > 0) {
        orphans.forEach((orphan) => {
          console.warn(
            `[Integrity] Removing confirmed orphan expense share: ${orphan.id} (${orphan.participantName}, ${orphan.expectedAmount} €)`
          )
          dispatchSync('expense_share', 'delete', orphan.id, { id: orphan.id }, (sb, uid) =>
            syncDeleteExpenseShare(sb, uid, orphan.id)
          )
        })
      }

      const cleanShares = rawShares.filter((s) => !orphans.some((o) => o.id === s.id))

      const accountsWithInitial = (newState.accounts ?? initialFinanceState.accounts).map((acc) =>
        ensureAccountInitialBalance(acc, txs)
      )
      const completeState: PersistedState = {
        accounts: accountsWithInitial,
        transactions: txs,
        goals: newState.goals ?? [],
        recurring: newState.recurring ?? [],
        categories: newState.categories ?? [],
        budgets: newState.budgets ?? [],
        reserves: newState.reserves ?? [],
        specialPeriods: newState.specialPeriods ?? [],
        planSettings: newState.planSettings ?? initialFinanceState.planSettings,
        profile: newState.profile ?? initialFinanceState.profile,
        variableExpenseEstimates: newState.variableExpenseEstimates ?? [],
        sharedContacts: newState.sharedContacts ?? [],
        expenseShares: cleanShares,
        cashTransactions: cashTxs,
      }
      setState(completeState)
      const currentStorage = activeStorageRef.current ?? (isCustomStorage ? storage : null)
      if (currentStorage) {
        await currentStorage.save(completeState)
      }
    },
    [isCustomStorage, storage, dispatchSync]
  )

  const getFullState = useCallback((): PersistedState => {
    return {
      accounts: reconciledAccounts,
      transactions: state.transactions,
      goals: state.goals,
      recurring: state.recurring,
      categories: state.categories,
      budgets: state.budgets,
      reserves: state.reserves,
      specialPeriods: state.specialPeriods,
      planSettings: state.planSettings,
      profile: state.profile ?? initialFinanceState.profile,
      variableExpenseEstimates: state.variableExpenseEstimates ?? [],
      sharedContacts: state.sharedContacts ?? [],
      expenseShares: state.expenseShares ?? [],
      cashTransactions: state.cashTransactions ?? [],
    }
  }, [reconciledAccounts, state])

  return {
    ...state,
    profile: state.profile ?? initialFinanceState.profile,
    variableExpenseEstimates: state.variableExpenseEstimates ?? [],
    sharedContacts: state.sharedContacts ?? [],
    expenseShares: state.expenseShares ?? [],
    cashTransactions: state.cashTransactions ?? [],
    storageHydrated,
    setSyncUser,
    resetSession,
    setOnSyncStatusChange,
    accounts: reconciledAccounts,
    totals,
    addTransaction,
    addSharedExpense,
    recordReimbursement,
    recordPayablePayment,
    adjustDebt,
    addSharedContact,
    deleteSharedContact,
    updateTransaction,
    deleteTransaction,
    updateAccountInitialBalance,

    // Efectivo y Operaciones Unificadas
    addCashTransaction,
    updateCashTransaction,
    deleteCashTransaction,
    adjustCashToAmount,
    adjustAccountToAmount,
    recordTransfer,
    switchMovementMedium,
    convertMovementType,

    // Perfil
    updateProfile,

    // Gastos variables previstos
    addVariableExpenseEstimate,
    updateVariableExpenseEstimate,
    deleteVariableExpenseEstimate,
    toggleVariableExpenseEstimate,

    // Objetivos de ahorro
    addSavingsGoal,
    updateSavingsGoal,
    deleteSavingsGoal,
    allocateSavingsToGoal,
    deallocateSavingsFromGoal,

    // Gastos recurrentes
    addRecurringPayment,
    updateRecurringPayment,
    deleteRecurringPayment,
    toggleRecurringPayment,
    confirmRecurringPayment,
    postponeRecurringPayment,

    // Presupuestos
    addBudget,
    updateBudget,
    deleteBudget,

    // Plan financiero
    updatePlanSettings,
    allocateEmergencyFund,
    deallocateEmergencyFund,

    // Reservas
    addReserve,
    updateReserve,
    deleteReserve,
    allocateToReserve,
    deallocateFromReserve,

    // Periodos especiales
    addSpecialPeriod,
    updateSpecialPeriod,
    deleteSpecialPeriod,

    // Manejadores remotos (Realtime)
    applyRemoteInsertTransaction,
    applyRemoteUpdateTransaction,
    applyRemoteDeleteTransaction,
    applyRemoteUpdateAccount,
    applyRemoteUpsertBudget,
    applyRemoteDeleteBudget,
    applyRemoteUpsertGoal,
    applyRemoteDeleteGoal,
    applyRemoteUpsertReserve,
    applyRemoteDeleteReserve,
    applyRemoteUpsertRecurring,
    applyRemoteDeleteRecurring,
    applyRemoteUpsertSpecialPeriod,
    applyRemoteDeleteSpecialPeriod,
    applyRemoteUpdatePlanSettings,
    applyRemoteUpdateProfile,
    applyRemoteUpsertVariableExpenseEstimate,
    applyRemoteDeleteVariableExpenseEstimate,
    applyRemoteUpsertSharedContact,
    applyRemoteDeleteSharedContact,
    applyRemoteUpsertExpenseShare,
    applyRemoteDeleteExpenseShare,
    applyRemoteInsertCashTransaction,
    applyRemoteUpdateCashTransaction,
    applyRemoteDeleteCashTransaction,

    // Copias de seguridad
    restoreState,
    getFullState,
  }
}

export type FinanceStore = ReturnType<typeof useFinance>

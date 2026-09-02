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
} from '../models/finance'
import { defaultAppStorage } from '../services/storage/indexedDbAdapter'
import { defaultStorage } from '../services/storage/localStorageAdapter'
import type { PersistedState, StorageAdapter } from '../services/storage/storageAdapter'
import { selectBudgetsSummary } from '../utils/budgetSelectors'
import { ensureAccountInitialBalance, reconcileAccounts } from '../utils/balance'
import { calculateVariableEstimatesSummary } from '../utils/variableEstimates'
import {
  selectGrossExpenses,
  selectGrossExpensesForPeriod,
  selectLinkedReimbursementsForPeriod,
  selectReimbursementsReceived,
  selectNetPersonalExpenses,
  selectNetPersonalExpensesForPeriod,
  selectNetExpensesByCategory,
  selectRealIncome,
  selectPendingReimbursements,
  selectExpenseShareDetails,
  selectPendingDebtors,
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
  selectActualMonthlySavings,
  selectAdjustedMonthlySpendingExpectation,
  selectEmergencyFundMonthsCovered,
  selectEmergencyFundTarget,
  selectEssentialMonthlyExpenses,
  selectFreeSavingsWithReserves,
  selectMonthlyIncome,
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
}

export const initialFinanceState: PersistedState = demoFinanceState

export function useFinance(storage: StorageAdapter = defaultAppStorage) {
  const [state, setState] = useState<PersistedState>(() => {
    try {
      const raw = localStorage.getItem('pocketflow:v1')
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedState>
        // Detección estricta de datos demo/antiguos en localStorage para prevenir resurrecciones
        const hasLegacyDemo =
          (parsed.transactions ?? []).some(
            (t) => t.id === 't1' || t.description === 'Mercadona' || (t.id && /^t[1-7]$/.test(t.id))
          ) ||
          (parsed.accounts ?? []).some(
            (a) => a.initialBalance === 791.16 || a.initialBalance === 1120
          )

        if (!hasLegacyDemo) {
          const rawTxs = parsed.transactions ?? []
          const rawAccounts = (parsed.accounts ?? cleanAccounts).map((acc) =>
            ensureAccountInitialBalance(acc, rawTxs)
          )

          return {
            accounts: rawAccounts,
            transactions: rawTxs,
            goals: parsed.goals ?? [],
            recurring: parsed.recurring ?? [],
            categories: parsed.categories ?? seedCategories,
            budgets: parsed.budgets ?? [],
            reserves: parsed.reserves ?? [],
            specialPeriods: parsed.specialPeriods ?? [],
            planSettings: parsed.planSettings ?? cleanPlanSettings,
            profile: parsed.profile ?? initialProfile,
            variableExpenseEstimates: parsed.variableExpenseEstimates ?? [],
          }
        }
      }
    } catch {
      // ignore parse errors
    }
    return cleanInitialFinanceState
  })

  const [storageHydrated, setStorageHydrated] = useState(false)
  const [syncUserId, setSyncUserId] = useState<string | null>(null)

  // Carga asíncrona mediante el StorageAdapter
  useEffect(() => {
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
          })
        }
        setStorageHydrated(true)
      })
      .catch((err) => {
        console.warn('[Pocketflow] Error cargando almacenamiento:', err)
        if (mounted) setStorageHydrated(true)
      })
    return () => {
      mounted = false
    }
  }, [storage])

  const onSyncStatusChangeRef = useRef<((status: 'syncing' | 'up_to_date' | 'offline' | 'error') => void) | null>(null)

  const setOnSyncStatusChange = useCallback(
    (cb: ((status: 'syncing' | 'up_to_date' | 'offline' | 'error') => void) | null) => {
      onSyncStatusChangeRef.current = cb
    },
    []
  )

  const setSyncUser = useCallback((userId: string | null) => {
    setSyncUserId(userId)
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
            console.warn(`[Sync] Fallo en ${action} ${entity}, encolando offline:`, err)
            enqueueOfflineMutation({ entity, action, data })
            onSyncStatusChangeRef.current?.('offline')
          })
      } else {
        enqueueOfflineMutation({ entity, action, data })
        onSyncStatusChangeRef.current?.('offline')
      }
    },
    [syncUserId]
  )

  const persistStateAsync = useCallback(
    (next: PersistedState, correlationId?: string) => {
      queueMicrotask(() => {
        storage
          .save(next)
          .then(() => {
            if (correlationId) logPerfCacheApplied(correlationId)
          })
          .catch((err) => {
            console.error('[Pocketflow] Error persistiendo estado financiero:', err)
          })
      })
    },
    [storage]
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
    (input: CreateTransactionInput) => {
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
    },
    [state, commit, dispatchSync]
  )

  const addSharedExpense = useCallback(
    (
      input: CreateTransactionInput,
      shares: { participantName: string; contactId?: string; isPayerShare: boolean; expectedAmount: number }[]
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
        expectedAmount: Number(s.expectedAmount),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }))

      // Auto-guardar participantes no pagadores en sharedContacts para autocompletado
      const currentContacts = state.sharedContacts ?? []
      const newContacts: SharedContact[] = []
      shares.forEach((s) => {
        if (!s.isPayerShare) {
          const name = s.participantName.trim()
          const exists =
            currentContacts.some((c) => c.displayName.toLowerCase() === name.toLowerCase()) ||
            newContacts.some((c) => c.displayName.toLowerCase() === name.toLowerCase())
          if (!exists && name.length > 0) {
            newContacts.push({
              id: s.contactId || crypto.randomUUID(),
              displayName: name,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
          }
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
        dispatchSync('expense_share' as any, 'insert', share.id, share, (sb, uid) =>
          syncUpsertExpenseShare(sb, uid, share)
        )
      })
      newContacts.forEach((c) => {
        dispatchSync('shared_contact' as any, 'insert', c.id, c, (sb, uid) =>
          syncUpsertSharedContact(sb, uid, c)
        )
      })

      return { transaction: newTx, shares: createdShares }
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
    }) => {
      const parentTx = state.transactions.find((t) => t.id === input.parentExpenseId)
      const share = (state.expenseShares ?? []).find((s) => s.id === input.expenseShareId)
      const targetExpenseId = input.parentExpenseId || share?.expenseTransactionId

      const desc =
        input.description ||
        (share
          ? `Bizum ${share.participantName} · ${parentTx?.description || 'Reembolso'}`
          : `Reembolso · ${parentTx?.description || 'Gasto'}`)

      const newTx: Transaction = {
        id: crypto.randomUUID(),
        type: 'income',
        incomeKind: 'reimbursement',
        amount: Number(input.amount),
        accountId: input.accountId || parentTx?.accountId || 'daily',
        date: input.date || new Date().toISOString(),
        description: desc,
        note: input.note,
        parentExpenseId: targetExpenseId,
        expenseShareId: input.expenseShareId,
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
      dispatchSync('shared_contact' as any, 'insert', newContact.id, newContact, (sb, uid) =>
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
      dispatchSync('shared_contact' as any, 'delete', id, { id }, (sb, uid) =>
        syncDeleteSharedContact(sb, uid, id)
      )
    },
    [state, commit, dispatchSync]
  )

  const updateTransaction = useCallback(
    (id: string, updates: UpdateTransactionInput) => {
      const existingIndex = state.transactions.findIndex((t) => t.id === id)
      if (existingIndex === -1) return

      const updatedTx: Transaction = {
        ...state.transactions[existingIndex],
        ...updates,
        amount: updates.amount !== undefined ? Number(updates.amount) : state.transactions[existingIndex].amount,
      }

      const nextTransactions = [...state.transactions]
      nextTransactions[existingIndex] = updatedTx

      commit(
        {
          ...state,
          transactions: nextTransactions,
        },
        updatedTx.id
      )
      dispatchSync('transaction', 'update', updatedTx.id, updatedTx, (sb, uid) =>
        syncUpdateTransaction(sb, uid, updatedTx)
      )
    },
    [state, commit, dispatchSync]
  )

  const deleteTransaction = useCallback(
    (id: string) => {
      const remainingShares = (state.expenseShares ?? []).filter(
        (s) => s.expenseTransactionId !== id
      )
      commit(
        {
          ...state,
          transactions: state.transactions.filter((t) => t.id !== id),
          expenseShares: remainingShares,
        },
        id
      )
      dispatchSync('transaction', 'delete', id, { id }, (sb, uid) =>
        syncDeleteTransaction(sb, uid, id)
      )
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
    (id: string, confirmationDate?: string): Transaction | null => {
      const rec = state.recurring.find((r) => r.id === id)
      if (!rec) return null

      const dateStr = confirmationDate || new Date().toISOString()
      const d = new Date(dateStr)
      const currentMonth = d.getMonth()
      const currentYear = d.getFullYear()

      // Idempotencia: Verificar si ya existe una transacción para este recurrente en este mes
      const alreadyConfirmed = state.transactions.some(
        (t) =>
          t.type === 'expense' &&
          t.recurringPaymentId === id &&
          new Date(t.date).getMonth() === currentMonth &&
          new Date(t.date).getFullYear() === currentYear
      )
      if (alreadyConfirmed) {
        console.warn(`[useFinance] El pago recurrente ${id} ya fue confirmado para este ciclo`)
        return null
      }

      // 1. Crear transacción real vinculada con recurringPaymentId
      const newTx: Transaction = {
        id: `tx_${crypto.randomUUID()}`,
        type: 'expense',
        amount: rec.amount,
        description: rec.name,
        categoryId: rec.categoryId,
        accountId: rec.accountId || 'daily',
        date: dateStr,
        recurringPaymentId: rec.id,
        isShared: Boolean(rec.isShared),
      }

      // Si es un recurrente compartido, crear las partes independientes para ESTE ciclo
      let cycleShares: ExpenseShare[] = []
      if (rec.isShared && rec.sharingTemplate) {
        cycleShares = rec.sharingTemplate.participants.map((p) => ({
          id: crypto.randomUUID(),
          expenseTransactionId: newTx.id,
          contactId: p.contactId,
          participantName: p.name,
          isPayerShare: false,
          expectedAmount: Number(p.amount),
          createdAt: dateStr,
          updatedAt: dateStr,
        }))

        if (rec.sharingTemplate.includePayer) {
          const externalTotal = cycleShares.reduce((s, sh) => s + sh.expectedAmount, 0)
          const payerAmount = Math.max(0, Math.round((rec.amount - externalTotal) * 100) / 100)
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

      // 2. Avanzar nextDate según frecuencia de calendario segura
      const nextDate = calculateNextRecurringDate(rec.nextDate, rec.frequency)
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
        dispatchSync('expense_share' as any, 'insert', share.id, share, (sb, uid) =>
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
        return {
          ...r,
          ...updates,
          targetAmount: updates.targetAmount !== undefined ? Number(updates.targetAmount) : r.targetAmount,
          currentAllocated:
            updates.currentAllocated !== undefined ? Number(updates.currentAllocated) : r.currentAllocated,
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
      const newPeriod: SpecialPeriod = {
        ...input,
        id: crypto.randomUUID(),
        expectedExtraBudget: Number(input.expectedExtraBudget),
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
        return {
          ...p,
          ...updates,
          expectedExtraBudget:
            updates.expectedExtraBudget !== undefined
              ? Number(updates.expectedExtraBudget)
              : p.expectedExtraBudget,
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
      commit({
        ...state,
        specialPeriods: state.specialPeriods.filter((p) => p.id !== id),
      })
      dispatchSync('specialPeriod', 'delete', id, { id }, (sb, uid) =>
        syncDeleteSpecialPeriod(sb, uid, id)
      )
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

    // Métricas del plan financiero
    const monthlyIncome = selectMonthlyIncome(state.planSettings)
    const essentialExpenses = selectEssentialMonthlyExpenses(
      state.categories,
      state.transactions,
      state.planSettings,
      now
    )
    const variableExpenses = selectVariableMonthlyExpenses(
      state.categories,
      state.transactions,
      state.planSettings,
      now
    )
    const targetMonthlySavings = selectTargetMonthlySavings(state.planSettings)
    const actualMonthlySavings = selectActualMonthlySavings(state.transactions, reconciledAccounts, now)
    const emergencyFundTarget = selectEmergencyFundTarget(state.planSettings, essentialExpenses)
    const emergencyFundMonthsCovered = selectEmergencyFundMonthsCovered(emergencyAllocated, essentialExpenses)
    const adjustedSpending = selectAdjustedMonthlySpendingExpectation(
      essentialExpenses + variableExpenses,
      state.specialPeriods,
      now
    )
    const monthlyOutflow = essentialExpenses + variableExpenses + targetMonthlySavings
    const estimatedMonthlyMargin = Math.round((monthlyIncome - monthlyOutflow) * 100) / 100

    const currentMonthKey = now.toISOString().slice(0, 7)
    const variableEstimatesSummary = calculateVariableEstimatesSummary(
      state.variableExpenseEstimates ?? [],
      state.transactions,
      currentMonthKey
    )
    const pendingVariableExpenses = variableEstimatesSummary.totalPendingEstimated
    const projectedAvailable = Math.round((realAvailable - pendingVariableExpenses) * 100) / 100

    // Métricas de gastos brutos vs netos e ingresos reales vs reembolsos
    const grossMonthExpenses = selectGrossExpensesForPeriod(state.transactions, now, 'month')
    const linkedReimbursementsMonth = selectLinkedReimbursementsForPeriod(state.transactions, now, 'month')
    const reimbursementsMonth = selectReimbursementsReceived(state.transactions, now, 'month')
    const netMonthExpenses = selectNetPersonalExpensesForPeriod(state.transactions, now, 'month')
    const netCategoryExpenses = selectNetExpensesByCategory(state.transactions, state.categories, now, 'month')
    const realMonthIncome = selectRealIncome(state.transactions, now)
    const pendingReimbursements = selectPendingReimbursements(state.expenseShares ?? [], state.transactions)

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
      linkedReimbursementsMonth,
      reimbursementsMonth,
      netMonthExpenses,
      netCategoryExpenses,
      realMonthIncome,
      pendingReimbursements,

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

      // Plan financiero
      planMetrics: {
        monthlyIncome,
        essentialMonthlyExpenses: essentialExpenses,
        variableMonthlyExpenses: variableExpenses,
        targetMonthlySavings,
        actualMonthlySavings,
        emergencyFundTarget,
        emergencyFundMonthsCovered,
        estimatedMonthlyMargin,
        adjustedSpending,
      },
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

  const restoreState = useCallback(
    async (newState: PersistedState) => {
      const txs = newState.transactions ?? []
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
        expenseShares: newState.expenseShares ?? [],
      }
      setState(completeState)
      await storage.save(completeState)
    },
    [storage]
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
    }
  }, [reconciledAccounts, state])

  return {
    ...state,
    profile: state.profile ?? initialFinanceState.profile,
    variableExpenseEstimates: state.variableExpenseEstimates ?? [],
    sharedContacts: state.sharedContacts ?? [],
    expenseShares: state.expenseShares ?? [],
    storageHydrated,
    setSyncUser,
    setOnSyncStatusChange,
    accounts: reconciledAccounts,
    totals,
    addTransaction,
    addSharedExpense,
    recordReimbursement,
    addSharedContact,
    deleteSharedContact,
    updateTransaction,
    deleteTransaction,
    updateAccountInitialBalance,

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

    // Copias de seguridad
    restoreState,
    getFullState,
  }
}

export type FinanceStore = ReturnType<typeof useFinance>

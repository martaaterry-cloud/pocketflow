import { useCallback, useEffect, useMemo, useState } from 'react'
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
} from '../models/finance'
import { defaultAppStorage } from '../services/storage/indexedDbAdapter'
import { defaultStorage } from '../services/storage/localStorageAdapter'
import type { PersistedState, StorageAdapter } from '../services/storage/storageAdapter'
import { selectBudgetsSummary } from '../utils/budgetSelectors'
import { ensureAccountInitialBalance, reconcileAccounts } from '../utils/balance'
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
} from '../services/supabase/supabaseSync'
import {
  logPerfMutationStart,
  logPerfUiUpdated,
  logPerfCloudConfirmed,
  logPerfRealtimeReceived,
  logPerfCacheApplied,
} from '../utils/syncPerfTracker'
import {
  selectAssignedSavings,
  selectCommittedAmount,
  selectFreeSavings,
  selectMonthExpenses,
  selectPendingRecurringPayments,
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

      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const supabase = getSupabase()
        remoteFn(supabase, syncUserId)
          .then(() => {
            logPerfCloudConfirmed(id)
          })
          .catch((err) => {
            console.warn(`[Sync] Fallo en ${action} ${entity}, encolando offline:`, err)
            enqueueOfflineMutation({ entity, action, data })
          })
      } else {
        enqueueOfflineMutation({ entity, action, data })
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
      commit(
        {
          ...state,
          transactions: state.transactions.filter((t) => t.id !== id),
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

    return {
      // Compatibilidad
      daily: spendable,
      savings,
      total: totalMoney,
      committed,
      available: realAvailable,
      monthExpenses,

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
    }
  }, [reconciledAccounts, state])

  return {
    ...state,
    profile: state.profile ?? initialFinanceState.profile,
    storageHydrated,
    setSyncUser,
    accounts: reconciledAccounts,
    totals,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    updateAccountInitialBalance,

    // Perfil
    updateProfile,

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

    // Copias de seguridad
    restoreState,
    getFullState,
  }
}

export type FinanceStore = ReturnType<typeof useFinance>

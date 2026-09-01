import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  accounts as seedAccounts,
  budgets as seedBudgets,
  categories as seedCategories,
  goals as seedGoals,
  planSettings as seedPlanSettings,
  recurring as seedRecurring,
  reserves as seedReserves,
  specialPeriods as seedSpecialPeriods,
  transactions as seedTransactions,
} from '../data/seed'
import type {
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
  UpdateRecurringPaymentInput,
  UpdateReserveInput,
  UpdateSavingsGoalInput,
  UpdateSpecialPeriodInput,
  UpdateTransactionInput,
} from '../models/finance'
import { defaultStorage } from '../services/storage/localStorageAdapter'
import type { PersistedState, StorageAdapter } from '../services/storage/storageAdapter'
import { selectBudgetsSummary } from '../utils/budgetSelectors'
import { ensureAccountInitialBalance, reconcileAccounts } from '../utils/balance'
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

export const initialFinanceState: PersistedState = {
  accounts: seedAccounts,
  transactions: seedTransactions,
  goals: seedGoals,
  recurring: seedRecurring,
  categories: seedCategories,
  budgets: seedBudgets,
  reserves: seedReserves,
  specialPeriods: seedSpecialPeriods,
  planSettings: seedPlanSettings,
}

export function useFinance(storage: StorageAdapter = defaultStorage) {
  const [state, setState] = useState<PersistedState>(() => {
    try {
      const raw = localStorage.getItem('pocketflow:v1')
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedState>
        const rawTxs = parsed.transactions ?? initialFinanceState.transactions
        const rawAccounts = (parsed.accounts ?? initialFinanceState.accounts).map((acc) =>
          ensureAccountInitialBalance(acc, rawTxs)
        )

        return {
          accounts: rawAccounts,
          transactions: rawTxs,
          goals: parsed.goals ?? initialFinanceState.goals,
          recurring: parsed.recurring ?? initialFinanceState.recurring,
          categories: parsed.categories ?? initialFinanceState.categories,
          budgets: parsed.budgets ?? initialFinanceState.budgets,
          reserves: parsed.reserves ?? initialFinanceState.reserves,
          specialPeriods: parsed.specialPeriods ?? initialFinanceState.specialPeriods,
          planSettings: parsed.planSettings ?? initialFinanceState.planSettings,
        }
      }
    } catch {
      // ignore parse errors
    }
    return initialFinanceState
  })

  // Carga asíncrona mediante el StorageAdapter (preparado para SQLite)
  useEffect(() => {
    let mounted = true
    storage.load().then((loaded) => {
      if (!mounted || !loaded) return

      const txs = loaded.transactions ?? []
      const accountsWithInitial = (loaded.accounts ?? initialFinanceState.accounts).map((acc) =>
        ensureAccountInitialBalance(acc, txs)
      )

      setState((prev) => ({
        ...prev,
        ...loaded,
        accounts: accountsWithInitial,
        transactions: txs,
        goals: loaded.goals ?? prev.goals,
        recurring: loaded.recurring ?? prev.recurring,
        categories: loaded.categories?.length ? loaded.categories : prev.categories,
        budgets: loaded.budgets?.length ? loaded.budgets : prev.budgets,
        reserves: loaded.reserves ?? prev.reserves,
        specialPeriods: loaded.specialPeriods ?? prev.specialPeriods,
        planSettings: loaded.planSettings ?? prev.planSettings,
      }))
    })
    return () => {
      mounted = false
    }
  }, [storage])

  const commit = useCallback(
    (next: PersistedState) => {
      setState(next)
      storage.save(next).catch((err) => {
        console.error('[Pocketflow] Error persistiendo estado financiero:', err)
      })
    },
    [storage]
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
      commit({
        ...state,
        transactions: [newTx, ...state.transactions],
      })
    },
    [state, commit]
  )

  const updateTransaction = useCallback(
    (id: string, updates: UpdateTransactionInput) => {
      const existingIndex = state.transactions.findIndex((t) => t.id === id)
      if (existingIndex === -1) return

      const existing = state.transactions[existingIndex]
      const updatedTx: Transaction = {
        ...existing,
        ...updates,
        amount: updates.amount !== undefined ? Number(updates.amount) : existing.amount,
      }

      const nextTransactions = [...state.transactions]
      nextTransactions[existingIndex] = updatedTx

      commit({
        ...state,
        transactions: nextTransactions,
      })
    },
    [state, commit]
  )

  const deleteTransaction = useCallback(
    (id: string) => {
      commit({
        ...state,
        transactions: state.transactions.filter((t) => t.id !== id),
      })
    },
    [state, commit]
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
    },
    [state, commit]
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
    },
    [state, commit]
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
    },
    [state, commit]
  )

  const deleteSavingsGoal = useCallback(
    (id: string) => {
      commit({
        ...state,
        goals: state.goals.filter((g) => g.id !== id),
      })
    },
    [state, commit]
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
        return false // No se puede asignar más de lo que hay libre
      }

      const nextGoals = state.goals.map((g) => {
        if (g.id !== goalId) return g
        const updatedCurrent = Math.round((g.current + numericAmount) * 100) / 100
        return {
          ...g,
          current: updatedCurrent,
          completed: updatedCurrent >= g.target,
        }
      })

      commit({
        ...state,
        goals: nextGoals,
      })
      return true
    },
    [state, reconciledAccounts, commit]
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
      const nextGoals = state.goals.map((g) => {
        if (g.id !== goalId) return g
        const updatedCurrent = Math.round((g.current - effectiveDealloc) * 100) / 100
        return {
          ...g,
          current: updatedCurrent,
          completed: updatedCurrent >= g.target,
        }
      })

      commit({
        ...state,
        goals: nextGoals,
      })
      return true
    },
    [state, commit]
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
    },
    [state, commit]
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
    },
    [state, commit]
  )

  const deleteRecurringPayment = useCallback(
    (id: string) => {
      commit({
        ...state,
        recurring: state.recurring.filter((r) => r.id !== id),
      })
    },
    [state, commit]
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
    },
    [state, commit]
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
    },
    [state, commit]
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
    },
    [state, commit]
  )

  const deleteBudget = useCallback(
    (id: string) => {
      commit({
        ...state,
        budgets: state.budgets.filter((b) => b.id !== id),
      })
    },
    [state, commit]
  )

  /* ==========================================================================
     Plan Financiero y Fondo de Emergencia
     ========================================================================== */

  const updatePlanSettings = useCallback(
    (updates: UpdatePlanSettingsInput) => {
      commit({
        ...state,
        planSettings: {
          ...state.planSettings,
          ...updates,
        },
      })
    },
    [state, commit]
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
      commit({
        ...state,
        planSettings: {
          ...state.planSettings,
          emergencyFundCurrent: nextCurrent,
        },
      })
      return true
    },
    [state, reconciledAccounts, commit]
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
      commit({
        ...state,
        planSettings: {
          ...state.planSettings,
          emergencyFundCurrent: nextCurrent,
        },
      })
      return true
    },
    [state, commit]
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
    },
    [state, commit]
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
    },
    [state, commit]
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
    },
    [state, commit]
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

      const nextReserves = state.reserves.map((r) => {
        if (r.id !== reserveId) return r
        const updated = Math.round((r.currentAllocated + num) * 100) / 100
        return { ...r, currentAllocated: updated }
      })

      commit({
        ...state,
        reserves: nextReserves,
      })
      return true
    },
    [state, reconciledAccounts, commit]
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
      const nextReserves = state.reserves.map((r) => {
        if (r.id !== reserveId) return r
        const updated = Math.round((r.currentAllocated - effectiveDealloc) * 100) / 100
        return { ...r, currentAllocated: updated }
      })

      commit({
        ...state,
        reserves: nextReserves,
      })
      return true
    },
    [state, commit]
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
    },
    [state, commit]
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
    },
    [state, commit]
  )

  const deleteSpecialPeriod = useCallback(
    (id: string) => {
      commit({
        ...state,
        specialPeriods: state.specialPeriods.filter((p) => p.id !== id),
      })
    },
    [state, commit]
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

  return {
    ...state,
    accounts: reconciledAccounts,
    totals,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    updateAccountInitialBalance,

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
  }
}

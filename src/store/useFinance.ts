import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  accounts as seedAccounts,
  budgets as seedBudgets,
  categories as seedCategories,
  goals as seedGoals,
  recurring as seedRecurring,
  transactions as seedTransactions,
} from '../data/seed'
import type {
  Budget,
  CreateBudgetInput,
  CreateRecurringPaymentInput,
  CreateSavingsGoalInput,
  CreateTransactionInput,
  RecurringPayment,
  SavingsGoal,
  Transaction,
  UpdateBudgetInput,
  UpdateRecurringPaymentInput,
  UpdateSavingsGoalInput,
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

export const initialFinanceState: PersistedState = {
  accounts: seedAccounts,
  transactions: seedTransactions,
  goals: seedGoals,
  recurring: seedRecurring,
  categories: seedCategories,
  budgets: seedBudgets,
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
   * Regla de producto: El dinero sale del ahorro libre. No crea dinero ni altera el saldo de Ahorro.
   */
  const allocateSavingsToGoal = useCallback(
    (goalId: string, amount: number): boolean => {
      const numericAmount = Math.round(amount * 100) / 100
      if (numericAmount <= 0) return false

      const savingsBalance = selectSavingsBalance(reconciledAccounts)
      const currentAssigned = selectAssignedSavings(state.goals)
      const freeSavings = selectFreeSavings(savingsBalance, currentAssigned)

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
     Totales y Conceptos Financieros Centralizados
     ========================================================================== */

  const totals = useMemo(() => {
    const now = new Date()
    const spendable = selectSpendableBalance(reconciledAccounts)
    const savings = selectSavingsBalance(reconciledAccounts)
    const totalMoney = selectTotalMoney(reconciledAccounts)

    const assignedSavings = selectAssignedSavings(state.goals)
    const freeSavings = selectFreeSavings(savings, assignedSavings)

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
      assignedSavings,
      freeSavings,
      committedAmount: committed,
      realAvailable,
      pendingRecurring,
      budgetsSummary,
    }
  }, [reconciledAccounts, state.goals, state.recurring, state.transactions, state.budgets, state.categories])

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
  }
}


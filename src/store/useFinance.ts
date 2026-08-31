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
  Account,
  Budget,
  Category,
  CreateTransactionInput,
  RecurringPayment,
  SavingsGoal,
  Transaction,
  UpdateTransactionInput,
} from '../models/finance'
import { defaultStorage } from '../services/storage/localStorageAdapter'
import type { PersistedState, StorageAdapter } from '../services/storage/storageAdapter'

export const initialFinanceState: PersistedState = {
  accounts: seedAccounts,
  transactions: seedTransactions,
  goals: seedGoals,
  recurring: seedRecurring,
  categories: seedCategories,
  budgets: seedBudgets,
}

function adjustAccountBalance(
  accounts: Account[],
  transaction: Pick<Transaction, 'type' | 'amount' | 'accountId' | 'toAccountId'>,
  direction: 1 | -1
): Account[] {
  const { type, amount, accountId, toAccountId } = transaction
  const signedAmount = amount * direction

  return accounts.map((acc) => {
    if (type === 'expense' && acc.id === accountId) {
      return { ...acc, balance: acc.balance - signedAmount }
    }
    if (type === 'income' && acc.id === accountId) {
      return { ...acc, balance: acc.balance + signedAmount }
    }
    if (type === 'transfer') {
      if (acc.id === accountId) {
        return { ...acc, balance: acc.balance - signedAmount }
      }
      if (acc.id === toAccountId) {
        return { ...acc, balance: acc.balance + signedAmount }
      }
    }
    return acc
  })
}

export function useFinance(storage: StorageAdapter = defaultStorage) {
  const [state, setState] = useState<PersistedState>(() => {
    // Initial synchronous read fallback
    try {
      const raw = localStorage.getItem('pocketflow:v1')
      if (raw) {
        const parsed = JSON.parse(raw)
        return {
          accounts: parsed.accounts ?? initialFinanceState.accounts,
          transactions: parsed.transactions ?? initialFinanceState.transactions,
          goals: parsed.goals ?? initialFinanceState.goals,
          recurring: parsed.recurring ?? initialFinanceState.recurring,
          categories: parsed.categories ?? initialFinanceState.categories,
          budgets: parsed.budgets ?? initialFinanceState.budgets,
        }
      }
    } catch {
      // ignore
    }
    return initialFinanceState
  })

  // Load from storage adapter (asynchronous ready for SQLite transition)
  useEffect(() => {
    let mounted = true
    storage.load().then((loaded) => {
      if (!mounted || !loaded) return
      setState((prev) => ({
        ...prev,
        ...loaded,
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
        console.error('Failed to persist finance state:', err)
      })
    },
    [storage]
  )

  const addTransaction = useCallback(
    (input: CreateTransactionInput) => {
      const newTx: Transaction = {
        ...input,
        id: crypto.randomUUID(),
        amount: Number(input.amount),
      }
      const updatedAccounts = adjustAccountBalance(state.accounts, newTx, 1)
      commit({
        ...state,
        accounts: updatedAccounts,
        transactions: [newTx, ...state.transactions],
      })
    },
    [state, commit]
  )

  const updateTransaction = useCallback(
    (id: string, updates: UpdateTransactionInput) => {
      const existing = state.transactions.find((t) => t.id === id)
      if (!existing) return

      const updatedTx: Transaction = {
        ...existing,
        ...updates,
        amount: updates.amount !== undefined ? Number(updates.amount) : existing.amount,
      }

      // 1. Revert effect of previous transaction on accounts
      const accountsAfterRevert = adjustAccountBalance(state.accounts, existing, -1)
      // 2. Apply effect of updated transaction
      const finalAccounts = adjustAccountBalance(accountsAfterRevert, updatedTx, 1)

      const finalTransactions = state.transactions.map((t) => (t.id === id ? updatedTx : t))

      commit({
        ...state,
        accounts: finalAccounts,
        transactions: finalTransactions,
      })
    },
    [state, commit]
  )

  const deleteTransaction = useCallback(
    (id: string) => {
      const existing = state.transactions.find((t) => t.id === id)
      if (!existing) return

      // Revert effect on accounts
      const updatedAccounts = adjustAccountBalance(state.accounts, existing, -1)
      const finalTransactions = state.transactions.filter((t) => t.id !== id)

      commit({
        ...state,
        accounts: updatedAccounts,
        transactions: finalTransactions,
      })
    },
    [state, commit]
  )

  const totals = useMemo(() => {
    const daily = state.accounts.find((a) => a.type === 'spending')?.balance ?? 0
    const savings = state.accounts.find((a) => a.type === 'savings')?.balance ?? 0

    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    // Committed: active recurring payments that have NOT already been paid this month
    const pendingRecurring = state.recurring.filter((r) => {
      if (!r.active) return false
      const alreadyPaidThisMonth = state.transactions.some((t) => {
        if (t.type !== 'expense') return false
        const d = new Date(t.date)
        const isCurrentMonth = d.getMonth() === currentMonth && d.getFullYear() === currentYear
        return (
          isCurrentMonth &&
          (t.description.toLowerCase().includes(r.name.toLowerCase()) ||
            (r.categoryId && t.categoryId === r.categoryId && Math.abs(t.amount - r.amount) < 0.01))
        )
      })
      return !alreadyPaidThisMonth
    })

    const committed = pendingRecurring.reduce((sum, r) => sum + r.amount, 0)

    const monthExpenses = state.transactions
      .filter((t) => t.type === 'expense')
      .filter((t) => {
        const d = new Date(t.date)
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear
      })
      .reduce((sum, t) => sum + t.amount, 0)

    return {
      daily,
      savings,
      total: daily + savings,
      committed,
      available: Math.max(0, daily - committed),
      monthExpenses,
    }
  }, [state])

  return {
    ...state,
    totals,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  }
}

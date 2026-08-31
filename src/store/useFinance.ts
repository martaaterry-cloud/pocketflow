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
  CreateTransactionInput,
  Transaction,
  UpdateTransactionInput,
} from '../models/finance'
import { defaultStorage } from '../services/storage/localStorageAdapter'
import type { PersistedState, StorageAdapter } from '../services/storage/storageAdapter'
import { ensureAccountInitialBalance, reconcileAccounts } from '../utils/balance'

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
      // ignore JSON parse errors
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

  const totals = useMemo(() => {
    const daily = reconciledAccounts.find((a) => a.type === 'spending')?.balance ?? 0
    const savings = reconciledAccounts.find((a) => a.type === 'savings')?.balance ?? 0

    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    // Comprometido: recurrentes activos que todavía no han sido pagados este mes
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
      total: Math.round((daily + savings) * 100) / 100,
      committed,
      available: Math.max(0, Math.round((daily - committed) * 100) / 100),
      monthExpenses,
    }
  }, [reconciledAccounts, state.transactions, state.recurring])

  return {
    ...state,
    accounts: reconciledAccounts,
    totals,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  }
}

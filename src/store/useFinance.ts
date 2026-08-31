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
  CreateTransactionInput,
  Transaction,
  UpdateTransactionInput,
} from '../models/finance'
import { defaultStorage } from '../services/storage/localStorageAdapter'
import type { PersistedState, StorageAdapter } from '../services/storage/storageAdapter'
import { ensureAccountInitialBalance, reconcileAccounts } from '../utils/balance'
import {
  selectCommittedAmount,
  selectMonthExpenses,
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

  const totals = useMemo(() => {
    const now = new Date()
    const spendable = selectSpendableBalance(reconciledAccounts)
    const savings = selectSavingsBalance(reconciledAccounts)
    const totalMoney = selectTotalMoney(reconciledAccounts)
    const committed = selectCommittedAmount(state.recurring, state.transactions, now)
    const realAvailable = selectRealAvailable(spendable, committed)
    const monthExpenses = selectMonthExpenses(state.transactions, now)

    return {
      // Nombres de compatibilidad
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
      committedAmount: committed,
      realAvailable,
    }
  }, [reconciledAccounts, state.transactions, state.recurring])

  return {
    ...state,
    accounts: reconciledAccounts,
    totals,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    updateAccountInitialBalance,
  }
}

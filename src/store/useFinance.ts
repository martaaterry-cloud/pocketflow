import { useMemo, useState } from 'react'
import { accounts as seedAccounts, budgets, categories, goals as seedGoals, recurring as seedRecurring, transactions as seedTransactions } from '../data/seed'
import type { Account, RecurringPayment, SavingsGoal, Transaction } from '../models/finance'

const STORAGE_KEY = 'pocketflow:v1'

type PersistedState = {
  accounts: Account[]
  transactions: Transaction[]
  goals: SavingsGoal[]
  recurring: RecurringPayment[]
}

const initialState: PersistedState = {
  accounts: seedAccounts,
  transactions: seedTransactions,
  goals: seedGoals,
  recurring: seedRecurring,
}

function loadState(): PersistedState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : initialState
  } catch {
    return initialState
  }
}

function saveState(state: PersistedState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function useFinance() {
  const [state, setState] = useState<PersistedState>(() => loadState())

  const commit = (next: PersistedState) => {
    setState(next)
    saveState(next)
  }

  const addTransaction = (transaction: Omit<Transaction, 'id'>) => {
    const item = { ...transaction, id: crypto.randomUUID() }
    const nextAccounts = state.accounts.map((account) => {
      if (transaction.type === 'expense' && account.id === transaction.accountId) return { ...account, balance: account.balance - transaction.amount }
      if (transaction.type === 'income' && account.id === transaction.accountId) return { ...account, balance: account.balance + transaction.amount }
      if (transaction.type === 'transfer') {
        if (account.id === transaction.accountId) return { ...account, balance: account.balance - transaction.amount }
        if (account.id === transaction.toAccountId) return { ...account, balance: account.balance + transaction.amount }
      }
      return account
    })
    commit({ ...state, accounts: nextAccounts, transactions: [item, ...state.transactions] })
  }

  const totals = useMemo(() => {
    const daily = state.accounts.find((a) => a.type === 'spending')?.balance ?? 0
    const savings = state.accounts.find((a) => a.type === 'savings')?.balance ?? 0
    const committed = state.recurring.filter((r) => r.active).reduce((sum, r) => sum + r.amount, 0)
    const now = new Date()
    const monthExpenses = state.transactions
      .filter((t) => t.type === 'expense')
      .filter((t) => {
        const d = new Date(t.date)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
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
    categories,
    budgets,
    totals,
    addTransaction,
  }
}

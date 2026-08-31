import type { Account, Budget, Category, RecurringPayment, SavingsGoal, Transaction } from '../../models/finance'

export interface PersistedState {
  accounts: Account[]
  transactions: Transaction[]
  goals: SavingsGoal[]
  recurring: RecurringPayment[]
  categories: Category[]
  budgets: Budget[]
}

export interface StorageAdapter {
  load(): Promise<PersistedState | null>
  save(state: PersistedState): Promise<void>
  clear(): Promise<void>
}

import type {
  Account,
  Budget,
  Category,
  FinancialPlanSettings,
  RecurringPayment,
  Reserve,
  SavingsGoal,
  SpecialPeriod,
  Transaction,
} from '../../models/finance'

export interface PersistedState {
  accounts: Account[]
  transactions: Transaction[]
  goals: SavingsGoal[]
  recurring: RecurringPayment[]
  categories: Category[]
  budgets: Budget[]
  reserves: Reserve[]
  specialPeriods: SpecialPeriod[]
  planSettings: FinancialPlanSettings
}

export interface StorageAdapter {
  load(): Promise<PersistedState | null>
  save(state: PersistedState): Promise<void>
  clear(): Promise<void>
}

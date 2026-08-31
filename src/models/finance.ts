export type AccountType = 'spending' | 'savings'
export type TransactionType = 'expense' | 'income' | 'transfer'
export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly'

export interface Account {
  id: string
  name: string
  type: AccountType
  initialBalance: number
  balance?: number
}

export interface Category {
  id: string
  name: string
  color: string
  icon: string
}

export interface Transaction {
  id: string
  type: TransactionType
  amount: number
  accountId: string
  toAccountId?: string
  categoryId?: string
  description: string
  date: string
  note?: string
  recurringPaymentId?: string
}

export type CreateTransactionInput = Omit<Transaction, 'id'>
export type UpdateTransactionInput = Partial<CreateTransactionInput>

export interface SavingsGoal {
  id: string
  name: string
  target: number
  current: number // cantidad asignada actual del ahorro libre
  targetDate?: string
  icon?: string
  completed?: boolean
}

export type CreateSavingsGoalInput = Omit<SavingsGoal, 'id' | 'current'> & {
  current?: number
}
export type UpdateSavingsGoalInput = Partial<Omit<SavingsGoal, 'id'>>

export interface RecurringPayment {
  id: string
  name: string
  amount: number
  categoryId: string
  accountId: string
  frequency: RecurringFrequency
  nextDate: string
  active: boolean
}

export type CreateRecurringPaymentInput = Omit<RecurringPayment, 'id'>
export type UpdateRecurringPaymentInput = Partial<CreateRecurringPaymentInput>

export interface Budget {
  id: string
  categoryId: string
  monthlyLimit: number
}

export type AccountType = 'spending' | 'savings'
export type TransactionType = 'expense' | 'income' | 'transfer'

export interface Account {
  id: string
  name: string
  type: AccountType
  balance: number
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
}

export type CreateTransactionInput = Omit<Transaction, 'id'>
export type UpdateTransactionInput = Partial<CreateTransactionInput>

export interface SavingsGoal {
  id: string
  name: string
  target: number
  current: number
  targetDate?: string
}

export interface RecurringPayment {
  id: string
  name: string
  amount: number
  categoryId: string
  accountId: string
  frequency: 'weekly' | 'monthly' | 'yearly'
  nextDate: string
  active: boolean
}

export interface Budget {
  id: string
  categoryId: string
  monthlyLimit: number
}

import type { Account, Budget, Category, RecurringPayment, SavingsGoal, Transaction } from '../models/finance'

export const categories: Category[] = [
  { id: 'food', name: 'Alimentación', color: '#8DB596', icon: '◌' },
  { id: 'leisure', name: 'Ocio', color: '#D7A9A9', icon: '◇' },
  { id: 'transport', name: 'Transporte', color: '#9DB7D5', icon: '↗' },
  { id: 'clothes', name: 'Ropa', color: '#C7AFD7', icon: '□' },
  { id: 'subscriptions', name: 'Suscripciones', color: '#D5C38E', icon: '○' },
  { id: 'sport', name: 'Deporte', color: '#9FC9C4', icon: '△' },
  { id: 'travel', name: 'Viajes', color: '#E0B18A', icon: '⌁' },
  { id: 'other', name: 'Otros', color: '#B9B9B9', icon: '·' },
]

export const accounts: Account[] = [
  { id: 'daily', name: 'Cuenta diaria', type: 'spending', initialBalance: 791.16, balance: 438.25 },
  { id: 'savings', name: 'Ahorro', type: 'savings', initialBalance: 1120, balance: 1320 },
]

const iso = (daysAgo: number) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString()
}

export const transactions: Transaction[] = [
  { id: 't1', type: 'expense', amount: 18.43, accountId: 'daily', categoryId: 'food', description: 'Mercadona', date: iso(0) },
  { id: 't2', type: 'expense', amount: 42, accountId: 'daily', categoryId: 'transport', description: 'Gasolina', date: iso(1) },
  { id: 't3', type: 'expense', amount: 16.5, accountId: 'daily', categoryId: 'leisure', description: 'Cena', date: iso(1) },
  { id: 't4', type: 'expense', amount: 29.99, accountId: 'daily', categoryId: 'clothes', description: 'Ropa', date: iso(3) },
  { id: 't5', type: 'expense', amount: 10.99, accountId: 'daily', categoryId: 'subscriptions', description: 'Spotify', date: iso(5) },
  { id: 't6', type: 'expense', amount: 35, accountId: 'daily', categoryId: 'sport', description: 'Gimnasio', date: iso(7) },
  { id: 't7', type: 'transfer', amount: 200, accountId: 'daily', toAccountId: 'savings', description: 'A ahorro', date: iso(10) },
]

export const goals: SavingsGoal[] = [
  { id: 'g1', name: 'Japón', target: 2500, current: 740 },
  { id: 'g2', name: 'Fondo de emergencia', target: 3000, current: 400 },
]

export const recurring: RecurringPayment[] = [
  { id: 'r1', name: 'Spotify', amount: 10.99, categoryId: 'subscriptions', accountId: 'daily', frequency: 'monthly', nextDate: '2026-09-04', active: true },
  { id: 'r2', name: 'Gimnasio', amount: 35, categoryId: 'sport', accountId: 'daily', frequency: 'monthly', nextDate: '2026-09-07', active: true },
  { id: 'r3', name: 'iCloud', amount: 2.99, categoryId: 'subscriptions', accountId: 'daily', frequency: 'monthly', nextDate: '2026-09-14', active: true },
]

export const budgets: Budget[] = [
  { id: 'b1', categoryId: 'leisure', monthlyLimit: 150 },
  { id: 'b2', categoryId: 'clothes', monthlyLimit: 100 },
  { id: 'b3', categoryId: 'food', monthlyLimit: 220 },
]

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
  SharedContact,
  ExpenseShare,
  UserProfile,
  VariableExpenseEstimate,
} from '../models/finance'

export const initialProfile: UserProfile = {
  displayName: '',
}

export const categories: Category[] = [
  { id: 'food', name: 'Alimentación', color: '#8DB596', icon: 'shopping-basket', iconKey: 'shopping-basket' },
  { id: 'leisure', name: 'Ocio', color: '#D7A9A9', icon: 'ticket', iconKey: 'ticket' },
  { id: 'transport', name: 'Transporte', color: '#9DB7D5', icon: 'car', iconKey: 'car' },
  { id: 'clothes', name: 'Ropa', color: '#C7AFD7', icon: 'shirt', iconKey: 'shirt' },
  { id: 'subscriptions', name: 'Suscripciones', color: '#D5C38E', icon: 'refresh-cw', iconKey: 'refresh-cw' },
  { id: 'sport', name: 'Deporte', color: '#9FC9C4', icon: 'dumbbell', iconKey: 'dumbbell' },
  { id: 'travel', name: 'Viajes', color: '#E0B18A', icon: 'plane', iconKey: 'plane' },
  { id: 'other', name: 'Otros', color: '#B9B9B9', icon: 'ellipsis', iconKey: 'ellipsis' },
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
  { id: 'g1', name: 'Japón', target: 2500, current: 500, icon: 'plane', iconKey: 'plane' },
  { id: 'g2', name: 'Portátil nuevo', target: 1200, current: 240, icon: 'laptop', iconKey: 'laptop' },
]

export const reserves: Reserve[] = [
  {
    id: 'res1',
    name: 'Navidad y regalos',
    targetAmount: 400,
    currentAllocated: 100,
    targetDate: '2026-12-15',
    iconKey: 'sparkles',
    active: true,
  },
  {
    id: 'res2',
    name: 'Seguro del coche',
    targetAmount: 360,
    currentAllocated: 120,
    targetDate: '2027-03-01',
    iconKey: 'car',
    active: true,
  },
]

export const specialPeriods: SpecialPeriod[] = [
  {
    id: 'sp1',
    name: 'Navidad',
    startDate: '2026-12-01',
    endDate: '2027-01-06',
    expectedExtraBudget: 400,
    type: 'expected_high_spend',
    note: 'Cenas, compras y detalles festivos',
  },
  {
    id: 'sp2',
    name: 'Vacaciones de verano',
    startDate: '2027-07-01',
    endDate: '2027-08-31',
    expectedExtraBudget: 700,
    type: 'expected_high_spend',
    note: 'Viaje y planes de verano',
  },
]

export const planSettings: FinancialPlanSettings = {
  monthlyIncome: 1650,
  targetSavingsType: 'percentage',
  targetSavingsValue: 15,
  emergencyFundTargetType: 'months',
  emergencyFundTargetValue: 3,
  emergencyFundCurrent: 300,
  essentialCategoryIds: ['food', 'transport', 'subscriptions'],
}

export const recurring: RecurringPayment[] = [
  { id: 'r1', name: 'Spotify', amount: 10.99, categoryId: 'subscriptions', accountId: 'daily', frequency: 'monthly', nextDate: '2026-09-04', active: true },
  { id: 'r2', name: 'Gimnasio', amount: 35, categoryId: 'sport', accountId: 'daily', frequency: 'monthly', nextDate: '2026-09-07', active: true },
  { id: 'r3', name: 'iCloud', amount: 2.99, categoryId: 'subscriptions', accountId: 'daily', frequency: 'monthly', nextDate: '2026-09-14', active: true },
]

export const budgets: Budget[] = [
  { id: 'b1', categoryId: 'leisure', amountLimit: 150, period: 'monthly', monthlyLimit: 150 },
  { id: 'b2', categoryId: 'clothes', amountLimit: 100, period: 'monthly', monthlyLimit: 100 },
  { id: 'b3', categoryId: 'food', amountLimit: 220, period: 'monthly', monthlyLimit: 220 },
]

// ==========================================================================
// Estado limpio oficial para cuentas reales (sin datos de prueba/demo)
// ==========================================================================

export const cleanAccounts: Account[] = [
  { id: 'daily', name: 'Cuenta diaria', type: 'spending', initialBalance: 0, balance: 0 },
  { id: 'savings', name: 'Ahorro', type: 'savings', initialBalance: 0, balance: 0 },
]

export const cleanPlanSettings: FinancialPlanSettings = {
  monthlyIncome: 0,
  targetSavingsType: 'percentage',
  targetSavingsValue: 0,
  emergencyFundTargetType: 'months',
  emergencyFundTargetValue: 0,
  emergencyFundCurrent: 0,
  essentialCategoryIds: [],
}

export const cleanInitialFinanceState = {
  accounts: cleanAccounts,
  transactions: [] as Transaction[],
  goals: [] as SavingsGoal[],
  recurring: [] as RecurringPayment[],
  categories,
  budgets: [] as Budget[],
  reserves: [] as Reserve[],
  specialPeriods: [] as SpecialPeriod[],
  planSettings: cleanPlanSettings,
  profile: initialProfile,
  variableExpenseEstimates: [] as VariableExpenseEstimate[],
  sharedContacts: [] as SharedContact[],
  expenseShares: [] as ExpenseShare[],
}


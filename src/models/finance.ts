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
  icon: string // legacy o iconKey
  iconKey?: string
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
  icon?: string // legacy
  iconKey?: string
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

export type BudgetPeriod = 'monthly'

export interface Budget {
  id: string
  categoryId: string
  amountLimit: number
  period: BudgetPeriod
  monthlyLimit?: number
}

export type CreateBudgetInput = {
  categoryId: string
  amountLimit: number
  period?: BudgetPeriod
}

export type UpdateBudgetInput = Partial<CreateBudgetInput>

/* ==========================================================================
   Planificación Financiera de Medio Plazo (Reservas, Estacionalidad, Plan)
   ========================================================================== */

/**
 * Reserva: Dinero del ahorro existente reservado para gastos previsibles futuros
 * (Navidad, vacaciones de verano, seguros, matrículas, etc.).
 * No altera totalMoney, no es gasto ni transferencia.
 */
export interface Reserve {
  id: string
  name: string
  targetAmount: number
  currentAllocated: number
  targetDate: string // YYYY-MM-DD
  iconKey: string
  active: boolean
  note?: string
}

export type CreateReserveInput = Omit<Reserve, 'id' | 'currentAllocated'> & {
  currentAllocated?: number
}
export type UpdateReserveInput = Partial<Omit<Reserve, 'id'>>

export type SpecialPeriodType = 'normal' | 'expected_high_spend' | 'expected_low_spend'

/**
 * Periodo Especial / Estacionalidad: Meses o intervalos temporales con gastos extraordinarios previstos
 * (Navidad, vacaciones, etc.), para evitar falsos positivos de gasto excesivo.
 */
export interface SpecialPeriod {
  id: string
  name: string
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  expectedExtraBudget: number
  type: SpecialPeriodType
  note?: string
}

export type CreateSpecialPeriodInput = Omit<SpecialPeriod, 'id'>
export type UpdateSpecialPeriodInput = Partial<CreateSpecialPeriodInput>

export type SavingsTargetType = 'percentage' | 'fixed'
export type EmergencyFundTargetType = 'months' | 'fixed'

export interface FinancialPlanSettings {
  monthlyIncome: number
  targetSavingsType: SavingsTargetType
  targetSavingsValue: number // porcentaje (ej. 15) o importe en € (ej. 250)
  emergencyFundTargetType: EmergencyFundTargetType
  emergencyFundTargetValue: number // número de meses (ej. 3 o 6) o importe en € (ej. 3000)
  emergencyFundCurrent: number // cantidad asignada del ahorro existente al fondo de emergencia
  essentialCategoryIds: string[]
}

export type UpdatePlanSettingsInput = Partial<FinancialPlanSettings>

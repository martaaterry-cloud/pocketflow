import type { SupabaseClient } from '@supabase/supabase-js'
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
import type { PersistedState } from '../storage/storageAdapter'
import { migratePersistedState } from '../storage/localStorageAdapter'

// ==========================================================================
// Mappers: TypeScript Models <-> Supabase DB Rows
// ==========================================================================

export function toDbAccount(acc: Account, userId: string) {
  return {
    id: acc.id,
    user_id: userId,
    name: acc.name,
    type: acc.type,
    initial_balance: acc.initialBalance,
    updated_at: new Date().toISOString(),
  }
}

export function fromDbAccount(row: Record<string, unknown>): Account {
  return {
    id: String(row.id),
    name: String(row.name),
    type: row.type as 'spending' | 'savings',
    initialBalance: Number(row.initial_balance ?? 0),
  }
}

export function toDbCategory(cat: Category, userId: string) {
  return {
    id: cat.id,
    user_id: userId,
    name: cat.name,
    color: cat.color,
    icon_key: cat.iconKey || cat.icon || 'shopping-basket',
    updated_at: new Date().toISOString(),
  }
}

export function fromDbCategory(row: Record<string, unknown>): Category {
  return {
    id: String(row.id),
    name: String(row.name),
    color: String(row.color),
    icon: String(row.icon_key || 'shopping-basket'),
    iconKey: String(row.icon_key || 'shopping-basket'),
  }
}

export function toDbTransaction(tx: Transaction, userId: string) {
  return {
    id: tx.id,
    user_id: userId,
    type: tx.type,
    amount: tx.amount,
    account_id: tx.accountId,
    to_account_id: tx.toAccountId || null,
    category_id: tx.categoryId || null,
    description: tx.description,
    date: tx.date,
    note: tx.note || null,
    recurring_payment_id: tx.recurringPaymentId || null,
    updated_at: new Date().toISOString(),
  }
}

export function fromDbTransaction(row: Record<string, unknown>): Transaction {
  return {
    id: String(row.id),
    type: row.type as 'expense' | 'income' | 'transfer',
    amount: Number(row.amount),
    accountId: String(row.account_id),
    toAccountId: row.to_account_id ? String(row.to_account_id) : undefined,
    categoryId: row.category_id ? String(row.category_id) : undefined,
    description: String(row.description),
    date: String(row.date),
    note: row.note ? String(row.note) : undefined,
    recurringPaymentId: row.recurring_payment_id ? String(row.recurring_payment_id) : undefined,
  }
}

export function toDbBudget(b: Budget, userId: string) {
  return {
    id: b.id,
    user_id: userId,
    category_id: b.categoryId,
    amount_limit: b.amountLimit,
    period: b.period || 'monthly',
    updated_at: new Date().toISOString(),
  }
}

export function fromDbBudget(row: Record<string, unknown>): Budget {
  return {
    id: String(row.id),
    categoryId: String(row.category_id),
    amountLimit: Number(row.amount_limit),
    period: (row.period as 'monthly') || 'monthly',
  }
}

export function toDbGoal(g: SavingsGoal, userId: string) {
  return {
    id: g.id,
    user_id: userId,
    name: g.name,
    target: g.target,
    current: g.current,
    target_date: g.targetDate || null,
    icon_key: g.iconKey || g.icon || 'target',
    completed: Boolean(g.completed),
    updated_at: new Date().toISOString(),
  }
}

export function fromDbGoal(row: Record<string, unknown>): SavingsGoal {
  return {
    id: String(row.id),
    name: String(row.name),
    target: Number(row.target),
    current: Number(row.current ?? 0),
    targetDate: row.target_date ? String(row.target_date) : undefined,
    icon: String(row.icon_key || 'target'),
    iconKey: String(row.icon_key || 'target'),
    completed: Boolean(row.completed),
  }
}

export function toDbReserve(r: Reserve, userId: string) {
  return {
    id: r.id,
    user_id: userId,
    name: r.name,
    target_amount: r.targetAmount,
    current_allocated: r.currentAllocated,
    target_date: r.targetDate,
    icon_key: r.iconKey || 'target',
    active: r.active,
    note: r.note || null,
    updated_at: new Date().toISOString(),
  }
}

export function fromDbReserve(row: Record<string, unknown>): Reserve {
  return {
    id: String(row.id),
    name: String(row.name),
    targetAmount: Number(row.target_amount),
    currentAllocated: Number(row.current_allocated ?? 0),
    targetDate: String(row.target_date),
    iconKey: String(row.icon_key || 'target'),
    active: Boolean(row.active),
    note: row.note ? String(row.note) : undefined,
  }
}

export function toDbRecurring(r: RecurringPayment, userId: string) {
  return {
    id: r.id,
    user_id: userId,
    name: r.name,
    amount: r.amount,
    category_id: r.categoryId,
    account_id: r.accountId,
    frequency: r.frequency,
    next_date: r.nextDate,
    active: r.active,
    updated_at: new Date().toISOString(),
  }
}

export function fromDbRecurring(row: Record<string, unknown>): RecurringPayment {
  return {
    id: String(row.id),
    name: String(row.name),
    amount: Number(row.amount),
    categoryId: String(row.category_id),
    accountId: String(row.account_id),
    frequency: row.frequency as 'weekly' | 'monthly' | 'yearly',
    nextDate: String(row.next_date),
    active: Boolean(row.active),
  }
}

export function toDbSpecialPeriod(sp: SpecialPeriod, userId: string) {
  return {
    id: sp.id,
    user_id: userId,
    name: sp.name,
    start_date: sp.startDate,
    end_date: sp.endDate,
    expected_extra_budget: sp.expectedExtraBudget,
    type: sp.type,
    note: sp.note || null,
    updated_at: new Date().toISOString(),
  }
}

export function fromDbSpecialPeriod(row: Record<string, unknown>): SpecialPeriod {
  return {
    id: String(row.id),
    name: String(row.name),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    expectedExtraBudget: Number(row.expected_extra_budget ?? 0),
    type: row.type as 'normal' | 'expected_high_spend' | 'expected_low_spend',
    note: row.note ? String(row.note) : undefined,
  }
}

export function toDbPlanSettings(ps: FinancialPlanSettings, userId: string) {
  return {
    user_id: userId,
    monthly_income: ps.monthlyIncome,
    target_savings_type: ps.targetSavingsType,
    target_savings_value: ps.targetSavingsValue,
    emergency_fund_target_type: ps.emergencyFundTargetType,
    emergency_fund_target_value: ps.emergencyFundTargetValue,
    emergency_fund_current: ps.emergencyFundCurrent,
    essential_category_ids: ps.essentialCategoryIds,
    updated_at: new Date().toISOString(),
  }
}

export function fromDbPlanSettings(row: Record<string, unknown>): FinancialPlanSettings {
  let essentialIds: string[] = []
  if (Array.isArray(row.essential_category_ids)) {
    essentialIds = row.essential_category_ids as string[]
  } else if (typeof row.essential_category_ids === 'string') {
    try {
      essentialIds = JSON.parse(row.essential_category_ids)
    } catch {
      essentialIds = []
    }
  }

  return {
    monthlyIncome: Number(row.monthly_income ?? 0),
    targetSavingsType: (row.target_savings_type as 'percentage' | 'fixed') || 'percentage',
    targetSavingsValue: Number(row.target_savings_value ?? 15),
    emergencyFundTargetType: (row.emergency_fund_target_type as 'months' | 'fixed') || 'months',
    emergencyFundTargetValue: Number(row.emergency_fund_target_value ?? 3),
    emergencyFundCurrent: Number(row.emergency_fund_current ?? 0),
    essentialCategoryIds: essentialIds,
  }
}

// ==========================================================================
// Operaciones de sincronización completa
// ==========================================================================

export async function fetchRemoteState(
  supabase: SupabaseClient,
  userId: string
): Promise<PersistedState | null> {
  const [
    accountsRes,
    categoriesRes,
    txsRes,
    budgetsRes,
    goalsRes,
    reservesRes,
    recurringRes,
    periodsRes,
    settingsRes,
  ] = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id', userId),
    supabase.from('categories').select('*').eq('user_id', userId),
    supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false }),
    supabase.from('budgets').select('*').eq('user_id', userId),
    supabase.from('savings_goals').select('*').eq('user_id', userId),
    supabase.from('reserves').select('*').eq('user_id', userId),
    supabase.from('recurring_payments').select('*').eq('user_id', userId),
    supabase.from('special_periods').select('*').eq('user_id', userId),
    supabase.from('financial_plan_settings').select('*').eq('user_id', userId).maybeSingle(),
  ])

  // Si no hay cuentas remotas, consideramos que aún no se ha subido estado
  if (!accountsRes.data || accountsRes.data.length === 0) {
    return null
  }

  const rawState: Partial<PersistedState> = {
    accounts: (accountsRes.data ?? []).map(fromDbAccount),
    categories: (categoriesRes.data ?? []).map(fromDbCategory),
    transactions: (txsRes.data ?? []).map(fromDbTransaction),
    budgets: (budgetsRes.data ?? []).map(fromDbBudget),
    goals: (goalsRes.data ?? []).map(fromDbGoal),
    reserves: (reservesRes.data ?? []).map(fromDbReserve),
    recurring: (recurringRes.data ?? []).map(fromDbRecurring),
    specialPeriods: (periodsRes.data ?? []).map(fromDbSpecialPeriod),
    planSettings: settingsRes.data ? fromDbPlanSettings(settingsRes.data) : undefined,
  }

  return migratePersistedState(rawState)
}

export async function uploadStateToSupabase(
  supabase: SupabaseClient,
  userId: string,
  state: PersistedState
): Promise<boolean> {
  try {
    // 1. Cuentas y Categorías (entidades raíz)
    if (state.accounts?.length) {
      const dbAccounts = state.accounts.map((a) => toDbAccount(a, userId))
      const { error } = await supabase.from('accounts').upsert(dbAccounts)
      if (error) throw error
    }

    if (state.categories?.length) {
      const dbCats = state.categories.map((c) => toDbCategory(c, userId))
      const { error } = await supabase.from('categories').upsert(dbCats)
      if (error) throw error
    }

    // 2. Transacciones
    if (state.transactions?.length) {
      const dbTxs = state.transactions.map((t) => toDbTransaction(t, userId))
      // Insertar por lotes de 100 para estabilidad
      for (let i = 0; i < dbTxs.length; i += 100) {
        const batch = dbTxs.slice(i, i + 100)
        const { error } = await supabase.from('transactions').upsert(batch)
        if (error) throw error
      }
    }

    // 3. Presupuestos, Objetivos, Reservas, Recurrentes, Periodos
    if (state.budgets?.length) {
      const dbBudgets = state.budgets.map((b) => toDbBudget(b, userId))
      const { error } = await supabase.from('budgets').upsert(dbBudgets)
      if (error) throw error
    }

    if (state.goals?.length) {
      const dbGoals = state.goals.map((g) => toDbGoal(g, userId))
      const { error } = await supabase.from('savings_goals').upsert(dbGoals)
      if (error) throw error
    }

    if (state.reserves?.length) {
      const dbReserves = state.reserves.map((r) => toDbReserve(r, userId))
      const { error } = await supabase.from('reserves').upsert(dbReserves)
      if (error) throw error
    }

    if (state.recurring?.length) {
      const dbRec = state.recurring.map((r) => toDbRecurring(r, userId))
      const { error } = await supabase.from('recurring_payments').upsert(dbRec)
      if (error) throw error
    }

    if (state.specialPeriods?.length) {
      const dbPeriods = state.specialPeriods.map((p) => toDbSpecialPeriod(p, userId))
      const { error } = await supabase.from('special_periods').upsert(dbPeriods)
      if (error) throw error
    }

    if (state.planSettings) {
      const dbSettings = toDbPlanSettings(state.planSettings, userId)
      const { error } = await supabase.from('financial_plan_settings').upsert(dbSettings)
      if (error) throw error
    }

    return true
  } catch (err) {
    console.error('[SupabaseSync] Error subiendo estado a Supabase:', err)
    return false
  }
}

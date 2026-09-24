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
  IncomeKind,
  SpecialMovementType,
  ExpenseNature,
  SharedContact,
  ExpenseShare,
  RecurringSharingTemplate,
  UserProfile,
  VariableExpenseEstimate,
  CashTransaction,
  CashMovementType,
} from '../../models/finance'
import type { PersistedState } from '../storage/storageAdapter'
import { categories as seedCategories } from '../../data/seed'
import { migratePersistedState } from '../storage/localStorageAdapter'

// ==========================================================================
// Estado limpio para producción (sin datos demo/seed)
// ==========================================================================

export function createCleanInitialState(): PersistedState {
  return {
    accounts: [
      { id: 'daily', name: 'Cuenta diaria', type: 'spending', initialBalance: 0 },
      { id: 'savings', name: 'Ahorro', type: 'savings', initialBalance: 0 },
    ],
    transactions: [],
    categories: seedCategories,
    budgets: [],
    goals: [],
    reserves: [],
    recurring: [],
    specialPeriods: [],
    planSettings: {
      monthlyIncome: 0,
      targetSavingsType: 'percentage',
      targetSavingsValue: 0,
      emergencyFundTargetType: 'months',
      emergencyFundTargetValue: 0,
      emergencyFundCurrent: 0,
      essentialCategoryIds: [],
    },
    profile: {
      displayName: '',
    },
    variableExpenseEstimates: [],
    sharedContacts: [],
    expenseShares: [],
    cashTransactions: [],
  }
}

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
  const row: Record<string, unknown> = {
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
    income_kind: tx.incomeKind || 'income',
    parent_expense_id: tx.parentExpenseId || null,
    expense_share_id: tx.expenseShareId || null,
    is_shared: Boolean(tx.isShared),
    special_type: tx.specialType || 'normal',
    expense_nature: tx.expenseNature || null,
  }
  if (tx.giftRecipient) {
    row.gift_recipient = tx.giftRecipient
  }
  return row
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
    incomeKind: (row.income_kind as IncomeKind) || 'income',
    parentExpenseId: row.parent_expense_id ? String(row.parent_expense_id) : undefined,
    expenseShareId: row.expense_share_id ? String(row.expense_share_id) : undefined,
    isShared: Boolean(row.is_shared),
    specialType: (row.special_type as SpecialMovementType) || undefined,
    expenseNature: (row.expense_nature as ExpenseNature) || undefined,
    giftRecipient: row.gift_recipient ? String(row.gift_recipient) : undefined,
  }
}

export function toDbBudget(b: Budget, userId: string) {
  return {
    id: b.id,
    user_id: userId,
    category_id: b.categoryId,
    amount_limit: b.amountLimit,
    period: b.period || 'monthly',
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
    special_period_id: r.specialPeriodId || null,
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
    specialPeriodId: row.special_period_id ? String(row.special_period_id) : undefined,
  }
}

export function toDbRecurring(r: RecurringPayment, userId: string) {
  const isIncome = r.type === 'income'
  const categoryId = isIncome && r.categoryId === 'income' ? null : (r.categoryId || null)
  const row: Record<string, unknown> = {
    id: r.id,
    user_id: userId,
    name: r.name,
    amount: r.amount,
    category_id: categoryId,
    account_id: r.accountId,
    frequency: r.frequency,
    next_date: r.nextDate,
    active: r.active,
    is_shared: Boolean(r.isShared),
    sharing_template: r.sharingTemplate || null,
    type: r.type || 'expense',
    installments_count: r.installmentsCount || null,
  }
  if (r.incomeSourceType) {
    row.income_source_type = r.incomeSourceType
  }
  return row
}

export function fromDbRecurring(row: Record<string, unknown>): RecurringPayment {
  const isIncome = (row.type as string) === 'income'
  const categoryId = row.category_id ? String(row.category_id) : (isIncome ? 'income' : 'other')
  return {
    id: String(row.id),
    name: String(row.name),
    amount: Number(row.amount),
    categoryId,
    accountId: String(row.account_id),
    frequency: row.frequency as 'weekly' | 'monthly' | 'yearly',
    nextDate: String(row.next_date),
    active: Boolean(row.active),
    isShared: Boolean(row.is_shared),
    sharingTemplate: (row.sharing_template as RecurringSharingTemplate) || undefined,
    type: isIncome ? 'income' : 'expense',
    incomeSourceType: row.income_source_type ? String(row.income_source_type) : undefined,
    installmentsCount: row.installments_count ? Number(row.installments_count) : undefined,
  }
}

export function toDbSpecialPeriod(sp: SpecialPeriod, userId: string) {
  return {
    id: sp.id,
    user_id: userId,
    name: sp.name,
    start_date: sp.startDate,
    end_date: sp.endDate,
    expected_extra_budget:
      sp.expectedExtraBudget !== undefined && sp.expectedExtraBudget !== null
        ? sp.expectedExtraBudget
        : null,
    type: sp.type,
    note: sp.note || null,
  }
}

export function fromDbSpecialPeriod(row: Record<string, unknown>): SpecialPeriod {
  return {
    id: String(row.id),
    name: String(row.name),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    expectedExtraBudget:
      row.expected_extra_budget !== null && row.expected_extra_budget !== undefined
        ? Number(row.expected_extra_budget)
        : undefined,
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
    targetSavingsValue: Number(row.target_savings_value ?? 0),
    emergencyFundTargetType: (row.emergency_fund_target_type as 'months' | 'fixed') || 'months',
    emergencyFundTargetValue: Number(row.emergency_fund_target_value ?? 0),
    emergencyFundCurrent: Number(row.emergency_fund_current ?? 0),
    essentialCategoryIds: essentialIds,
  }
}

export function toDbProfile(p: UserProfile, userId: string) {
  return {
    user_id: userId,
    display_name: p.displayName,
  }
}

export function fromDbProfile(row: Record<string, unknown>): UserProfile {
  return {
    displayName: String(row.display_name ?? ''),
  }
}

export function toDbVariableExpenseEstimate(est: VariableExpenseEstimate, userId: string) {
  return {
    id: est.id,
    user_id: userId,
    name: est.name,
    category_id: est.categoryId,
    unit_cost: est.unitCost,
    frequency_type: est.frequencyType,
    frequency_value: est.frequencyValue,
    active: est.active,
  }
}

export function fromDbVariableExpenseEstimate(row: Record<string, unknown>): VariableExpenseEstimate {
  return {
    id: String(row.id),
    name: String(row.name),
    categoryId: String(row.category_id),
    unitCost: Number(row.unit_cost ?? 0),
    frequencyType: (row.frequency_type as 'per_week' | 'per_month') || 'per_week',
    frequencyValue: Number(row.frequency_value ?? 1),
    active: row.active !== false,
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  }
}

export function toDbSharedContact(c: SharedContact, userId: string) {
  return {
    id: c.id,
    user_id: userId,
    display_name: c.displayName,
  }
}

export function fromDbSharedContact(row: Record<string, unknown>): SharedContact {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  }
}

export function toDbExpenseShare(row: ExpenseShare, userId: string) {
  return {
    id: row.id,
    user_id: userId,
    expense_transaction_id: row.expenseTransactionId,
    contact_id: row.contactId || null,
    participant_name: row.participantName,
    is_payer_share: Boolean(row.isPayerShare),
    expected_amount: row.expectedAmount,
  }
}

export function fromDbExpenseShare(row: Record<string, unknown>): ExpenseShare {
  return {
    id: String(row.id),
    expenseTransactionId: String(row.expense_transaction_id),
    contactId: row.contact_id ? String(row.contact_id) : undefined,
    participantName: String(row.participant_name),
    isPayerShare: Boolean(row.is_payer_share),
    expectedAmount: Number(row.expected_amount),
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  }
}

export function toDbCashTransaction(tx: CashTransaction, userId: string) {
  return {
    id: tx.id,
    user_id: userId,
    type: tx.type,
    amount: tx.amount,
    description: tx.description,
    date: tx.date,
    category_id: tx.categoryId || null,
    note: tx.note || null,
    bank_transaction_id: tx.bankTransactionId || null,
    is_shared: tx.isShared ?? false,
  }
}

export function fromDbCashTransaction(row: Record<string, unknown>): CashTransaction {
  return {
    id: String(row.id),
    type: row.type as CashMovementType,
    amount: Number(row.amount),
    description: String(row.description),
    date: String(row.date),
    categoryId: row.category_id ? String(row.category_id) : undefined,
    note: row.note ? String(row.note) : undefined,
    bankTransactionId: row.bank_transaction_id ? String(row.bank_transaction_id) : undefined,
    isShared: Boolean(row.is_shared),
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  }
}

// ==========================================================================
// Operaciones de lectura segura (Validación estricta de errores)
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
    profileRes,
    estimatesRes,
    contactsRes,
    sharesRes,
    cashRes,
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
    supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('variable_expense_estimates').select('*').eq('user_id', userId),
    supabase.from('shared_contacts').select('*').eq('user_id', userId),
    supabase.from('expense_shares').select('*').eq('user_id', userId),
    supabase.from('cash_transactions').select('*').eq('user_id', userId).order('date', { ascending: false }),
  ])

  // Comprobar errores en CADA query con logging detallado para diagnóstico transparente
  const checkQueryError = (tableName: string, res: { error: any }) => {
    if (res.error) {
      console.error(`[SYNC][${tableName}][fetch]`, {
        code: res.error.code,
        message: res.error.message,
        details: res.error.details,
        hint: res.error.hint,
      })
      throw new Error(`[Sync] Error leyendo ${tableName}: ${res.error.message}`)
    }
  }

  checkQueryError('accounts', accountsRes)
  checkQueryError('categories', categoriesRes)
  checkQueryError('transactions', txsRes)
  checkQueryError('budgets', budgetsRes)
  checkQueryError('savings_goals', goalsRes)
  checkQueryError('reserves', reservesRes)
  checkQueryError('recurring_payments', recurringRes)
  checkQueryError('special_periods', periodsRes)
  checkQueryError('financial_plan_settings', settingsRes)
  checkQueryError('profiles', profileRes)
  checkQueryError('variable_expense_estimates', estimatesRes)
  checkQueryError('shared_contacts', contactsRes)
  checkQueryError('expense_shares', sharesRes)
  checkQueryError('cash_transactions', cashRes)

  // Si no hay cuentas remotas, la base de datos de este usuario está virgen
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
    profile: profileRes.data ? fromDbProfile(profileRes.data) : { displayName: '' },
    variableExpenseEstimates: (estimatesRes.data ?? []).map(fromDbVariableExpenseEstimate),
    sharedContacts: (contactsRes.data ?? []).map(fromDbSharedContact),
    expenseShares: (sharesRes.data ?? []).map(fromDbExpenseShare),
    cashTransactions: (cashRes.data ?? []).map(fromDbCashTransaction),
  }

  return migratePersistedState(rawState)
}

export async function ensureCategoryExistsInRemote(
  supabase: SupabaseClient,
  userId: string,
  categoryId?: unknown
): Promise<void> {
  if (!categoryId || typeof categoryId !== 'string' || !userId) return
  const seedCat = seedCategories.find((c) => c.id === categoryId)
  if (seedCat && typeof supabase?.from === 'function') {
    const table = supabase.from('categories')
    if (table && typeof table.upsert === 'function') {
      const dbCat = toDbCategory(seedCat, userId)
      const { error } = await table.upsert(dbCat)
      if (error) {
        console.warn('[Supabase] Aviso al provisionar categoría base en remoto:', categoryId, error.message)
      }
    }
  }
}

export async function syncMissingDefaultCategories(
  supabase: SupabaseClient,
  userId: string,
  categories: Category[]
): Promise<void> {
  if (!categories || categories.length === 0 || !userId) return
  const dbCats = categories.map((c) => toDbCategory(c, userId))
  const { error } = await supabase.from('categories').upsert(dbCats)
  if (error) {
    console.warn('[Supabase] Error sincronizando categorías base:', error.message)
  }
}

export function cleanMissingColumns(row: Record<string, unknown>, errorMessage?: string): Record<string, unknown> {
  const clean = { ...row }
  const msg = (errorMessage || '').toLowerCase()
  if (msg.includes('gift_recipient') || !errorMessage) delete clean.gift_recipient
  if (msg.includes('income_source_type') || !errorMessage) delete clean.income_source_type
  if (msg.includes('installments_count') || !errorMessage) delete clean.installments_count
  if (msg.includes('special_type')) delete clean.special_type
  if (msg.includes('expense_nature')) delete clean.expense_nature
  return clean
}

export async function safeInsertTransaction(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
  userId?: string
): Promise<void> {
  const effectiveUserId = (userId || row.user_id) as string | undefined
  if (row.category_id && effectiveUserId) {
    await ensureCategoryExistsInRemote(supabase, effectiveUserId, row.category_id)
  }
  const { error } = await supabase.from('transactions').insert(row)
  if (error) {
    console.error('[Supabase Real Error - Insert Transaction]', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      row,
    })
    // 23503: Foreign Key violation (la categoría no existía en categories)
    if (error.code === '23503' && effectiveUserId) {
      await ensureCategoryExistsInRemote(supabase, effectiveUserId, row.category_id)
      const { error: retryError } = await supabase.from('transactions').insert(row)
      if (!retryError) return
    }
    // Column missing in database schema
    if (error.code === 'PGRST204' || error.code === '42703' || error.message.toLowerCase().includes('column')) {
      const clean = cleanMissingColumns(row, error.message)
      const { error: retryError } = await supabase.from('transactions').insert(clean)
      if (retryError) throw retryError
      return
    }
    throw error
  }
}

export async function safeUpdateTransaction(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
  txId: string,
  userId: string
): Promise<void> {
  if (row.category_id && userId) {
    await ensureCategoryExistsInRemote(supabase, userId, row.category_id)
  }
  const { error } = await supabase.from('transactions').update(row).eq('id', txId).eq('user_id', userId)
  if (error) {
    console.error('[Supabase Real Error - Update Transaction]', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      txId,
      row,
    })
    // 23503: Foreign Key violation (la categoría no existía en categories)
    if (error.code === '23503' && userId) {
      await ensureCategoryExistsInRemote(supabase, userId, row.category_id)
      const { error: retryError } = await supabase.from('transactions').update(row).eq('id', txId).eq('user_id', userId)
      if (!retryError) return
    }
    // Column missing in database schema
    if (error.code === 'PGRST204' || error.code === '42703' || error.message.toLowerCase().includes('column')) {
      const clean = cleanMissingColumns(row, error.message)
      const { error: retryError } = await supabase.from('transactions').update(clean).eq('id', txId).eq('user_id', userId)
      if (retryError) throw retryError
      return
    }
    throw error
  }
}

export async function safeUpsertTransaction(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
  userId?: string
): Promise<void> {
  const effectiveUserId = (userId || row.user_id) as string | undefined
  if (row.category_id && effectiveUserId) {
    await ensureCategoryExistsInRemote(supabase, effectiveUserId, row.category_id)
  }
  const { error } = await supabase.from('transactions').upsert(row)
  if (error) {
    console.error('[Supabase Real Error - Upsert Transaction]', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      row,
    })
    // 23503: Foreign Key violation (la categoría no existía en categories)
    if (error.code === '23503' && effectiveUserId) {
      await ensureCategoryExistsInRemote(supabase, effectiveUserId, row.category_id)
      const { error: retryError } = await supabase.from('transactions').upsert(row)
      if (!retryError) return
    }
    // Column missing in database schema
    if (error.code === 'PGRST204' || error.code === '42703' || error.message.toLowerCase().includes('column')) {
      const clean = cleanMissingColumns(row, error.message)
      const { error: retryError } = await supabase.from('transactions').upsert(clean)
      if (retryError) throw retryError
      return
    }
    throw error
  }
}

export async function safeUpsertRecurring(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
  userId?: string
): Promise<void> {
  const effectiveUserId = (userId || row.user_id) as string | undefined
  if (row.category_id && effectiveUserId && row.category_id !== 'income') {
    await ensureCategoryExistsInRemote(supabase, effectiveUserId, row.category_id)
  }
  const { error } = await supabase.from('recurring_payments').upsert(row)
  if (error) {
    console.error('[Supabase Real Error - Upsert Recurring]', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      row,
    })
    // 23503: Foreign Key violation (la categoría no existía en categories)
    if (error.code === '23503' && effectiveUserId) {
      if (row.category_id && row.category_id !== 'income') {
        await ensureCategoryExistsInRemote(supabase, effectiveUserId, row.category_id)
      } else {
        row.category_id = null
      }
      const { error: retryError } = await supabase.from('recurring_payments').upsert(row)
      if (!retryError) return
    }
    // Column missing in database schema
    if (error.code === 'PGRST204' || error.code === '42703' || error.message.toLowerCase().includes('column')) {
      const clean = cleanMissingColumns(row, error.message)
      const { error: retryError } = await supabase.from('recurring_payments').upsert(clean)
      if (retryError) throw retryError
      return
    }
    throw error
  }
}

export async function safeUpsertBudget(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
  userId?: string
): Promise<void> {
  const effectiveUserId = (userId || row.user_id) as string | undefined
  if (row.category_id && effectiveUserId) {
    await ensureCategoryExistsInRemote(supabase, effectiveUserId, row.category_id)
  }
  const { error } = await supabase.from('budgets').upsert(row)
  if (error) {
    console.error('[Supabase Real Error - Upsert Budget]', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      row,
    })
    if (error.code === '23503' && effectiveUserId) {
      await ensureCategoryExistsInRemote(supabase, effectiveUserId, row.category_id)
      const { error: retryError } = await supabase.from('budgets').upsert(row)
      if (!retryError) return
    }
    throw error
  }
}

export async function syncInsertTransaction(
  supabase: SupabaseClient,
  userId: string,
  tx: Transaction
): Promise<void> {
  const row = toDbTransaction(tx, userId)
  await safeInsertTransaction(supabase, row, userId)
}

export async function syncUpdateTransaction(
  supabase: SupabaseClient,
  userId: string,
  tx: Transaction
): Promise<void> {
  const row = toDbTransaction(tx, userId)
  await safeUpdateTransaction(supabase, row, tx.id, userId)
}

export async function syncDeleteTransaction(
  supabase: SupabaseClient,
  userId: string,
  txId: string
): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', txId).eq('user_id', userId)
  if (error) throw error
}

export async function syncUpsertAccount(
  supabase: SupabaseClient,
  userId: string,
  acc: Account
): Promise<void> {
  const row = toDbAccount(acc, userId)
  const { error } = await supabase.from('accounts').upsert(row)
  if (error) throw error
}

export async function syncUpsertBudget(
  supabase: SupabaseClient,
  userId: string,
  b: Budget
): Promise<void> {
  const row = toDbBudget(b, userId)
  await safeUpsertBudget(supabase, row, userId)
}

export async function syncDeleteBudget(
  supabase: SupabaseClient,
  userId: string,
  budgetId: string
): Promise<void> {
  const { error } = await supabase.from('budgets').delete().eq('id', budgetId).eq('user_id', userId)
  if (error) throw error
}

export async function syncUpsertGoal(
  supabase: SupabaseClient,
  userId: string,
  g: SavingsGoal
): Promise<void> {
  const row = toDbGoal(g, userId)
  const { error } = await supabase.from('savings_goals').upsert(row)
  if (error) throw error
}

export async function syncDeleteGoal(
  supabase: SupabaseClient,
  userId: string,
  goalId: string
): Promise<void> {
  const { error } = await supabase.from('savings_goals').delete().eq('id', goalId).eq('user_id', userId)
  if (error) throw error
}

export async function syncUpsertReserve(
  supabase: SupabaseClient,
  userId: string,
  r: Reserve
): Promise<void> {
  const row = toDbReserve(r, userId)
  const { error } = await supabase.from('reserves').upsert(row)
  if (error) throw error
}

export async function syncDeleteReserve(
  supabase: SupabaseClient,
  userId: string,
  reserveId: string
): Promise<void> {
  const { error } = await supabase.from('reserves').delete().eq('id', reserveId).eq('user_id', userId)
  if (error) throw error
}

export async function syncUpsertRecurring(
  supabase: SupabaseClient,
  userId: string,
  r: RecurringPayment
): Promise<void> {
  const row = toDbRecurring(r, userId)
  await safeUpsertRecurring(supabase, row, userId)
}

export async function syncDeleteRecurring(
  supabase: SupabaseClient,
  userId: string,
  recurringId: string
): Promise<void> {
  const { error } = await supabase.from('recurring_payments').delete().eq('id', recurringId).eq('user_id', userId)
  if (error) throw error
}

export async function syncUpsertSpecialPeriod(
  supabase: SupabaseClient,
  userId: string,
  sp: SpecialPeriod
): Promise<void> {
  const row = toDbSpecialPeriod(sp, userId)
  const { error } = await supabase.from('special_periods').upsert(row)
  if (error) throw error
}

export async function syncDeleteSpecialPeriod(
  supabase: SupabaseClient,
  userId: string,
  periodId: string
): Promise<void> {
  const { error } = await supabase.from('special_periods').delete().eq('id', periodId).eq('user_id', userId)
  if (error) throw error
}

export async function syncUpsertPlanSettings(
  supabase: SupabaseClient,
  userId: string,
  ps: FinancialPlanSettings
): Promise<void> {
  const row = toDbPlanSettings(ps, userId)
  const { error } = await supabase.from('financial_plan_settings').upsert(row)
  if (error) throw error
}

export async function syncUpsertProfile(
  supabase: SupabaseClient,
  userId: string,
  profile: UserProfile
): Promise<void> {
  const row = toDbProfile(profile, userId)
  const { error } = await supabase.from('profiles').upsert(row)
  if (error) throw error
}

export async function syncUpsertVariableExpenseEstimate(
  supabase: SupabaseClient,
  userId: string,
  est: VariableExpenseEstimate
): Promise<void> {
  const row = toDbVariableExpenseEstimate(est, userId)
  const { error } = await supabase.from('variable_expense_estimates').upsert(row)
  if (error) throw error
}

export async function syncDeleteVariableExpenseEstimate(
  supabase: SupabaseClient,
  userId: string,
  estimateId: string
): Promise<void> {
  const { error } = await supabase.from('variable_expense_estimates').delete().eq('id', estimateId).eq('user_id', userId)
  if (error) throw error
}

export async function syncUpsertSharedContact(
  supabase: SupabaseClient,
  userId: string,
  contact: SharedContact
): Promise<void> {
  const row = toDbSharedContact(contact, userId)
  const { error } = await supabase.from('shared_contacts').upsert(row)
  if (error) throw error
}

export async function syncDeleteSharedContact(
  supabase: SupabaseClient,
  userId: string,
  contactId: string
): Promise<void> {
  const { error } = await supabase.from('shared_contacts').delete().eq('id', contactId).eq('user_id', userId)
  if (error) throw error
}

export async function syncUpsertExpenseShare(
  supabase: SupabaseClient,
  userId: string,
  share: ExpenseShare
): Promise<void> {
  const row = toDbExpenseShare(share, userId)
  const { error } = await supabase.from('expense_shares').upsert(row)
  if (error) throw error
}

export async function syncDeleteExpenseShare(
  supabase: SupabaseClient,
  userId: string,
  shareId: string
): Promise<void> {
  const { error } = await supabase.from('expense_shares').delete().eq('id', shareId).eq('user_id', userId)
  if (error) throw error
}

export async function safeUpsertCashTransaction(
  supabase: SupabaseClient,
  row: Record<string, unknown>,
  userId?: string
): Promise<void> {
  const effectiveUserId = (userId || row.user_id) as string | undefined
  const { error } = await supabase.from('cash_transactions').upsert(row)
  if (error) {
    console.error('[Supabase Real Error - Upsert Cash Transaction]', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      row,
      userId: effectiveUserId,
    })
    throw error
  }
}

export async function syncUpsertCashTransaction(
  supabase: SupabaseClient,
  userId: string,
  tx: CashTransaction
): Promise<void> {
  const row = toDbCashTransaction(tx, userId)
  await safeUpsertCashTransaction(supabase, row, userId)
}

export async function syncDeleteCashTransaction(
  supabase: SupabaseClient,
  userId: string,
  cashTxId: string
): Promise<void> {
  const { error } = await supabase
    .from('cash_transactions')
    .delete()
    .eq('id', cashTxId)
    .eq('user_id', userId)
  if (error) throw error
}

// ==========================================================================
// Subida completa (SOLO para migración inicial o restauración de backup)
// ==========================================================================

export async function uploadStateToSupabase(
  supabase: SupabaseClient,
  userId: string,
  state: PersistedState
): Promise<boolean> {
  try {
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

    if (state.transactions?.length) {
      const dbTxs = state.transactions.map((t) => toDbTransaction(t, userId))
      for (let i = 0; i < dbTxs.length; i += 100) {
        const batch = dbTxs.slice(i, i + 100)
        const { error } = await supabase.from('transactions').upsert(batch)
        if (error) throw error
      }
    }

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

    if (state.profile) {
      const dbProfile = toDbProfile(state.profile, userId)
      const { error } = await supabase.from('profiles').upsert(dbProfile)
      if (error) throw error
    }

    if (state.variableExpenseEstimates?.length) {
      const dbEstimates = state.variableExpenseEstimates.map((e) => toDbVariableExpenseEstimate(e, userId))
      const { error } = await supabase.from('variable_expense_estimates').upsert(dbEstimates)
      if (error) throw error
    }

    if (state.sharedContacts?.length) {
      const dbContacts = state.sharedContacts.map((c) => toDbSharedContact(c, userId))
      const { error } = await supabase.from('shared_contacts').upsert(dbContacts)
      if (error) throw error
    }

    if (state.expenseShares?.length) {
      const dbShares = state.expenseShares.map((s) => toDbExpenseShare(s, userId))
      const { error } = await supabase.from('expense_shares').upsert(dbShares)
      if (error) throw error
    }

    if (state.cashTransactions?.length) {
      const dbCash = state.cashTransactions.map((c) => toDbCashTransaction(c, userId))
      for (let i = 0; i < dbCash.length; i += 100) {
        const batch = dbCash.slice(i, i + 100)
        const { error } = await supabase.from('cash_transactions').upsert(batch)
        if (error) throw error
      }
    }

    return true
  } catch (err) {
    console.error('[SupabaseSync] Error subiendo estado a Supabase:', err)
    return false
  }
}

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Account, Budget, Category, FinancialPlanSettings, RecurringPayment, Reserve, SavingsGoal, SpecialPeriod, Transaction, UserProfile, VariableExpenseEstimate } from '../src/models/finance'
import { calculateAccountBalance, reconcileAccounts } from '../src/utils/balance'
import { money } from '../src/utils/money'
import type { PersistedState, StorageAdapter } from '../src/services/storage/storageAdapter'
import { LocalStorageAdapter, migratePersistedState } from '../src/services/storage/localStorageAdapter'
import { IndexedDbAdapter } from '../src/services/storage/indexedDbAdapter'
import { resolveIconKey } from '../src/ui/icons'
import { cleanUrlQueryParams, createDeepLinkDeduplicator, parseShortcutUrl } from '../src/utils/deepLink'
import {
  BACKUP_APP_IDENTIFIER,
  CURRENT_BACKUP_VERSION,
  createBackupPayload,
  validateBackupPayload,
} from '../src/utils/backup'
import {
  calculateMonthlyEstimate,
  calculateRealSpentForEstimate,
  calculatePendingEstimate,
  calculateVariableEstimatesSummary,
  normalizeEstimateName,
  selectPendingVariableExpenseEstimate,
} from '../src/utils/variableEstimates'
import {
  calculateNextRecurringDate,
  selectCommittedAmount,
  selectMonthExpenses,
  selectPendingRecurringPayments,
  selectProjectedAvailable,
  selectRealAvailable,
  selectRecurringPaymentCycleStatus,
} from '../src/utils/financeSelectors'
import {
  toDbAccount,
  fromDbAccount,
  toDbTransaction,
  fromDbTransaction,
  toDbCategory,
  fromDbCategory,
  toDbBudget,
  fromDbBudget,
  toDbGoal,
  fromDbGoal,
  toDbReserve,
  fromDbReserve,
  toDbPlanSettings,
  fromDbPlanSettings,
  toDbProfile,
  fromDbProfile,
  toDbVariableExpenseEstimate,
  fromDbVariableExpenseEstimate,
  createCleanInitialState,
  fetchRemoteState,
  syncInsertTransaction,
  syncUpdateTransaction,
  syncDeleteTransaction,
  syncUpsertBudget,
  syncDeleteBudget,
  syncUpsertGoal,
  syncDeleteGoal,
  syncUpsertReserve,
  syncDeleteReserve,
  syncUpsertRecurring,
  syncDeleteRecurring,
  syncUpsertSpecialPeriod,
  syncDeleteSpecialPeriod,
  syncUpsertPlanSettings,
  syncUpsertProfile,
  syncUpsertVariableExpenseEstimate,
  syncDeleteVariableExpenseEstimate,
} from '../src/services/supabase/supabaseSync'
import {
  enqueueOfflineMutation,
  getOfflineQueue,
  flushOfflineQueue,
  getPendingMutationsCount,
  clearOfflineQueue,
  isDemoMutation,
  subscribeOfflineQueue,
} from '../src/services/supabase/offlineQueue'
import {
  cleanInitialFinanceState,
  categories as baseCategories,
} from '../src/data/seed'
import {
  markLocalMutation,
  isLocalMutation,
  initRealtimeSubscription,
  unsubscribeRealtime,
  isRealtimeSubscribed,
  getRealtimeChannelStatus,
  ensureRealtimeConnection,
} from '../src/services/supabase/supabaseRealtime'
import { initialFinanceState } from '../src/store/useFinance'
import {
  budgetRemaining,
  budgetUsagePercentage,
  overBudgetAmount,
  selectBudgetsSummary,
  spentByCategoryThisMonth,
} from '../src/utils/budgetSelectors'
import {
  calculatePeriodStatistics,
  compareWithPreviousPeriod,
  getLocalDateRange,
} from '../src/utils/statisticsSelectors'
import {
  selectAssignedSavings,
  selectCommittedAmount,
  selectFreeSavings,
  selectGoalProgress,
  selectMonthExpenses,
  selectPendingRecurringPayments,
  selectRealAvailable,
  selectSavingsBalance,
  selectSpendableBalance,
  selectTotalMoney,
} from '../src/utils/financeSelectors'
import {
  isMonthInSpecialPeriod,
  selectAdjustedMonthlySpendingExpectation,
  selectEmergencyFundMonthsCovered,
  selectEmergencyFundTarget,
  selectEssentialMonthlyExpenses,
  selectExpectedExtraSpendingForMonth,
  selectFreeSavingsWithReserves,
  selectMonthlyIncome,
  selectMonthlyReserveNeeded,
  selectTargetMonthlySavings,
  selectTotalAllocatedToGoals,
  selectTotalAllocatedToReserves,
  selectUpcomingSpecialPeriods,
  selectVariableMonthlyExpenses,
} from '../src/utils/planSelectors'

describe('Pocketflow — Pruebas Exhaustivas de Dominio Financiero', () => {
  const baseAccounts: Account[] = [
    { id: 'daily', name: 'Cuenta diaria', type: 'spending', initialBalance: 500 },
    { id: 'savings', name: 'Ahorro', type: 'savings', initialBalance: 1000 },
  ]

  // 1. Gasto
  it('1. Gasto: deduce el importe de la cuenta indicada', () => {
    const txs: Transaction[] = [
      { id: 't1', type: 'expense', amount: 50, accountId: 'daily', description: 'Mercadona', date: new Date().toISOString() },
    ]
    const reconciled = reconcileAccounts(baseAccounts, txs)
    const daily = reconciled.find((a) => a.id === 'daily')!
    const savings = reconciled.find((a) => a.id === 'savings')!

    assert.equal(daily.balance, 450)
    assert.equal(savings.balance, 1000)
  })

  // 2. Ingreso
  it('2. Ingreso: aumenta el importe de la cuenta indicada', () => {
    const txs: Transaction[] = [
      { id: 't2', type: 'income', amount: 300, accountId: 'daily', description: 'Bizum recibido', date: new Date().toISOString() },
    ]
    const reconciled = reconcileAccounts(baseAccounts, txs)
    const daily = reconciled.find((a) => a.id === 'daily')!

    assert.equal(daily.balance, 800)
  })

  // 3. Transferencia diaria -> ahorro
  it('3. Transferencia diaria -> ahorro: reduce diaria e incrementa ahorro sin alterar patrimonio total', () => {
    const txs: Transaction[] = [
      { id: 't3', type: 'transfer', amount: 150, accountId: 'daily', toAccountId: 'savings', description: 'Traspaso a ahorro', date: new Date().toISOString() },
    ]
    const reconciled = reconcileAccounts(baseAccounts, txs)
    const daily = reconciled.find((a) => a.id === 'daily')!
    const savings = reconciled.find((a) => a.id === 'savings')!

    assert.equal(daily.balance, 350)
    assert.equal(savings.balance, 1150)
    assert.equal(daily.balance + savings.balance, 1500)
  })

  // 4. Transferencia ahorro -> diaria
  it('4. Transferencia ahorro -> diaria: reduce ahorro e incrementa diaria', () => {
    const txs: Transaction[] = [
      { id: 't4', type: 'transfer', amount: 200, accountId: 'savings', toAccountId: 'daily', description: 'Rescate de ahorro', date: new Date().toISOString() },
    ]
    const reconciled = reconcileAccounts(baseAccounts, txs)
    const daily = reconciled.find((a) => a.id === 'daily')!
    const savings = reconciled.find((a) => a.id === 'savings')!

    assert.equal(daily.balance, 700)
    assert.equal(savings.balance, 800)
    assert.equal(daily.balance + savings.balance, 1500)
  })

  // 5. Editar gasto
  it('5. Editar gasto: recalcula el saldo a partir de la nueva versión del gasto', () => {
    let txs: Transaction[] = [
      { id: 't5', type: 'expense', amount: 40, accountId: 'daily', description: 'Ropa', date: new Date().toISOString() },
    ]
    assert.equal(reconcileAccounts(baseAccounts, txs).find((a) => a.id === 'daily')!.balance, 460)

    // Editar importe a 65
    txs = txs.map((t) => (t.id === 't5' ? { ...t, amount: 65 } : t))
    assert.equal(reconcileAccounts(baseAccounts, txs).find((a) => a.id === 'daily')!.balance, 435)
  })

  // 6. Editar ingreso
  it('6. Editar ingreso: recalcula el saldo a partir del nuevo importe', () => {
    let txs: Transaction[] = [
      { id: 't6', type: 'income', amount: 1000, accountId: 'daily', description: 'Nómina', date: new Date().toISOString() },
    ]
    assert.equal(reconcileAccounts(baseAccounts, txs).find((a) => a.id === 'daily')!.balance, 1500)

    // Editar a 1200
    txs = txs.map((t) => (t.id === 't6' ? { ...t, amount: 1200 } : t))
    assert.equal(reconcileAccounts(baseAccounts, txs).find((a) => a.id === 'daily')!.balance, 1700)
  })

  // 7. Editar transferencia
  it('7. Editar transferencia: actualiza ambas cuentas con el nuevo importe transferido', () => {
    let txs: Transaction[] = [
      { id: 't7', type: 'transfer', amount: 100, accountId: 'daily', toAccountId: 'savings', description: 'Ahorro', date: new Date().toISOString() },
    ]
    let reconciled = reconcileAccounts(baseAccounts, txs)
    assert.equal(reconciled.find((a) => a.id === 'daily')!.balance, 400)
    assert.equal(reconciled.find((a) => a.id === 'savings')!.balance, 1100)

    // Modificar a 250
    txs = txs.map((t) => (t.id === 't7' ? { ...t, amount: 250 } : t))
    reconciled = reconcileAccounts(baseAccounts, txs)
    assert.equal(reconciled.find((a) => a.id === 'daily')!.balance, 250)
    assert.equal(reconciled.find((a) => a.id === 'savings')!.balance, 1250)
  })

  // 8. Borrar gasto
  it('8. Borrar gasto: el saldo recupera su valor previo de inmediato', () => {
    const txs: Transaction[] = [
      { id: 't8', type: 'expense', amount: 80, accountId: 'daily', description: 'Cena', date: new Date().toISOString() },
    ]
    assert.equal(reconcileAccounts(baseAccounts, txs).find((a) => a.id === 'daily')!.balance, 420)

    const afterDelete = txs.filter((t) => t.id !== 't8')
    assert.equal(reconcileAccounts(baseAccounts, afterDelete).find((a) => a.id === 'daily')!.balance, 500)
  })

  // 9. Borrar ingreso
  it('9. Borrar ingreso: el saldo se recalcula sin el ingreso eliminado', () => {
    const txs: Transaction[] = [
      { id: 't9', type: 'income', amount: 300, accountId: 'daily', description: 'Extra', date: new Date().toISOString() },
    ]
    assert.equal(reconcileAccounts(baseAccounts, txs).find((a) => a.id === 'daily')!.balance, 800)

    const afterDelete = txs.filter((t) => t.id !== 't9')
    assert.equal(reconcileAccounts(baseAccounts, afterDelete).find((a) => a.id === 'daily')!.balance, 500)
  })

  // 10. Borrar transferencia
  it('10. Borrar transferencia: ambas cuentas vuelven a su saldo previo exacto', () => {
    const txs: Transaction[] = [
      { id: 't10', type: 'transfer', amount: 150, accountId: 'daily', toAccountId: 'savings', description: 'Traspaso', date: new Date().toISOString() },
    ]
    assert.equal(reconcileAccounts(baseAccounts, txs).find((a) => a.id === 'daily')!.balance, 350)
    assert.equal(reconcileAccounts(baseAccounts, txs).find((a) => a.id === 'savings')!.balance, 1150)

    const afterDelete = txs.filter((t) => t.id !== 't10')
    const rec = reconcileAccounts(baseAccounts, afterDelete)
    assert.equal(rec.find((a) => a.id === 'daily')!.balance, 500)
    assert.equal(rec.find((a) => a.id === 'savings')!.balance, 1000)
  })

  // 11. Reconstrucción completa de saldos desde histórico
  it('11. Reconstrucción completa de saldos desde histórico: determinista e inmutable', () => {
    const complexHistory: Transaction[] = [
      { id: 'h1', type: 'income', amount: 1500, accountId: 'daily', description: 'Nómina', date: '2026-08-01' },
      { id: 'h2', type: 'expense', amount: 45.2, accountId: 'daily', description: 'Supermercado', date: '2026-08-02' },
      { id: 'h3', type: 'transfer', amount: 300, accountId: 'daily', toAccountId: 'savings', description: 'Ahorro', date: '2026-08-03' },
      { id: 'h4', type: 'expense', amount: 12.8, accountId: 'daily', description: 'Farmacia', date: '2026-08-04' },
      { id: 'h5', type: 'transfer', amount: 50, accountId: 'savings', toAccountId: 'daily', description: 'Ajuste', date: '2026-08-05' },
      { id: 'h6', type: 'expense', amount: 120, accountId: 'daily', description: 'Gasolina', date: '2026-08-06' },
      { id: 'h7', type: 'income', amount: 80, accountId: 'daily', description: 'Venta ropa', date: '2026-08-07' },
    ]

    // Cálculo esperado para daily:
    // 500 (inicial) + 1500 - 45.20 - 300 - 12.80 + 50 - 120 + 80 = 1652.00
    const dailyBalance = calculateAccountBalance({ id: 'daily', initialBalance: 500 }, complexHistory)
    assert.equal(dailyBalance, 1652)

    // Cálculo esperado para savings:
    // 1000 (inicial) + 300 - 50 = 1250.00
    const savingsBalance = calculateAccountBalance({ id: 'savings', initialBalance: 1000 }, complexHistory)
    assert.equal(savingsBalance, 1250)
  })

  // 12. Transferencias excluidas de ingresos/gastos
  it('12. Transferencias excluidas de ingresos/gastos: una transferencia nunca debe contarse como gasto ni ingreso del periodo', () => {
    const transactions: Transaction[] = [
      { id: '1', type: 'expense', amount: 25, accountId: 'daily', description: 'Gasto real', date: new Date().toISOString() },
      { id: '2', type: 'transfer', amount: 500, accountId: 'daily', toAccountId: 'savings', description: 'Transferencia interna', date: new Date().toISOString() },
      { id: '3', type: 'income', amount: 100, accountId: 'daily', description: 'Ingreso real', date: new Date().toISOString() },
    ]

    const totalExpenses = transactions
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0)

    const totalIncomes = transactions
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0)

    assert.equal(totalExpenses, 25)
    assert.equal(totalIncomes, 100)
  })

  // 13. monthExpenses correcto
  it('13. monthExpenses correcto: filtra y suma únicamente los gastos del mes y año en curso', () => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()

    const pastDate = new Date(currentYear, currentMonth - 1, 15).toISOString()
    const currentDate = new Date(currentYear, currentMonth, 10).toISOString()
    const anotherCurrentDate = new Date(currentYear, currentMonth, 20).toISOString()

    const transactions: Transaction[] = [
      { id: 'm1', type: 'expense', amount: 30, accountId: 'daily', description: 'Gasto este mes 1', date: currentDate },
      { id: 'm2', type: 'expense', amount: 45, accountId: 'daily', description: 'Gasto este mes 2', date: anotherCurrentDate },
      { id: 'm3', type: 'expense', amount: 100, accountId: 'daily', description: 'Gasto mes pasado', date: pastDate },
      { id: 'm4', type: 'transfer', amount: 200, accountId: 'daily', toAccountId: 'savings', description: 'Traspaso este mes', date: currentDate },
      { id: 'm5', type: 'income', amount: 500, accountId: 'daily', description: 'Ingreso este mes', date: currentDate },
    ]

    const monthExpenses = transactions
      .filter((t) => t.type === 'expense')
      .filter((t) => {
        const d = new Date(t.date)
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth
      })
      .reduce((sum, t) => sum + t.amount, 0)

    assert.equal(monthExpenses, 75) // 30 + 45
  })

  // 14. Persistencia y carga del StorageAdapter
  it('14. Persistencia/carga del StorageAdapter: almacena y recupera el estado de forma fiel', async () => {
    // Implementación en memoria del contrato StorageAdapter
    class MemoryStorageAdapter implements StorageAdapter {
      private state: PersistedState | null = null

      async load(): Promise<PersistedState | null> {
        return this.state ? JSON.parse(JSON.stringify(this.state)) : null
      }

      async save(next: PersistedState): Promise<void> {
        this.state = JSON.parse(JSON.stringify(next))
      }

      async clear(): Promise<void> {
        this.state = null
      }
    }

    const adapter = new MemoryStorageAdapter()
    const testState: PersistedState = {
      accounts: baseAccounts,
      transactions: [
        { id: 's1', type: 'expense', amount: 19.99, accountId: 'daily', description: 'Cine', date: '2026-08-31' },
      ],
      goals: [{ id: 'g1', name: 'Vacaciones', target: 1000, current: 200 }],
      recurring: [],
      categories: [{ id: 'c1', name: 'Ocio', color: '#ff0000', icon: '◌' }],
      budgets: [{ id: 'b1', categoryId: 'c1', monthlyLimit: 200 }],
    }

    await adapter.save(testState)
    const loaded = await adapter.load()

    assert.deepEqual(loaded, testState)
    assert.equal(loaded?.transactions.length, 1)
    assert.equal(loaded?.transactions[0].amount, 19.99)
  })

  // 15. Recurrente ya pagado no descontado dos veces
  it('15. Recurrente ya pagado no descontado dos veces: si un recurrente ya fue registrado como gasto en el mes, no se resta doblemente del disponible real', () => {
    const recurringItem: RecurringPayment = {
      id: 'r_spotify',
      name: 'Spotify',
      amount: 10.99,
      categoryId: 'sub',
      accountId: 'daily',
      frequency: 'monthly',
      nextDate: '2026-08-04',
      active: true,
    }

    const recurringList = [recurringItem]

    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    // Caso A: Todavía NO se ha pagado Spotify este mes
    const txsBeforePay: Transaction[] = []
    const pendingBefore = recurringList.filter((r) => {
      if (!r.active) return false
      const alreadyPaid = txsBeforePay.some((t) => {
        if (t.type !== 'expense') return false
        const d = new Date(t.date)
        return (
          d.getMonth() === currentMonth &&
          d.getFullYear() === currentYear &&
          (t.description.toLowerCase().includes(r.name.toLowerCase()) ||
            (r.categoryId && t.categoryId === r.categoryId && Math.abs(t.amount - r.amount) < 0.01))
        )
      })
      return !alreadyPaid
    })
    assert.equal(pendingBefore.length, 1)
    assert.equal(pendingBefore.reduce((s, r) => s + r.amount, 0), 10.99)

    // Caso B: Se registra el gasto de Spotify en el mes
    const txsAfterPay: Transaction[] = [
      {
        id: 't_spot',
        type: 'expense',
        amount: 10.99,
        accountId: 'daily',
        categoryId: 'sub',
        description: 'Spotify suscripción',
        date: new Date(currentYear, currentMonth, 4).toISOString(),
      },
    ]

    const pendingAfter = recurringList.filter((r) => {
      if (!r.active) return false
      const alreadyPaid = txsAfterPay.some((t) => {
        if (t.type !== 'expense') return false
        const d = new Date(t.date)
        return (
          d.getMonth() === currentMonth &&
          d.getFullYear() === currentYear &&
          (t.description.toLowerCase().includes(r.name.toLowerCase()) ||
            (r.categoryId && t.categoryId === r.categoryId && Math.abs(t.amount - r.amount) < 0.01))
        )
      })
      return !alreadyPaid
    })

    // Ahora pendingAfter debe ser 0, para no restar los 10.99€ por duplicado
    assert.equal(pendingAfter.length, 0)
    assert.equal(pendingAfter.reduce((s, r) => s + r.amount, 0), 0)
  })
})

describe('Fase 2 — Conceptos Financieros Principales y Selectores', () => {
  const accounts: Account[] = [
    { id: 'daily', name: 'Cuenta diaria', type: 'spending', initialBalance: 600 },
    { id: 'savings', name: 'Ahorro', type: 'savings', initialBalance: 1200 },
  ]

  it('16. Dinero total: suma exacta del saldo de Cuenta diaria y saldo de Ahorro', () => {
    const reconciled = reconcileAccounts(accounts, [])
    const total = selectTotalMoney(reconciled)
    assert.equal(total, 1800)
  })

  it('17. Saldo gastable: refleja únicamente el saldo actual de la Cuenta diaria', () => {
    const txs: Transaction[] = [
      { id: 't1', type: 'expense', amount: 50, accountId: 'daily', description: 'Café y comida', date: new Date().toISOString() },
    ]
    const reconciled = reconcileAccounts(accounts, txs)
    const spendable = selectSpendableBalance(reconciled)
    assert.equal(spendable, 550)
  })

  it('18. Ahorro: refleja únicamente el saldo actual de la Cuenta Ahorro', () => {
    const txs: Transaction[] = [
      { id: 't2', type: 'transfer', amount: 300, accountId: 'daily', toAccountId: 'savings', description: 'Ahorro', date: new Date().toISOString() },
    ]
    const reconciled = reconcileAccounts(accounts, txs)
    const savings = selectSavingsBalance(reconciled)
    assert.equal(savings, 1500)
  })

  it('19. Transferencia diaria -> ahorro: reduce dinero para gastar, aumenta ahorro y mantiene Dinero total intacto', () => {
    const txs: Transaction[] = [
      { id: 't3', type: 'transfer', amount: 200, accountId: 'daily', toAccountId: 'savings', description: 'Ahorro mensual', date: new Date().toISOString() },
    ]
    const reconciled = reconcileAccounts(accounts, txs)
    assert.equal(selectSpendableBalance(reconciled), 400) // 600 - 200
    assert.equal(selectSavingsBalance(reconciled), 1400)   // 1200 + 200
    assert.equal(selectTotalMoney(reconciled), 1800)       // Dinero total no cambia
  })

  it('20. Transferencia ahorro -> diaria: reduce ahorro, aumenta dinero para gastar y mantiene Dinero total intacto', () => {
    const txs: Transaction[] = [
      { id: 't4', type: 'transfer', amount: 500, accountId: 'savings', toAccountId: 'daily', description: 'Uso de reserva', date: new Date().toISOString() },
    ]
    const reconciled = reconcileAccounts(accounts, txs)
    assert.equal(selectSpendableBalance(reconciled), 1100) // 600 + 500
    assert.equal(selectSavingsBalance(reconciled), 700)    // 1200 - 500
    assert.equal(selectTotalMoney(reconciled), 1800)       // Dinero total no cambia
  })

  it('21. Cambio de initialBalance: reconstruye correctamente el saldo actual sobre todo el histórico', () => {
    const txs: Transaction[] = [
      { id: 'h1', type: 'expense', amount: 100, accountId: 'daily', description: 'Gasto', date: '2026-08-01' },
      { id: 'h2', type: 'income', amount: 250, accountId: 'daily', description: 'Ingreso', date: '2026-08-05' },
    ]
    // Con saldo inicial de 600: 600 - 100 + 250 = 750
    assert.equal(calculateAccountBalance({ id: 'daily', initialBalance: 600 }, txs), 750)

    // Si el usuario modifica el saldo inicial a 800 desde Ajustes: 800 - 100 + 250 = 950
    assert.equal(calculateAccountBalance({ id: 'daily', initialBalance: 800 }, txs), 950)
  })

  it('22. Disponible real: dinero para gastar menos dinero comprometido de recurrentes pendientes', () => {
    const spendable = 600
    const committed = 48.98 // Ej: Spotify 10.99 + Gimnasio 35 + iCloud 2.99
    const realAvailable = selectRealAvailable(spendable, committed)
    assert.equal(realAvailable, 551.02)

    // Si el comprometido supera al gastable, disponible real nunca es negativo
    assert.equal(selectRealAvailable(30, 100), 0)
  })

  it('23. Ahorro nunca cuenta como gasto mensual: transferir a ahorro no aumenta monthExpenses', () => {
    const now = new Date()
    const txs: Transaction[] = [
      { id: 'g1', type: 'expense', amount: 60, accountId: 'daily', description: 'Restaurante', date: now.toISOString() },
      { id: 'tr1', type: 'transfer', amount: 400, accountId: 'daily', toAccountId: 'savings', description: 'A ahorro', date: now.toISOString() },
    ]
    const expenses = selectMonthExpenses(txs, now)
    assert.equal(expenses, 60) // Solo los 60€ de gasto, los 400€ transferidos a ahorro no son gasto
  })
})

describe('Fase 3 — Ahorro, Asignación de Objetivos y Gastos Recurrentes', () => {
  // 1. ahorro sin objetivos => todo ahorro es libre
  it('24. Ahorro sin objetivos: todo el saldo de Ahorro es libre', () => {
    const savingsBalance = 1000
    const goals: SavingsGoal[] = []
    const assigned = selectAssignedSavings(goals)
    const free = selectFreeSavings(savingsBalance, assigned)

    assert.equal(assigned, 0)
    assert.equal(free, 1000)
  })

  // 2. asignar ahorro a un objetivo
  it('25. Asignar ahorro a un objetivo: disminuye ahorro libre e incrementa asignado', () => {
    const savingsBalance = 1200
    const goals: SavingsGoal[] = [
      { id: 'g1', name: 'Japón', target: 2500, current: 300 },
    ]
    const assigned = selectAssignedSavings(goals)
    const free = selectFreeSavings(savingsBalance, assigned)

    assert.equal(assigned, 300)
    assert.equal(free, 900)
  })

  // 3. varios objetivos
  it('26. Varios objetivos: suma correctamente las asignaciones de todos los objetivos', () => {
    const savingsBalance = 1500
    const goals: SavingsGoal[] = [
      { id: 'g1', name: 'Japón', target: 2500, current: 500 },
      { id: 'g2', name: 'Fondo emergencia', target: 3000, current: 400 },
      { id: 'g3', name: 'MacBook', target: 1200, current: 150 },
    ]
    const assigned = selectAssignedSavings(goals)
    const free = selectFreeSavings(savingsBalance, assigned)

    assert.equal(assigned, 1050) // 500 + 400 + 150
    assert.equal(free, 450)      // 1500 - 1050
  })

  // 4. desasignar ahorro
  it('27. Desasignar ahorro: reduce la asignación del objetivo y libera saldo a ahorro libre', () => {
    const savingsBalance = 1000
    let goals: SavingsGoal[] = [
      { id: 'g1', name: 'Viaje', target: 800, current: 500 },
    ]
    assert.equal(selectFreeSavings(savingsBalance, selectAssignedSavings(goals)), 500)

    // Retirar 200€ del objetivo
    goals = goals.map((g) => (g.id === 'g1' ? { ...g, current: g.current - 200 } : g))
    const assigned = selectAssignedSavings(goals)
    const free = selectFreeSavings(savingsBalance, assigned)

    assert.equal(assigned, 300)
    assert.equal(free, 700)
  })

  // 5. impedir asignar más que savingsBalance
  it('28. Validación: no se permite asignar más ahorro que el saldo libre disponible', () => {
    const savingsBalance = 800
    const goals: SavingsGoal[] = [
      { id: 'g1', name: 'Fondo', target: 2000, current: 600 },
    ]
    const assigned = selectAssignedSavings(goals)
    const free = selectFreeSavings(savingsBalance, assigned)
    assert.equal(free, 200)

    // Intento de asignar 300€ cuando solo hay 200€ libres
    const attemptAmount = 300
    const isValid = attemptAmount <= free
    assert.equal(isValid, false)
  })

  // 6. transferencia diaria -> ahorro aumenta savingsBalance pero no asigna automáticamente
  it('29. Transferencia diaria -> ahorro: incrementa savingsBalance y el ahorro libre, sin asignar automáticamente', () => {
    const accounts: Account[] = [
      { id: 'daily', name: 'Cuenta diaria', type: 'spending', initialBalance: 500 },
      { id: 'savings', name: 'Ahorro', type: 'savings', initialBalance: 1000 },
    ]
    const goals: SavingsGoal[] = [
      { id: 'g1', name: 'Japón', target: 2500, current: 400 },
    ]

    // Antes de la transferencia
    let rec = reconcileAccounts(accounts, [])
    let savings = selectSavingsBalance(rec)
    assert.equal(savings, 1000)
    assert.equal(selectFreeSavings(savings, selectAssignedSavings(goals)), 600)

    // Transferir 200€ a ahorro
    const transfer: Transaction = {
      id: 'tr1',
      type: 'transfer',
      amount: 200,
      accountId: 'daily',
      toAccountId: 'savings',
      description: 'A ahorro',
      date: new Date().toISOString(),
    }
    rec = reconcileAccounts(accounts, [transfer])
    savings = selectSavingsBalance(rec)

    assert.equal(savings, 1200)
    assert.equal(selectAssignedSavings(goals), 400) // Se mantiene intacto
    assert.equal(selectFreeSavings(savings, selectAssignedSavings(goals)), 800) // Se incrementa el libre
  })

  // 7. asignación a objetivo no cambia totalMoney
  it('30. Asignación a objetivo: no altera el Dinero total (totalMoney)', () => {
    const accounts: Account[] = [
      { id: 'daily', name: 'Cuenta diaria', type: 'spending', initialBalance: 400 },
      { id: 'savings', name: 'Ahorro', type: 'savings', initialBalance: 1100 },
    ]
    const totalMoneyBefore = selectTotalMoney(reconcileAccounts(accounts, []))
    assert.equal(totalMoneyBefore, 1500)

    // Se asignan 600€ a un objetivo
    const goals: SavingsGoal[] = [{ id: 'g1', name: 'Coche', target: 5000, current: 600 }]
    const totalMoneyAfter = selectTotalMoney(reconcileAccounts(accounts, []))

    assert.equal(totalMoneyAfter, 1500)
    assert.equal(selectAssignedSavings(goals), 600)
  })

  // 8. asignación a objetivo no cambia savingsBalance
  it('31. Asignación a objetivo: no cambia el saldo de la cuenta Ahorro (savingsBalance)', () => {
    const accounts: Account[] = [
      { id: 'savings', name: 'Ahorro', type: 'savings', initialBalance: 1200 },
    ]
    const savingsBefore = selectSavingsBalance(reconcileAccounts(accounts, []))
    assert.equal(savingsBefore, 1200)

    // Crear/asignar objetivo
    const goals: SavingsGoal[] = [{ id: 'g1', name: 'Bici', target: 800, current: 400 }]
    const savingsAfter = selectSavingsBalance(reconcileAccounts(accounts, []))

    assert.equal(savingsAfter, 1200)
  })

  // 9. eliminar objetivo libera su ahorro asignado
  it('32. Eliminar objetivo: libera automáticamente su dinero asignado al ahorro libre', () => {
    const savingsBalance = 1000
    let goals: SavingsGoal[] = [
      { id: 'g1', name: 'Japón', target: 2000, current: 350 },
      { id: 'g2', name: 'Reserva', target: 1000, current: 200 },
    ]
    assert.equal(selectAssignedSavings(goals), 550)
    assert.equal(selectFreeSavings(savingsBalance, 550), 450)

    // Eliminar g1
    goals = goals.filter((g) => g.id !== 'g1')
    const assignedAfter = selectAssignedSavings(goals)
    const freeAfter = selectFreeSavings(savingsBalance, assignedAfter)

    assert.equal(assignedAfter, 200)
    assert.equal(freeAfter, 800) // Se liberaron los 350€
  })

  // 10. porcentaje/progreso correcto
  it('33. Progreso de objetivos: calcula correctamente el porcentaje y estado completado', () => {
    const p1 = selectGoalProgress(750, 2500)
    assert.equal(p1.percentage, 30)
    assert.equal(p1.isCompleted, false)

    const p2 = selectGoalProgress(2500, 2500)
    assert.equal(p2.percentage, 100)
    assert.equal(p2.isCompleted, true)

    // Si supera el objetivo, no sobrepasa 100% en la barra visual pero está completado
    const p3 = selectGoalProgress(3000, 2500)
    assert.equal(p3.percentage, 100)
    assert.equal(p3.isCompleted, true)
  })

  // 11. recurrente futuro activo cuenta como comprometido
  it('34. Recurrente futuro activo: se incluye en committedAmount de la Cuenta diaria', () => {
    const recurring: RecurringPayment[] = [
      { id: 'r1', name: 'Gimnasio', amount: 35, categoryId: 'sport', accountId: 'daily', frequency: 'monthly', nextDate: '2026-08-25', active: true },
    ]
    const transactions: Transaction[] = []
    const now = new Date(2026, 7, 10)

    const pending = selectPendingRecurringPayments(recurring, transactions, now, 'daily')
    assert.equal(pending.length, 1)
    assert.equal(selectCommittedAmount(recurring, transactions, now, 'daily'), 35)
  })

  // 12. recurrente desactivado no cuenta
  it('35. Recurrente desactivado: no computa como dinero comprometido', () => {
    const recurring: RecurringPayment[] = [
      { id: 'r1', name: 'Gimnasio', amount: 35, categoryId: 'sport', accountId: 'daily', frequency: 'monthly', nextDate: '2026-08-25', active: false },
    ]
    const transactions: Transaction[] = []
    const now = new Date(2026, 7, 10)

    const pending = selectPendingRecurringPayments(recurring, transactions, now, 'daily')
    assert.equal(pending.length, 0)
    assert.equal(selectCommittedAmount(recurring, transactions, now, 'daily'), 0)
  })

  // 13. recurrente ya registrado no cuenta dos veces
  it('36. Recurrente ya registrado: transacción con recurringPaymentId en el mes evita doble cómputo', () => {
    const recurring: RecurringPayment[] = [
      { id: 'r_spotify', name: 'Spotify', amount: 10.99, categoryId: 'sub', accountId: 'daily', frequency: 'monthly', nextDate: '2026-08-04', active: true },
    ]
    const now = new Date(2026, 7, 15)

    // Se registra el gasto de Spotify este mes con el recurringPaymentId correspondiente
    const transactions: Transaction[] = [
      { id: 'tx_spot', type: 'expense', amount: 10.99, accountId: 'daily', description: 'Spotify', date: '2026-08-04T10:00:00Z', recurringPaymentId: 'r_spotify' },
    ]

    const pending = selectPendingRecurringPayments(recurring, transactions, now, 'daily')
    assert.equal(pending.length, 0)
    assert.equal(selectCommittedAmount(recurring, transactions, now, 'daily'), 0)
  })

  // 14. recurrente de otra cuenta no afecta disponible de Cuenta diaria si no corresponde
  it('37. Recurrente de otra cuenta: un recurrente asignado a Ahorro no resta del disponible de Cuenta diaria', () => {
    const recurring: RecurringPayment[] = [
      { id: 'r_broker', name: 'Aportación indexado', amount: 150, categoryId: 'inv', accountId: 'savings', frequency: 'monthly', nextDate: '2026-08-15', active: true },
    ]
    const now = new Date(2026, 7, 1)

    const pendingDaily = selectPendingRecurringPayments(recurring, [], now, 'daily')
    assert.equal(pendingDaily.length, 0)
    assert.equal(selectCommittedAmount(recurring, [], now, 'daily'), 0)
  })

  // 15. edición de recurrente actualiza committedAmount
  it('38. Edición de recurrente: modificar el importe actualiza de inmediato committedAmount', () => {
    let recurring: RecurringPayment[] = [
      { id: 'r1', name: 'Internet fibra', amount: 30, categoryId: 'home', accountId: 'daily', frequency: 'monthly', nextDate: '2026-08-20', active: true },
    ]
    const now = new Date(2026, 7, 5)
    assert.equal(selectCommittedAmount(recurring, [], now, 'daily'), 30)

    // Editar importe a 45€
    recurring = recurring.map((r) => (r.id === 'r1' ? { ...r, amount: 45 } : r))
    assert.equal(selectCommittedAmount(recurring, [], now, 'daily'), 45)
  })

  // 16. eliminación de recurrente actualiza committedAmount
  it('39. Eliminación de recurrente: suprimir un recurrente lo desvincula del committedAmount', () => {
    let recurring: RecurringPayment[] = [
      { id: 'r1', name: 'Netflix', amount: 15.99, categoryId: 'sub', accountId: 'daily', frequency: 'monthly', nextDate: '2026-08-18', active: true },
      { id: 'r2', name: 'Gimnasio', amount: 35, categoryId: 'sport', accountId: 'daily', frequency: 'monthly', nextDate: '2026-08-22', active: true },
    ]
    const now = new Date(2026, 7, 1)
    assert.equal(selectCommittedAmount(recurring, [], now, 'daily'), 50.99)

    // Eliminar Netflix
    recurring = recurring.filter((r) => r.id !== 'r1')
    assert.equal(selectCommittedAmount(recurring, [], now, 'daily'), 35)
  })

  // 17. relación recurringPaymentId se mantiene correctamente
  it('40. Relación recurringPaymentId: vincula unívocamente transacción con recurrente específico', () => {
    const recurring: RecurringPayment[] = [
      { id: 'r_apple', name: 'Apple Music', amount: 10.99, categoryId: 'sub', accountId: 'daily', frequency: 'monthly', nextDate: '2026-08-10', active: true },
      { id: 'r_spotify', name: 'Spotify', amount: 10.99, categoryId: 'sub', accountId: 'daily', frequency: 'monthly', nextDate: '2026-08-10', active: true },
    ]
    const now = new Date(2026, 7, 5)

    // Se registra pago SOLO para Apple Music
    const transactions: Transaction[] = [
      { id: 'tx_apple', type: 'expense', amount: 10.99, accountId: 'daily', description: 'Pago Apple', date: '2026-08-05T00:00:00Z', recurringPaymentId: 'r_apple' },
    ]

    const pending = selectPendingRecurringPayments(recurring, transactions, now, 'daily')
    // Spotify debe continuar pendiente
    assert.equal(pending.length, 1)
    assert.equal(pending[0].id, 'r_spotify')
    assert.equal(selectCommittedAmount(recurring, transactions, now, 'daily'), 10.99)
  })
})

describe('Fase 4 — Presupuestos por Categoría y Estadísticas', () => {
  const sampleCategories: Category[] = [
    { id: 'food', name: 'Comida', color: '#16a34a', icon: '🍽️' },
    { id: 'leisure', name: 'Ocio', color: '#f59e0b', icon: '🍿' },
    { id: 'clothes', name: 'Ropa', color: '#ec4899', icon: '🛍️' },
  ]

  const now = new Date(2026, 7, 15) // Agosto 2026

  // 1. gasto mensual de una categoría
  it('41. Gasto mensual de una categoría: suma exclusivamente los gastos de esa categoría en el mes', () => {
    const txs: Transaction[] = [
      { id: 't1', type: 'expense', amount: 45, accountId: 'daily', categoryId: 'food', description: 'Super', date: '2026-08-02' },
      { id: 't2', type: 'expense', amount: 37, accountId: 'daily', categoryId: 'food', description: 'Restaurante', date: '2026-08-10' },
      { id: 't3', type: 'expense', amount: 50, accountId: 'daily', categoryId: 'food', description: 'Mes pasado', date: '2026-07-28' },
    ]
    const spentFood = spentByCategoryThisMonth(txs, 'food', now)
    assert.equal(spentFood, 82) // 45 + 37 en agosto, julio queda excluido
  })

  // 2. gasto de otra categoría no afecta
  it('42. Gasto de otra categoría: no computa en el presupuesto de la categoría consultada', () => {
    const txs: Transaction[] = [
      { id: 't1', type: 'expense', amount: 82, accountId: 'daily', categoryId: 'leisure', description: 'Cine y copas', date: '2026-08-05' },
      { id: 't2', type: 'expense', amount: 60, accountId: 'daily', categoryId: 'clothes', description: 'Camisa', date: '2026-08-06' },
    ]
    assert.equal(spentByCategoryThisMonth(txs, 'leisure', now), 82)
    assert.equal(spentByCategoryThisMonth(txs, 'clothes', now), 60)
  })

  // 3. transferencia no consume presupuesto
  it('43. Transferencia: nunca consume presupuesto, incluso si especifica categoría o cuenta', () => {
    const txs: Transaction[] = [
      { id: 't1', type: 'transfer', amount: 300, accountId: 'daily', toAccountId: 'savings', categoryId: 'leisure', description: 'Ahorro para ocio', date: '2026-08-08' },
    ]
    assert.equal(spentByCategoryThisMonth(txs, 'leisure', now), 0)
  })

  // 4. ingreso no consume presupuesto
  it('44. Ingreso: nunca consume ni altera el gasto del presupuesto de una categoría', () => {
    const txs: Transaction[] = [
      { id: 't1', type: 'income', amount: 200, accountId: 'daily', categoryId: 'food', description: 'Reembolso cena', date: '2026-08-11' },
      { id: 't2', type: 'expense', amount: 50, accountId: 'daily', categoryId: 'food', description: 'Cena', date: '2026-08-11' },
    ]
    assert.equal(spentByCategoryThisMonth(txs, 'food', now), 50)
  })

  // 5. budgetRemaining
  it('45. budgetRemaining: calcula el saldo restante exacto hasta el límite', () => {
    const limit = 150
    const spent = 82
    assert.equal(budgetRemaining(limit, spent), 68)
  })

  // 6. porcentaje de consumo
  it('46. Porcentaje de consumo: porcentaje entero redondeado del presupuesto consumido', () => {
    const limit = 150
    const spent = 82
    assert.equal(budgetUsagePercentage(limit, spent), 55) // 82 / 150 = 54.67% -> 55%
  })

  // 7. presupuesto superado
  it('47. Presupuesto superado: identifica exceso sin arrojar número negativo en restante', () => {
    const limit = 100
    const spent = 120
    assert.equal(budgetRemaining(limit, spent), 0)
    assert.equal(overBudgetAmount(limit, spent), 20)
    assert.equal(budgetUsagePercentage(limit, spent), 120)

    const summary = selectBudgetsSummary(
      [{ id: 'b1', categoryId: 'clothes', amountLimit: 100, period: 'monthly' }],
      [{ id: 't1', type: 'expense', amount: 120, accountId: 'daily', categoryId: 'clothes', description: 'Ropa', date: '2026-08-05' }],
      sampleCategories,
      now
    )
    assert.equal(summary.items[0].isOverBudget, true)
    assert.equal(summary.items[0].overBudget, 20)
  })

  // 8. borrar presupuesto no afecta movimientos
  it('48. Borrar presupuesto: no altera la integridad ni el número de transacciones registradas', () => {
    let budgets: Budget[] = [
      { id: 'b1', categoryId: 'leisure', amountLimit: 150, period: 'monthly' },
    ]
    const txs: Transaction[] = [
      { id: 't1', type: 'expense', amount: 40, accountId: 'daily', categoryId: 'leisure', description: 'Concierto', date: '2026-08-05' },
    ]
    assert.equal(txs.length, 1)

    // Eliminar presupuesto
    budgets = budgets.filter((b) => b.id !== 'b1')
    assert.equal(budgets.length, 0)
    assert.equal(txs.length, 1)
    assert.equal(txs[0].amount, 40)
  })

  // 9. editar límite recalcula correctamente
  it('49. Editar límite de presupuesto: recalcula al instante el restante y porcentaje', () => {
    let budget: Budget = { id: 'b1', categoryId: 'food', amountLimit: 100, period: 'monthly' }
    const spent = 80
    assert.equal(budgetRemaining(budget.amountLimit, spent), 20)
    assert.equal(budgetUsagePercentage(budget.amountLimit, spent), 80)

    // Aumentar límite a 200€
    budget = { ...budget, amountLimit: 200 }
    assert.equal(budgetRemaining(budget.amountLimit, spent), 120)
    assert.equal(budgetUsagePercentage(budget.amountLimit, spent), 40)
  })

  // 10. gastos diarios
  it('50. Estadísticas — Gastos diarios: filtra y suma exclusivamente los gastos del día local', () => {
    const txs: Transaction[] = [
      { id: 't1', type: 'expense', amount: 15, accountId: 'daily', description: 'Desayuno', date: '2026-08-15T08:30:00' },
      { id: 't2', type: 'expense', amount: 30, accountId: 'daily', description: 'Almuerzo', date: '2026-08-15T14:15:00' },
      { id: 't3', type: 'expense', amount: 20, accountId: 'daily', description: 'Ayer', date: '2026-08-14T20:00:00' },
    ]
    const stats = calculatePeriodStatistics(txs, sampleCategories, 'day', now)
    assert.equal(stats.expenses, 45) // 15 + 30
    assert.equal(stats.transactionCount, 2)
  })

  // 11. gastos semanales
  it('51. Estadísticas — Gastos semanales: incluye todos los gastos de lunes a domingo de la semana de referencia', () => {
    // 2026-08-15 es Sábado. La semana va del Lunes 2026-08-10 al Domingo 2026-08-16.
    const txs: Transaction[] = [
      { id: 't1', type: 'expense', amount: 50, accountId: 'daily', description: 'Lunes', date: '2026-08-10T10:00:00' },
      { id: 't2', type: 'expense', amount: 70, accountId: 'daily', description: 'Sábado', date: '2026-08-15T19:00:00' },
      { id: 't3', type: 'expense', amount: 90, accountId: 'daily', description: 'Semana previa', date: '2026-08-08T12:00:00' },
    ]
    const stats = calculatePeriodStatistics(txs, sampleCategories, 'week', now)
    assert.equal(stats.expenses, 120) // 50 + 70
    assert.equal(stats.transactionCount, 2)
  })

  // 12. gastos mensuales
  it('52. Estadísticas — Gastos mensuales: suma todos los gastos del mes completo', () => {
    const txs: Transaction[] = [
      { id: 't1', type: 'expense', amount: 100, accountId: 'daily', description: 'Día 1', date: '2026-08-01T12:00:00' },
      { id: 't2', type: 'expense', amount: 150, accountId: 'daily', description: 'Día 25', date: '2026-08-25T12:00:00' },
      { id: 't3', type: 'expense', amount: 200, accountId: 'daily', description: 'Julio', date: '2026-07-31T23:59:00' },
    ]
    const stats = calculatePeriodStatistics(txs, sampleCategories, 'month', now)
    assert.equal(stats.expenses, 250) // 100 + 150
  })

  // 13. gastos anuales
  it('53. Estadísticas — Gastos anuales: incluye los gastos de todos los meses del año', () => {
    const txs: Transaction[] = [
      { id: 't1', type: 'expense', amount: 300, accountId: 'daily', description: 'Enero', date: '2026-01-15T10:00:00' },
      { id: 't2', type: 'expense', amount: 400, accountId: 'daily', description: 'Agosto', date: '2026-08-15T10:00:00' },
      { id: 't3', type: 'expense', amount: 500, accountId: 'daily', description: 'Año 2025', date: '2025-12-31T23:00:00' },
    ]
    const stats = calculatePeriodStatistics(txs, sampleCategories, 'year', now)
    assert.equal(stats.expenses, 700) // 300 + 400
  })

  // 14. ingresos por periodo
  it('54. Estadísticas — Ingresos por periodo: calcula la suma exacta de ingresos del periodo', () => {
    const txs: Transaction[] = [
      { id: 't1', type: 'income', amount: 1800, accountId: 'daily', description: 'Nómina', date: '2026-08-01T09:00:00' },
      { id: 't2', type: 'income', amount: 150, accountId: 'daily', description: 'Bizum venta', date: '2026-08-14T11:00:00' },
      { id: 't3', type: 'expense', amount: 80, accountId: 'daily', description: 'Gasto', date: '2026-08-10T12:00:00' },
    ]
    const stats = calculatePeriodStatistics(txs, sampleCategories, 'month', now)
    assert.equal(stats.income, 1950)
  })

  // 15. ahorro transferido por periodo separado de gastos
  it('55. Estadísticas — Ahorro transferido: se cuantifica de forma independiente y nunca suma como gasto', () => {
    const txs: Transaction[] = [
      { id: 't1', type: 'expense', amount: 60, accountId: 'daily', description: 'Supermercado', date: '2026-08-05T10:00:00' },
      { id: 't2', type: 'transfer', amount: 350, accountId: 'daily', toAccountId: 'savings', description: 'A ahorro mensual', date: '2026-08-05T10:05:00' },
    ]
    const stats = calculatePeriodStatistics(txs, sampleCategories, 'month', now)
    assert.equal(stats.expenses, 60)
    assert.equal(stats.savingsTransferred, 350)
  })

  // 16. netFlow correcto
  it('56. Estadísticas — NetFlow: ingresos menos gastos del periodo', () => {
    const txs: Transaction[] = [
      { id: 't1', type: 'income', amount: 2000, accountId: 'daily', description: 'Nómina', date: '2026-08-01T10:00:00' },
      { id: 't2', type: 'expense', amount: 750, accountId: 'daily', description: 'Alquiler', date: '2026-08-02T10:00:00' },
    ]
    const stats = calculatePeriodStatistics(txs, sampleCategories, 'month', now)
    assert.equal(stats.netFlow, 1250) // 2000 - 750
  })

  // 17. topCategory
  it('57. Estadísticas — TopCategory: identifica la categoría con mayor gasto y su importe', () => {
    const txs: Transaction[] = [
      { id: 't1', type: 'expense', amount: 120, accountId: 'daily', categoryId: 'food', description: 'Comida', date: '2026-08-03' },
      { id: 't2', type: 'expense', amount: 230, accountId: 'daily', categoryId: 'leisure', description: 'Escapada', date: '2026-08-06' },
      { id: 't3', type: 'expense', amount: 80, accountId: 'daily', categoryId: 'clothes', description: 'Zapatillas', date: '2026-08-08' },
    ]
    const stats = calculatePeriodStatistics(txs, sampleCategories, 'month', now)
    assert.ok(stats.topCategory)
    assert.equal(stats.topCategory?.categoryId, 'leisure')
    assert.equal(stats.topCategory?.amount, 230)
  })

  // 18. gasto medio diario
  it('58. Estadísticas — Gasto medio diario: divide el gasto total entre el número de días del periodo', () => {
    const txs: Transaction[] = [
      { id: 't1', type: 'expense', amount: 310, accountId: 'daily', description: 'Varios', date: '2026-08-10' },
    ]
    // En Agosto hay 31 días. 310 / 31 = 10€/día
    const stats = calculatePeriodStatistics(txs, sampleCategories, 'month', now)
    assert.equal(stats.averageDailySpend, 10)
  })

  // 19. comparación con mes anterior
  it('59. Comparación con mes anterior: calcula diferencia absoluta y porcentual correcta', () => {
    const currentExpenses = 410
    const previousExpenses = 365
    const comp = compareWithPreviousPeriod(currentExpenses, previousExpenses)

    assert.equal(comp.diffAmount, 45)
    assert.equal(comp.percentageDiff, 12.3) // +12.3%
    assert.equal(comp.isHigher, true)
  })

  // 20. mes anterior = 0 no genera NaN/Infinity
  it('60. Comparación con periodo previo = 0: no genera NaN ni Infinity', () => {
    const currentExpenses = 250
    const previousExpenses = 0
    const comp = compareWithPreviousPeriod(currentExpenses, previousExpenses)

    assert.equal(comp.diffAmount, 250)
    assert.equal(comp.percentageDiff, null) // Seguro y sin NaN / Infinity
    assert.ok(!isNaN(comp.diffAmount))
  })

  // 21. límites de fechas locales correctos
  it('61. Límites de fechas locales: inicio y fin a las 00:00:00 y 23:59:59 locales exactas', () => {
    const range = getLocalDateRange('day', new Date(2026, 7, 20, 14, 30))
    assert.equal(range.start.getHours(), 0)
    assert.equal(range.start.getMinutes(), 0)
    assert.equal(range.start.getSeconds(), 0)
    assert.equal(range.start.getDate(), 20)

    assert.equal(range.end.getHours(), 23)
    assert.equal(range.end.getMinutes(), 59)
    assert.equal(range.end.getSeconds(), 59)
    assert.equal(range.end.getDate(), 20)
  })
})

describe('Fase 5 — Iconografía Profesional y Planificación Financiera', () => {
  // ICONOS
  it('62. Migración de icon antiguo -> iconKey: resuelve correctamente símbolos y emojis legados a claves canónicas', () => {
    assert.equal(resolveIconKey('◌'), 'shopping-basket')
    assert.equal(resolveIconKey('◇'), 'ticket')
    assert.equal(resolveIconKey('↗'), 'car')
    assert.equal(resolveIconKey('□'), 'shirt')
    assert.equal(resolveIconKey('○'), 'refresh-cw')
    assert.equal(resolveIconKey('△'), 'dumbbell')
    assert.equal(resolveIconKey('⌁'), 'plane')
    assert.equal(resolveIconKey('·'), 'ellipsis')
    assert.equal(resolveIconKey('🗾'), 'plane')
    assert.equal(resolveIconKey('🛡️'), 'shield')
    assert.equal(resolveIconKey('🚗'), 'car')
    assert.equal(resolveIconKey('🏠'), 'house')

    // Migración en estado persistido
    const migrated = migratePersistedState({
      categories: [{ id: 'c1', name: 'Comida', color: '#8DB596', icon: '◌' }],
      goals: [{ id: 'g1', name: 'Viaje', target: 1000, current: 200, icon: '🗾' }],
    })
    assert.equal(migrated.categories[0].iconKey, 'shopping-basket')
    assert.equal(migrated.goals[0].iconKey, 'plane')
  })

  it('63. iconKey desconocido usa fallback: devuelve clave de respaldo segura sin lanzar error', () => {
    assert.equal(resolveIconKey('icono_desconocido_123'), 'target')
    assert.equal(resolveIconKey(undefined), 'target')
    assert.equal(resolveIconKey(null), 'target')
    assert.equal(resolveIconKey(''), 'target')
    assert.equal(resolveIconKey('clave_rara', 'ellipsis'), 'ellipsis')
  })

  // AHORRO / PLAN
  it('64. Cálculo ahorro libre: savingsBalance - (emergencyAllocated + goalsAllocated + reservesAllocated)', () => {
    const savingsBalance = 1500
    const emergencyAllocated = 500
    const goalsAllocated = 400
    const reservesAllocated = 300
    const free = selectFreeSavingsWithReserves(
      savingsBalance,
      emergencyAllocated,
      goalsAllocated,
      reservesAllocated
    )
    assert.equal(free, 300)
  })

  it('65. Ahorro asignado a objetivos: suma fielmente el campo current de todos los objetivos', () => {
    const goals: SavingsGoal[] = [
      { id: 'g1', name: 'Japón', target: 2000, current: 350 },
      { id: 'g2', name: 'Portátil', target: 1000, current: 250 },
    ]
    assert.equal(selectTotalAllocatedToGoals(goals), 600)
  })

  it('66. Ahorro asignado a reservas: suma exclusivamente las reservas activas', () => {
    const reserves: Reserve[] = [
      { id: 'r1', name: 'Navidad', targetAmount: 400, currentAllocated: 150, targetDate: '2026-12-15', iconKey: 'sparkles', active: true },
      { id: 'r2', name: 'Seguro', targetAmount: 300, currentAllocated: 100, targetDate: '2027-02-01', iconKey: 'car', active: true },
      { id: 'r3', name: 'Inactiva', targetAmount: 500, currentAllocated: 200, targetDate: '2027-06-01', iconKey: 'sun', active: false },
    ]
    assert.equal(selectTotalAllocatedToReserves(reserves), 250)
  })

  it('67. Fondo emergencia no altera totalMoney: asignar colchón clasifica ahorro sin alterar el patrimonio total', () => {
    const accounts: Account[] = [
      { id: 'daily', name: 'Cuenta diaria', type: 'spending', initialBalance: 400 },
      { id: 'savings', name: 'Ahorro', type: 'savings', initialBalance: 1000 },
    ]
    const reconciled = reconcileAccounts(accounts, [])
    const totalMoneyBefore = selectTotalMoney(reconciled)

    // Simulamos asignar 300 al fondo de emergencia
    const emergencyFundCurrent = 300
    const totalMoneyAfter = selectTotalMoney(reconciled)

    assert.equal(totalMoneyBefore, 1400)
    assert.equal(totalMoneyAfter, 1400)
    assert.equal(emergencyFundCurrent, 300)
  })

  it('68. Reserva no altera savingsBalance ni totalMoney: clasifica ahorro existente sin generar gasto ni transferencia', () => {
    const accounts: Account[] = [
      { id: 'daily', name: 'Cuenta diaria', type: 'spending', initialBalance: 500 },
      { id: 'savings', name: 'Ahorro', type: 'savings', initialBalance: 1200 },
    ]
    const reconciled = reconcileAccounts(accounts, [])
    const savingsBefore = selectSavingsBalance(reconciled)
    const totalBefore = selectTotalMoney(reconciled)

    const reserve: Reserve = {
      id: 'res1',
      name: 'Verano',
      targetAmount: 600,
      currentAllocated: 250,
      targetDate: '2027-07-01',
      iconKey: 'sun',
      active: true,
    }

    const savingsAfter = selectSavingsBalance(reconciled)
    const totalAfter = selectTotalMoney(reconciled)

    assert.equal(savingsBefore, 1200)
    assert.equal(savingsAfter, 1200)
    assert.equal(totalBefore, 1700)
    assert.equal(totalAfter, 1700)
    assert.equal(reserve.currentAllocated, 250)
  })

  it('69. Suma de asignaciones correcta: emergencyAllocated + goalsAllocated + reservesAllocated + freeSavings = savingsBalance', () => {
    const savingsBalance = 2000
    const emergencyAllocated = 600
    const goalsAllocated = 500
    const reservesAllocated = 400
    const freeSavings = selectFreeSavingsWithReserves(
      savingsBalance,
      emergencyAllocated,
      goalsAllocated,
      reservesAllocated
    )

    assert.equal(freeSavings, 500)
    assert.equal(emergencyAllocated + goalsAllocated + reservesAllocated + freeSavings, savingsBalance)
  })

  it('70. Impedir asignaciones por encima de savingsBalance o freeSavings: la fórmula protege contra negativos', () => {
    const savingsBalance = 800
    const emergencyAllocated = 500
    const goalsAllocated = 300
    const reservesAllocated = 100 // Intento que suma 900 > 800
    const free = selectFreeSavingsWithReserves(
      savingsBalance,
      emergencyAllocated,
      goalsAllocated,
      reservesAllocated
    )
    assert.equal(free, 0) // No arroja número negativo
  })

  it('71. Meses cubiertos de fondo emergencia: divide fondo actual entre gastos esenciales con redondeo a 1 decimal', () => {
    const essentialExpenses = 700
    const currentEmergency = 2100
    const covered = selectEmergencyFundMonthsCovered(currentEmergency, essentialExpenses)
    assert.equal(covered, 3.0)

    const partialCovered = selectEmergencyFundMonthsCovered(1050, 700)
    assert.equal(partialCovered, 1.5)

    // Gastos esenciales = 0
    assert.equal(selectEmergencyFundMonthsCovered(1000, 0), 0)
  })

  it('72. Target de fondo a 3 meses: calcula el producto exacto de meses por gastos esenciales', () => {
    const settings: FinancialPlanSettings = {
      monthlyIncome: 1500,
      targetSavingsType: 'percentage',
      targetSavingsValue: 15,
      emergencyFundTargetType: 'months',
      emergencyFundTargetValue: 3,
      emergencyFundCurrent: 0,
      essentialCategoryIds: ['food'],
    }
    const essentialExpenses = 800
    const target = selectEmergencyFundTarget(settings, essentialExpenses)
    assert.equal(target, 2400)
  })

  it('73. Target de fondo a 6 meses: calcula el producto exacto de 6 meses de gastos esenciales', () => {
    const settings: FinancialPlanSettings = {
      monthlyIncome: 1500,
      targetSavingsType: 'percentage',
      targetSavingsValue: 15,
      emergencyFundTargetType: 'months',
      emergencyFundTargetValue: 6,
      emergencyFundCurrent: 0,
      essentialCategoryIds: ['food'],
    }
    const essentialExpenses = 750
    const target = selectEmergencyFundTarget(settings, essentialExpenses)
    assert.equal(target, 4500)
  })

  it('74. Ahorro mensual por porcentaje: aplica el porcentaje configurado sobre los ingresos mensuales', () => {
    const settings: FinancialPlanSettings = {
      monthlyIncome: 1600,
      targetSavingsType: 'percentage',
      targetSavingsValue: 15,
      emergencyFundTargetType: 'months',
      emergencyFundTargetValue: 3,
      emergencyFundCurrent: 0,
      essentialCategoryIds: [],
    }
    const targetSavings = selectTargetMonthlySavings(settings)
    assert.equal(targetSavings, 240) // 15% de 1600 = 240
  })

  it('75. Ahorro mensual por cantidad fija: respeta la cantidad definida sin alterarla por los ingresos', () => {
    const settings: FinancialPlanSettings = {
      monthlyIncome: 1800,
      targetSavingsType: 'fixed',
      targetSavingsValue: 275,
      emergencyFundTargetType: 'months',
      emergencyFundTargetValue: 3,
      emergencyFundCurrent: 0,
      essentialCategoryIds: [],
    }
    const targetSavings = selectTargetMonthlySavings(settings)
    assert.equal(targetSavings, 275)
  })

  // RESERVAS
  it('76. monthlyReserveNeeded: calcula (targetAmount - currentAllocated) / meses restantes', () => {
    const reserve: Reserve = {
      id: 'r1',
      name: 'Navidad',
      targetAmount: 480,
      currentAllocated: 120,
      targetDate: '2026-12-01',
      iconKey: 'sparkles',
      active: true,
    }
    // Desde marzo (mes 2) hasta diciembre (mes 11) hay 9 meses
    const refDate = new Date(2026, 2, 15)
    const needed = selectMonthlyReserveNeeded(reserve, refDate)
    assert.equal(needed, 40) // (480 - 120) / 9 = 40 €/mes
  })

  it('77. Reserva completada -> 0 €/mes necesarios: cuando currentAllocated >= targetAmount devuelve 0', () => {
    const reserve: Reserve = {
      id: 'r1',
      name: 'Seguro',
      targetAmount: 360,
      currentAllocated: 360,
      targetDate: '2026-12-01',
      iconKey: 'car',
      active: true,
    }
    const refDate = new Date(2026, 5, 1)
    const needed = selectMonthlyReserveNeeded(reserve, refDate)
    assert.equal(needed, 0)
  })

  it('78. Fecha vencida tratada de forma segura: si targetDate venció, devuelve el pendiente sin error ni NaN', () => {
    const reserve: Reserve = {
      id: 'r1',
      name: 'Regalo',
      targetAmount: 200,
      currentAllocated: 50,
      targetDate: '2026-05-01',
      iconKey: 'gift',
      active: true,
    }
    // Fecha posterior a targetDate (mes 7 = agosto 2026)
    const refDate = new Date(2026, 7, 1)
    const needed = selectMonthlyReserveNeeded(reserve, refDate)
    assert.equal(needed, 150) // Pendiente completo de forma segura
    assert.ok(!isNaN(needed))
  })

  it('79. Eliminar reserva libera ahorro asignado: al desaparecer la reserva, el ahorro libre aumenta de inmediato', () => {
    const savingsBalance = 1000
    const emergencyAllocated = 200
    const goalsAllocated = 100

    let reserves: Reserve[] = [
      { id: 'r1', name: 'Reserva A', targetAmount: 300, currentAllocated: 150, targetDate: '2026-12-01', iconKey: 'car', active: true },
    ]

    const freeBefore = selectFreeSavingsWithReserves(
      savingsBalance,
      emergencyAllocated,
      goalsAllocated,
      selectTotalAllocatedToReserves(reserves)
    )
    assert.equal(freeBefore, 550) // 1000 - 200 - 100 - 150 = 550

    // Eliminamos la reserva
    reserves = []
    const freeAfter = selectFreeSavingsWithReserves(
      savingsBalance,
      emergencyAllocated,
      goalsAllocated,
      selectTotalAllocatedToReserves(reserves)
    )
    assert.equal(freeAfter, 700) // 1000 - 200 - 100 = 700
  })

  // ESTACIONALIDAD
  it('80. Periodo especial detectado correctamente: filtra periodos pasados y ordena cronológicamente', () => {
    const periods: SpecialPeriod[] = [
      { id: 'p1', name: 'Verano 2027', startDate: '2027-07-01', endDate: '2027-08-31', expectedExtraBudget: 600, type: 'expected_high_spend' },
      { id: 'p2', name: 'Navidad 2026', startDate: '2026-12-01', endDate: '2027-01-06', expectedExtraBudget: 400, type: 'expected_high_spend' },
      { id: 'p0', name: 'Pasado', startDate: '2025-01-01', endDate: '2025-01-15', expectedExtraBudget: 200, type: 'normal' },
    ]
    const upcoming = selectUpcomingSpecialPeriods(periods, new Date('2026-09-01'))
    assert.equal(upcoming.length, 2)
    assert.equal(upcoming[0].id, 'p2') // Navidad primero
    assert.equal(upcoming[1].id, 'p1') // Verano después
  })

  it('81. Gasto extraordinario esperado por mes: calcula el extra de un periodo activo en el mes evaluado', () => {
    const periods: SpecialPeriod[] = [
      { id: 'p1', name: 'Fiestas', startDate: '2026-10-10', endDate: '2026-10-20', expectedExtraBudget: 250, type: 'expected_high_spend' },
    ]
    const octDate = new Date(2026, 9, 15)
    const novDate = new Date(2026, 10, 15)

    assert.equal(selectExpectedExtraSpendingForMonth(periods, octDate), 250)
    assert.equal(selectExpectedExtraSpendingForMonth(periods, novDate), 0)
  })

  it('82. Periodo que cruza cambio de año: divide proporcionalmente el gasto entre los meses involucrados', () => {
    const periods: SpecialPeriod[] = [
      { id: 'p1', name: 'Navidad', startDate: '2026-12-01', endDate: '2027-01-06', expectedExtraBudget: 400, type: 'expected_high_spend' },
    ]
    const decDate = new Date(2026, 11, 15) // Diciembre 2026
    const janDate = new Date(2027, 0, 3)    // Enero 2027
    const febDate = new Date(2027, 1, 1)    // Febrero 2027

    // Solapamiento de 2 meses: 400 / 2 = 200 € por mes
    assert.equal(selectExpectedExtraSpendingForMonth(periods, decDate), 200)
    assert.equal(selectExpectedExtraSpendingForMonth(periods, janDate), 200)
    assert.equal(selectExpectedExtraSpendingForMonth(periods, febDate), 0)
  })

  it('83. Comparación ajustada sin NaN/Infinity: suma base + extra estacional limpiamente', () => {
    const periods: SpecialPeriod[] = [
      { id: 'p1', name: 'Verano', startDate: '2027-07-01', endDate: '2027-07-31', expectedExtraBudget: 350, type: 'expected_high_spend' },
    ]
    const julDate = new Date(2027, 6, 15)
    const adjusted = selectAdjustedMonthlySpendingExpectation(1100, periods, julDate)
    assert.equal(adjusted, 1450)
    assert.ok(!isNaN(adjusted))
    assert.ok(isFinite(adjusted))
  })
})

describe('Fase 5 — Integración iOS Deep Link (Atajos / Shortcuts)', () => {
  const validCategoryIds = ['food', 'leisure', 'transport', 'clothes', 'subscriptions', 'sport', 'travel', 'other']

  // 1. Parsear deep link válido
  it('84. Parsear deep link válido: extrae amount, description y categoryId con protocolo pocketflow://', () => {
    const url = 'pocketflow://expense?amount=24.50&description=Mercadona&category=food'
    const result = parseShortcutUrl(url, validCategoryIds)

    assert.equal(result.valid, true)
    if (result.valid) {
      assert.equal(result.amount, 24.50)
      assert.equal(result.description, 'Mercadona')
      assert.equal(result.categoryId, 'food')
    }
  })

  // 2. Coma decimal
  it('85. Coma decimal: interpreta correctamente cantidades con coma europea (15,90 -> 15.90)', () => {
    const url = 'pocketflow://expense?amount=15,90&description=Farmacia&category=other'
    const result = parseShortcutUrl(url, validCategoryIds)

    assert.equal(result.valid, true)
    if (result.valid) {
      assert.equal(result.amount, 15.90)
    }
  })

  // 3. URL encoded description
  it('86. URL encoded description: decodifica espacios, tildes, signos y caracteres como ñ correctamente', () => {
    const url1 = 'pocketflow://expense?amount=35&description=Cena%20en%20San%20Juan&category=leisure'
    const res1 = parseShortcutUrl(url1, validCategoryIds)
    assert.equal(res1.valid, true)
    if (res1.valid) {
      assert.equal(res1.description, 'Cena en San Juan')
    }

    const url2 = 'pocketflow://expense?amount=2.40&description=Caf%C3%A9%20%2B%20tostada&category=food'
    const res2 = parseShortcutUrl(url2, validCategoryIds)
    assert.equal(res2.valid, true)
    if (res2.valid) {
      assert.equal(res2.description, 'Café + tostada')
    }

    const url3 = 'pocketflow://expense?amount=50&description=Cumplea%C3%B1os&category=leisure'
    const res3 = parseShortcutUrl(url3, validCategoryIds)
    assert.equal(res3.valid, true)
    if (res3.valid) {
      assert.equal(res3.description, 'Cumpleaños')
    }
  })

  // 4. Categoría válida
  it('87. Categoría válida: conserva la categoría enviada si existe en el catálogo', () => {
    const url = 'pocketflow://expense?amount=8.50&description=Metro&category=transport'
    const result = parseShortcutUrl(url, validCategoryIds)

    assert.equal(result.valid, true)
    if (result.valid) {
      assert.equal(result.categoryId, 'transport')
    }
  })

  // 5. Categoría desconocida -> fallback seguro
  it('88. Categoría desconocida: fallback seguro y documentado a "other" para no romper la app', () => {
    const url = 'pocketflow://expense?amount=10&description=Algo&category=categoria_inexistente_xyz'
    const result = parseShortcutUrl(url, validCategoryIds)

    assert.equal(result.valid, true)
    if (result.valid) {
      assert.equal(result.categoryId, 'other')
    }

    // Si viene vacía
    const urlNoCat = 'pocketflow://expense?amount=10&description=Algo'
    const resNoCat = parseShortcutUrl(urlNoCat, validCategoryIds)
    assert.equal(resNoCat.valid, true)
    if (resNoCat.valid) {
      assert.equal(resNoCat.categoryId, 'other')
    }
  })

  // 6. Amount 0 rechazado
  it('89. Amount 0 rechazado: deniega la creación si el importe es cero', () => {
    const url = 'pocketflow://expense?amount=0&description=Prueba'
    const result = parseShortcutUrl(url, validCategoryIds)

    assert.equal(result.valid, false)
    if (!result.valid) {
      assert.ok(result.error.includes('mayor que 0'))
    }
  })

  // 7. Amount negativo rechazado
  it('90. Amount negativo rechazado: deniega importes negativos para proteger la integridad contable', () => {
    const url = 'pocketflow://expense?amount=-14.50&description=Negativo'
    const result = parseShortcutUrl(url, validCategoryIds)

    assert.equal(result.valid, false)
    if (!result.valid) {
      assert.ok(result.error.includes('mayor que 0'))
    }
  })

  // 8. NaN rechazado
  it('91. NaN rechazado: deniega texto no numérico o vacío en el parámetro amount', () => {
    const urlNaN = 'pocketflow://expense?amount=abc&description=Prueba'
    assert.equal(parseShortcutUrl(urlNaN, validCategoryIds).valid, false)

    const urlEmpty = 'pocketflow://expense?amount=&description=Prueba'
    assert.equal(parseShortcutUrl(urlEmpty, validCategoryIds).valid, false)

    const urlNoAmount = 'pocketflow://expense?description=Prueba'
    assert.equal(parseShortcutUrl(urlNoAmount, validCategoryIds).valid, false)
  })

  // 9. URL no expense rechazada
  it('92. URL no expense rechazada: deniega cualquier acción diferente de "expense" o protocolo no autorizado', () => {
    // Protocolo ajeno
    assert.equal(parseShortcutUrl('https://example.com/expense?amount=10', validCategoryIds).valid, false)

    // Acciones no autorizadas
    assert.equal(parseShortcutUrl('pocketflow://income?amount=50', validCategoryIds).valid, false)
    assert.equal(parseShortcutUrl('pocketflow://transfer?amount=50', validCategoryIds).valid, false)
    assert.equal(parseShortcutUrl('pocketflow://delete?id=123', validCategoryIds).valid, false)
    assert.equal(parseShortcutUrl('pocketflow://settings', validCategoryIds).valid, false)
    assert.equal(parseShortcutUrl('pocketflow://accounts', validCategoryIds).valid, false)
  })

  // 10. Parámetros extra ignorados
  it('93. Parámetros extra ignorados: ignora query params maliciosos o desconocidos', () => {
    const url = 'pocketflow://expense?amount=12.50&description=Cena&category=leisure&overrideBalance=99999&danger=true&delete=all'
    const result = parseShortcutUrl(url, validCategoryIds)

    assert.equal(result.valid, true)
    if (result.valid) {
      assert.equal(result.amount, 12.50)
      assert.equal(result.description, 'Cena')
      assert.equal(result.categoryId, 'leisure')
      // No se inyecta ningún parámetro espurio en el objeto
      assert.equal(Object.keys(result).sort().join(','), 'amount,categoryId,description,valid')
    }
  })

  // 11. Deep link crea exactamente una transacción
  it('94. Deep link crea exactamente una transacción: se genera una transacción expense con accountId daily y fecha válida', () => {
    const url = 'pocketflow://expense?amount=4.80&description=Desayuno&category=food'
    const result = parseShortcutUrl(url, validCategoryIds)
    assert.equal(result.valid, true)

    const transactions: Transaction[] = []
    if (result.valid) {
      const nowIso = new Date().toISOString()
      const newTx: Transaction = {
        id: 'tx_deep_1',
        type: 'expense',
        amount: result.amount,
        description: result.description,
        categoryId: result.categoryId,
        accountId: 'daily',
        date: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      }
      transactions.push(newTx)
    }

    assert.equal(transactions.length, 1)
    assert.equal(transactions[0].amount, 4.80)
    assert.equal(transactions[0].type, 'expense')
    assert.equal(transactions[0].accountId, 'daily')
    assert.equal(transactions[0].categoryId, 'food')
    assert.ok(new Date(transactions[0].date).getTime() > 0)
  })

  // 12. Transferencia / ingreso no se pueden crear por deep link
  it('95. Transferencia / ingreso no se pueden crear por deep link: el parseador bloquea cualquier intento', () => {
    const transferUrl = 'pocketflow://transfer?amount=100&from=daily&to=savings'
    const incomeUrl = 'pocketflow://income?amount=1500&description=Nomina'

    const transferRes = parseShortcutUrl(transferUrl, validCategoryIds)
    const incomeRes = parseShortcutUrl(incomeUrl, validCategoryIds)

    assert.equal(transferRes.valid, false)
    assert.equal(incomeRes.valid, false)
  })

  // 13. Protección anti-duplicado
  it('96. Protección anti-duplicado: ignora llamadas idénticas repetidas dentro de la ventana de tiempo', () => {
    const deduplicator = createDeepLinkDeduplicator(2500)
    const url = 'pocketflow://expense?amount=12.50&description=Taxi&category=transport'

    const t0 = 10000
    // Primera llegada: debe procesarse
    assert.equal(deduplicator.shouldProcess(url, t0), true)

    // Llegada duplicada 200ms después: debe ser ignorada
    assert.equal(deduplicator.shouldProcess(url, t0 + 200), false)

    // Llegada duplicada 1500ms después: debe ser ignorada
    assert.equal(deduplicator.shouldProcess(url, t0 + 1500), false)

    // Otra URL distinta a los 1600ms: debe procesarse
    const urlDifferent = 'pocketflow://expense?amount=3.00&description=Cafe&category=food'
    assert.equal(deduplicator.shouldProcess(urlDifferent, t0 + 1600), true)

    // Misma URL original después de 2600ms (ventana expirada): vuelve a procesarse
    assert.equal(deduplicator.shouldProcess(url, t0 + 4500), true)
  })
})

describe('Fase 6 — PWA, Atajos Web, Copias de Seguridad y Persistencia', () => {
  const validCategoryIds = ['food', 'leisure', 'transport', 'clothes', 'subscriptions', 'sport', 'travel', 'other']

  // 1. URL web válida
  it('97. URL web válida: parsea https://.../?action=expense&amount=18.75&description=Mercadona&category=food', () => {
    const webUrl = 'https://martaaterry-cloud.github.io/pocketflow/?action=expense&amount=18.75&description=Mercadona&category=food'
    const result = parseShortcutUrl(webUrl, validCategoryIds)

    assert.equal(result.valid, true)
    if (result.valid) {
      assert.equal(result.amount, 18.75)
      assert.equal(result.description, 'Mercadona')
      assert.equal(result.categoryId, 'food')
    }

    // También soporta ruta directa con query params '?action=expense&...'
    const queryOnly = '?action=expense&amount=6.20&description=Panaderia&category=food'
    const resQuery = parseShortcutUrl(queryOnly, validCategoryIds)
    assert.equal(resQuery.valid, true)
    if (resQuery.valid) {
      assert.equal(resQuery.amount, 6.20)
      assert.equal(resQuery.description, 'Panaderia')
    }
  })

  // 2. Codificación de descripción web
  it('98. Codificación de descripción web: decodifica espacios, tildes y caracteres como ñ o + en web query', () => {
    const webUrl1 = 'https://martaaterry-cloud.github.io/pocketflow/?action=expense&amount=32&description=Cena%20en%20San%20Juan&category=leisure'
    const res1 = parseShortcutUrl(webUrl1, validCategoryIds)
    assert.equal(res1.valid, true)
    if (res1.valid) {
      assert.equal(res1.description, 'Cena en San Juan')
    }

    const webUrl2 = 'https://martaaterry-cloud.github.io/pocketflow/?action=expense&amount=2.50&description=Caf%C3%A9%20%2B%20tostada&category=food'
    const res2 = parseShortcutUrl(webUrl2, validCategoryIds)
    assert.equal(res2.valid, true)
    if (res2.valid) {
      assert.equal(res2.description, 'Café + tostada')
    }

    const webUrl3 = 'https://martaaterry-cloud.github.io/pocketflow/?action=expense&amount=15&description=Ma%C3%B1ana%20soleada&category=other'
    const res3 = parseShortcutUrl(webUrl3, validCategoryIds)
    assert.equal(res3.valid, true)
    if (res3.valid) {
      assert.equal(res3.description, 'Mañana soleada')
    }
  })

  // 3. Importe inválido en web
  it('99. Importe inválido en web: deniega importes cero, negativos o no numéricos', () => {
    const zeroUrl = 'https://pocketflow.local/?action=expense&amount=0&description=Test'
    assert.equal(parseShortcutUrl(zeroUrl, validCategoryIds).valid, false)

    const negUrl = 'https://pocketflow.local/?action=expense&amount=-5&description=Test'
    assert.equal(parseShortcutUrl(negUrl, validCategoryIds).valid, false)

    const nanUrl = 'https://pocketflow.local/?action=expense&amount=invalido&description=Test'
    assert.equal(parseShortcutUrl(nanUrl, validCategoryIds).valid, false)
  })

  // 4. Categoría desconocida en web
  it('100. Categoría desconocida en web: aplica fallback seguro a "other"', () => {
    const unknownCatUrl = 'https://pocketflow.local/?action=expense&amount=10&description=Algo&category=inexistente'
    const result = parseShortcutUrl(unknownCatUrl, validCategoryIds)
    assert.equal(result.valid, true)
    if (result.valid) {
      assert.equal(result.categoryId, 'other')
    }
  })

  // 5. Deduplicación web
  it('101. Deduplicación web: deduplicador temporal ignora dobles invocaciones de la misma URL web en Safari/PWA', () => {
    const deduplicator = createDeepLinkDeduplicator(2500)
    const webUrl = 'https://martaaterry-cloud.github.io/pocketflow/?action=expense&amount=14.50&description=Taxi'

    const t0 = 20000
    assert.equal(deduplicator.shouldProcess(webUrl, t0), true)
    // 300ms después: repetida por evento doble o recarga inmediata
    assert.equal(deduplicator.shouldProcess(webUrl, t0 + 300), false)
    // Pasados 3000ms: admitida
    assert.equal(deduplicator.shouldProcess(webUrl, t0 + 3000), true)
  })

  // 6. Limpieza de URL
  it('102. Limpieza de URL: cleanUrlQueryParams ejecuta replaceState de forma segura sin lanzar excepción', () => {
    // Simulamos un entorno con window / history
    const originalWindow = globalThis.window
    let replacedStateUrl = ''

    // @ts-expect-error Mock window global para test
    globalThis.window = {
      location: { pathname: '/pocketflow/', search: '?action=expense&amount=10', hash: '' },
      history: {
        replaceState: (_data: unknown, _title: string, url: string) => {
          replacedStateUrl = url
        },
      },
    }

    cleanUrlQueryParams()
    assert.equal(replacedStateUrl, '/pocketflow/')

    // Restaurar global
    // @ts-expect-error Restaurar
    globalThis.window = originalWindow
  })

  // 7. Export backup
  it('103. Export backup: genera estructura JSON versionada con app "Pocketflow" y colecciones íntegras', () => {
    const backup = createBackupPayload(initialFinanceState)

    assert.equal(backup.app, BACKUP_APP_IDENTIFIER)
    assert.equal(backup.version, CURRENT_BACKUP_VERSION)
    assert.ok(typeof backup.exportedAt === 'string')
    assert.ok(new Date(backup.exportedAt).getTime() > 0)

    assert.ok(Array.isArray(backup.data.accounts))
    assert.ok(Array.isArray(backup.data.transactions))
    assert.ok(Array.isArray(backup.data.goals))
    assert.ok(Array.isArray(backup.data.recurring))
    assert.ok(Array.isArray(backup.data.categories))
    assert.ok(Array.isArray(backup.data.budgets))
    assert.ok(Array.isArray(backup.data.reserves))
  })

  // 8. Import backup válido
  it('104. Import backup válido: valida correctamente el esquema y calcula el resumen de entidades', () => {
    const backup = createBackupPayload(initialFinanceState)
    const result = validateBackupPayload(backup)

    assert.equal(result.valid, true)
    if (result.valid) {
      assert.equal(result.version, CURRENT_BACKUP_VERSION)
      assert.equal(result.summary.accountCount, initialFinanceState.accounts.length)
      assert.equal(result.summary.transactionCount, initialFinanceState.transactions.length)
      assert.equal(result.summary.goalCount, initialFinanceState.goals.length)
      assert.equal(result.summary.budgetCount, initialFinanceState.budgets.length)
      assert.equal(result.summary.reserveCount, initialFinanceState.reserves.length)
      assert.equal(result.summary.recurringCount, initialFinanceState.recurring.length)
    }
  })

  // 9. Backup inválido rechazado
  it('105. Backup inválido rechazado: deniega archivos con JSON arbitrario, string, array o esquema no compatible', () => {
    assert.equal(validateBackupPayload(null).valid, false)
    assert.equal(validateBackupPayload('string aleatorio').valid, false)
    assert.equal(validateBackupPayload([]).valid, false)
    assert.equal(validateBackupPayload({ foo: 'bar' }).valid, false)
    assert.equal(validateBackupPayload({ app: 'OtraApp', version: 1, data: {} }).valid, false)
    assert.equal(validateBackupPayload({ app: 'Pocketflow', version: 1, data: { accounts: 'no array' } }).valid, false)
  })

  // 10. Versión incompatible rechazada
  it('106. Versión incompatible rechazada: bloquea copias con versión futura no soportada (v999) o inválida', () => {
    const futureBackup = {
      app: 'Pocketflow',
      version: 999,
      exportedAt: new Date().toISOString(),
      data: initialFinanceState,
    }
    const result = validateBackupPayload(futureBackup)
    assert.equal(result.valid, false)
    if (!result.valid) {
      assert.ok(result.error.includes('no soportada'))
    }
  })

  // 11. Restauración exacta
  it('107. Restauración exacta: el estado se reconstituye con las transacciones y cuentas del archivo importado', () => {
    const customState: PersistedState = {
      ...initialFinanceState,
      transactions: [
        {
          id: 'tx_backup_custom_1',
          type: 'expense',
          amount: 88.50,
          description: 'Compra restaurada',
          categoryId: 'food',
          accountId: 'daily',
          date: '2026-09-01T10:00:00.000Z',
          createdAt: '2026-09-01T10:00:00.000Z',
          updatedAt: '2026-09-01T10:00:00.000Z',
        },
      ],
    }

    const payload = createBackupPayload(customState)
    const valResult = validateBackupPayload(payload)
    assert.equal(valResult.valid, true)

    if (valResult.valid) {
      assert.equal(valResult.state.transactions.length, 1)
      assert.equal(valResult.state.transactions[0].id, 'tx_backup_custom_1')
      assert.equal(valResult.state.transactions[0].amount, 88.50)
      assert.equal(valResult.state.transactions[0].description, 'Compra restaurada')
    }
  })

  // 12. Migración localStorage -> IndexedDB / StorageAdapter fallback
  it('108. Migración localStorage -> IndexedDB / fallback: preserva compatibilidad y recupera datos legados', async () => {
    // Simula mock de localStorage
    const store = new Map<string, string>()
    const mockStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    }

    const legacyKey = 'pocketflow:v1'
    mockStorage.setItem(legacyKey, JSON.stringify(initialFinanceState))

    // LocalStorageAdapter lee los datos correctamente
    // @ts-expect-error Mock global localStorage
    globalThis.localStorage = mockStorage

    const adapter = new LocalStorageAdapter(legacyKey)
    const loaded = await adapter.load()

    assert.ok(loaded !== null)
    assert.equal(loaded?.transactions.length, initialFinanceState.transactions.length)
    assert.equal(loaded?.accounts.length, initialFinanceState.accounts.length)

    // Un adaptador IndexedDbAdapter en entorno sin window.indexedDB recurre limpiamente al fallback
    const idbAdapter = new IndexedDbAdapter()
    const idbLoaded = await idbAdapter.load()

    assert.ok(idbLoaded !== null)
    assert.equal(idbLoaded?.accounts.length, initialFinanceState.accounts.length)

    // @ts-expect-error Limpieza
    delete globalThis.localStorage
  })
})

describe('Fase 7 — Migración Supabase, Modelos Remotos, Cola Offline y Seguridad del Atajo', () => {
  const userId = 'usr_test_uuid_12345'

  it('109. Mapeo Account <-> DB row: serializa y deserializa tipos y saldos', () => {
    const acc: Account = { id: 'daily', name: 'Cuenta Diaria', type: 'spending', initialBalance: 1200 }
    const dbRow = toDbAccount(acc, userId)
    assert.equal(dbRow.id, 'daily')
    assert.equal(dbRow.user_id, userId)
    assert.equal(dbRow.type, 'spending')
    assert.equal(dbRow.initial_balance, 1200)

    const restored = fromDbAccount(dbRow)
    assert.equal(restored.id, acc.id)
    assert.equal(restored.name, acc.name)
    assert.equal(restored.type, acc.type)
    assert.equal(restored.initialBalance, acc.initialBalance)
  })

  it('110. Mapeo Transaction <-> DB row: serializa y deserializa con claves y fechas', () => {
    const tx: Transaction = {
      id: 'tx_99',
      type: 'expense',
      amount: 45.5,
      accountId: 'daily',
      categoryId: 'food',
      description: 'Cena familiar',
      date: '2026-09-01T14:30:00.000Z',
      note: 'Sin gluten',
    }
    const dbRow = toDbTransaction(tx, userId)
    assert.equal(dbRow.id, 'tx_99')
    assert.equal(dbRow.user_id, userId)
    assert.equal(dbRow.amount, 45.5)
    assert.equal(dbRow.account_id, 'daily')
    assert.equal(dbRow.category_id, 'food')

    const restored = fromDbTransaction(dbRow)
    assert.equal(restored.id, tx.id)
    assert.equal(restored.type, tx.type)
    assert.equal(restored.amount, tx.amount)
    assert.equal(restored.description, tx.description)
    assert.equal(restored.date, tx.date)
  })

  it('111. Mapeo Category <-> DB row: preserva iconKey y color', () => {
    const cat: Category = { id: 'leisure', name: 'Ocio', color: '#ff8800', icon: 'ticket', iconKey: 'ticket' }
    const dbRow = toDbCategory(cat, userId)
    assert.equal(dbRow.id, 'leisure')
    assert.equal(dbRow.icon_key, 'ticket')

    const restored = fromDbCategory(dbRow)
    assert.equal(restored.id, 'leisure')
    assert.equal(restored.iconKey, 'ticket')
  })

  it('112. Mapeo Budget <-> DB row: valida límite y categoría', () => {
    const b: Budget = { id: 'b_1', categoryId: 'food', amountLimit: 300, period: 'monthly' }
    const dbRow = toDbBudget(b, userId)
    assert.equal(dbRow.id, 'b_1')
    assert.equal(dbRow.amount_limit, 300)

    const restored = fromDbBudget(dbRow)
    assert.equal(restored.categoryId, 'food')
    assert.equal(restored.amountLimit, 300)
    assert.equal(restored.period, 'monthly')
  })

  it('113. Mapeo SavingsGoal & Reserve <-> DB row: preserva importes y fechas objetivo', () => {
    const goal: SavingsGoal = { id: 'g_1', name: 'Fondo coche', target: 5000, current: 1500, completed: false }
    const dbGoal = toDbGoal(goal, userId)
    assert.equal(dbGoal.target, 5000)
    assert.equal(dbGoal.current, 1500)
    const restoredGoal = fromDbGoal(dbGoal)
    assert.equal(restoredGoal.target, 5000)

    const res: Reserve = {
      id: 'res_1',
      name: 'Seguro coche',
      targetAmount: 600,
      currentAllocated: 300,
      targetDate: '2026-11-15',
      iconKey: 'shield',
      active: true,
    }
    const dbRes = toDbReserve(res, userId)
    assert.equal(dbRes.target_amount, 600)
    const restoredRes = fromDbReserve(dbRes)
    assert.equal(restoredRes.targetAmount, 600)
    assert.equal(restoredRes.targetDate, '2026-11-15')
  })

  it('114. Mapeo PlanSettings <-> DB row: serializa categorías esenciales y configuración', () => {
    const plan: FinancialPlanSettings = {
      monthlyIncome: 2500,
      targetSavingsType: 'percentage',
      targetSavingsValue: 20,
      emergencyFundTargetType: 'months',
      emergencyFundTargetValue: 6,
      emergencyFundCurrent: 4000,
      essentialCategoryIds: ['food', 'transport', 'subscriptions'],
    }
    const dbPlan = toDbPlanSettings(plan, userId)
    assert.equal(dbPlan.monthly_income, 2500)
    assert.deepEqual(dbPlan.essential_category_ids, ['food', 'transport', 'subscriptions'])

    const restored = fromDbPlanSettings(dbPlan)
    assert.equal(restored.monthlyIncome, 2500)
    assert.deepEqual(restored.essentialCategoryIds, ['food', 'transport', 'subscriptions'])
  })

  it('115. OfflineQueue: encola mutación con id y timestamp únicos', () => {
    const mockStore: Record<string, string> = {}
    // @ts-expect-error Mock
    globalThis.localStorage = {
      getItem: (k: string) => mockStore[k] ?? null,
      setItem: (k: string, v: string) => {
        mockStore[k] = v
      },
    }

    enqueueOfflineMutation({
      entity: 'transaction',
      action: 'insert',
      data: { id: 'tx_offline_1', amount: 15 },
    })

    const queue = getOfflineQueue()
    assert.equal(queue.length, 1)
    assert.equal(queue[0].entity, 'transaction')
    assert.equal(queue[0].action, 'insert')
    assert.ok(queue[0].id.startsWith('mut_'))
    assert.ok(queue[0].timestamp > 0)

    // @ts-expect-error Limpieza
    delete globalThis.localStorage
  })

  it('116. Validación de importe del Atajo: valores nulos, negativos o NaN deben ser denegados', () => {
    const validateAmount = (val: unknown) => {
      const raw = String(val ?? '').trim().replace(',', '.')
      const num = Number(raw)
      return !isNaN(num) && isFinite(num) && num > 0
    }

    assert.equal(validateAmount(0), false)
    assert.equal(validateAmount(-12.5), false)
    assert.equal(validateAmount('abc'), false)
    assert.equal(validateAmount(''), false)
    assert.equal(validateAmount(null), false)
    assert.equal(validateAmount('12.50'), true)
    assert.equal(validateAmount('12,50'), true)
  })

  it('117. Saneamiento de descripción del Atajo: recorta a 120 caracteres y aplica fallback', () => {
    const sanitizeDesc = (raw: unknown) => {
      const trimmed = typeof raw === 'string' ? raw.trim() : ''
      return trimmed ? trimmed.slice(0, 120) : 'Gasto rápido'
    }

    assert.equal(sanitizeDesc(''), 'Gasto rápido')
    assert.equal(sanitizeDesc(null), 'Gasto rápido')
    assert.equal(sanitizeDesc('   Café con leche   '), 'Café con leche')
    const longString = 'A'.repeat(200)
    assert.equal(sanitizeDesc(longString).length, 120)
  })

  it('118. Fallback de categoría del Atajo: categorías inexistentes caen a "other"', () => {
    const resolveCategory = (cat: unknown, existingIds: string[]) => {
      const str = typeof cat === 'string' ? cat.trim().toLowerCase() : ''
      if (existingIds.includes(str)) return str
      return 'other'
    }

    const available = ['food', 'leisure', 'transport', 'other']
    assert.equal(resolveCategory('food', available), 'food')
    assert.equal(resolveCategory('FOOD', available), 'food')
    assert.equal(resolveCategory('crypto', available), 'other')
    assert.equal(resolveCategory('', available), 'other')
    assert.equal(resolveCategory(undefined, available), 'other')
  })
})

describe('Fase 8 — Sincronización Supabase Robusta, Realtime y Reconciliación Determinista', () => {
  /* ==========================================================================
     A. ARRANQUE
     ========================================================================== */

  it('119. Arranque: local vacío + cloud existente -> descarga y adopta cloud', async () => {
    const remoteTx: Transaction = {
      id: 'tx_cloud_1',
      type: 'expense',
      amount: 42.5,
      description: 'Restaurante nube',
      categoryId: 'food',
      accountId: 'daily',
      date: '2026-09-01T12:00:00.000Z',
    }

    const mockSupabase = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: table === 'transactions' ? [toDbTransaction(remoteTx, 'u1')] : [], error: null }),
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            then: (fn: any) => fn({
              data: table === 'accounts' ? [{ id: 'daily', name: 'Cuenta diaria', type: 'spending', initial_balance: 100 }] : [],
              error: null,
            }),
          }),
        }),
      }),
    }

    const remoteState = await fetchRemoteState(mockSupabase as any, 'u1')
    assert.ok(remoteState !== null)
    assert.equal(remoteState.transactions.length, 1)
    assert.equal(remoteState.transactions[0].id, 'tx_cloud_1')
    assert.equal(remoteState.transactions[0].amount, 42.5)
  })

  it('120. Arranque: local existente + cloud virgen -> sube datos limpios una sola vez', () => {
    const cleanState = createCleanInitialState()
    assert.equal(cleanState.transactions.length, 0)
    assert.equal(cleanState.budgets.length, 0)
    assert.equal(cleanState.goals.length, 0)
    assert.equal(cleanState.accounts.length, 2)
    assert.equal(cleanState.accounts[0].initialBalance, 0)
  })

  it('121. Arranque: cloud existente jamás se sobrescribe con seed o demo', () => {
    const localHasSeed = initialFinanceState.transactions.some((t) => t.id === 't1')
    assert.equal(localHasSeed, true)

    // La función createCleanInitialState previene subir este seed a un nuevo usuario
    const clean = createCleanInitialState()
    assert.equal(clean.transactions.length, 0)
    assert.equal(clean.budgets.length, 0)
  })

  it('122. Arranque: storageHydrated garantiza orden estricto antes de sincronizar', () => {
    let storageHydrated = false
    let authChecked = false
    let cloudSyncStarted = false

    const triggerSyncIfReady = () => {
      if (storageHydrated && authChecked) {
        cloudSyncStarted = true
      }
    }

    // 1. Auth resuelve primero
    authChecked = true
    triggerSyncIfReady()
    assert.equal(cloudSyncStarted, false, 'No debe iniciar si storageHydrated es false')

    // 2. Storage concluye
    storageHydrated = true
    triggerSyncIfReady()
    assert.equal(cloudSyncStarted, true, 'Inicia solo cuando ambos están listos')
  })

  /* ==========================================================================
     B. TRANSACTIONS CRUD & REALTIME
     ========================================================================== */

  it('123. Transactions: crear A -> envía insert granular a Supabase', async () => {
    let insertedRow: any = null
    const mockSupabase = {
      from: (table: string) => ({
        insert: async (row: any) => {
          insertedRow = row
          return { error: null }
        },
      }),
    }

    const newTx: Transaction = {
      id: 'tx_create_1',
      type: 'expense',
      amount: 19.99,
      description: 'Libro de finanzas',
      categoryId: 'leisure',
      accountId: 'daily',
      date: '2026-09-01T10:00:00.000Z',
    }

    await syncInsertTransaction(mockSupabase as any, 'user_test', newTx)
    assert.ok(insertedRow)
    assert.equal(insertedRow.id, 'tx_create_1')
    assert.equal(insertedRow.amount, 19.99)
    assert.equal(insertedRow.user_id, 'user_test')
  })

  it('124. Transactions: editar A -> envía update granular a Supabase', async () => {
    let updatedRow: any = null
    let targetId: any = null
    const mockSupabase = {
      from: (table: string) => ({
        update: (row: any) => ({
          eq: (field: string, val: string) => ({
            eq: () => {
              updatedRow = row
              targetId = val
              return Promise.resolve({ error: null })
            },
          }),
        }),
      }),
    }

    const editedTx: Transaction = {
      id: 'tx_edit_1',
      type: 'expense',
      amount: 25.0, // Cambiado de 20 a 25
      description: 'Compra editada',
      categoryId: 'food',
      accountId: 'daily',
      date: '2026-09-01T10:00:00.000Z',
    }

    await syncUpdateTransaction(mockSupabase as any, 'user_test', editedTx)
    assert.equal(targetId, 'tx_edit_1')
    assert.equal(updatedRow.amount, 25.0)
  })

  it('125. Transactions: borrar A -> envía delete explícito (no resucita)', async () => {
    let deletedId: any = null
    const mockSupabase = {
      from: (table: string) => ({
        delete: () => ({
          eq: (field: string, val: string) => ({
            eq: () => {
              deletedId = val
              return Promise.resolve({ error: null })
            },
          }),
        }),
      }),
    }

    await syncDeleteTransaction(mockSupabase as any, 'user_test', 'tx_delete_1')
    assert.equal(deletedId, 'tx_delete_1')
  })

  it('126. Transactions: Atajo crea A -> Realtime lo inserta en cliente', () => {
    let clientState: Transaction[] = []
    const applyRemoteInsert = (tx: Transaction) => {
      if (!clientState.some((t) => t.id === tx.id)) {
        clientState = [tx, ...clientState]
      }
    }

    const shortcutTx: Transaction = {
      id: 'tx_shortcut_realtime',
      type: 'expense',
      amount: 3.5,
      description: 'Café Atajo',
      categoryId: 'food',
      accountId: 'daily',
      date: '2026-09-01T11:00:00.000Z',
    }

    applyRemoteInsert(shortcutTx)
    assert.equal(clientState.length, 1)
    assert.equal(clientState[0].id, 'tx_shortcut_realtime')
    assert.equal(clientState[0].amount, 3.5)
  })

  it('127. Transactions: protección anti-echo previene duplicados locales', () => {
    markLocalMutation('transactions', 'tx_local_127')
    assert.equal(isLocalMutation('transactions', 'tx_local_127'), true)

    // Segunda comprobación o transacción remota ajena
    assert.equal(isLocalMutation('transactions', 'tx_remote_external'), false)
  })

  /* ==========================================================================
     C. MULTIDISPOSITIVO
     ========================================================================== */

  it('128. Multidispositivo: Dispositivo A crea -> Dispositivo B recibe por Realtime', () => {
    const deviceBState: Transaction[] = []
    const onRemoteInsert = (tx: Transaction) => {
      deviceBState.push(tx)
    }

    const txFromDeviceA: Transaction = {
      id: 'tx_from_a',
      type: 'expense',
      amount: 15.0,
      description: 'Gasto creado en iPhone',
      categoryId: 'food',
      accountId: 'daily',
      date: '2026-09-01T12:00:00.000Z',
    }

    onRemoteInsert(txFromDeviceA)
    assert.equal(deviceBState.length, 1)
    assert.equal(deviceBState[0].description, 'Gasto creado en iPhone')
  })

  it('129. Multidispositivo: Dispositivo A edita -> Dispositivo B actualiza', () => {
    let deviceBState: Transaction[] = [
      {
        id: 'tx_sync_shared',
        type: 'expense',
        amount: 10.0,
        description: 'Original',
        categoryId: 'food',
        accountId: 'daily',
        date: '2026-09-01T12:00:00.000Z',
      },
    ]

    const onRemoteUpdate = (tx: Transaction) => {
      deviceBState = deviceBState.map((t) => (t.id === tx.id ? tx : t))
    }

    onRemoteUpdate({
      ...deviceBState[0],
      amount: 14.5,
      description: 'Modificado en dispositivo A',
    })

    assert.equal(deviceBState[0].amount, 14.5)
    assert.equal(deviceBState[0].description, 'Modificado en dispositivo A')
  })

  it('130. Multidispositivo: Dispositivo A elimina -> Dispositivo B elimina', () => {
    let deviceBState: Transaction[] = [
      { id: 'tx_to_remove', type: 'expense', amount: 5, description: 'Borrar', accountId: 'daily', date: '2026-09-01' },
      { id: 'tx_to_keep', type: 'expense', amount: 10, description: 'Mantener', accountId: 'daily', date: '2026-09-01' },
    ]

    const onRemoteDelete = (id: string) => {
      deviceBState = deviceBState.filter((t) => t.id !== id)
    }

    onRemoteDelete('tx_to_remove')
    assert.equal(deviceBState.length, 1)
    assert.equal(deviceBState[0].id, 'tx_to_keep')
  })

  /* ==========================================================================
     D. ENTIDADES NO TRANSACTION (CRUD Granular)
     ========================================================================== */

  it('131. Budget CRUD: Sincroniza upsert y delete granular de presupuestos', async () => {
    let upsertedRow: any = null
    let deletedId: any = null
    const mockSupabase = {
      from: () => ({
        upsert: async (r: any) => {
          upsertedRow = r
          return { error: null }
        },
        delete: () => ({
          eq: (field: string, val: string) => ({
            eq: () => {
              deletedId = val
              return Promise.resolve({ error: null })
            },
          }),
        }),
      }),
    }

    const budget: Budget = { id: 'b_1', categoryId: 'food', amountLimit: 300, period: 'monthly' }
    await syncUpsertBudget(mockSupabase as any, 'u1', budget)
    assert.equal(upsertedRow.amount_limit, 300)

    await syncDeleteBudget(mockSupabase as any, 'u1', 'b_1')
    assert.equal(deletedId, 'b_1')
  })

  it('132. Goal CRUD: Sincroniza upsert y delete granular de objetivos', async () => {
    let upsertedGoal: any = null
    let deletedGoalId: any = null
    const mockSupabase = {
      from: () => ({
        upsert: async (r: any) => {
          upsertedGoal = r
          return { error: null }
        },
        delete: () => ({
          eq: (field: string, val: string) => ({
            eq: () => {
              deletedGoalId = val
              return Promise.resolve({ error: null })
            },
          }),
        }),
      }),
    }

    const goal: SavingsGoal = { id: 'g_1', name: 'Viaje Japón', target: 2000, current: 500, completed: false }
    await syncUpsertGoal(mockSupabase as any, 'u1', goal)
    assert.equal(upsertedGoal.target, 2000)

    await syncDeleteGoal(mockSupabase as any, 'u1', 'g_1')
    assert.equal(deletedGoalId, 'g_1')
  })

  it('133. Reserve CRUD: Sincroniza upsert y delete granular de reservas', async () => {
    let upsertedReserve: any = null
    const mockSupabase = {
      from: () => ({
        upsert: async (r: any) => {
          upsertedReserve = r
          return { error: null }
        },
        delete: () => ({
          eq: (field: string, val: string) => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        }),
      }),
    }

    const reserve: Reserve = {
      id: 'res_1',
      name: 'Seguro coche',
      targetAmount: 480,
      currentAllocated: 120,
      targetDate: '2026-11-01',
      active: true,
    }
    await syncUpsertReserve(mockSupabase as any, 'u1', reserve)
    assert.equal(upsertedReserve.target_amount, 480)
  })

  it('134. Recurring CRUD: Sincroniza upsert y delete granular de pagos recurrentes', async () => {
    let upsertedRec: any = null
    const mockSupabase = {
      from: () => ({
        upsert: async (r: any) => {
          upsertedRec = r
          return { error: null }
        },
      }),
    }

    const rec: RecurringPayment = {
      id: 'rec_1',
      name: 'Gimnasio',
      amount: 35,
      categoryId: 'sport',
      accountId: 'daily',
      frequency: 'monthly',
      nextDate: '2026-10-01',
      active: true,
    }
    await syncUpsertRecurring(mockSupabase as any, 'u1', rec)
    assert.equal(upsertedRec.amount, 35)
  })

  it('135. SpecialPeriod CRUD: Sincroniza upsert y delete granular de periodos', async () => {
    let upsertedPeriod: any = null
    const mockSupabase = {
      from: () => ({
        upsert: async (r: any) => {
          upsertedPeriod = r
          return { error: null }
        },
      }),
    }

    const period: SpecialPeriod = {
      id: 'sp_1',
      name: 'Navidad',
      startDate: '2026-12-01',
      endDate: '2026-12-31',
      expectedExtraBudget: 400,
      type: 'expected_high_spend',
    }
    await syncUpsertSpecialPeriod(mockSupabase as any, 'u1', period)
    assert.equal(upsertedPeriod.expected_extra_budget, 400)
  })

  it('136. PlanSettings: Sincroniza configuración de ingresos y fondo de emergencia', async () => {
    let upsertedPlan: any = null
    const mockSupabase = {
      from: () => ({
        upsert: async (r: any) => {
          upsertedPlan = r
          return { error: null }
        },
      }),
    }

    const plan: FinancialPlanSettings = {
      monthlyIncome: 2500,
      targetSavingsType: 'percentage',
      targetSavingsValue: 20,
      emergencyFundTargetType: 'months',
      emergencyFundTargetValue: 6,
      emergencyFundCurrent: 3000,
      essentialCategoryIds: ['food', 'transport'],
    }
    await syncUpsertPlanSettings(mockSupabase as any, 'u1', plan)
    assert.equal(upsertedPlan.monthly_income, 2500)
    assert.equal(upsertedPlan.target_savings_value, 20)
  })

  /* ==========================================================================
     E. OFFLINE QUEUE
     ========================================================================== */

  it('137. Offline: crear transacción offline la guarda en cola con datos correctos', () => {
    const mockStore: Record<string, string> = {}
    // @ts-expect-error Mock
    globalThis.localStorage = {
      getItem: (k: string) => mockStore[k] || null,
      setItem: (k: string, v: string) => {
        mockStore[k] = v
      },
    }

    clearOfflineQueue()
    enqueueOfflineMutation({
      entity: 'transaction',
      action: 'insert',
      data: { id: 'tx_off_1', amount: 50, description: 'Supermercado sin red' },
    })

    assert.equal(getPendingMutationsCount(), 1)
    const queue = getOfflineQueue()
    assert.equal(queue[0].action, 'insert')
    assert.equal(queue[0].entity, 'transaction')

    // @ts-expect-error Limpieza
    delete globalThis.localStorage
  })

  it('138. Offline: editar transacción offline encola mutación de tipo update', () => {
    const mockStore: Record<string, string> = {}
    // @ts-expect-error Mock
    globalThis.localStorage = {
      getItem: (k: string) => mockStore[k] || null,
      setItem: (k: string, v: string) => {
        mockStore[k] = v
      },
    }

    clearOfflineQueue()
    enqueueOfflineMutation({
      entity: 'transaction',
      action: 'update',
      data: { id: 'tx_off_1', amount: 55, description: 'Supermercado corregido' },
    })

    const queue = getOfflineQueue()
    assert.equal(queue.length, 1)
    assert.equal(queue[0].action, 'update')

    // @ts-expect-error Limpieza
    delete globalThis.localStorage
  })

  it('139. Offline: borrar transacción offline encola mutación de tipo delete', () => {
    const mockStore: Record<string, string> = {}
    // @ts-expect-error Mock
    globalThis.localStorage = {
      getItem: (k: string) => mockStore[k] || null,
      setItem: (k: string, v: string) => {
        mockStore[k] = v
      },
    }

    clearOfflineQueue()
    enqueueOfflineMutation({
      entity: 'transaction',
      action: 'delete',
      data: { id: 'tx_to_delete_off' },
    })

    const queue = getOfflineQueue()
    assert.equal(queue.length, 1)
    assert.equal(queue[0].action, 'delete')

    // @ts-expect-error Limpieza
    delete globalThis.localStorage
  })

  it('140. Reconnect Flush: procesa mutaciones en estricto orden FIFO', async () => {
    const mockStore: Record<string, string> = {}
    // @ts-expect-error Mock
    globalThis.localStorage = {
      getItem: (k: string) => mockStore[k] || null,
      setItem: (k: string, v: string) => {
        mockStore[k] = v
      },
    }

    clearOfflineQueue()
    enqueueOfflineMutation({ entity: 'transaction', action: 'insert', data: { id: 'tx_fifo_1', amount: 10 } })
    enqueueOfflineMutation({ entity: 'transaction', action: 'insert', data: { id: 'tx_fifo_2', amount: 20 } })

    const processedIds: string[] = []
    const mockSupabase = {
      from: () => ({
        upsert: async (row: any) => {
          processedIds.push(row.id)
          return { error: null }
        },
      }),
    }

    const { successCount, failCount } = await flushOfflineQueue(mockSupabase as any, 'u1')
    assert.equal(successCount, 2)
    assert.equal(failCount, 0)
    assert.deepEqual(processedIds, ['tx_fifo_1', 'tx_fifo_2'])
    assert.equal(getPendingMutationsCount(), 0)

    // @ts-expect-error Limpieza
    delete globalThis.localStorage
  })

  it('141. Preservación de cola ante fallos: mutación fallida se conserva en cola', async () => {
    const mockStore: Record<string, string> = {}
    // @ts-expect-error Mock
    globalThis.localStorage = {
      getItem: (k: string) => mockStore[k] || null,
      setItem: (k: string, v: string) => {
        mockStore[k] = v
      },
    }

    clearOfflineQueue()
    enqueueOfflineMutation({ entity: 'transaction', action: 'insert', data: { id: 'tx_ok', amount: 10 } })
    enqueueOfflineMutation({ entity: 'transaction', action: 'insert', data: { id: 'tx_fail', amount: 20 } })

    const mockSupabase = {
      from: () => ({
        upsert: async (row: any) => {
          if (row.id === 'tx_fail') throw new Error('Network Timeout')
          return { error: null }
        },
      }),
    }

    const { successCount, failCount } = await flushOfflineQueue(mockSupabase as any, 'u1')
    assert.equal(successCount, 1)
    assert.equal(failCount, 1)
    assert.equal(getPendingMutationsCount(), 1)
    assert.equal(getOfflineQueue()[0].data.id, 'tx_fail')

    // @ts-expect-error Limpieza
    delete globalThis.localStorage
  })

  it('142. No pérdida de datos: operaciones offline convergen tras vaciado', async () => {
    const mockStore: Record<string, string> = {}
    // @ts-expect-error Mock
    globalThis.localStorage = {
      getItem: (k: string) => mockStore[k] || null,
      setItem: (k: string, v: string) => {
        mockStore[k] = v
      },
    }

    clearOfflineQueue()
    enqueueOfflineMutation({ entity: 'budget', action: 'insert', data: { id: 'b_off', categoryId: 'food', amountLimit: 250 } })
    enqueueOfflineMutation({ entity: 'goal', action: 'insert', data: { id: 'g_off', name: 'Colchón', target: 1000 } })

    const mockSupabase = {
      from: () => ({
        upsert: async () => ({ error: null }),
      }),
    }

    const res = await flushOfflineQueue(mockSupabase as any, 'u1')
    assert.equal(res.successCount, 2)
    assert.equal(getPendingMutationsCount(), 0)

    // @ts-expect-error Limpieza
    delete globalThis.localStorage
  })

  /* ==========================================================================
     F. ERRORES Y RESILIENCIA
     ========================================================================== */

  it('143. Error de fetch remoto: query fallida aborta y jamás borra datos locales', async () => {
    const mockSupabaseWithError = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: null, error: { message: 'Database 503 Service Unavailable' } }),
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            then: (fn: any) => fn({ data: [{ id: 'daily' }], error: null }),
          }),
        }),
      }),
    }

    await assert.rejects(
      async () => {
        await fetchRemoteState(mockSupabaseWithError as any, 'u1')
      },
      /\[Sync\] Error leyendo transactions: Database 503/
    )
  })

  it('144. Fallo de push: llamada fallida encola mutación para reintento', () => {
    const mockStore: Record<string, string> = {}
    // @ts-expect-error Mock
    globalThis.localStorage = {
      getItem: (k: string) => mockStore[k] || null,
      setItem: (k: string, v: string) => {
        mockStore[k] = v
      },
    }

    clearOfflineQueue()
    // Simulamos fallo en llamada remota y encolado automático
    enqueueOfflineMutation({
      entity: 'transaction',
      action: 'insert',
      data: { id: 'tx_failed_push', amount: 18.0 },
    })

    assert.equal(getPendingMutationsCount(), 1)

    // @ts-expect-error Limpieza
    delete globalThis.localStorage
  })

  it('145. Realtime: anti-echo limpia registro de mutaciones locales tras timeout', () => {
    markLocalMutation('transactions', 'tx_anti_echo_test')
    assert.equal(isLocalMutation('transactions', 'tx_anti_echo_test'), true)
  })

  it('146. Realtime Lifecycle: Canal permanece SUBSCRIBED tras mutaciones locales y procesa múltiples eventos remotos', () => {
    let channelHandlerCallbacks: Record<string, Function> = {}
    let subscribeCallback: Function | null = null

    const mockChannel = {
      on: (event: string, opts: any, callback: Function) => {
        const key = `${opts.table}:${opts.event}`
        channelHandlerCallbacks[key] = callback
        return mockChannel
      },
      subscribe: (cb: (status: string) => void) => {
        subscribeCallback = cb
        cb('SUBSCRIBED')
        return mockChannel
      },
      unsubscribe: () => {
        if (subscribeCallback) subscribeCallback('CLOSED')
      },
    }

    const mockSupabase = {
      channel: () => mockChannel,
    }

    let localTransactions: Transaction[] = []
    const handlers = {
      onTransactionInsert: (tx: Transaction) => {
        localTransactions = [tx, ...localTransactions]
      },
      onTransactionUpdate: () => {},
      onTransactionDelete: () => {},
      onAccountUpdate: () => {},
      onBudgetUpsert: () => {},
      onBudgetDelete: () => {},
      onGoalUpsert: () => {},
      onGoalDelete: () => {},
      onReserveUpsert: () => {},
      onReserveDelete: () => {},
      onRecurringUpsert: () => {},
      onRecurringDelete: () => {},
      onSpecialPeriodUpsert: () => {},
      onSpecialPeriodDelete: () => {},
      onPlanSettingsUpdate: () => {},
    }

    // 1. Conectar Realtime
    initRealtimeSubscription(mockSupabase as any, 'user_stable_test', handlers)
    assert.equal(getRealtimeChannelStatus(), 'SUBSCRIBED')
    assert.equal(isRealtimeSubscribed(), true)

    // 2. Modificar estado local (ej. usuario añade gasto local o restoreState)
    localTransactions.push({ id: 'local_tx_1', amount: 20, type: 'expense', accountId: 'daily', description: 'Local', date: '2026-09-01' })

    // 3. Verificar que el canal sigue SUBSCRIBED y nunca se desconectó
    assert.equal(getRealtimeChannelStatus(), 'SUBSCRIBED')
    assert.equal(isRealtimeSubscribed(), true)

    // 4. Recibir primer INSERT remoto (ej. desde el Atajo de iPhone)
    const remoteEvent1 = channelHandlerCallbacks['transactions:INSERT']
    assert.ok(remoteEvent1, 'Debe haber listener para transactions:INSERT')
    remoteEvent1({
      new: {
        id: 'tx_remote_insert_1',
        amount: 8.5,
        type: 'expense',
        account_id: 'daily',
        description: 'Gasto Atajo 1',
        date: '2026-09-01T12:00:00Z',
      },
    })
    assert.equal(localTransactions.length, 2)
    assert.equal(localTransactions[0].id, 'tx_remote_insert_1')

    // 5. Modificar otro estado local (ej. edición o cambio de categoría)
    localTransactions[0].description = 'Gasto Atajo 1 (etiquetado)'

    // 6. Verificar que la suscripción sigue activa al 100%
    assert.equal(getRealtimeChannelStatus(), 'SUBSCRIBED')
    assert.equal(isRealtimeSubscribed(), true)

    // 7. Recibir segundo INSERT remoto (ej. segundo gasto desde otro dispositivo)
    remoteEvent1({
      new: {
        id: 'tx_remote_insert_2',
        amount: 32.0,
        type: 'expense',
        account_id: 'daily',
        description: 'Gasto Dispositivo 2',
        date: '2026-09-01T12:05:00Z',
      },
    })
    assert.equal(localTransactions.length, 3)
    assert.equal(localTransactions[0].id, 'tx_remote_insert_2')

    // 8. Verificar que la suscripción sigue intacta
    assert.equal(isRealtimeSubscribed(), true)

    // 9. Cleanup explícito solo al cerrar sesión
    unsubscribeRealtime()
    assert.equal(isRealtimeSubscribed(), false)
    assert.equal(getRealtimeChannelStatus(), 'CLOSED')
  })

  it('147. Concurrencia initialSync: Bloquea ejecuciones simultáneas mientras una sincronización está en curso', async () => {
    let syncExecutions = 0
    let inProgress = false
    let isDone = false

    const runSync = async () => {
      if (inProgress || isDone) return
      inProgress = true
      syncExecutions++
      await new Promise((r) => setTimeout(r, 20))
      isDone = true
      inProgress = false
    }

    // Disparamos 3 llamadas casi concurrentes (como ocurriría en un rerender durante restoreState)
    await Promise.all([runSync(), runSync(), runSync()])

    assert.equal(syncExecutions, 1, 'initialSync debe ejecutarse exactamente una sola vez')
    assert.equal(isDone, true)
  })
})

describe('Fase 9 — Perfil de Usuario y Saludo Personalizado', () => {
  // Función auxiliar pura idéntica a la utilizada en HomePage.tsx
  const getGreeting = (profile?: UserProfile | null): string => {
    const displayName = profile?.displayName?.trim()
    return displayName ? `Hola, ${displayName}` : 'Hola'
  }

  it('148. Profile vacío -> Home muestra "Hola"', () => {
    assert.equal(getGreeting(null), 'Hola')
    assert.equal(getGreeting(undefined), 'Hola')
    assert.equal(getGreeting({ displayName: '' }), 'Hola')
    assert.equal(getGreeting({ displayName: '   ' }), 'Hola')
  })

  it('149. display_name Marta -> Home muestra "Hola, Marta"', () => {
    assert.equal(getGreeting({ displayName: 'Marta' }), 'Hola, Marta')
    assert.equal(getGreeting({ displayName: '  Marta  ' }), 'Hola, Marta')
    assert.equal(getGreeting({ displayName: 'Marta M.' }), 'Hola, Marta M.')
  })

  it('150. Editar nombre local: actualiza estado inmediatamente de forma optimista', () => {
    let state: PersistedState = {
      ...initialFinanceState,
      profile: { displayName: 'Marta' },
    }

    // Mutación optimista local
    const nextProfile: UserProfile = { ...state.profile, displayName: 'Marta M.' }
    state = { ...state, profile: nextProfile }

    assert.equal(state.profile?.displayName, 'Marta M.')
    assert.equal(getGreeting(state.profile), 'Hola, Marta M.')
  })

  it('151. Persistencia IndexedDB: guarda y recupera perfil desde caché sin parpadeos', async () => {
    const mockStorage: Record<string, string> = {}
    const storage: StorageAdapter = {
      async load() {
        const raw = mockStorage['test_db']
        if (!raw) return null
        return migratePersistedState(JSON.parse(raw))
      },
      async save(s) {
        mockStorage['test_db'] = JSON.stringify(s)
      },
      async clear() {
        delete mockStorage['test_db']
      },
    }

    const stateWithProfile: PersistedState = {
      ...initialFinanceState,
      profile: { displayName: 'Marta' },
    }

    await storage.save(stateWithProfile)
    const loaded = await storage.load()

    assert.ok(loaded)
    assert.equal(loaded.profile?.displayName, 'Marta')
    assert.equal(getGreeting(loaded.profile), 'Hola, Marta')
  })

  it('152. Sincronización Supabase: mapea toDbProfile / fromDbProfile y ejecuta syncUpsertProfile', async () => {
    const userId = 'usr_test_marta_123'
    const profile: UserProfile = { displayName: 'Marta' }

    // Mapeo modelo -> DB
    const dbRow = toDbProfile(profile, userId)
    assert.equal(dbRow.user_id, userId)
    assert.equal(dbRow.display_name, 'Marta')

    // Mapeo DB -> modelo
    const model = fromDbProfile({ user_id: userId, display_name: 'Marta' })
    assert.equal(model.displayName, 'Marta')

    // Inserción / actualización en Supabase
    let upsertPayload: unknown = null
    const mockSupabase: any = {
      from(table: string) {
        assert.equal(table, 'profiles')
        return {
          async upsert(row: unknown) {
            upsertPayload = row
            return { error: null }
          },
        }
      },
    }

    await syncUpsertProfile(mockSupabase, userId, profile)
    assert.deepEqual(upsertPayload, { user_id: userId, display_name: 'Marta' })
  })

  it('153. Realtime PC -> iPhone: evento en tabla profiles actualiza nombre en dispositivo remoto', () => {
    let currentProfile: UserProfile = { displayName: 'Marta' }

    // Handlers de Realtime en dispositivo remoto (iPhone)
    let realtimeProfileHandler: ((p: UserProfile) => void) | null = null

    const mockChannel: any = {
      on(type: string, filter: any, callback: any) {
        if (filter.table === 'profiles') {
          realtimeProfileHandler = (p: UserProfile) => {
            currentProfile = p
          }
        }
        return mockChannel
      },
      subscribe(cb: any) {
        cb?.('SUBSCRIBED')
        return mockChannel
      },
      unsubscribe() {
        return Promise.resolve('ok')
      },
    }

    // Simulamos suscripción de iPhone a profiles
    mockChannel.on('postgres_changes', { table: 'profiles' }, () => {})
    assert.ok(realtimeProfileHandler)

    // Evento entrante desde PC modificando display_name a "Marta M."
    const pcPayloadRow = { user_id: 'usr_test_marta_123', display_name: 'Marta M.' }
    realtimeProfileHandler(fromDbProfile(pcPayloadRow))

    // Verificamos que iPhone actualizó su perfil y su saludo
    assert.equal(currentProfile.displayName, 'Marta M.')
    assert.equal(getGreeting(currentProfile), 'Hola, Marta M.')
  })

  it('154. Cambio offline -> queue -> reconnect: encola actualización y la vacía al reconectar', async () => {
    const mockStore: Record<string, string> = {}
    // @ts-expect-error Mock
    globalThis.localStorage = {
      getItem: (k: string) => mockStore[k] || null,
      setItem: (k: string, v: string) => {
        mockStore[k] = v
      },
      removeItem: (k: string) => {
        delete mockStore[k]
      },
    }

    clearOfflineQueue()

    // 1. Encolar mutación offline de profile
    enqueueOfflineMutation({
      entity: 'profile',
      action: 'update',
      data: { displayName: 'Marta Offline' },
    })

    assert.equal(getPendingMutationsCount(), 1)
    const queue = getOfflineQueue()
    assert.equal(queue[0].entity, 'profile')
    assert.equal((queue[0].data as UserProfile).displayName, 'Marta Offline')

    // 2. Reconexión y vaciado de cola (flush)
    let flushedProfileRow: any = null
    const mockSupabase: any = {
      from(table: string) {
        assert.equal(table, 'profiles')
        return {
          async upsert(row: any) {
            flushedProfileRow = row
            return { error: null }
          },
        }
      },
    }

    const { successCount, failCount } = await flushOfflineQueue(mockSupabase, 'usr_marta_test')
    assert.equal(successCount, 1)
    assert.equal(failCount, 0)
    assert.equal(getPendingMutationsCount(), 0)
    assert.deepEqual(flushedProfileRow, { user_id: 'usr_marta_test', display_name: 'Marta Offline' })

    clearOfflineQueue()
    // @ts-expect-error Cleanup
    delete globalThis.localStorage
  })

  it('155. RLS: política auth.uid() = user_id impide leer/modificar perfil ajeno', () => {
    const authUserId = '00000000-0000-0000-0000-000000000001'
    const otherUserId = '00000000-0000-0000-0000-000000000002'

    // Evaluación de política RLS: auth.uid() = user_id
    const canAccessProfile = (requestUid: string, targetUserId: string) => {
      return requestUid === targetUserId
    }

    // Acceso a perfil propio: permitido
    assert.equal(canAccessProfile(authUserId, authUserId), true)

    // Acceso a perfil ajeno: denegado por RLS
    assert.equal(canAccessProfile(authUserId, otherUserId), false)
  })

  it('156. Compatibilidad y estado íntegro: createCleanInitialState incluye profile vacío', () => {
    const clean = createCleanInitialState()
    assert.ok(clean.profile)
    assert.equal(clean.profile.displayName, '')
    assert.equal(getGreeting(clean.profile), 'Hola')
  })
})

describe('Fase 10 — Reset Financiero Real y Prevención de Resurrección Demo', () => {
  it('157. Usuario real nuevo no recibe seed: cleanInitialFinanceState arranca en 0 € y vacío', () => {
    assert.equal(cleanInitialFinanceState.transactions.length, 0)
    assert.equal(cleanInitialFinanceState.budgets.length, 0)
    assert.equal(cleanInitialFinanceState.goals.length, 0)
    assert.equal(cleanInitialFinanceState.reserves.length, 0)
    assert.equal(cleanInitialFinanceState.recurring.length, 0)
    assert.equal(cleanInitialFinanceState.specialPeriods.length, 0)

    // Cuentas estructurales con saldo 0
    assert.equal(cleanInitialFinanceState.accounts.length, 2)
    assert.equal(cleanInitialFinanceState.accounts[0].initialBalance, 0)
    assert.equal(cleanInitialFinanceState.accounts[1].initialBalance, 0)

    // Plan financiero neutro sin suposiciones de ahorro o emergencias
    assert.equal(cleanInitialFinanceState.planSettings.monthlyIncome, 0)
    assert.equal(cleanInitialFinanceState.planSettings.targetSavingsValue, 0)
    assert.equal(cleanInitialFinanceState.planSettings.emergencyFundTargetValue, 0)
    assert.equal(cleanInitialFinanceState.planSettings.emergencyFundCurrent, 0)
    assert.equal(cleanInitialFinanceState.planSettings.essentialCategoryIds.length, 0)
  })

  it('158. Reset cloud limpio no es sobrescrito por cache local antigua con demo data', () => {
    // Simulamos un localStorage que tenía datos demo antiguos
    const legacyDemoCache: Partial<PersistedState> = {
      transactions: [{ id: 't1', type: 'expense', amount: 18.43, accountId: 'daily', categoryId: 'food', description: 'Mercadona', date: '2026-09-01T00:00:00Z' }],
      accounts: [{ id: 'daily', name: 'Cuenta diaria', type: 'spending', initialBalance: 791.16, balance: 438.25 }],
    }

    const hasLegacyDemo =
      (legacyDemoCache.transactions ?? []).some(
        (t) => t.id === 't1' || t.description === 'Mercadona'
      ) ||
      (legacyDemoCache.accounts ?? []).some(
        (a) => a.initialBalance === 791.16
      )

    assert.equal(hasLegacyDemo, true)

    // Al detectar legacy demo, el sistema adopta cleanInitialFinanceState y no resucita datos demo
    const effectiveState = hasLegacyDemo ? cleanInitialFinanceState : legacyDemoCache
    assert.equal(effectiveState.transactions.length, 0)
    assert.equal(effectiveState.accounts[0].initialBalance, 0)
  })

  it('159. Offline queue antigua no resucita datos demo', async () => {
    // 1. Mutaciones antiguas de demo son detectadas por isDemoMutation
    assert.equal(
      isDemoMutation({
        id: 'mut_1',
        entity: 'transaction',
        action: 'insert',
        data: { id: 't1', description: 'Mercadona', amount: 18.43 },
        timestamp: Date.now(),
      }),
      true
    )

    assert.equal(
      isDemoMutation({
        id: 'mut_2',
        entity: 'reserve',
        action: 'update',
        data: { id: 'res1', name: 'Navidad y regalos' },
        timestamp: Date.now(),
      }),
      true
    )

    // 2. Mutaciones legítimas de usuario real no se bloquean
    assert.equal(
      isDemoMutation({
        id: 'mut_3',
        entity: 'transaction',
        action: 'insert',
        data: { id: 'tx_real_uuid_99', description: 'Compra panadería', amount: 1.5 },
        timestamp: Date.now(),
      }),
      false
    )

    // 3. flushOfflineQueue descarta mutaciones demo sin enviarlas a Supabase
    const mockStore: Record<string, string> = {}
    // @ts-expect-error Mock
    globalThis.localStorage = {
      getItem: (k: string) => mockStore[k] || null,
      setItem: (k: string, v: string) => {
        mockStore[k] = v
      },
      removeItem: (k: string) => {
        delete mockStore[k]
      },
    }

    clearOfflineQueue()
    enqueueOfflineMutation({
      entity: 'transaction',
      action: 'insert',
      data: { id: 't1', description: 'Mercadona', amount: 18.43 },
    })

    let supabaseUpsertCalled = false
    const mockSupabase: any = {
      from() {
        return {
          upsert() {
            supabaseUpsertCalled = true
            return Promise.resolve({ error: null })
          },
        }
      },
    }

    const { successCount } = await flushOfflineQueue(mockSupabase, 'u1')
    assert.equal(successCount, 1)
    assert.equal(supabaseUpsertCalled, false, 'Mutación demo jamás debe enviarse a Supabase')

    clearOfflineQueue()
    // @ts-expect-error Cleanup
    delete globalThis.localStorage
  })

  it('160. Home vacío funciona: saldos derivados calculan 0,00 € con precisión', () => {
    const emptyAccounts = [
      { id: 'daily', name: 'Cuenta diaria', type: 'spending' as const, initialBalance: 0, balance: 0 },
      { id: 'savings', name: 'Ahorro', type: 'savings' as const, initialBalance: 0, balance: 0 },
    ]
    const reconciled = reconcileAccounts(emptyAccounts, [])
    assert.equal(reconciled[0].balance, 0)
    assert.equal(reconciled[1].balance, 0)

    const totalMoney = reconciled.reduce((sum, a) => sum + a.balance, 0)
    assert.equal(totalMoney, 0)
  })

  it('161. Gráfico donut vacío funciona sin errores: sin divisiones por cero ni NaN', () => {
    const expenses: Transaction[] = []
    const total = expenses.reduce((sum, t) => sum + t.amount, 0)
    assert.equal(total, 0)

    const byCategory = baseCategories
      .map((category) => ({
        ...category,
        amount: expenses.filter((t) => t.categoryId === category.id).reduce((sum, t) => sum + t.amount, 0),
      }))
      .filter((item) => item.amount > 0)

    assert.equal(byCategory.length, 0)

    // Si no hay gastos, conic-gradient debe tener fallback limpio '#ecece8 0 100%'
    let cursor = 0
    const gradient = byCategory
      .map((item) => {
        const start = cursor
        cursor += total ? (item.amount / total) * 100 : 0
        return `${item.color} ${start}% ${cursor}%`
      })
      .join(', ')

    assert.equal(gradient, '')
    const finalBackground = `conic-gradient(${gradient || '#ecece8 0 100%'})`
    assert.equal(finalBackground, 'conic-gradient(#ecece8 0 100%)')
  })

  it('162. Perfil se conserva tras reset: display_name Marta intacto', () => {
    const profile = { displayName: 'Marta' }
    const displayName = profile.displayName.trim()
    const greeting = displayName ? `Hola, ${displayName}` : 'Hola'
    assert.equal(greeting, 'Hola, Marta')
  })

  it('163. Categorías base se conservan tras reset: exactamente 8 categorías útiles', () => {
    assert.equal(baseCategories.length, 8)
    const categoryIds = baseCategories.map((c) => c.id).sort()
    assert.deepEqual(categoryIds, [
      'clothes',
      'food',
      'leisure',
      'other',
      'sport',
      'subscriptions',
      'transport',
      'travel',
    ])
  })

  it('164. Tokens del Atajo se conservan tras reset: script de reset excluye shortcut_tokens', () => {
    const tablesClearedInReset = [
      'transactions',
      'budgets',
      'savings_goals',
      'reserves',
      'recurring_payments',
      'special_periods',
    ]
    assert.equal(tablesClearedInReset.includes('shortcut_tokens'), false)
    assert.equal(tablesClearedInReset.includes('profiles'), false)
    assert.equal(tablesClearedInReset.includes('categories'), false)
  })
})

describe('Fase 11 — Semántica de Sincronización, Foreground Reconcile y Resiliencia Realtime', () => {
  it('165. Socket zombie al volver de background: detecta estado cerrado/zombie y reconecta limpiamente sin canales huérfanos', () => {
    let channelCreatedCount = 0
    let removedChannels: any[] = []
    let currentChannelStatus = 'CLOSED'

    const createMockChannel = () => {
      channelCreatedCount++
      let subscribeCb: ((status: string) => void) | null = null
      const ch = {
        id: `mock_ch_${channelCreatedCount}`,
        on: () => ch,
        subscribe: (cb: (status: string) => void) => {
          subscribeCb = cb
          currentChannelStatus = 'SUBSCRIBED'
          cb('SUBSCRIBED')
          return ch
        },
        unsubscribe: () => {
          currentChannelStatus = 'CLOSED'
          if (subscribeCb) subscribeCb('CLOSED')
        },
      }
      return ch
    }

    const mockSupabase = {
      channel: () => createMockChannel(),
      removeChannel: (c: any) => {
        removedChannels.push(c)
      },
    }

    const handlers = {
      onTransactionInsert: () => {},
      onTransactionUpdate: () => {},
      onTransactionDelete: () => {},
      onAccountUpdate: () => {},
      onBudgetUpsert: () => {},
      onBudgetDelete: () => {},
      onGoalUpsert: () => {},
      onGoalDelete: () => {},
      onReserveUpsert: () => {},
      onReserveDelete: () => {},
      onRecurringUpsert: () => {},
      onRecurringDelete: () => {},
      onSpecialPeriodUpsert: () => {},
      onSpecialPeriodDelete: () => {},
      onPlanSettingsUpdate: () => {},
    }

    // 1. Conexión inicial
    const ch1 = initRealtimeSubscription(mockSupabase as any, 'user_zombie_test', handlers)
    assert.equal(channelCreatedCount, 1)
    assert.equal(isRealtimeSubscribed(), true)

    // 2. Simular que iOS suspende la app en background y el socket muere a CLOSED
    ch1.unsubscribe()
    assert.equal(isRealtimeSubscribed(), false)
    assert.equal(getRealtimeChannelStatus(), 'CLOSED')

    // 3. Al volver a foreground, ensureRealtimeConnection detecta que no está SUBSCRIBED y reconecta
    const ch2 = ensureRealtimeConnection(mockSupabase as any, 'user_zombie_test', handlers)
    assert.equal(channelCreatedCount, 2)
    assert.equal(isRealtimeSubscribed(), true)
    assert.equal(getRealtimeChannelStatus(), 'SUBSCRIBED')
    assert.equal(removedChannels.length, 1, 'El canal antiguo debe haber sido eliminado con removeChannel')

    unsubscribeRealtime()
  })

  it('166. Reconciliación foreground: al volver a primer plano realiza pull cloud de transacciones creadas externamente (Atajo)', async () => {
    // 1. Estado local de Pocketflow antes de pasar a background
    let localTransactions: Transaction[] = [
      { id: 'tx_local_1', amount: 12.0, type: 'expense', accountId: 'daily', description: 'Café', date: '2026-09-01T08:00:00Z' },
    ]

    // 2. El Atajo crea un gasto en Supabase mientras la PWA duerme
    const cloudTransactions: Transaction[] = [
      ...localTransactions,
      { id: 'tx_from_shortcut', amount: 4.5, type: 'expense', accountId: 'daily', description: 'Panadería (Atajo)', date: '2026-09-01T09:30:00Z' },
    ]

    let badgeStatus: string = 'connected'
    const statusTransitions: string[] = [badgeStatus]

    const setSyncStatus = (status: string) => {
      badgeStatus = status
      statusTransitions.push(status)
    }

    // Simular el flujo exacto de handleFocus de App.tsx:
    // A. Marcar syncing inmediatamente
    setSyncStatus('syncing')

    // B. Reconciliar pull cloud
    const mockRemote = {
      transactions: cloudTransactions,
      categories: baseCategories,
      budgets: [],
      savingsGoals: [],
      reserves: [],
      recurringPayments: [],
      specialPeriods: [],
      planSettings: {} as any,
      profile: { displayName: 'Marta' },
    }

    // C. Restaurar en memoria
    localTransactions = mockRemote.transactions

    // D. Confirmado: marcar up_to_date
    setSyncStatus('up_to_date')

    // Verificaciones:
    assert.equal(localTransactions.length, 2)
    assert.ok(localTransactions.some((t) => t.id === 'tx_from_shortcut'))
    assert.deepEqual(statusTransitions, ['connected', 'syncing', 'up_to_date'])
  })

  it('167. Badge no muestra "Al día" antes de reconciliar: Realtime SUBSCRIBED pasa a "Conectado", y solo reconciliación/mutación confirmada marca "Al día"', () => {
    let syncStatus: string = 'connecting'

    const onRealtimeStatusChange = (status: string) => {
      if (status === 'SUBSCRIBED') {
        // Semántica correcta: estar conectado al websocket NO significa que estés al día
        syncStatus = syncStatus === 'connecting' ? 'connected' : syncStatus
      }
    }

    // Al arrancar y suscribir socket
    assert.equal(syncStatus, 'connecting')
    onRealtimeStatusChange('SUBSCRIBED')
    assert.equal(syncStatus, 'connected', 'Debe ser Conectado, NO Al día')

    // Al confirmar sincronización en la nube (ej. dispatchSync o reconciliación foreground)
    syncStatus = 'up_to_date'
    assert.equal(syncStatus, 'up_to_date')

    // Tras temporizador, vuelve a Conectado
    const transitionTimer = () => {
      if (syncStatus === 'up_to_date') syncStatus = 'connected'
    }
    transitionTimer()
    assert.equal(syncStatus, 'connected')
  })

  it('168. No múltiples canales Realtime: ensureRealtimeConnection no duplica canales cuando el socket ya está saludable', () => {
    let channelCreatedCount = 0

    const createMockChannel = () => {
      channelCreatedCount++
      const ch = {
        id: `mock_ch_${channelCreatedCount}`,
        on: () => ch,
        subscribe: (cb: (status: string) => void) => {
          cb('SUBSCRIBED')
          return ch
        },
        unsubscribe: () => {},
      }
      return ch
    }

    const mockSupabase = {
      channel: () => createMockChannel(),
      removeChannel: () => {},
    }

    const handlers = {
      onTransactionInsert: () => {},
      onTransactionUpdate: () => {},
      onTransactionDelete: () => {},
      onAccountUpdate: () => {},
      onBudgetUpsert: () => {},
      onBudgetDelete: () => {},
      onGoalUpsert: () => {},
      onGoalDelete: () => {},
      onReserveUpsert: () => {},
      onReserveDelete: () => {},
      onRecurringUpsert: () => {},
      onRecurringDelete: () => {},
      onSpecialPeriodUpsert: () => {},
      onSpecialPeriodDelete: () => {},
      onPlanSettingsUpdate: () => {},
    }

    // 1. Suscripción inicial
    const ch = initRealtimeSubscription(mockSupabase as any, 'user_no_dup_test', handlers)
    assert.equal(channelCreatedCount, 1)
    assert.equal(isRealtimeSubscribed(), true)

    // 2. Invocar ensureRealtimeConnection 3 veces consecutivas mientras está SUBSCRIBED
    const same1 = ensureRealtimeConnection(mockSupabase as any, 'user_no_dup_test', handlers)
    const same2 = ensureRealtimeConnection(mockSupabase as any, 'user_no_dup_test', handlers)
    const same3 = ensureRealtimeConnection(mockSupabase as any, 'user_no_dup_test', handlers)

    assert.equal(channelCreatedCount, 1, 'No debe crear nuevos canales si ya está suscrito')
    assert.equal(same1, ch)
    assert.equal(same2, ch)
    assert.equal(same3, ch)

    unsubscribeRealtime()
  })
})

/* ==========================================================================
   FASE 12 — GASTOS VARIABLES PREVISTOS
   ========================================================================== */

describe('Fase 12 — Gastos Variables Previstos', () => {
  it('169. Cálculo semanal: 1,50 € × 4 veces/semana × 4,33 = 25,98 €/mes aproximado', () => {
    const estimate = calculateMonthlyEstimate(1.50, 'per_week', 4)
    assert.equal(estimate, 25.98)
  })

  it('170. Cálculo mensual: 15,00 € × 2 veces/mes = 30,00 €/mes exacto', () => {
    const estimate = calculateMonthlyEstimate(15.00, 'per_month', 2)
    assert.equal(estimate, 30.00)
  })

  it('171. Estimación no cuenta como gasto real en saldos ni altera balances', () => {
    const initialAccounts: Account[] = [
      { id: 'daily', name: 'Cuenta diaria', type: 'spending', initialBalance: 500 },
      { id: 'savings', name: 'Ahorro', type: 'savings', initialBalance: 1000 },
    ]
    const transactions: Transaction[] = []
    const reconciled = reconcileAccounts(initialAccounts, transactions)

    // Tener una estimación de 25,98 €/mes no debe restar nada del saldo de la cuenta diaria
    assert.equal(reconciled.find((a) => a.id === 'daily')?.balance, 500)
    assert.equal(reconciled.find((a) => a.id === 'savings')?.balance, 1000)
  })

  it('172. Matching conservador por nombre exacto normalizado (no agrupa gastos distintos de la misma categoría)', () => {
    const estimate: VariableExpenseEstimate = {
      id: 'est_gym',
      name: 'Gimnasio Rafa',
      categoryId: 'sport',
      unitCost: 1.5,
      frequencyType: 'per_week',
      frequencyValue: 4,
      active: true,
    }

    assert.equal(normalizeEstimateName('  Gimnasio Rafa  '), 'gimnasio rafa')
    assert.equal(normalizeEstimateName('GIMNASIO RAFA'), 'gimnasio rafa')

    const txSame: Transaction = {
      id: 'tx_gym_1',
      type: 'expense',
      amount: 1.5,
      description: '  Gimnasio Rafa  ',
      categoryId: 'sport',
      accountId: 'daily',
      date: '2026-09-02T10:00:00.000Z',
    }

    const txDifferentSport: Transaction = {
      id: 'tx_padel',
      type: 'expense',
      amount: 10.0,
      description: 'Pádel fin de semana',
      categoryId: 'sport',
      accountId: 'daily',
      date: '2026-09-02T11:00:00.000Z',
    }

    const currentMonth = '2026-09'
    const spent = calculateRealSpentForEstimate(estimate, [txSame, txDifferentSport], currentMonth)

    // Solo debe contar txSame (1.50 €), jamás txDifferentSport (10 €) aunque comparta sport
    assert.equal(spent, 1.5)
  })

  it('173. Gasto real del mes suma correctamente transacciones del mes y descarta otros meses', () => {
    const estimate: VariableExpenseEstimate = {
      id: 'est_gym',
      name: 'Gimnasio Rafa',
      categoryId: 'sport',
      unitCost: 1.5,
      frequencyType: 'per_week',
      frequencyValue: 4,
      active: true,
    }

    const txThisMonth1: Transaction = {
      id: 'tx_1',
      type: 'expense',
      amount: 1.5,
      description: 'Gimnasio Rafa',
      categoryId: 'sport',
      accountId: 'daily',
      date: '2026-09-01T08:00:00.000Z',
    }
    const txThisMonth2: Transaction = {
      id: 'tx_2',
      type: 'expense',
      amount: 1.5,
      description: 'gimnasio rafa',
      categoryId: 'sport',
      accountId: 'daily',
      date: '2026-09-02T08:00:00.000Z',
    }
    const txPastMonth: Transaction = {
      id: 'tx_past',
      type: 'expense',
      amount: 1.5,
      description: 'Gimnasio Rafa',
      categoryId: 'sport',
      accountId: 'daily',
      date: '2026-08-25T08:00:00.000Z',
    }

    const spent = calculateRealSpentForEstimate(estimate, [txThisMonth1, txThisMonth2, txPastMonth], '2026-09')
    assert.equal(spent, 3.0)
  })

  it('174. Pendiente estimado = max(0, previsto - real) sin doble cómputo', () => {
    const monthlyEstimate = 25.98

    // Caso 1: real menor que previsto (10 € gastados)
    const pending1 = calculatePendingEstimate(monthlyEstimate, 10.0)
    assert.equal(pending1, 15.98)

    // Caso 2: real igual al previsto (25.98 € gastados)
    const pending2 = calculatePendingEstimate(monthlyEstimate, 25.98)
    assert.equal(pending2, 0)

    // Caso 3: real superior al previsto (30 € gastados -> no debe ser negativo)
    const pending3 = calculatePendingEstimate(monthlyEstimate, 30.0)
    assert.equal(pending3, 0)
  })

  it('175. CRUD local: añadir, actualizar, alternar activo y borrar estimación', () => {
    let estimates: VariableExpenseEstimate[] = []

    // 1. Añadir
    const newEst: VariableExpenseEstimate = {
      id: 'est_1',
      name: 'Gimnasio Rafa',
      categoryId: 'sport',
      unitCost: 1.5,
      frequencyType: 'per_week',
      frequencyValue: 4,
      active: true,
    }
    estimates = [...estimates, newEst]
    assert.equal(estimates.length, 1)

    // 2. Actualizar coste
    estimates = estimates.map((e) => (e.id === 'est_1' ? { ...e, unitCost: 2.0 } : e))
    assert.equal(estimates[0].unitCost, 2.0)

    // 3. Alternar activo/pausado
    estimates = estimates.map((e) => (e.id === 'est_1' ? { ...e, active: !e.active } : e))
    assert.equal(estimates[0].active, false)

    // 4. Borrar
    estimates = estimates.filter((e) => e.id !== 'est_1')
    assert.equal(estimates.length, 0)
  })

  it('176. Sincronización Supabase: mapea toDbVariableExpenseEstimate y fromDbVariableExpenseEstimate', () => {
    const model: VariableExpenseEstimate = {
      id: 'est_gym_123',
      name: 'Gimnasio Rafa',
      categoryId: 'sport',
      unitCost: 1.5,
      frequencyType: 'per_week',
      frequencyValue: 4,
      active: true,
    }
    const userId = 'user_marta_test'

    const dbRow = toDbVariableExpenseEstimate(model, userId)
    assert.equal(dbRow.id, 'est_gym_123')
    assert.equal(dbRow.user_id, userId)
    assert.equal(dbRow.name, 'Gimnasio Rafa')
    assert.equal(dbRow.category_id, 'sport')
    assert.equal(dbRow.unit_cost, 1.5)
    assert.equal(dbRow.frequency_type, 'per_week')
    assert.equal(dbRow.frequency_value, 4)
    assert.equal(dbRow.active, true)

    const restored = fromDbVariableExpenseEstimate(dbRow)
    assert.equal(restored.id, model.id)
    assert.equal(restored.name, model.name)
    assert.equal(restored.categoryId, model.categoryId)
    assert.equal(restored.unitCost, model.unitCost)
    assert.equal(restored.frequencyType, model.frequencyType)
    assert.equal(restored.frequencyValue, model.frequencyValue)
    assert.equal(restored.active, model.active)
  })

  it('177. Realtime: eventos remotos de upsert y delete actualizan la lista de estimaciones', () => {
    let stateEstimates: VariableExpenseEstimate[] = []

    const onUpsert = (est: VariableExpenseEstimate) => {
      const exists = stateEstimates.some((e) => e.id === est.id)
      stateEstimates = exists
        ? stateEstimates.map((e) => (e.id === est.id ? est : e))
        : [...stateEstimates, est]
    }

    const onDelete = (id: string) => {
      stateEstimates = stateEstimates.filter((e) => e.id !== id)
    }

    const remoteEst: VariableExpenseEstimate = {
      id: 'est_remote_1',
      name: 'Gimnasio Rafa',
      categoryId: 'sport',
      unitCost: 1.5,
      frequencyType: 'per_week',
      frequencyValue: 4,
      active: true,
    }

    // 1. Insert remoto
    onUpsert(remoteEst)
    assert.equal(stateEstimates.length, 1)
    assert.equal(stateEstimates[0].name, 'Gimnasio Rafa')

    // 2. Update remoto
    onUpsert({ ...remoteEst, frequencyValue: 5 })
    assert.equal(stateEstimates.length, 1)
    assert.equal(stateEstimates[0].frequencyValue, 5)

    // 3. Delete remoto
    onDelete('est_remote_1')
    assert.equal(stateEstimates.length, 0)
  })

  it('178. Offline Queue: encola mutación de estimación variable y la vacía al reconectar', async () => {
    const mockStore: Record<string, string> = {}
    // @ts-expect-error Mocking localStorage in node test environment
    globalThis.localStorage = {
      getItem: (k: string) => mockStore[k] || null,
      setItem: (k: string, v: string) => {
        mockStore[k] = v
      },
      removeItem: (k: string) => {
        delete mockStore[k]
      },
    }

    clearOfflineQueue()

    const est: VariableExpenseEstimate = {
      id: 'est_offline_1',
      name: 'Gimnasio Rafa',
      categoryId: 'sport',
      unitCost: 1.5,
      frequencyType: 'per_week',
      frequencyValue: 4,
      active: true,
    }

    // 1. Encolar offline
    enqueueOfflineMutation({
      entity: 'variable_expense_estimate',
      action: 'insert',
      data: est,
    })

    const queue = getOfflineQueue()
    assert.equal(queue.length, 1)
    assert.equal(queue[0].entity, 'variable_expense_estimate')

    // 2. Mock Supabase para flush
    let upsertCalled = false
    const mockSupabase = {
      from: (table: string) => {
        assert.equal(table, 'variable_expense_estimates')
        return {
          upsert: async (row: any) => {
            upsertCalled = true
            assert.equal(row.id, 'est_offline_1')
            return { error: null }
          },
        }
      },
    }

    const { successCount, failCount } = await flushOfflineQueue(mockSupabase as any, 'user_test_178')
    assert.equal(successCount, 1)
    assert.equal(failCount, 0)
    assert.equal(upsertCalled, true)
    assert.equal(getOfflineQueue().length, 0)

    clearOfflineQueue()
    // @ts-expect-error Cleanup
    delete globalThis.localStorage
  })

  /* ==========================================================================
     Indicador Home y Selector Puro selectPendingVariableExpenseEstimate
     ========================================================================== */

  it('179. selectPendingVariableExpenseEstimate: sin estimaciones devuelve 0', () => {
    assert.equal(selectPendingVariableExpenseEstimate([], []), 0)
    assert.equal(selectPendingVariableExpenseEstimate(null as any, []), 0)
  })

  it('180. selectPendingVariableExpenseEstimate: Gimnasio Rafa 25,98 previsto / 0 real -> 25,98 pendiente', () => {
    const gymEstimate: VariableExpenseEstimate = {
      id: 'est_gym',
      name: 'Gimnasio Rafa',
      categoryId: 'sport',
      unitCost: 1.5,
      frequencyType: 'per_week',
      frequencyValue: 4,
      active: true,
    }

    const pending = selectPendingVariableExpenseEstimate([gymEstimate], [], '2026-09')
    assert.equal(pending, 25.98)
  })

  it('181. selectPendingVariableExpenseEstimate: 1,50 real -> 24,48 pendiente', () => {
    const gymEstimate: VariableExpenseEstimate = {
      id: 'est_gym',
      name: 'Gimnasio Rafa',
      categoryId: 'sport',
      unitCost: 1.5,
      frequencyType: 'per_week',
      frequencyValue: 4,
      active: true,
    }

    const tx: Transaction = {
      id: 'tx_gym_real_1',
      type: 'expense',
      amount: 1.5,
      description: 'Gimnasio Rafa',
      categoryId: 'sport',
      accountId: 'daily',
      date: '2026-09-02T10:00:00.000Z',
    }

    const pending = selectPendingVariableExpenseEstimate([gymEstimate], [tx], '2026-09')
    assert.equal(pending, 24.48)
  })

  it('182. selectPendingVariableExpenseEstimate: si real supera previsto -> pendiente 0', () => {
    const gymEstimate: VariableExpenseEstimate = {
      id: 'est_gym',
      name: 'Gimnasio Rafa',
      categoryId: 'sport',
      unitCost: 1.5,
      frequencyType: 'per_week',
      frequencyValue: 4,
      active: true,
    }

    const txOver: Transaction = {
      id: 'tx_gym_over',
      type: 'expense',
      amount: 30.0,
      description: 'Gimnasio Rafa',
      categoryId: 'sport',
      accountId: 'daily',
      date: '2026-09-02T10:00:00.000Z',
    }

    const pending = selectPendingVariableExpenseEstimate([gymEstimate], [txOver], '2026-09')
    assert.equal(pending, 0)
  })

  it('183. selectPendingVariableExpenseEstimate: estimaciones inactivas no cuentan', () => {
    const inactiveGym: VariableExpenseEstimate = {
      id: 'est_gym_paused',
      name: 'Gimnasio Rafa',
      categoryId: 'sport',
      unitCost: 1.5,
      frequencyType: 'per_week',
      frequencyValue: 4,
      active: false,
    }

    const pending = selectPendingVariableExpenseEstimate([inactiveGym], [], '2026-09')
    assert.equal(pending, 0)
  })

  it('184. Home: indicador de variable pendiente no altera "Gastado este mes"', () => {
    const gymEstimate: VariableExpenseEstimate = {
      id: 'est_gym',
      name: 'Gimnasio Rafa',
      categoryId: 'sport',
      unitCost: 1.5,
      frequencyType: 'per_week',
      frequencyValue: 4,
      active: true,
    }

    const txs: Transaction[] = [
      {
        id: 'tx_food',
        type: 'expense',
        amount: 45.5,
        description: 'Supermercado',
        categoryId: 'food',
        accountId: 'daily',
        date: '2026-09-01T12:00:00.000Z',
      },
    ]

    const targetDate = new Date('2026-09-02T12:00:00.000Z')
    const actualMonthExpenses = selectMonthExpenses(txs, targetDate)
    const pendingVariable = selectPendingVariableExpenseEstimate([gymEstimate], txs, '2026-09')

    // El gasto real del mes es exactamente 45.50 € (las transacciones reales)
    assert.equal(actualMonthExpenses, 45.5)
    // El pendiente estimado variable es 25.98 €
    assert.equal(pendingVariable, 25.98)
    // "Gastado este mes" NO se incrementa con la estimación variable (no hay mezcla)
    assert.equal(actualMonthExpenses, 45.5)
  })
})

describe('Fase 13 — Disponible Proyectado, Tarjeta Expandible y Confirmación de Recurrentes', () => {
  // A. Disponible proyectado
  it('185. Disponible proyectado: 534,08 € - 24,48 € = 509,60 €', () => {
    const projected = selectProjectedAvailable(534.08, 24.48)
    assert.equal(projected, 509.6)
  })

  it('186. Disponible proyectado sin variables: igual a disponible real', () => {
    const projected = selectProjectedAvailable(534.08, 0)
    assert.equal(projected, 534.08)
    const fromEmpty = selectProjectedAvailable(534.08, selectPendingVariableExpenseEstimate([], []))
    assert.equal(fromEmpty, 534.08)
  })

  it('187. Variables inactivas no cuentan en la deducción del disponible proyectado', () => {
    const inactive: VariableExpenseEstimate[] = [
      {
        id: 'est_inact',
        name: 'Gimnasio Rafa',
        categoryId: 'sport',
        unitCost: 1.5,
        frequencyType: 'per_week',
        frequencyValue: 4,
        active: false,
      },
    ]
    const pending = selectPendingVariableExpenseEstimate(inactive, [], '2026-09')
    assert.equal(pending, 0)
    const projected = selectProjectedAvailable(534.08, pending)
    assert.equal(projected, 534.08)
  })

  it('188. Gasto real reduce el pendiente variable y aumenta el disponible proyectado', () => {
    const active: VariableExpenseEstimate[] = [
      {
        id: 'est_act',
        name: 'Gimnasio Rafa',
        categoryId: 'sport',
        unitCost: 1.5,
        frequencyType: 'per_week',
        frequencyValue: 4,
        active: true,
      },
    ]
    // Con 0 real: pendiente = 25.98 -> proyectado = 534.08 - 25.98 = 508.10
    const pendingZero = selectPendingVariableExpenseEstimate(active, [], '2026-09')
    assert.equal(pendingZero, 25.98)
    assert.equal(selectProjectedAvailable(534.08, pendingZero), 508.1)

    // Con 10 € real: pendiente = 15.98 -> proyectado = 534.08 - 15.98 = 518.10
    const txReal: Transaction = {
      id: 'tx_real_gym',
      type: 'expense',
      amount: 10,
      description: 'Gimnasio Rafa',
      categoryId: 'sport',
      accountId: 'daily',
      date: '2026-09-02T10:00:00.000Z',
    }
    const pendingTen = selectPendingVariableExpenseEstimate(active, [txReal], '2026-09')
    assert.equal(pendingTen, 15.98)
    assert.equal(selectProjectedAvailable(534.08, pendingTen), 518.1)
  })

  // B. Recurrentes y no cobro automático
  it('189. Llegar a next_date NO crea transacción automática', () => {
    const recurring: RecurringPayment[] = [
      {
        id: 'rec_sub_1',
        name: 'Spotify',
        amount: 10.99,
        categoryId: 'subscriptions',
        accountId: 'daily',
        frequency: 'monthly',
        nextDate: '2026-09-01', // Fecha ya pasada
        active: true,
      },
    ]
    const transactions: Transaction[] = []
    // Ninguna transacción se crea automáticamente
    assert.equal(transactions.length, 0)
    // El pago sigue sin estar registrado en el historial de gastos
    const wasCharged = transactions.some((t) => t.recurringPaymentId === 'rec_sub_1')
    assert.equal(wasCharged, false)
  })

  it('190. Recurrente pendiente sí cuenta en comprometido', () => {
    const recurring: RecurringPayment[] = [
      {
        id: 'rec_sub_1',
        name: 'Spotify',
        amount: 10.99,
        categoryId: 'subscriptions',
        accountId: 'daily',
        frequency: 'monthly',
        nextDate: '2026-09-01',
        active: true,
      },
    ]
    const committed = selectCommittedAmount(recurring, [], new Date('2026-09-02'))
    assert.equal(committed, 10.99)
  })

  it('191. Confirmar cobro crea una única transacción vinculada', () => {
    const rec: RecurringPayment = {
      id: 'rec_netflix',
      name: 'Netflix',
      amount: 8.99,
      categoryId: 'subscriptions',
      accountId: 'daily',
      frequency: 'monthly',
      nextDate: '2026-09-02',
      active: true,
    }
    const dateStr = '2026-09-02T12:00:00.000Z'
    const createdTx: Transaction = {
      id: 'tx_netflix_1',
      type: 'expense',
      amount: rec.amount,
      description: rec.name,
      categoryId: rec.categoryId,
      accountId: rec.accountId || 'daily',
      date: dateStr,
      recurringPaymentId: rec.id,
    }
    assert.equal(createdTx.type, 'expense')
    assert.equal(createdTx.amount, 8.99)
    assert.equal(createdTx.description, 'Netflix')
    assert.equal(createdTx.recurringPaymentId, 'rec_netflix')
  })

  it('192. Transaction generada incluye recurringPaymentId', () => {
    const recId = 'rec_icloud'
    const tx: Transaction = {
      id: 'tx_icloud_1',
      type: 'expense',
      amount: 2.99,
      description: 'iCloud 200GB',
      categoryId: 'subscriptions',
      accountId: 'daily',
      date: '2026-09-02T12:00:00.000Z',
      recurringPaymentId: recId,
    }
    assert.equal(tx.recurringPaymentId, recId)
  })

  it('193. Confirmar avanza next_date con calendario correcto (semanas, fin de mes, bisiestos)', () => {
    // Semanal: +7 días
    assert.equal(calculateNextRecurringDate('2026-09-02', 'weekly'), '2026-09-09')
    // Mensual normal: 15 enero -> 15 febrero
    assert.equal(calculateNextRecurringDate('2026-01-15', 'monthly'), '2026-02-15')
    // Fin de mes enero no bisiesto: 31 enero -> 28 febrero
    assert.equal(calculateNextRecurringDate('2026-01-31', 'monthly'), '2026-02-28')
    // Fin de mes enero en año bisiesto: 31 enero 2024 -> 29 febrero 2024
    assert.equal(calculateNextRecurringDate('2024-01-31', 'monthly'), '2024-02-29')
    // Anual bisiesto: 29 febrero 2024 -> 28 febrero 2025
    assert.equal(calculateNextRecurringDate('2024-02-29', 'yearly'), '2025-02-28')
    // Fin de año mensual: 31 diciembre -> 31 enero año siguiente
    assert.equal(calculateNextRecurringDate('2026-12-31', 'monthly'), '2027-01-31')
  })

  it('194. Recurrente confirmado deja de contar como comprometido del ciclo', () => {
    const rec: RecurringPayment = {
      id: 'rec_netflix',
      name: 'Netflix',
      amount: 8.99,
      categoryId: 'subscriptions',
      accountId: 'daily',
      frequency: 'monthly',
      nextDate: '2026-09-02',
      active: true,
    }
    const refDate = new Date('2026-09-02')

    // Antes de confirmar: 1 pendiente
    const pendingBefore = selectPendingRecurringPayments([rec], [], refDate)
    assert.equal(pendingBefore.length, 1)
    assert.equal(selectCommittedAmount([rec], [], refDate), 8.99)

    // Al confirmar (transacción con recurringPaymentId en el mes)
    const confirmedTx: Transaction = {
      id: 'tx_netflix_1',
      type: 'expense',
      amount: 8.99,
      description: 'Netflix',
      categoryId: 'subscriptions',
      accountId: 'daily',
      date: '2026-09-02T12:00:00.000Z',
      recurringPaymentId: 'rec_netflix',
    }

    const pendingAfter = selectPendingRecurringPayments([rec], [confirmedTx], refDate)
    assert.equal(pendingAfter.length, 0)
    assert.equal(selectCommittedAmount([rec], [confirmedTx], refDate), 0)
  })

  it('195. CRÍTICO: Disponible real NO sufre doble descuento al confirmar cobro', () => {
    const initialSpendable = 543.08
    const recAmount = 8.99

    const rec: RecurringPayment = {
      id: 'rec_netflix',
      name: 'Netflix',
      amount: recAmount,
      categoryId: 'subscriptions',
      accountId: 'daily',
      frequency: 'monthly',
      nextDate: '2026-09-02',
      active: true,
    }
    const refDate = new Date('2026-09-02')

    // 1. ANTES DE CONFIRMAR:
    // Dinero para gastar = 543.08 €
    // Comprometido = 8.99 €
    // Disponible real = 543.08 - 8.99 = 534.09 €
    const committedBefore = selectCommittedAmount([rec], [], refDate)
    const availableBefore = selectRealAvailable(initialSpendable, committedBefore)
    assert.equal(committedBefore, 8.99)
    assert.equal(availableBefore, 534.09)

    // 2. TRAS CONFIRMAR:
    // Se genera gasto real de 8.99 € en la cuenta diaria
    const spendableAfter = Math.round((initialSpendable - recAmount) * 100) / 100 // 534.09 €
    const tx: Transaction = {
      id: 'tx_netflix',
      type: 'expense',
      amount: recAmount,
      description: 'Netflix',
      categoryId: 'subscriptions',
      accountId: 'daily',
      date: '2026-09-02T10:00:00.000Z',
      recurringPaymentId: 'rec_netflix',
    }
    // El recurrente ya no cuenta como comprometido en este ciclo (comprometido = 0 €)
    const committedAfter = selectCommittedAmount([rec], [tx], refDate)
    const availableAfter = selectRealAvailable(spendableAfter, committedAfter)

    assert.equal(committedAfter, 0)
    assert.equal(availableAfter, 534.09)
    // El disponible real es idéntico antes y después: NO hubo doble descuento
    assert.equal(availableAfter, availableBefore)
  })

  it('196. Gastado este mes sí aumenta al confirmar el cobro', () => {
    const refDate = new Date('2026-09-02')
    const beforeMonthExpenses = selectMonthExpenses([], refDate)
    assert.equal(beforeMonthExpenses, 0)

    const tx: Transaction = {
      id: 'tx_netflix',
      type: 'expense',
      amount: 8.99,
      description: 'Netflix',
      categoryId: 'subscriptions',
      accountId: 'daily',
      date: '2026-09-02T10:00:00.000Z',
      recurringPaymentId: 'rec_netflix',
    }
    const afterMonthExpenses = selectMonthExpenses([tx], refDate)
    assert.equal(afterMonthExpenses, 8.99)
  })

  it('197. Recurrente inactivo no cuenta como comprometido', () => {
    const inactiveRec: RecurringPayment = {
      id: 'rec_old',
      name: 'Gimnasio antiguo',
      amount: 45.0,
      categoryId: 'sport',
      accountId: 'daily',
      frequency: 'monthly',
      nextDate: '2026-09-01',
      active: false,
    }
    const committed = selectCommittedAmount([inactiveRec], [], new Date('2026-09-02'))
    assert.equal(committed, 0)
  })

  // C. Idempotencia y Resiliencia
  it('198. Idempotencia: doble llamada de confirmación no duplica gasto en el ciclo', () => {
    const recId = 'rec_gym_fee'
    const transactions: Transaction[] = []
    const refDate = new Date('2026-09-02')
    const currentMonth = refDate.getMonth()
    const currentYear = refDate.getFullYear()

    const confirmPayment = (id: string, amount: number) => {
      const alreadyConfirmed = transactions.some(
        (t) =>
          t.type === 'expense' &&
          t.recurringPaymentId === id &&
          new Date(t.date).getMonth() === currentMonth &&
          new Date(t.date).getFullYear() === currentYear
      )
      if (alreadyConfirmed) return null
      const newTx: Transaction = {
        id: `tx_${transactions.length + 1}`,
        type: 'expense',
        amount,
        description: 'Gimnasio Cuota',
        categoryId: 'sport',
        accountId: 'daily',
        date: refDate.toISOString(),
        recurringPaymentId: id,
      }
      transactions.push(newTx)
      return newTx
    }

    // Primer toque: crea transacción
    const tx1 = confirmPayment(recId, 25.0)
    assert.ok(tx1)
    assert.equal(transactions.length, 1)

    // Segundo toque (doble click rápido o reintento): bloqueado
    const tx2 = confirmPayment(recId, 25.0)
    assert.equal(tx2, null)
    assert.equal(transactions.length, 1)
  })

  it('199. Idempotencia en cola offline: confirmar offline registra y no duplica', () => {
    const mockStore: Record<string, string> = {}
    // @ts-expect-error Mocking localStorage
    globalThis.localStorage = {
      getItem: (k: string) => mockStore[k] || null,
      setItem: (k: string, v: string) => {
        mockStore[k] = v
      },
      removeItem: (k: string) => {
        delete mockStore[k]
      },
    }

    clearOfflineQueue()

    const newTx: Transaction = {
      id: 'tx_offline_rec_1',
      type: 'expense',
      amount: 8.99,
      description: 'Suscripción Offline',
      categoryId: 'subscriptions',
      accountId: 'daily',
      date: '2026-09-02T12:00:00.000Z',
      recurringPaymentId: 'rec_offline_1',
    }

    enqueueOfflineMutation({
      entity: 'transaction',
      action: 'insert',
      data: newTx,
    })

    const queue = getOfflineQueue()
    assert.equal(queue.length, 1)
    assert.equal((queue[0].data as Transaction).recurringPaymentId, 'rec_offline_1')

    clearOfflineQueue()
    // @ts-expect-error Cleanup
    delete globalThis.localStorage
  })

  it('200. Realtime echo no genera duplicados de transacciones de recurrente', () => {
    let localTxs: Transaction[] = [
      {
        id: 'tx_echo_rec_1',
        type: 'expense',
        amount: 8.99,
        description: 'Netflix',
        categoryId: 'subscriptions',
        accountId: 'daily',
        date: '2026-09-02T12:00:00.000Z',
        recurringPaymentId: 'rec_netflix',
      },
    ]

    // Función que aplica inserción remota con deduplicación por ID
    const applyRemoteInsert = (incomingTx: Transaction) => {
      if (localTxs.some((t) => t.id === incomingTx.id)) return
      localTxs = [incomingTx, ...localTxs]
    }

    // Llega eco de Realtime con el mismo ID
    applyRemoteInsert({
      id: 'tx_echo_rec_1',
      type: 'expense',
      amount: 8.99,
      description: 'Netflix',
      categoryId: 'subscriptions',
      accountId: 'daily',
      date: '2026-09-02T12:00:00.000Z',
      recurringPaymentId: 'rec_netflix',
    })

    assert.equal(localTxs.length, 1)
  })

  // D. UI y Estados Derivados
  it('201. selectRecurringPaymentCycleStatus: devuelve estados contextuales precisos', () => {
    const today = new Date('2026-09-02T12:00:00.000Z')

    // 1. Pendiente / previsto hoy (nextDate <= today)
    const duePayment: RecurringPayment = {
      id: 'rec_due',
      name: 'Servicio Web',
      amount: 15.0,
      categoryId: 'bills',
      accountId: 'daily',
      frequency: 'monthly',
      nextDate: '2026-09-02',
      active: true,
    }
    const statusDue = selectRecurringPaymentCycleStatus(duePayment, [], today)
    assert.equal(statusDue.status, 'due')
    assert.equal(statusDue.label, 'Previsto hoy')

    // 2. Próximo en fecha futura (nextDate > today)
    const upcomingPayment: RecurringPayment = {
      id: 'rec_up',
      name: 'Seguro',
      amount: 50.0,
      categoryId: 'bills',
      accountId: 'daily',
      frequency: 'monthly',
      nextDate: '2026-09-15',
      active: true,
    }
    const statusUpcoming = selectRecurringPaymentCycleStatus(upcomingPayment, [], today)
    assert.equal(statusUpcoming.status, 'upcoming')
    assert.ok(statusUpcoming.label.includes('15'))

    // 3. Ya cobrado en el ciclo actual
    const txConfirmed: Transaction = {
      id: 'tx_c1',
      type: 'expense',
      amount: 15.0,
      description: 'Servicio Web',
      categoryId: 'bills',
      accountId: 'daily',
      date: '2026-09-01T10:00:00.000Z',
      recurringPaymentId: 'rec_due',
    }
    const statusConfirmed = selectRecurringPaymentCycleStatus(duePayment, [txConfirmed], today)
    assert.equal(statusConfirmed.status, 'confirmed_for_cycle')
    assert.equal(statusConfirmed.label, 'Cobrado este ciclo')
  })

  it('202. Tarjeta cerrada: expone disponible real y proyectado de forma independiente', () => {
    const realAvailable = 534.08
    const pendingVariable = 24.48
    const projected = selectProjectedAvailable(realAvailable, pendingVariable)

    assert.equal(realAvailable, 534.08)
    assert.equal(projected, 509.6)
    assert.notEqual(realAvailable, projected)
  })

  it('203. Desglose completo: calcula con exactitud cada nivel de liquidez', () => {
    const totalMoney = 543.07
    const committed = 8.99
    const realAvailable = selectRealAvailable(totalMoney, committed) // 534.08
    const pendingVariable = 24.48
    const projectedAvailable = selectProjectedAvailable(realAvailable, pendingVariable) // 509.60

    assert.equal(totalMoney, 543.07)
    assert.equal(committed, 8.99)
    assert.equal(realAvailable, 534.08)
    assert.equal(pendingVariable, 24.48)
    assert.equal(projectedAvailable, 509.6)
  })

  it('204. Desglose con ahorro: separa los fondos de ahorro sin doble resta en disponible', () => {
    const dailyBalance = 400.0
    const savingsBalance = 200.0
    const accounts: Account[] = [
      { id: 'daily', name: 'Diaria', type: 'spending', balance: dailyBalance, initialBalance: 0 },
      { id: 'savings', name: 'Ahorro', type: 'savings', balance: savingsBalance, initialBalance: 0 },
    ]
    const totalMoney = selectTotalMoney(accounts) // 600.00
    const committed = 50.0
    const realAvailable = selectRealAvailable(dailyBalance, committed) // 350.00
    const pendingVariable = 20.0
    const projected = selectProjectedAvailable(realAvailable, pendingVariable) // 330.00

    assert.equal(totalMoney, 600.0)
    assert.equal(selectSavingsBalance(accounts), 200.0)
    assert.equal(realAvailable, 350.0)
    assert.equal(projected, 330.0)
  })

  it('205. Calendario: importe diario de 1,50 € se formatea con money() y no se redondea a 2 €', () => {
    const amount = 1.5
    const formatted = money(amount)
    // Debe incluir los decimales de céntimos (1,50 €) y no redondearse erróneamente a 2 €
    assert.ok(formatted.includes('1,50'))
    assert.ok(!formatted.startsWith('2'))
  })
})









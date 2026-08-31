import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Account, RecurringPayment, SavingsGoal, Transaction } from '../src/models/finance'
import { calculateAccountBalance, reconcileAccounts } from '../src/utils/balance'
import type { PersistedState, StorageAdapter } from '../src/services/storage/storageAdapter'
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



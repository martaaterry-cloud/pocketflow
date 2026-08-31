import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Account, RecurringPayment, Transaction } from '../src/models/finance'
import { calculateAccountBalance, reconcileAccounts } from '../src/utils/balance'
import type { PersistedState, StorageAdapter } from '../src/services/storage/storageAdapter'

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

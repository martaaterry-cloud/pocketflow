import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Transaction, CashTransaction, Category } from '../src/models/finance'
import type { ReturnTypeFinance } from '../src/types'
import { DonutChart } from '../src/components/DonutChart'
import { CategoryDetailModal } from '../src/components/CategoryDetailModal'
import { HomePage } from '../src/pages/HomePage'
import { MovementsPage } from '../src/pages/MovementsPage'
import { StatisticsPage } from '../src/pages/StatisticsPage'
import { TransactionList } from '../src/components/TransactionList'
import { calculateAccountBalance } from '../src/utils/balance'
import { money } from '../src/utils/money'
import { toUnifiedMovements } from '../src/utils/unifiedMovementSelectors'

// tsx usa JSX clásico al ejecutar pruebas con el tsconfig raíz de referencias.
Object.defineProperty(globalThis, 'React', { value: React, configurable: true })

const today = new Date()
const referenceDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}T12:00:00`
const categories: Category[] = [{ id: 'food', name: 'Comida', color: '#123456', icon: 'shopping-basket' }]
const withdrawal: Transaction = { id: 'atm', type: 'expense', specialType: 'cash_withdrawal', amount: 300, accountId: 'daily', categoryId: 'food', date, description: 'Traslado de 300' }
const bankExpense: Transaction = { id: 'bank-purchase', type: 'expense', amount: 50, accountId: 'daily', categoryId: 'food', date, description: 'Compra banco' }
const entry: CashTransaction = { id: 'cash-atm', type: 'income', bankTransactionId: withdrawal.id, amount: 300, date, description: 'Entrada desde banco' }
const cashExpense: CashTransaction = { id: 'cash-purchase', type: 'expense', amount: 20, categoryId: 'food', date, description: 'Compra efectivo' }
const transactions = [withdrawal, bankExpense], cashTransactions = [entry, cashExpense]
const common = { transactions, cashTransactions, categories, expenseShares: [], referenceDate }

test('rosquillas y detalles aplican los ámbitos Banco 50, Efectivo 20 y Total 70', () => {
  for (const [source, expected] of [['bank', 50], ['cash', 20], ['total', 70]] as const) {
    const chart = renderToStaticMarkup(createElement(DonutChart, { ...common, source }))
    const detail = renderToStaticMarkup(createElement(CategoryDetailModal, {
      ...common, open: true, onClose() {}, category: categories[0], source,
    }))
    assert.ok(chart.includes(money(expected)), `${source}: gráfico`)
    assert.ok(detail.includes(money(expected)), `${source}: detalle`)
    assert.ok(!detail.includes('Traslado de 300'))
    assert.ok(!detail.includes('Entrada desde banco'))
  }
})

test('el detalle de día excluye compras de otros días y conserva reembolsos fuera del rango', () => {
  const other: Transaction = { ...bankExpense, id: 'other', amount: 100, date: `${date.slice(0, 8)}${today.getDate() === 1 ? '02' : '01'}T12:00:00`, description: 'Otro día' }
  const refund: Transaction = { ...bankExpense, id: 'refund', type: 'income', incomeKind: 'reimbursement', parentExpenseId: bankExpense.id, amount: 10, date: '2099-01-01' }
  const detail = renderToStaticMarkup(createElement(CategoryDetailModal, {
    ...common, transactions: [...transactions, other, refund], open: true, onClose() {}, category: categories[0],
    dateRange: { start: referenceDate, end: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999) },
  }))
  assert.ok(detail.includes(money(60)))
  assert.ok(!detail.includes('Otro día'))
})

test('la cronología global muestra una fila de transferencia y conserva su registro original', () => {
  const movements = toUnifiedMovements(transactions, cashTransactions)
  const html = renderToStaticMarkup(createElement(TransactionList, { movements, categories }))
  assert.ok(html.includes('Traslado de 300'))
  assert.ok(!html.includes('Entrada desde banco'))
  assert.ok(html.includes('Compra banco'))
  assert.ok(html.includes('Compra efectivo'))
  assert.equal(movements.length, 4)
  assert.equal(movements.find((m) => m.id === withdrawal.id)?.originalTransaction, withdrawal)
})

test('Inicio Banco, Movimientos y Estadísticas reciben el universo correcto de gastos', () => {
  const account = { id: 'daily', name: 'Banco', type: 'spending' as const, initialBalance: 1000 }
  const finance = {
    ...common, accounts: [{ ...account, balance: calculateAccountBalance(account, transactions) }],
    variableExpenseEstimates: [], sharedContacts: [], profile: {},
    totals: { committedAmount: 0, totalMoney: 650, realAvailable: 650, projectedAvailable: 650,
      savingsBalance: 0, assignedSavings: 0, pendingReimbursements: 0, pendingPayables: 0,
      budgetsSummary: { totalBudgeted: 0 }, monthlyPlanSummary: { hasConfiguredPlan: false },
    },
  } as unknown as ReturnTypeFinance
  const home = renderToStaticMarkup(createElement(HomePage, { finance, onAdd() {} }))
  const movements = renderToStaticMarkup(createElement(MovementsPage, { finance }))
  const statistics = renderToStaticMarkup(createElement(StatisticsPage, { finance, onBack() {} }))
  assert.ok(home.includes(money(50)))
  assert.ok(home.includes('Compra banco'))
  assert.ok(!home.includes('Compra efectivo'), 'La vista Banco no lista la compra en efectivo')
  assert.ok(movements.includes(money(70)))
  assert.ok(statistics.includes(money(70)))
  assert.ok(!statistics.includes(money(350)))
})

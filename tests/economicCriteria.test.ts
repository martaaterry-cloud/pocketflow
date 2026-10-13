import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Transaction, CashTransaction, Account, Category, ExpenseShare } from '../src/models/finance'
import { selectGrossExpensesForPeriod, selectGrossExpensesByPaymentMethod, selectNetPersonalExpensesForPeriod, selectNetCashExpensesForPeriod, selectNetExpensesByCategory, selectRealIncome, selectReimbursementsReceived, selectDayNetFinanceStats, selectMonthDailyNetStats } from '../src/utils/sharedExpenseSelectors'
import { selectCashBalance, selectTotalEconomicConsumptionForPeriod } from '../src/utils/cashSelectors'
import { calculateAccountBalance } from '../src/utils/balance'
import { calculatePeriodStatistics, selectExpensesByNature } from '../src/utils/statisticsSelectors'
import { toUnifiedMovements, filterUnifiedMovements, collapseInternalTransfers, selectUnifiedMovementsForPeriod } from '../src/utils/unifiedMovementSelectors'
import { selectEconomicSummary, selectEconomicExpenses, selectIncomeCategoryBreakdown, selectCategoryMonthlyStats } from '../src/utils/sharedExpenseSelectors'

const ref = new Date(2026, 9, 13)
const date = '2026-10-13T12:00:00'
const bank: Transaction = { id: 'atm', type: 'expense', specialType: 'cash_withdrawal', amount: 300, accountId: 'daily', date, description: 'Traslado' }
const entry: CashTransaction = { id: 'cash-atm', type: 'income', bankTransactionId: bank.id, amount: 300, date, description: 'Traslado' }
const purchase: Transaction = { id: 'purchase', type: 'expense', amount: 50, accountId: 'daily', categoryId: 'food', date, description: 'Compra' }
const cashPurchase: CashTransaction = { id: 'cash-purchase', type: 'expense', amount: 20, categoryId: 'food', date, description: 'Compra efectivo' }
const categories: Category[] = [{ id: 'food', name: 'Comida', color: '#123456', icon: 'food' }]
const account: Account = { id: 'daily', name: 'Banco', type: 'spending', initialBalance: 1000 }
const deposit: Transaction = { id: 'deposit', type: 'income', incomeKind: 'reimbursement', specialType: 'reimbursement', amount: 300, accountId: 'daily', date, description: 'Traslado inverso' }
const cashDeposit: CashTransaction = { id: 'cash-deposit', type: 'expense', bankTransactionId: deposit.id, amount: 300, date, description: 'Traslado inverso' }

test('300 € Banco → Efectivo no son gasto ni ingreso ni reembolso', () => {
  assert.equal(selectNetPersonalExpensesForPeriod([bank], ref, 'month', [entry]), 0)
  assert.equal(selectGrossExpensesForPeriod([bank], ref, 'month', [entry]), 0)
  assert.equal(selectRealIncome([bank], ref, 'month', [entry]), 0)
  assert.equal(selectReimbursementsReceived([bank], ref, 'month', [entry]), 0)
  assert.equal(calculatePeriodStatistics([bank], categories, 'month', ref, [entry]).netExpenses, 0)
})

test('Banco 50 + Efectivo 20 = Total, categorías, estadísticas y serie 70', () => {
  const txs = [bank, purchase], cash = [entry, cashPurchase]
  assert.equal(selectNetPersonalExpensesForPeriod(txs, ref, 'month', cash), 50)
  assert.equal(selectNetCashExpensesForPeriod(cash, txs, ref), 20)
  assert.equal(selectTotalEconomicConsumptionForPeriod(txs, cash, ref).totalEconomicConsumption, 70)
  const stats = calculatePeriodStatistics(txs, categories, 'month', ref, cash)
  assert.equal(stats.expenses, 70)
  assert.equal(stats.netExpenses, 70)
  assert.equal(stats.timeSeries.reduce((s, p) => s + p.amount, 0), 70)
  assert.equal(selectNetExpensesByCategory(txs, categories, ref, 'month', cash).reduce((s, c) => s + c.amount, 0), 70)
  assert.equal(selectExpensesByNature(txs, 'month', ref, cash).total, 70)
  assert.equal(selectDayNetFinanceStats(txs, 2026, 9, 13, cash).netExpenses, 70)
  assert.equal(selectMonthDailyNetStats(txs, 2026, 9, cash).get(13)?.netExpenses, 70)
})

test('el bruto excluye retiradas incluso sin movimientos de efectivo', () => {
  assert.equal(selectGrossExpensesForPeriod([bank], ref), 0)
  assert.equal(selectGrossExpensesByPaymentMethod([bank], [], ref).total, 0)
  assert.equal(selectTotalEconomicConsumptionForPeriod([bank], [], ref).totalEconomicConsumption, 0)
})

test('300 € Efectivo → Banco tampoco son gasto ni reembolso', () => {
  assert.equal(selectNetCashExpensesForPeriod([cashDeposit], [deposit], ref), 0)
  assert.equal(selectGrossExpensesForPeriod([deposit], ref, 'month', [cashDeposit]), 0)
  assert.equal(selectReimbursementsReceived([deposit], ref, 'month', [cashDeposit]), 0)
  assert.equal(selectRealIncome([deposit], ref, 'month', [cashDeposit]), 0)
  assert.equal(selectTotalEconomicConsumptionForPeriod([deposit], [cashDeposit], ref).totalEconomicConsumption, 0)
})

test('un ingreso bancario enlazado desde efectivo sin etiqueta de reembolso sigue siendo traslado', () => {
  const income: Transaction = { ...deposit, incomeKind: 'income', specialType: 'normal' }
  assert.equal(selectRealIncome([income], ref, 'month', [cashDeposit]), 0)
  assert.equal(selectNetCashExpensesForPeriod([cashDeposit], [income], ref), 0)
})

test('estadísticas incluyen ingresos y reembolsos reales de ambos medios', () => {
  const income: Transaction = { ...purchase, id: 'salary', type: 'income', amount: 1000 }
  const cashIncome: CashTransaction = { ...entry, id: 'gift', amount: 40, bankTransactionId: undefined }
  const refund: Transaction = { ...income, id: 'refund', amount: 10, incomeKind: 'reimbursement', parentExpenseId: cashPurchase.id }
  const cashRefund: CashTransaction = { ...cashIncome, id: 'cash-refund', amount: 15, bankTransactionId: purchase.id }
  const txs = [bank, purchase, income, refund], cash = [entry, cashPurchase, cashIncome, cashRefund]
  const stats = calculatePeriodStatistics(txs, categories, 'month', ref, cash)
  assert.equal(stats.realIncome, 1040)
  assert.equal(stats.reimbursements, 25)
  assert.equal(stats.expenses, 70)
  assert.equal(stats.netExpenses, 45)
  assert.equal(stats.netFlow, 995)
})

test('un reembolso posterior reduce el gasto original, no el mes de cobro', () => {
  const refund: Transaction = { ...purchase, id: 'refund', type: 'income', incomeKind: 'reimbursement', parentExpenseId: purchase.id, amount: 10, date: '2026-11-01' }
  const txs = [purchase, refund]
  assert.equal(calculatePeriodStatistics(txs, categories, 'month', ref).netExpenses, 40)
  assert.equal(calculatePeriodStatistics(txs, categories, 'month', new Date(2026, 10, 1)).reimbursements, 10)
})

test('la fecha económica mantiene septiembre aunque el ISO cruce medianoche local', () => {
  const boundary: Transaction = { ...purchase, date: '2026-09-30T23:30:00Z' }
  assert.equal(calculatePeriodStatistics([boundary], categories, 'month', ref).netExpenses, 0)
  assert.equal(selectNetPersonalExpensesForPeriod([boundary], ref), 0)
  assert.equal(calculatePeriodStatistics([boundary], categories, 'month', new Date(2026, 8, 1)).netExpenses, 50)
})

test('cada periodo incorpora efectivo y excluye traslado y ajustes', () => {
  const adjustment: Transaction = { ...purchase, id: 'adjust', specialType: 'account_adjustment', amount: 100 }
  const cashAdjust: CashTransaction = { ...cashPurchase, id: 'cash-adjust', type: 'adjustment', amount: -10 }
  for (const period of ['day', 'week', 'month', 'year'] as const) {
    const stats = calculatePeriodStatistics([bank, purchase, adjustment], categories, period, ref, [entry, cashPurchase, cashAdjust])
    assert.equal(stats.netExpenses, 70, period)
    assert.equal(stats.categoryBreakdown.reduce((s, c) => s + c.amount, 0), 70, period)
    assert.equal(stats.timeSeries.reduce((s, p) => s + p.amount, 0), 70, period)
  }
})

test('los selectores no mutan registros, vínculos ni saldos', () => {
  const txs = [bank, purchase, deposit], cash = [entry, cashPurchase, cashDeposit]
  const snapshot = JSON.stringify({ txs, cash })
  const balance = calculateAccountBalance(account, txs), cashBalance = selectCashBalance(cash)
  for (const t of [...txs, ...cash]) Object.freeze(t)
  Object.freeze(txs); Object.freeze(cash)
  calculatePeriodStatistics(txs, categories, 'month', ref, cash)
  selectTotalEconomicConsumptionForPeriod(txs, cash, ref)
  selectNetExpensesByCategory(txs, categories, ref, 'month', cash)
  toUnifiedMovements(txs, cash)
  assert.equal(JSON.stringify({ txs, cash }), snapshot)
  assert.equal(calculateAccountBalance(account, txs), balance)
  assert.equal(selectCashBalance(cash), cashBalance)
  assert.equal(balance + cashBalance, 930)
  assert.equal(calculateAccountBalance(account, [bank]) + selectCashBalance([entry]), 1000)
})

test('el filtro de gastos excluye el depósito de efectivo, el de transferencias lo incluye', () => {
  const rows = toUnifiedMovements([deposit], [cashDeposit])
  assert.equal(filterUnifiedMovements(rows, categories, { type: 'expense' }).length, 0)
  assert.equal(filterUnifiedMovements(rows, categories, { type: 'income' }).length, 0)
  assert.equal(filterUnifiedMovements(rows, categories, { type: 'transfer', source: 'bank' }).length, 1)
  assert.equal(filterUnifiedMovements(rows, categories, { type: 'transfer', source: 'cash' }).length, 1)
})

test('Banco y Efectivo suman exactamente el resumen Total sin restar dos veces los 300', () => {
  const txs = [bank, purchase], cash = [entry, cashPurchase]
  const bankSummary = selectEconomicSummary(txs, cash, ref, 'month', [], 'bank')
  const cashSummary = selectEconomicSummary(txs, cash, ref, 'month', [], 'cash')
  const total = selectEconomicSummary(txs, cash, ref)
  assert.equal(total.netExpenses, bankSummary.netExpenses + cashSummary.netExpenses)
  assert.equal(total.grossExpenses, bankSummary.grossExpenses + cashSummary.grossExpenses)
  assert.equal(selectTotalEconomicConsumptionForPeriod(txs, cash, ref).linkedWithdrawalsDeducted, 0)
  assert.equal(selectTotalEconomicConsumptionForPeriod(txs, cash, ref).transferredToCash, 300)
})

test('deduplicar la vista global conserva las dos patas en las vistas de origen', () => {
  const txs = [bank, deposit], cash = [entry, cashDeposit]
  const rows = toUnifiedMovements(txs, cash)
  assert.equal(rows.length, 4)
  assert.equal(collapseInternalTransfers(rows).length, 2)
  assert.equal(collapseInternalTransfers(filterUnifiedMovements(rows, [], { source: 'cash' })).length, 2)
  assert.equal(collapseInternalTransfers(filterUnifiedMovements(rows, [], { source: 'bank' })).length, 2)
  assert.deepEqual(rows.map((r) => r.originalTransaction.id).sort(), [bank.id, entry.id, deposit.id, cashDeposit.id].sort())
  const sameAmount = { ...bank, id: 'second-atm' }
  assert.equal(collapseInternalTransfers(toUnifiedMovements([bank, sameAmount], [entry])).length, 2)
})

test('vínculos entre meses no pierden la pata que sí pertenece al periodo', () => {
  const previous: Transaction = { ...bank, date: '2026-09-30' }
  const rows = selectUnifiedMovementsForPeriod([previous], [entry], [], ref)
  assert.equal(collapseInternalTransfers(rows).length, 1)
  assert.equal(rows[0].id, entry.id)
  assert.equal(selectEconomicSummary([previous], [entry], ref).realIncome, 0)
  assert.equal(selectEconomicSummary([previous], [entry], ref).netExpenses, 0)
})

test('pagos por contacto y liquidaciones reales no se confunden con depósitos', () => {
  const paidByContact: Transaction = { ...purchase, id: 'shared', isShared: true, paidBy: 'contact', amount: 100 }
  const settlement: CashTransaction = { ...cashPurchase, id: 'settlement', bankTransactionId: paidByContact.id, amount: 25 }
  const summary = selectEconomicSummary([paidByContact], [settlement], ref)
  assert.equal(summary.grossExpenses, 25)
  assert.equal(summary.netExpenses, 25)
  assert.equal(selectEconomicExpenses([paidByContact], [settlement]).length, 1)
  assert.equal(collapseInternalTransfers(toUnifiedMovements([paidByContact], [settlement])).length, 2)
})

test('cuotas, sobrepagos y perdón mantienen el coste neto real en ambos medios', () => {
  const shared: CashTransaction = { ...cashPurchase, isShared: true, amount: 100 }
  const share: ExpenseShare = { id: 'share', expenseTransactionId: shared.id, participantName: 'Ana', contactId: 'ana', isPayerShare: false, expectedAmount: 30, forgivenAmount: 5 }
  const refund: Transaction = { ...deposit, id: 'shared-refund', amount: 50, parentExpenseId: shared.id, expenseShareId: share.id }
  const summary = selectEconomicSummary([refund], [shared], ref, 'month', [share])
  assert.equal(summary.grossExpenses, 100)
  assert.equal(summary.linkedReimbursements, 30)
  assert.equal(summary.netExpenses, 70)
  assert.equal(summary.reimbursements, 50)
  assert.equal(calculatePeriodStatistics([refund], categories, 'month', ref, [shared], [share]).netExpenses, 70)
  const forgiven = selectEconomicSummary([], [shared], ref, 'month', [share])
  assert.equal(forgiven.netExpenses, 100, 'El perdón no es dinero cobrado')
})

test('los detalles de categorías y de ingresos excluyen traslados en ambos sentidos', () => {
  const txs = [bank, purchase, deposit], cash = [entry, cashPurchase, cashDeposit]
  const detail = selectCategoryMonthlyStats('food', categories, txs, cash, [], ref)
  assert.equal(detail.currentMonthAmount, 70)
  assert.equal(detail.movements.reduce((sum, m) => sum + m.amount, 0), 70)
  const incomes = selectIncomeCategoryBreakdown(txs, categories, ref, 'month', cash)
  assert.equal(incomes.total, 0)
  assert.equal(incomes.movements.length, 0)
})

test('céntimos, categorías desconocidas y ajustes preservan los invariantes', () => {
  const txs: Transaction[] = [
    { ...purchase, id: 'cent-1', amount: 0.1, categoryId: 'unknown' },
    { ...purchase, id: 'cent-2', amount: 0.2, categoryId: 'unknown' },
    { ...deposit, id: 'adjustment', specialType: 'account_adjustment', incomeKind: 'income', amount: 20 },
  ]
  const summary = selectEconomicSummary(txs, [], ref)
  assert.equal(summary.netExpenses, 0.3)
  assert.equal(summary.realIncome, 0)
  assert.equal(summary.reimbursements, 0)
  assert.equal(selectNetExpensesByCategory(txs, [], ref)[0].amount, 0.3)
  const stats = calculatePeriodStatistics(txs, [], 'month', ref)
  assert.equal(stats.netExpenses, 0.3)
  assert.equal(stats.categoryBreakdown[0].amount, 0.3)
})

test('Banco incluye Bizum bancario en sus resúmenes y movimientos', () => {
  const bizum: Transaction = { ...purchase, id: 'bizum', paymentMethod: 'bizum', amount: 25 }
  const txs = [purchase, bizum]
  const rows = filterUnifiedMovements(toUnifiedMovements(txs, [cashPurchase]), [], { source: 'bank', type: 'expense' })
  assert.equal(rows.reduce((sum, m) => sum + m.amount, 0), 75)
  assert.equal(selectEconomicSummary(txs, [cashPurchase], ref, 'month', [], 'bank').netExpenses, 75)
  assert.equal(selectEconomicSummary(txs, [cashPurchase], ref, 'month', [], 'cash').netExpenses, 20)
})

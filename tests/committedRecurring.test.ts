import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { RecurringPayment, Transaction } from '../src/models/finance'
import {
  selectPendingRecurringPayments,
  selectCommittedAmount,
  selectRecurringUserCashOutflow,
  selectRecurringUserEconomicShare,
  selectRecurringExpectedReimbursement,
  getCoveredMonthKeysForRecurring,
} from '../src/utils/financeSelectors'

const october = new Date(2026, 9, 14)
const spotify: RecurringPayment = {
  id: 'spotify', name: 'Spotify', amount: 21, categoryId: 'subscriptions',
  accountId: 'daily', frequency: 'monthly', nextDate: '2026-09-19', active: true,
  type: 'expense', isShared: true, paidBy: 'contact', payerName: 'Andrés',
  sharingTemplate: {
    payer: 'contact', payerName: 'Andrés', includePayer: true, splitType: 'custom',
    participants: [{ name: 'Tú', amount: 3.5, isUserShare: true }],
  },
}
const chatgpt: RecurringPayment = {
  id: 'chatgpt', name: 'ChatGPT', amount: 23, categoryId: 'subscriptions',
  accountId: 'daily', frequency: 'monthly', nextDate: '2026-10-16', active: true,
  type: 'expense', isShared: true, paidBy: 'user',
  sharingTemplate: {
    payer: 'user', includePayer: true, splitType: 'equal',
    participants: [{ name: 'Pareja', amount: 11.5 }],
  },
}

test('Spotify: un Bizum de dos cuotas cubre septiembre y octubre; noviembre vuelve a vencer', () => {
  const movements: Transaction[] = [{
    id: 'spotify-sep', type: 'expense', amount: 7, accountId: 'daily',
    date: '2026-09-19', description: 'Spotify a Andrés', recurringPaymentId: 'spotify',
    paymentMethod: 'bizum',
  }]
  assert.deepEqual([...getCoveredMonthKeysForRecurring(spotify, movements)], ['2026-09', '2026-10'])
  assert.equal(selectPendingRecurringPayments([spotify], movements, october).length, 0)
  assert.equal(selectCommittedAmount([spotify], movements, october), 0)
  assert.equal(selectCommittedAmount([spotify], movements, new Date(2026, 10, 14)), 3.5)
})

test('Spotify: fecha futura no se incluye aunque no haya transacciones vinculadas', () => {
  const future = { ...spotify, nextDate: '2026-11-19' }
  assert.equal(selectCommittedAmount([future], [], october), 0)
  assert.equal(selectPendingRecurringPayments([future], [], new Date(2026, 10, 14)).length, 1)
})

test('ChatGPT: se comprometen 23 euros de liquidez, no solo los 11,50 de coste personal', () => {
  assert.equal(selectRecurringUserCashOutflow(chatgpt), 23)
  assert.equal(selectRecurringUserEconomicShare(chatgpt), 11.5)
  assert.equal(selectRecurringExpectedReimbursement(chatgpt), 11.5)
  assert.equal(selectCommittedAmount([chatgpt], [], october), 23)
})

test('Recurrentes: no alterar los cálculos de la cuenta ni contar cuotas ya pagadas', () => {
  const paid: Transaction[] = [{
    id: 'chatgpt-oct', type: 'expense', amount: 23, accountId: 'daily',
    date: '2026-10-16', description: 'ChatGPT', recurringPaymentId: 'chatgpt',
  }]
  assert.equal(selectCommittedAmount([chatgpt], paid, october), 0)
  assert.equal(selectRecurringUserCashOutflow(spotify), 3.5)
})

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Account, Transaction } from '../src/models/finance'

// Mirror/test the balance adjustment domain logic
function adjustAccountBalance(
  accounts: Account[],
  transaction: Pick<Transaction, 'type' | 'amount' | 'accountId' | 'toAccountId'>,
  direction: 1 | -1
): Account[] {
  const { type, amount, accountId, toAccountId } = transaction
  const signedAmount = amount * direction

  return accounts.map((acc) => {
    if (type === 'expense' && acc.id === accountId) {
      return { ...acc, balance: acc.balance - signedAmount }
    }
    if (type === 'income' && acc.id === accountId) {
      return { ...acc, balance: acc.balance + signedAmount }
    }
    if (type === 'transfer') {
      if (acc.id === accountId) {
        return { ...acc, balance: acc.balance - signedAmount }
      }
      if (acc.id === toAccountId) {
        return { ...acc, balance: acc.balance + signedAmount }
      }
    }
    return acc
  })
}

describe('Domain Logic - Reglas Financieras y Balances', () => {
  const initialAccounts: Account[] = [
    { id: 'daily', name: 'Cuenta diaria', type: 'spending', balance: 500 },
    { id: 'savings', name: 'Ahorro', type: 'savings', balance: 1000 },
  ]

  it('1. Registrar un gasto deduce saldo de la cuenta correspondiente', () => {
    const tx: Transaction = {
      id: 'tx1',
      type: 'expense',
      amount: 50,
      accountId: 'daily',
      description: 'Supermercado',
      date: new Date().toISOString(),
    }
    const updated = adjustAccountBalance(initialAccounts, tx, 1)
    const daily = updated.find((a) => a.id === 'daily')!
    const savings = updated.find((a) => a.id === 'savings')!

    assert.equal(daily.balance, 450)
    assert.equal(savings.balance, 1000)
  })

  it('2. Registrar un ingreso aumenta saldo de la cuenta', () => {
    const tx: Transaction = {
      id: 'tx2',
      type: 'income',
      amount: 1200,
      accountId: 'daily',
      description: 'Nómina',
      date: new Date().toISOString(),
    }
    const updated = adjustAccountBalance(initialAccounts, tx, 1)
    const daily = updated.find((a) => a.id === 'daily')!

    assert.equal(daily.balance, 1700)
  })

  it('3. Las transferencias entre cuentas mueven fondos sin alterar el patrimonio total', () => {
    const tx: Transaction = {
      id: 'tx3',
      type: 'transfer',
      amount: 200,
      accountId: 'daily',
      toAccountId: 'savings',
      description: 'Ahorro mensual',
      date: new Date().toISOString(),
    }
    const updated = adjustAccountBalance(initialAccounts, tx, 1)
    const daily = updated.find((a) => a.id === 'daily')!
    const savings = updated.find((a) => a.id === 'savings')!

    assert.equal(daily.balance, 300)
    assert.equal(savings.balance, 1200)
    assert.equal(daily.balance + savings.balance, 1500) // Total patrimonio se mantiene intacto
  })

  it('4. Eliminar una transacción revierte el saldo exactamente a su estado previo', () => {
    const tx: Transaction = {
      id: 'tx4',
      type: 'expense',
      amount: 75.5,
      accountId: 'daily',
      description: 'Cena',
      date: new Date().toISOString(),
    }
    // Aplicar gasto
    const afterExpense = adjustAccountBalance(initialAccounts, tx, 1)
    assert.equal(afterExpense.find((a) => a.id === 'daily')!.balance, 424.5)

    // Revertir (eliminar)
    const afterDelete = adjustAccountBalance(afterExpense, tx, -1)
    assert.equal(afterDelete.find((a) => a.id === 'daily')!.balance, 500)
  })

  it('5. Editar una transacción (cambio de importe o cuenta) actualiza el saldo sin desajustes', () => {
    const originalTx: Transaction = {
      id: 'tx5',
      type: 'expense',
      amount: 40,
      accountId: 'daily',
      description: 'Ropa',
      date: new Date().toISOString(),
    }
    const stateWithTx = adjustAccountBalance(initialAccounts, originalTx, 1)
    assert.equal(stateWithTx.find((a) => a.id === 'daily')!.balance, 460)

    // Editamos: el importe real era 60 en vez de 40
    const editedTx: Transaction = {
      ...originalTx,
      amount: 60,
    }

    // 1) Revertir original
    const reverted = adjustAccountBalance(stateWithTx, originalTx, -1)
    // 2) Aplicar editada
    const finalAccounts = adjustAccountBalance(reverted, editedTx, 1)

    assert.equal(finalAccounts.find((a) => a.id === 'daily')!.balance, 440)
  })

  it('6. Transferencias nunca deben sumarse a gastos del mes', () => {
    const txs: Transaction[] = [
      { id: '1', type: 'expense', amount: 30, accountId: 'daily', description: 'Gasto 1', date: new Date().toISOString() },
      { id: '2', type: 'transfer', amount: 500, accountId: 'daily', toAccountId: 'savings', description: 'Traspaso', date: new Date().toISOString() },
      { id: '3', type: 'income', amount: 1000, accountId: 'daily', description: 'Ingreso', date: new Date().toISOString() },
    ]

    const monthExpenses = txs
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0)

    assert.equal(monthExpenses, 30) // Solo los gastos de tipo 'expense'
  })
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PayrollPage } from '../src/pages/PayrollPage'
import type { PayrollState } from '../src/hooks/usePayroll'
import { projectPayrollMonths, type PayrollEvent } from '../src/models/payroll'

Object.defineProperty(globalThis, 'React', { value: React, configurable: true })
const salary: PayrollEvent = { id: '11111111-1111-4111-8111-111111111111', userId: '22222222-2222-4222-8222-222222222222',
  kind: 'save', month: '2026-09', values: { month: '2026-09', gross: 1000, socialSecurity: 65, irpf: 10, net: 835 },
  clientCreatedAt: '2026-10-13T12:00:00Z', sequence: 1, createdAt: '2026-10-13T12:00:00Z' }
const state = (overrides: Partial<PayrollState> = {}): PayrollState => ({ userId: salary.userId, ready: true, months: projectPayrollMonths([salary]),
  pending: 0, migrationIssues: 0, status: 'synced', error: null, save() {}, remove() {}, sync: async () => {}, ...overrides })

test('Nóminas muestra el estado confirmado y no afirma que genera ingresos o movimientos', () => {
  const html = renderToStaticMarkup(React.createElement(PayrollPage, { onBack() {}, payroll: state() }))
  assert.ok(html.includes('Nóminas sincronizadas'))
  assert.ok(html.includes('835,00'))
  assert.ok(html.includes('No crea movimientos bancarios ni modifica saldos o ingresos'))
  assert.ok(!html.includes('Guardado solo en este dispositivo'))
})

test('fallo remoto muestra datos locales, pendientes y aviso; nunca anuncia sincronizado', () => {
  const html = renderToStaticMarkup(React.createElement(PayrollPage, { onBack() {}, payroll: state({ pending: 1, status: 'error', error: 'No se pudo sincronizar.' }) }))
  assert.ok(html.includes('835,00'))
  assert.ok(html.includes('pendientes de sincronizar'))
  assert.ok(html.includes('No se pudo sincronizar'))
  assert.ok(!html.includes('Nóminas sincronizadas'))
})

test('las versiones antiguas y la eliminación se presentan sin duplicar el historial mensual', () => {
  const deleted: PayrollEvent = { ...salary, id: '33333333-3333-4333-8333-333333333333', kind: 'delete', values: null, sequence: 2 }
  const html = renderToStaticMarkup(React.createElement(PayrollPage, { onBack() {}, payroll: state({ months: projectPayrollMonths([salary, deleted]) }) }))
  assert.ok(html.includes('Aún no has guardado nóminas'))
  assert.ok(html.includes('Versiones conservadas'))
  assert.ok(html.includes('Eliminada'))
  assert.ok(html.includes('Recuperar'))
})

test('carga o sesión sin datos mantiene deshabilitado el guardado y no muestra nóminas anteriores', () => {
  const html = renderToStaticMarkup(React.createElement(PayrollPage, { onBack() {}, payroll: state({ ready: false, months: [], status: 'loading' }) }))
  assert.ok(html.includes('disabled=""'))
  assert.ok(!html.includes('835,00'))
  assert.ok(html.includes('Cargando nóminas'))
})

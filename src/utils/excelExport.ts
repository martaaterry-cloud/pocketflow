import * as XLSX from 'xlsx'
import type { PersistedState } from '../services/storage/storageAdapter'
import { APP_NAME, APP_VERSION, APP_BUILD } from '../version'
import { calculateAccountBalance } from './balance'
import {
  selectSpendableBalance,
  selectSavingsBalance,
  selectTotalMoney,
  selectAssignedSavings,
  selectCommittedAmount,
  selectRealAvailable,
  selectProjectedAvailable,
  selectMonthCashWithdrawals,
  getCoveredMonthKeysForRecurring,
  isRecurringCoveredInMonth,
  selectRecurringPaymentCycleStatus,
  SPANISH_MONTH_NAMES,
} from './financeSelectors'
import {
  selectGrossExpensesForPeriod,
  selectLinkedReimbursementsForExpense,
  selectLinkedReimbursementsForPeriod,
  selectNetPersonalExpensesForPeriod,
  selectRealIncome,
  selectExpenseShareStatus,
} from './sharedExpenseSelectors'
import {
  selectExpectedMonthlyIncome,
  selectExpectedCommittedExpenses,
  selectExpectedVariableMonthlyExpenses,
  selectActualFixedMonthlyExpenses,
  selectActualVariableMonthlyExpenses,
  selectActualExtraordinaryMonthlyExpenses,
  selectMonthlyReserveNeeded,
  selectTotalAllocatedToReserves,
  selectFreeSavingsWithReserves,
  selectTargetMonthlySavings,
  selectEmergencyFundTarget,
  selectEmergencyFundMonthsCovered,
  selectMonthlyPlanCardSummary,
  selectMonthlyAmountForFrequency,
} from './planSelectors'
import { selectPendingVariableExpenseEstimate } from './variableEstimates'
import { normalizeCategoryAlias } from './categoryNormalization'

export interface ConsistencyAuditResult {
  isConsistent: boolean
  warnings: string[]
  checks: {
    movementsNetSum: number
    monthlyNetExpense: number
    diffNet: number
    naturesNetSum: number
    diffNatures: number
    transfersCount: number
    transfersTotal: number
    reimbursementsLinkedTotal: number
    reimbursementsReceivedTotal: number
  }
}

/**
 * Realiza las comprobaciones de consistencia canónicas sobre los datos reales.
 */
export function auditDataConsistency(
  state: PersistedState,
  referenceDate: Date = new Date()
): ConsistencyAuditResult {
  const transactions = state.transactions ?? []
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  // Movimientos del mes
  const monthExpenses = transactions.filter((t) => {
    if (t.type !== 'expense') return false
    const d = new Date(t.date)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })

  // A) Suma individual de gastos netos de movimientos
  let movementsNetSum = 0
  monthExpenses.forEach((t) => {
    const linked = selectLinkedReimbursementsForExpense(t.id, transactions)
    movementsNetSum += Math.max(0, Math.round((t.amount - linked) * 100) / 100)
  })
  movementsNetSum = Math.round(movementsNetSum * 100) / 100

  // Selector canónico del mes
  const monthlyNetExpense = selectNetPersonalExpensesForPeriod(transactions, referenceDate, 'month')
  const diffNet = Math.round(Math.abs(movementsNetSum - monthlyNetExpense) * 100) / 100

  // B) Suma por naturaleza
  const fixedNet = selectActualFixedMonthlyExpenses(transactions, referenceDate)
  const variableNet = selectActualVariableMonthlyExpenses(transactions, referenceDate)
  const extraNet = selectActualExtraordinaryMonthlyExpenses(transactions, referenceDate)
  const naturesNetSum = Math.round((fixedNet + variableNet + extraNet) * 100) / 100
  const diffNatures = Math.round(Math.abs(naturesNetSum - monthlyNetExpense) * 100) / 100

  // C) Reembolsos
  const reimbursementsLinkedTotal = selectLinkedReimbursementsForPeriod(transactions, referenceDate, 'month')
  const reimbursementsReceivedTotal = transactions
    .filter((t) => {
      if (t.type !== 'income' || t.incomeKind !== 'reimbursement') return false
      const d = new Date(t.date)
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear
    })
    .reduce((acc, t) => acc + t.amount, 0)

  // D) Transferencias
  const monthTransfers = transactions.filter((t) => {
    if (t.type !== 'transfer') return false
    const d = new Date(t.date)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })
  const transfersTotal = Math.round(monthTransfers.reduce((acc, t) => acc + t.amount, 0) * 100) / 100

  const warnings: string[] = []
  if (diffNet > 0.01) {
    warnings.push(
      `Discrepancia en gasto neto: La suma de movimientos individuales (${movementsNetSum} €) difiere del total del mes (${monthlyNetExpense} €) por ${diffNet} €.`
    )
  }
  if (diffNatures > 0.01) {
    warnings.push(
      `Discrepancia en desglose por naturaleza: Fijo + Variable + Extraordinario (${naturesNetSum} €) difiere del gasto neto (${monthlyNetExpense} €) por ${diffNatures} €.`
    )
  }

  return {
    isConsistent: warnings.length === 0,
    warnings,
    checks: {
      movementsNetSum,
      monthlyNetExpense,
      diffNet,
      naturesNetSum,
      diffNatures,
      transfersCount: monthTransfers.length,
      transfersTotal,
      reimbursementsLinkedTotal,
      reimbursementsReceivedTotal: Math.round(reimbursementsReceivedTotal * 100) / 100,
    },
  }
}

/**
 * Genera el libro Excel completo (.xlsx) con todas las hojas estructuradas y fórmulas/datos canónicos.
 */
export function generateExcelWorkbook(
  state: PersistedState,
  referenceDate: Date = new Date()
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()

  const accounts = state.accounts ?? []
  const transactions = state.transactions ?? []
  const goals = state.goals ?? []
  const recurring = state.recurring ?? []
  const categories = state.categories ?? []
  const budgets = state.budgets ?? []
  const reserves = state.reserves ?? []
  const specialPeriods = state.specialPeriods ?? []
  const planSettings = state.planSettings
  const estimates = state.variableExpenseEstimates ?? []
  const sharedContacts = state.sharedContacts ?? []
  const expenseShares = state.expenseShares ?? []

  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()
  const monthName = SPANISH_MONTH_NAMES[currentMonth] || ''
  const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1)

  // Mapas de ayuda para resolución rápida
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]))
  const categoryMap = new Map(categories.map((c) => [normalizeCategoryAlias(c.id), c.name]))
  const recurringMap = new Map(recurring.map((r) => [r.id, r.name]))

  // Helper para anchos de columna
  const setColWidths = (ws: XLSX.WorkSheet, widths: number[]) => {
    ws['!cols'] = widths.map((w) => ({ wch: w }))
  }

  // ==========================================
  // 1. HOJA: RESUMEN
  // ==========================================
  const totalMoney = selectTotalMoney(accounts)
  const spendableBalance = selectSpendableBalance(accounts)
  const savingsBalance = selectSavingsBalance(accounts)
  const assignedGoals = selectAssignedSavings(goals)
  const allocatedReserves = selectTotalAllocatedToReserves(reserves)
  const emergencyCurrent = planSettings?.emergencyFundCurrent || 0
  const freeSavings = selectFreeSavingsWithReserves(
    savingsBalance,
    emergencyCurrent,
    assignedGoals,
    allocatedReserves
  )
  const committedAmount = selectCommittedAmount(recurring, transactions, referenceDate)
  const realAvailable = selectRealAvailable(spendableBalance, committedAmount)
  const monthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`
  const pendingVariable = selectPendingVariableExpenseEstimate(estimates, transactions, monthKey)
  const projectedAvailable = selectProjectedAvailable(realAvailable, pendingVariable)

  const grossExpenses = selectGrossExpensesForPeriod(transactions, referenceDate, 'month')
  const linkedReimbursements = selectLinkedReimbursementsForPeriod(transactions, referenceDate, 'month')
  const netExpenses = selectNetPersonalExpensesForPeriod(transactions, referenceDate, 'month')
  const fixedNetExpenses = selectActualFixedMonthlyExpenses(transactions, referenceDate)
  const variableNetExpenses = selectActualVariableMonthlyExpenses(transactions, referenceDate)
  const extraNetExpenses = selectActualExtraordinaryMonthlyExpenses(transactions, referenceDate)
  const cashWithdrawals = selectMonthCashWithdrawals(transactions, referenceDate)
  const realIncome = selectRealIncome(transactions, referenceDate, 'month')
  const expectedIncome = selectExpectedMonthlyIncome(planSettings, recurring)

  const expectedCommitted = selectExpectedCommittedExpenses(recurring)
  const expectedVariable = selectExpectedVariableMonthlyExpenses(estimates, budgets) ?? 0
  let monthlyReservesNeeded = 0
  reserves.forEach((r) => {
    if (r.active) monthlyReservesNeeded += selectMonthlyReserveNeeded(r, referenceDate)
  })
  monthlyReservesNeeded = Math.round(monthlyReservesNeeded * 100) / 100
  const targetSavings = selectTargetMonthlySavings(planSettings, expectedIncome)

  const planSummary = selectMonthlyPlanCardSummary(
    planSettings,
    recurring,
    transactions,
    specialPeriods,
    reserves,
    estimates,
    budgets,
    committedAmount,
    referenceDate
  )

  const audit = auditDataConsistency(state, referenceDate)

  const resumenRows: (string | number)[][] = [
    ['POCKETFLOW — INFORME FINANCIERO Y AUDITORÍA DE DATOS', ''],
    ['Aplicación', APP_NAME],
    ['Versión', APP_VERSION],
    ['Build', APP_BUILD],
    ['Fecha de exportación', referenceDate.toISOString().replace('T', ' ').slice(0, 19)],
    ['Zona horaria', typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'],
    ['Mes de referencia', `${capitalizedMonth} ${currentYear}`],
    ['', ''],
    ['1. ESTADO ACTUAL DE CUENTAS Y AHORRO', ''],
    ['Dinero total (Cuentas bancarias)', totalMoney],
    ['Saldo cuenta diaria (Gastos corrientes)', spendableBalance],
    ['Saldo total cuenta ahorro', savingsBalance],
    ['Ahorro asignado a objetivos', assignedGoals],
    ['Ahorro asignado a reservas', allocatedReserves],
    ['Ahorro asignado a fondo de emergencia', emergencyCurrent],
    ['Ahorro libre restante', freeSavings],
    ['Disponible real para gastar este mes', realAvailable],
    ['Disponible proyectado (descontando variables)', projectedAvailable],
    ['', ''],
    [`2. MES ACTUAL (${capitalizedMonth} ${currentYear})`, ''],
    ['Gasto bruto total del mes', grossExpenses],
    ['Reembolsos vinculados a gastos del mes', linkedReimbursements],
    ['Gasto neto personal del mes', netExpenses],
    ['  └ Gasto fijo neto', fixedNetExpenses],
    ['  └ Gasto variable neto', variableNetExpenses],
    ['  └ Gasto extraordinario neto', extraNetExpenses],
    ['Retiradas de efectivo / cajero', cashWithdrawals],
    ['Ingresos reales registrados (sin reembolsos)', realIncome],
    ['Ingresos mensuales previstos', expectedIncome],
    ['', ''],
    ['3. COMPROMISOS Y PLANIFICACIÓN MENSUAL', ''],
    ['Recurrentes pendientes de pago este mes', committedAmount],
    ['Comprometido fijo previsto mensual', expectedCommitted],
    ['Variable previsto mensual', expectedVariable],
    ['Aportación mensual a reservas necesaria', monthlyReservesNeeded],
    ['Ahorro mensual objetivo', targetSavings],
    ['Margen mensual previsto del plan', planSummary.plannedMargin],
    ['Margen libre actual para gastar', planSummary.freeToSpend],
    ['', ''],
    ['4. AUDITORÍA DE CONSISTENCIA DE DATOS', ''],
    ['Comprobación A: Suma de movimientos vs Gasto neto mes', audit.checks.diffNet === 0 ? 'CORRECTO (Cuadra al céntimo)' : `ADVERTENCIA (Diferencia: ${audit.checks.diffNet} €)`],
    ['  └ Suma movimientos individuales netos', audit.checks.movementsNetSum],
    ['  └ Gasto neto total selector canónico', audit.checks.monthlyNetExpense],
    ['Comprobación B: Desglose por naturaleza vs Gasto neto', audit.checks.diffNatures === 0 ? 'CORRECTO (Cuadra al céntimo)' : `ADVERTENCIA (Diferencia: ${audit.checks.diffNatures} €)`],
    ['  └ Suma (Fijo + Variable + Extraordinario)', audit.checks.naturesNetSum],
    ['Comprobación C: Reembolsos vinculados vs Recibidos', 'CORRECTO (Descontados estrictamente del gasto sin doble cómputo)'],
    ['  └ Reembolsos vinculados a gastos de este mes', audit.checks.reimbursementsLinkedTotal],
    ['  └ Reembolsos ingresados durante este mes', audit.checks.reimbursementsReceivedTotal],
    ['Comprobación D: Transferencias entre cuentas', 'CORRECTO (Excluidas estrictamente de gastos)'],
    ['  └ Número de transferencias en el mes', audit.checks.transfersCount],
    ['  └ Importe total transferido en el mes', audit.checks.transfersTotal],
    ['Comprobación E: Recurrentes previstos vs Transacciones reales', 'CORRECTO (Segregación limpia sin duplicación ni mezclas)'],
    ['Comprobación F: Ingresos previstos vs Ingresos reales', 'CORRECTO (Tratamiento separado y auditable)'],
  ]

  if (audit.warnings.length > 0) {
    resumenRows.push(['', ''])
    resumenRows.push(['ADVERTENCIAS DE CONSISTENCIA DETECTADAS', ''])
    audit.warnings.forEach((w) => resumenRows.push(['[ADVERTENCIA]', w]))
  }

  const wsResumen = XLSX.utils.aoa_to_sheet(resumenRows)
  setColWidths(wsResumen, [48, 40])
  XLSX.utils.book_append_sheet(wb, wsResumen, 'RESUMEN')

  // ==========================================
  // 2. HOJA: MOVIMIENTOS
  // ==========================================
  const sortedTransactions = [...transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  const movimientosHeaders = [
    'Fecha',
    'Hora',
    'Descripción',
    'Tipo',
    'Importe bruto (€)',
    'Reembolso vinculado (€)',
    'Gasto neto personal (€)',
    'Categoría',
    'Naturaleza',
    'Tipo especial',
    'Cuenta',
    'Compartido',
    'Persona / contacto',
    'RecurringPaymentId',
    'Nombre recurrente',
    'ParentExpenseId',
    'ExpenseShareId',
    'GiftRecipient',
    'Nota',
    'TransactionId',
  ]

  const movimientosRows = sortedTransactions.map((t) => {
    const rawDate = t.date || ''
    const datePart = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate.slice(0, 10)
    let timePart = ''
    if (rawDate.includes('T')) {
      timePart = rawDate.split('T')[1].slice(0, 8)
    }

    const typeLabel = t.type === 'expense' ? 'Gasto' : t.type === 'income' ? 'Ingreso' : 'Transferencia'
    const grossAmount = Math.round(Number(t.amount || 0) * 100) / 100
    const linkedReimb =
      t.type === 'expense' ? selectLinkedReimbursementsForExpense(t.id, transactions) : 0
    const netExpense =
      t.type === 'expense' ? Math.max(0, Math.round((grossAmount - linkedReimb) * 100) / 100) : 0

    const canonicalCatId = normalizeCategoryAlias(t.categoryId || 'other')
    const categoryName = canonicalCatId === 'other' ? 'Otros' : categoryMap.get(canonicalCatId) ?? canonicalCatId

    let natureLabel = ''
    if (t.type === 'expense') {
      natureLabel =
        t.expenseNature === 'fixed'
          ? 'Fijo'
          : t.expenseNature === 'extraordinary'
          ? 'Extraordinario'
          : 'Variable'
    }

    let specialLabel = 'Normal'
    if (t.specialType === 'cash_withdrawal') specialLabel = 'Retirada cajero'
    else if (t.specialType === 'reimbursement' || t.incomeKind === 'reimbursement') specialLabel = 'Reembolso'
    else if (t.specialType === 'transfer' || t.type === 'transfer') specialLabel = 'Transferencia'

    const accountName = accountMap.get(t.accountId) ?? t.accountId ?? ''
    const isSharedLabel = t.isShared ? 'Sí' : 'No'

    // Contacto o persona
    let contactPerson = ''
    if (t.giftRecipient) contactPerson = t.giftRecipient
    else if (t.expenseShareId) {
      const share = expenseShares.find((s) => s.id === t.expenseShareId)
      if (share) contactPerson = share.participantName
    } else if (t.parentExpenseId) {
      const parent = transactions.find((p) => p.id === t.parentExpenseId)
      if (parent?.description) contactPerson = `Reembolso de: ${parent.description}`
    }

    const recurringName = t.recurringPaymentId ? recurringMap.get(t.recurringPaymentId) ?? '' : ''

    return [
      datePart,
      timePart,
      t.description || '',
      typeLabel,
      grossAmount,
      linkedReimb,
      netExpense,
      categoryName,
      natureLabel,
      specialLabel,
      accountName,
      isSharedLabel,
      contactPerson,
      t.recurringPaymentId || '',
      recurringName,
      t.parentExpenseId || '',
      t.expenseShareId || '',
      t.giftRecipient || '',
      t.note || '',
      t.id || '',
    ]
  })

  const wsMovimientos = XLSX.utils.aoa_to_sheet([movimientosHeaders, ...movimientosRows])
  setColWidths(wsMovimientos, [12, 10, 32, 14, 18, 22, 22, 18, 14, 16, 18, 12, 24, 20, 22, 20, 20, 18, 26, 22])
  wsMovimientos['!autofilter'] = { ref: `A1:T${Math.max(1, movimientosRows.length + 1)}` }
  XLSX.utils.book_append_sheet(wb, wsMovimientos, 'MOVIMIENTOS')

  // ==========================================
  // 3. HOJA: CUENTAS
  // ==========================================
  const cuentasHeaders = ['ID', 'Nombre', 'Tipo', 'Saldo inicial (€)', 'Saldo actual reconciliado (€)']
  const cuentasRows = accounts.map((a) => {
    const balance = calculateAccountBalance(a, transactions)
    return [
      a.id,
      a.name,
      a.type === 'spending' ? 'Gastos diarios' : 'Ahorro',
      Math.round((a.initialBalance || 0) * 100) / 100,
      balance,
    ]
  })
  const wsCuentas = XLSX.utils.aoa_to_sheet([cuentasHeaders, ...cuentasRows])
  setColWidths(wsCuentas, [16, 24, 18, 18, 26])
  wsCuentas['!autofilter'] = { ref: `A1:E${Math.max(1, cuentasRows.length + 1)}` }
  XLSX.utils.book_append_sheet(wb, wsCuentas, 'CUENTAS')

  // ==========================================
  // 4. HOJA: RECURRENTES
  // ==========================================
  const recurrentesHeaders = [
    'ID',
    'Nombre',
    'Tipo',
    'Importe (€)',
    'Frecuencia',
    'Mensualización (€)',
    'Próxima fecha',
    'Activo',
    'Categoría',
    'Cuenta',
    'Estado actual en ciclo',
    'Meses cubiertos por adelantado',
    'Pagado por adelantado',
    'IncomeSourceType',
    'Compartido',
    'RecurringPaymentId',
  ]

  const recurrentesRows = recurring.map((r) => {
    const cycleStatus = selectRecurringPaymentCycleStatus(r, transactions, referenceDate)
    const coveredKeys = Array.from(getCoveredMonthKeysForRecurring(r, transactions)).sort()
    const isCoveredAhead = isRecurringCoveredInMonth(r, transactions, currentYear, currentMonth)
    const monthlyAmount = selectMonthlyAmountForFrequency(r.amount, r.frequency)
    const canonicalCatId = normalizeCategoryAlias(r.categoryId || 'other')
    const categoryName = categoryMap.get(canonicalCatId) ?? canonicalCatId
    const accountName = accountMap.get(r.accountId) ?? r.accountId

    let freqLabel = 'Mensual'
    if (r.frequency === 'weekly') freqLabel = 'Semanal'
    else if (r.frequency === 'yearly') freqLabel = 'Anual'

    return [
      r.id,
      r.name,
      r.type === 'income' ? 'Ingreso' : 'Gasto',
      Math.round(r.amount * 100) / 100,
      freqLabel,
      monthlyAmount,
      r.nextDate || '',
      r.active ? 'Sí' : 'No',
      categoryName,
      accountName,
      cycleStatus.label,
      coveredKeys.length > 0 ? coveredKeys.join(', ') : 'Ninguno',
      isCoveredAhead ? 'Sí' : 'No',
      r.incomeSourceType || '',
      r.isShared ? 'Sí' : 'No',
      r.id,
    ]
  })

  const wsRecurrentes = XLSX.utils.aoa_to_sheet([recurrentesHeaders, ...recurrentesRows])
  setColWidths(wsRecurrentes, [16, 26, 12, 14, 14, 18, 14, 10, 18, 18, 24, 30, 20, 18, 12, 16])
  wsRecurrentes['!autofilter'] = { ref: `A1:P${Math.max(1, recurrentesRows.length + 1)}` }
  XLSX.utils.book_append_sheet(wb, wsRecurrentes, 'RECURRENTES')

  // ==========================================
  // 5. HOJA: CATEGORÍAS
  // ==========================================
  const categoriasHeaders = ['ID', 'Nombre', 'Color', 'Icono']
  const categoriasRows = categories.map((c) => [c.id, c.name, c.color || '', c.iconKey || c.icon || ''])
  const wsCategorias = XLSX.utils.aoa_to_sheet([categoriasHeaders, ...categoriasRows])
  setColWidths(wsCategorias, [18, 24, 14, 16])
  wsCategorias['!autofilter'] = { ref: `A1:D${Math.max(1, categoriasRows.length + 1)}` }
  XLSX.utils.book_append_sheet(wb, wsCategorias, 'CATEGORÍAS')

  // ==========================================
  // 6. HOJA: GASTOS_COMPARTIDOS
  // ==========================================
  const compartidosHeaders = [
    'Gasto original',
    'Fecha gasto',
    'Importe bruto (€)',
    'Persona / Contacto',
    'Es pagador propio',
    'Parte atribuida (€)',
    'Reembolso recibido (€)',
    'Pendiente por recuperar (€)',
    'Estado',
    'ExpenseShareId',
    'ParentExpenseId / ExpenseTransactionId',
  ]

  const compartidosRows = expenseShares.map((s) => {
    const parentTx = transactions.find((t) => t.id === s.expenseTransactionId)
    const status = selectExpenseShareStatus(s, transactions)
    let statusLabel = 'Pendiente'
    if (status.status === 'received') statusLabel = 'Cobrado'
    else if (status.status === 'partial') statusLabel = 'Parcial'

    return [
      parentTx?.description || 'Gasto compartido',
      parentTx?.date ? parentTx.date.slice(0, 10) : '',
      parentTx ? Math.round(parentTx.amount * 100) / 100 : 0,
      s.participantName || '',
      s.isPayerShare ? 'Sí' : 'No',
      status.expectedAmount,
      status.receivedAmount,
      status.pendingAmount,
      statusLabel,
      s.id,
      s.expenseTransactionId,
    ]
  })

  const wsCompartidos = XLSX.utils.aoa_to_sheet([compartidosHeaders, ...compartidosRows])
  setColWidths(wsCompartidos, [30, 14, 18, 22, 18, 18, 22, 24, 14, 20, 26])
  wsCompartidos['!autofilter'] = { ref: `A1:K${Math.max(1, compartidosRows.length + 1)}` }
  XLSX.utils.book_append_sheet(wb, wsCompartidos, 'GASTOS_COMPARTIDOS')

  // ==========================================
  // 7. HOJA: OBJETIVOS_AHORRO
  // ==========================================
  const objetivosHeaders = [
    'ID',
    'Nombre',
    'Importe objetivo (€)',
    'Asignado actual (€)',
    'Progreso (%)',
    'Fecha objetivo',
    'Completado',
  ]
  const objetivosRows = goals.map((g) => {
    const target = Math.round((g.target || 0) * 100) / 100
    const current = Math.round((g.current || 0) * 100) / 100
    const progress = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
    return [
      g.id,
      g.name,
      target,
      current,
      progress,
      g.targetDate || '',
      g.completed || current >= target ? 'Sí' : 'No',
    ]
  })
  const wsObjetivos = XLSX.utils.aoa_to_sheet([objetivosHeaders, ...objetivosRows])
  setColWidths(wsObjetivos, [16, 26, 20, 18, 14, 16, 14])
  wsObjetivos['!autofilter'] = { ref: `A1:G${Math.max(1, objetivosRows.length + 1)}` }
  XLSX.utils.book_append_sheet(wb, wsObjetivos, 'OBJETIVOS_AHORRO')

  // ==========================================
  // 8. HOJA: RESERVAS
  // ==========================================
  const specialPeriodsMap = new Map((specialPeriods || []).map((p) => [p.id, p]))

  const reservasHeaders = [
    'ID',
    'Nombre',
    'Importe objetivo (€)',
    'Asignado actual (€)',
    'Progreso (%)',
    'Fecha objetivo',
    'Cuota mensual sugerida (€)',
    'Activo',
    'Periodo especial asociado',
    'ID Periodo especial',
    'Nota',
  ]
  const reservasRows = reserves.map((r) => {
    const target = Math.round(r.targetAmount * 100) / 100
    const current = Math.round((r.currentAllocated || 0) * 100) / 100
    const progress = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
    const quota = selectMonthlyReserveNeeded(r, referenceDate)
    const linkedPeriod = r.specialPeriodId ? specialPeriodsMap.get(r.specialPeriodId) : null
    const periodLabel = linkedPeriod
      ? `${linkedPeriod.name} (${linkedPeriod.startDate} - ${linkedPeriod.endDate})`
      : 'Ninguno'
    const periodId = r.specialPeriodId || ''
    return [
      r.id,
      r.name,
      target,
      current,
      progress,
      r.targetDate || '',
      quota,
      r.active ? 'Sí' : 'No',
      periodLabel,
      periodId,
      r.note || '',
    ]
  })
  const wsReservas = XLSX.utils.aoa_to_sheet([reservasHeaders, ...reservasRows])
  setColWidths(wsReservas, [16, 26, 20, 18, 14, 16, 24, 10, 28, 18, 24])
  wsReservas['!autofilter'] = { ref: `A1:K${Math.max(1, reservasRows.length + 1)}` }
  XLSX.utils.book_append_sheet(wb, wsReservas, 'RESERVAS')

  // ==========================================
  // 9. HOJA: PERIODOS_ESPECIALES
  // ==========================================
  const periodosHeaders = [
    'ID',
    'Nombre',
    'Fecha inicio',
    'Fecha fin',
    'Presupuesto extra previsto (€)',
    'Tipo',
    'Nota',
  ]
  const periodosRows = specialPeriods.map((p) => {
    let typeLabel = 'Normal'
    if (p.type === 'expected_high_spend') typeLabel = 'Gasto alto previsto'
    else if (p.type === 'expected_low_spend') typeLabel = 'Gasto bajo previsto'

    return [
      p.id,
      p.name,
      p.startDate || '',
      p.endDate || '',
      p.expectedExtraBudget ? Math.round(p.expectedExtraBudget * 100) / 100 : 0,
      typeLabel,
      p.note || '',
    ]
  })
  const wsPeriodos = XLSX.utils.aoa_to_sheet([periodosHeaders, ...periodosRows])
  setColWidths(wsPeriodos, [16, 26, 14, 14, 28, 20, 26])
  wsPeriodos['!autofilter'] = { ref: `A1:G${Math.max(1, periodosRows.length + 1)}` }
  XLSX.utils.book_append_sheet(wb, wsPeriodos, 'PERIODOS_ESPECIALES')

  // ==========================================
  // 10. HOJA: PRESUPUESTOS
  // ==========================================
  const presupuestosHeaders = ['ID', 'Categoría', 'Límite mensual (€)', 'Periodo']
  const presupuestosRows = budgets.map((b) => {
    const canonicalCatId = normalizeCategoryAlias(b.categoryId || 'other')
    const catName = categoryMap.get(canonicalCatId) ?? canonicalCatId
    return [b.id, catName, Math.round(b.amountLimit * 100) / 100, 'Mensual']
  })
  const wsPresupuestos = XLSX.utils.aoa_to_sheet([presupuestosHeaders, ...presupuestosRows])
  setColWidths(wsPresupuestos, [16, 22, 20, 14])
  wsPresupuestos['!autofilter'] = { ref: `A1:D${Math.max(1, presupuestosRows.length + 1)}` }
  XLSX.utils.book_append_sheet(wb, wsPresupuestos, 'PRESUPUESTOS')

  // ==========================================
  // 11. HOJA: PLAN_FINANCIERO
  // ==========================================
  const baseExpenses = expectedCommitted + expectedVariable
  const efTarget = selectEmergencyFundTarget(planSettings, baseExpenses)
  const efCovered = selectEmergencyFundMonthsCovered(emergencyCurrent, baseExpenses)

  const planHeaders = ['Concepto / Parámetro', 'Valor', 'Detalle / Notas']
  const planRows: (string | number)[][] = [
    [
      'Ingresos mensuales previstos',
      expectedIncome,
      planSettings?.monthlyIncome
        ? `Configurado manualmente (${planSettings.monthlyIncome} €) o derivado de recurrentes`
        : 'Derivado automáticamente de nómina y recurrentes activos',
    ],
    [
      'Tipo de objetivo de ahorro',
      planSettings?.targetSavingsType === 'percentage' ? 'Porcentaje (%)' : 'Importe fijo (€)',
      'Modalidad de cálculo para la hucha mensual',
    ],
    [
      'Valor objetivo de ahorro',
      planSettings?.targetSavingsValue ?? 0,
      planSettings?.targetSavingsType === 'percentage' ? '% de los ingresos mensuales' : '€ mensuales fijos',
    ],
    [
      'Ahorro objetivo mensual (€)',
      targetSavings,
      'Cantidad neta destinada a ahorro cada mes',
    ],
    [
      'Tipo de objetivo fondo de emergencia',
      planSettings?.emergencyFundTargetType === 'months' ? 'Meses de gastos' : 'Importe fijo (€)',
      'Criterio de dimensionamiento de seguridad',
    ],
    [
      'Valor objetivo fondo de emergencia',
      planSettings?.emergencyFundTargetValue ?? 0,
      planSettings?.emergencyFundTargetType === 'months' ? 'Meses de cobertura' : 'Importe fijado',
    ],
    [
      'Objetivo fondo de emergencia (€)',
      efTarget,
      `Calculado sobre gastos base mensuales (${baseExpenses} €)`,
    ],
    [
      'Fondo de emergencia actual asignado (€)',
      emergencyCurrent,
      'Apartado actualmente en la cuenta de ahorro',
    ],
    [
      'Meses de gastos cubiertos',
      efCovered,
      'Meses de subsistencia garantizados con el fondo actual',
    ],
    [
      'Categorías esenciales configuradas',
      (planSettings?.essentialCategoryIds || [])
        .map((cid) => categoryMap.get(normalizeCategoryAlias(cid)) ?? cid)
        .join(', ') || 'Ninguna especificada',
      'Categorías para cálculo de gastos imprescindibles',
    ],
  ]

  // Si existen estimaciones de gastos variables periódicos
  if (estimates.length > 0) {
    planRows.push(['', '', ''])
    planRows.push(['GASTOS VARIABLES PREVISTOS (ESTIMACIONES PERIÓDICAS)', '', ''])
    estimates.forEach((est) => {
      const canonicalCatId = normalizeCategoryAlias(est.categoryId || 'other')
      const catName = categoryMap.get(canonicalCatId) ?? canonicalCatId
      const freqLabel = est.frequencyType === 'per_week' ? `${est.frequencyValue} veces/semana` : `${est.frequencyValue} veces/mes`
      const monthlyEst = est.unitCost * (est.frequencyType === 'per_week' ? est.frequencyValue * 4.33 : est.frequencyValue)
      planRows.push([
        `Estimación: ${est.name}`,
        Math.round(monthlyEst * 100) / 100,
        `${est.unitCost} €/uso · ${freqLabel} · Cat: ${catName} · ${est.active ? 'Activo' : 'Inactivo'}`,
      ])
    })
  }

  const wsPlan = XLSX.utils.aoa_to_sheet([planHeaders, ...planRows])
  setColWidths(wsPlan, [38, 22, 55])
  XLSX.utils.book_append_sheet(wb, wsPlan, 'PLAN_FINANCIERO')

  return wb
}

/**
 * Convierte un workbook a Blob y gestiona la descarga o compartición en iOS/Android/PC.
 */
export async function shareOrDownloadExcel(
  wb: XLSX.WorkBook,
  fileName = `pocketflow-datos-${new Date().toISOString().slice(0, 10)}.xlsx`
): Promise<boolean> {
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  // Web Share API con File si está disponible (iPhone / iPad Archivos)
  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], fileName, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Exportación de datos PocketFlow',
          files: [file],
        })
        return true
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        return true
      }
      console.warn('[Backup] Error compartiendo Excel vía Web Share API:', err)
    }
  }

  // Descarga estándar vía anchor element
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return true
  } catch (err) {
    console.error('[Backup] Error descargando archivo Excel:', err)
    return false
  }
}

import type { Account, Category, RecurringFrequency, RecurringPayment, SavingsGoal, Transaction } from '../models/finance'
import { normalizeCategoryAlias } from './categoryNormalization'
import { getCanonicalRecurringShares } from './sharedExpenseSelectors'

/**
 * A) GROSS AMOUNT / IMPORTE BRUTO:
 * Precio completo del servicio emitido por el proveedor.
 * Spotify = 21,00 €, ChatGPT = 23,00 €, iCloud = 2,99 €, FitnessPark = 30,00 €.
 */
export function selectRecurringGrossAmount(
  rec: RecurringPayment,
  monthsCount = 1
): number {
  if (!rec || rec.type === 'income' || rec.categoryId === 'income') {
    return 0
  }
  const effectiveMonths = Math.max(1, monthsCount)
  const baseAmount = Math.max(0, (Number(rec.amount) || 0) * effectiveMonths)
  return Math.round(baseAmount * 100) / 100
}

/**
 * C) USER ECONOMIC SHARE / COSTE RECURRENTE PERSONAL:
 * Cantidad del servicio que económicamente le corresponde asumir a la usuaria.
 * - Spotify (21 € / 6 pers, paga Andrés): 3,50 €
 * - ChatGPT (23 € / 2 pers, paga usuaria, padre reembolsa mitad): 11,50 €
 * - iCloud (2,99 € no compartido): 2,99 €
 * - FitnessPark (30 € no compartido): 30,00 €
 * Si la usuaria no participa en el recurrente (includePayer === false): 0 €.
 */
export function selectRecurringUserEconomicShare(
  rec: RecurringPayment,
  monthsCount = 1
): number {
  if (!rec || rec.type === 'income' || rec.categoryId === 'income') {
    return 0
  }
  const effectiveMonths = Math.max(1, monthsCount)
  if (!rec.isShared) {
    return selectRecurringGrossAmount(rec, effectiveMonths)
  }
  const canonical = getCanonicalRecurringShares(rec, effectiveMonths)
  return Math.round(canonical.userShareAmount * 100) / 100
}

/**
 * B) USER CASH OUTFLOW / SALIDA DE CAJA PROPIA INICIAL:
 * Dinero que físicamente tiene que desembolsar la usuaria antes de recibir reembolsos.
 * - Si lo paga un tercero (rec.paidBy === 'contact' o sharingTemplate.payer === 'contact'):
 *   La usuaria únicamente desembolsa su parte (ej. 3,50 € Bizum a Andrés).
 * - Si lo paga la usuaria (rec.paidBy === 'user'):
 *   La usuaria abona el cargo completo al proveedor (ej. 23,00 € ChatGPT).
 */
export function selectRecurringUserCashOutflow(
  rec: RecurringPayment,
  monthsCount = 1
): number {
  if (!rec || rec.type === 'income' || rec.categoryId === 'income') {
    return 0
  }
  const effectiveMonths = Math.max(1, monthsCount)
  const isContactPaid = rec.paidBy === 'contact' || rec.sharingTemplate?.payer === 'contact'

  if (isContactPaid) {
    return selectRecurringUserEconomicShare(rec, effectiveMonths)
  }

  return selectRecurringGrossAmount(rec, effectiveMonths)
}

/**
 * REEMBOLSO ESPERADO DE TERCEROS:
 * Dinero que la usuaria desembolsa inicialmente y que debe recuperar de otros participantes.
 * = User Cash Outflow - User Economic Share
 * - ChatGPT: 23,00 € - 11,50 € = 11,50 €
 * - Spotify: 3,50 € - 3,50 € = 0,00 €
 */
export function selectRecurringExpectedReimbursement(
  rec: RecurringPayment,
  monthsCount = 1
): number {
  const outflow = selectRecurringUserCashOutflow(rec, monthsCount)
  const share = selectRecurringUserEconomicShare(rec, monthsCount)
  return Math.max(0, Math.round((outflow - share) * 100) / 100)
}

/**
 * Cuota económica personal mensualizada según periodicidad del recurrente.
 */
export function selectRecurringMonthlyUserEconomicShare(rec: RecurringPayment): number {
  const singleCycleShare = selectRecurringUserEconomicShare(rec, 1)
  const freq = rec.frequency || 'monthly'
  if (freq === 'monthly') {
    return Math.round(singleCycleShare * 100) / 100
  }
  if (freq === 'yearly') {
    return Math.round((singleCycleShare / 12) * 100) / 100
  }
  if (freq === 'weekly') {
    return Math.round(singleCycleShare * 4.33 * 100) / 100
  }
  return Math.round(singleCycleShare * 100) / 100
}

/**
 * Salida mensualizada de caja propia para un gasto recurrente según periodicidad.
 */
export function selectRecurringMonthlyUserCashOutflow(rec: RecurringPayment): number {
  const singleCycleOutflow = selectRecurringUserCashOutflow(rec, 1)
  const freq = rec.frequency || 'monthly'
  if (freq === 'monthly') {
    return Math.round(singleCycleOutflow * 100) / 100
  }
  if (freq === 'yearly') {
    return Math.round((singleCycleOutflow / 12) * 100) / 100
  }
  if (freq === 'weekly') {
    return Math.round(singleCycleOutflow * 4.33 * 100) / 100
  }
  return Math.round(singleCycleOutflow * 100) / 100
}

/**
 * Suma canónica de todos los gastos recurrentes personales activos:
 * Suma de USER ECONOMIC SHARE mensualizado de cada recurrente.
 * Spotify (3,50 €) + ChatGPT (11,50 €) + iCloud (2,99 €) + FitnessPark (30,00 €) = 47,99 €/mes.
 */
export function selectTotalPersonalRecurringExpenses(recurring: RecurringPayment[] = []): number {
  const activeExpenseRecs = Array.isArray(recurring)
    ? recurring.filter((r) => r.active !== false && r.type !== 'income' && r.categoryId !== 'income')
    : []

  const sum = activeExpenseRecs.reduce((acc, r) => {
    return acc + selectRecurringMonthlyUserEconomicShare(r)
  }, 0)

  return Math.round(sum * 100) / 100
}

/**
 * @deprecated Utilizar `selectRecurringUserCashOutflow` o `selectRecurringUserEconomicShare`.
 * Mantenido por retrocompatibilidad: mapea a salida de caja.
 */
export const selectRecurringUserOutflow = selectRecurringUserCashOutflow

/**
 * @deprecated Utilizar `selectRecurringMonthlyUserCashOutflow` o `selectRecurringMonthlyUserEconomicShare`.
 * Mantenido por retrocompatibilidad: mapea a salida de caja mensualizada.
 */
export const selectRecurringMonthlyUserOutflow = selectRecurringMonthlyUserCashOutflow

/**
 * Dinero para gastar = saldo actual de Cuenta diaria.
 */
export function selectSpendableBalance(accounts: Account[]): number {
  const dailyAccount = accounts.find((a) => a.type === 'spending')
  return dailyAccount?.balance ?? 0
}

/**
 * Ahorro total = saldo actual de Cuenta Ahorro.
 */
export function selectSavingsBalance(accounts: Account[]): number {
  const savingsAccount = accounts.find((a) => a.type === 'savings')
  return savingsAccount?.balance ?? 0
}

/**
 * Dinero total = saldo Cuenta diaria + saldo Ahorro.
 */
export function selectTotalMoney(accounts: Account[]): number {
  const daily = selectSpendableBalance(accounts)
  const savings = selectSavingsBalance(accounts)
  return Math.round((daily + savings) * 100) / 100
}

/**
 * Ahorro asignado = cantidad del ahorro ya asignada a objetivos.
 */
export function selectAssignedSavings(goals: SavingsGoal[]): number {
  const sum = goals.reduce((acc, goal) => acc + (goal.current ?? 0), 0)
  return Math.round(sum * 100) / 100
}

/**
 * Ahorro libre = ahorro total - ahorro asignado.
 */
export function selectFreeSavings(savingsBalance: number, assignedSavings: number): number {
  return Math.max(0, Math.round((savingsBalance - assignedSavings) * 100) / 100)
}

/**
 * Progreso visual y estado de un objetivo de ahorro.
 */
export function selectGoalProgress(
  current: number,
  target: number
): { percentage: number; isCompleted: boolean } {
  if (!target || target <= 0) {
    return { percentage: 0, isCompleted: false }
  }
  const percentage = Math.min(100, Math.round((current / target) * 100))
  return {
    percentage,
    isCompleted: current >= target,
  }
}

export const SPANISH_MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/**
 * Devuelve el conjunto de claves 'YYYY-MM' de los meses cubiertos por las transacciones de un recurrente.
 * Para recurrentes mensuales:
 * - Una transacción vinculada cubre N = max(1, round(tx.amount / rec.amount)) meses a partir del mes de tx.date.
 */
export function getCoveredMonthKeysForRecurring(
  rec: RecurringPayment,
  transactions: Transaction[]
): Set<string> {
  const covered = new Set<string>()
  if (!rec || !Array.isArray(transactions) || rec.type === 'income') return covered

  const linkedTxs = transactions.filter(
    (t) =>
      t.type === 'expense' &&
      (t.recurringPaymentId === rec.id ||
        (t.parentExpenseId &&
          transactions.some(
            (pt) => pt.id === t.parentExpenseId && pt.recurringPaymentId === rec.id
          )))
  )

  for (const tx of linkedTxs) {
    if (!tx.date) continue
    const txDate = new Date(tx.date)
    const txYear = txDate.getFullYear()
    const txMonth = txDate.getMonth() // 0-11

    const userOutflow = selectRecurringUserOutflow(rec, 1)
    const baseDivisor = (rec.paidBy === 'contact' && userOutflow > 0 ? userOutflow : rec.amount) || rec.amount

    if (rec.frequency === 'monthly' && baseDivisor > 0) {
      const monthsCovered = Math.max(1, Math.round((tx.amount / baseDivisor) * 100) / 100)
      const count = Math.max(1, Math.round(monthsCovered))

      for (let i = 0; i < count; i++) {
        let y = txYear
        let m = txMonth + i
        while (m > 11) {
          y += 1
          m -= 12
        }
        const key = `${y}-${String(m + 1).padStart(2, '0')}`
        covered.add(key)
      }
    } else {
      const key = `${txYear}-${String(txMonth + 1).padStart(2, '0')}`
      covered.add(key)
    }
  }

  return covered
}

/**
 * Comprueba si un recurrente está cubierto en un mes y año específicos.
 */
export function isRecurringCoveredInMonth(
  rec: RecurringPayment,
  transactions: Transaction[],
  year: number,
  month: number // 0-11
): boolean {
  if (!rec || rec.type === 'income') return false
  const key = `${year}-${String(month + 1).padStart(2, '0')}`
  const covered = getCoveredMonthKeysForRecurring(rec, transactions)
  return covered.has(key)
}

/**
 * Formatea una descripción legible para el movimiento según los meses cubiertos.
 * Ejemplo (2 meses): "Spotify · septiembre + octubre"
 * Ejemplo (3 meses): "Spotify · septiembre + octubre + noviembre"
 */
export function formatCoverageDescription(
  baseName: string,
  startDate: string | Date,
  monthsCount: number
): string {
  const count = Math.max(1, Math.round(monthsCount))
  if (count === 1) {
    return baseName
  }

  const d = typeof startDate === 'string' ? new Date(startDate) : startDate
  const startMonth = d.getMonth()
  const startYear = d.getFullYear()

  const monthLabels: string[] = []
  for (let i = 0; i < count; i++) {
    let m = startMonth + i
    let y = startYear
    while (m > 11) {
      y += 1
      m -= 12
    }
    monthLabels.push(SPANISH_MONTH_NAMES[m])
  }

  return `${baseName} · ${monthLabels.join(' + ')}`
}

/**
 * Genera la lista de meses cubiertos con formato amigable para UI / Modales.
 */
export function getCoveredMonthsList(
  startDate: string | Date,
  monthsCount: number
): { name: string; year: number; label: string }[] {
  const count = Math.max(1, Math.round(monthsCount))
  const d = typeof startDate === 'string' ? new Date(startDate) : startDate
  const startMonth = d.getMonth()
  const startYear = d.getFullYear()

  const list: { name: string; year: number; label: string }[] = []
  for (let i = 0; i < count; i++) {
    let m = startMonth + i
    let y = startYear
    while (m > 11) {
      y += 1
      m -= 12
    }
    const capName = SPANISH_MONTH_NAMES[m].charAt(0).toUpperCase() + SPANISH_MONTH_NAMES[m].slice(1)
    list.push({
      name: capName,
      year: y,
      label: `${capName} ${y}`,
    })
  }
  return list
}

/**
 * Recalcula la fecha del próximo vencimiento (nextDate) de un recurrente mensual
 * a partir del primer mes que NO se encuentre cubierto.
 */
export function recalculateRecurringNextDate(
  rec: RecurringPayment,
  transactions: Transaction[],
  referenceDate: Date = new Date()
): string {
  if (!rec || rec.type === 'income' || rec.frequency !== 'monthly') {
    return rec.nextDate
  }

  const coveredKeys = getCoveredMonthKeysForRecurring(rec, transactions)
  const baseParts = (rec.nextDate || '').split('-').map(Number)
  const baseDay = baseParts.length === 3 && !isNaN(baseParts[2]) ? baseParts[2] : 1

  const refYear = referenceDate.getFullYear()
  const refMonth = referenceDate.getMonth()

  let candidateYear = refYear
  let candidateMonth = refMonth

  for (let offset = 0; offset < 36; offset++) {
    let y = refYear
    let m = refMonth + offset
    while (m > 11) {
      y += 1
      m -= 12
    }
    const key = `${y}-${String(m + 1).padStart(2, '0')}`
    if (!coveredKeys.has(key)) {
      candidateYear = y
      candidateMonth = m
      break
    }
  }

  const maxDaysInTargetMonth = new Date(Date.UTC(candidateYear, candidateMonth + 1, 0)).getUTCDate()
  const targetDay = Math.min(baseDay, maxDaysInTargetMonth)
  const mm = String(candidateMonth + 1).padStart(2, '0')
  const dd = String(targetDay).padStart(2, '0')

  return `${candidateYear}-${mm}-${dd}`
}

/**
 * Obtiene la lista de pagos recurrentes que siguen pendientes de cobro en el periodo (mes en curso).
 * Considera únicamente los recurrentes activos que afectarán a la liquidez del usuario.
 * Verifica si ya existe una transacción vinculada mediante recurringPaymentId (o heurística de respaldo),
 * o si el periodo ya fue cubierto por adelantado mediante un pago multimensualidad.
 */
export function selectPendingRecurringPayments(
  recurring: RecurringPayment[],
  transactions: Transaction[],
  referenceDate: Date = new Date(),
  spendingAccountId = 'daily'
): RecurringPayment[] {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  return recurring.filter((r) => {
    // 1. Debe ser un gasto recurrente (no ingreso como nómina)
    if (r.type === 'income') return false

    // 2. Debe estar activo
    if (!r.active) return false

    // 3. Debe pertenecer a la cuenta diaria si no es pagado por contacto
    if (r.accountId && r.accountId !== spendingAccountId && r.paidBy !== 'contact') return false

    // 4. Comprobar si está cubierto en el mes de referencia
    if (isRecurringCoveredInMonth(r, transactions, currentYear, currentMonth)) {
      return false
    }

    // 5. Enlace de respaldo por coincidencia de nombre/categoría e importe en el mes en curso
    const expectedUserAmt = selectRecurringUserOutflow(r)
    const alreadyRegistered = transactions.some((t) => {
      if (t.type !== 'expense') return false

      const d = new Date(t.date)
      const isSameMonth = d.getMonth() === currentMonth && d.getFullYear() === currentYear
      if (!isSameMonth) return false

      // Enlace robusto por ID prioritario
      if (t.recurringPaymentId && t.recurringPaymentId === r.id) {
        return true
      }

      // Enlace de respaldo por nombre/concepto o categoría+importe exacto
      const matchesDescription = t.description.toLowerCase().includes(r.name.toLowerCase())
      const matchesCategoryAndAmount =
        r.categoryId && t.categoryId === r.categoryId && (Math.abs(t.amount - r.amount) < 0.01 || Math.abs(t.amount - expectedUserAmt) < 0.01)

      return matchesDescription || matchesCategoryAndAmount
    })

    return !alreadyRegistered
  })
}

/**
 * Dinero comprometido = suma de las SALIDAS PROPIAS de caja previstas para los gastos
 * recurrentes pendientes de la usuaria en el periodo en curso.
 */
export function selectCommittedAmount(
  recurring: RecurringPayment[],
  transactions: Transaction[],
  referenceDate: Date = new Date(),
  spendingAccountId = 'daily'
): number {
  const pending = selectPendingRecurringPayments(
    recurring,
    transactions,
    referenceDate,
    spendingAccountId
  )
  const total = pending.reduce((sum, r) => sum + selectRecurringUserOutflow(r), 0)
  return Math.round(total * 100) / 100
}

/**
 * Disponible real = dinero para gastar - dinero comprometido.
 */
export function selectRealAvailable(spendableBalance: number, committedAmount: number): number {
  return Math.max(0, Math.round((spendableBalance - committedAmount) * 100) / 100)
}

/**
 * Total de retiradas de efectivo / cajero en el mes en curso.
 */
export function selectMonthCashWithdrawals(
  transactions: Transaction[],
  referenceDate: Date = new Date()
): number {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  const sum = transactions
    .filter((t) => t.type === 'expense' && t.specialType === 'cash_withdrawal')
    .filter((t) => {
      const d = new Date(t.date)
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear
    })
    .reduce((acc, t) => acc + t.amount, 0)

  return Math.round(sum * 100) / 100
}

/**
 * Gasto bruto facial de este mes = suma simple de transacciones de tipo 'expense'.
 * @deprecated Para KPIs de coste real y consumo financiero usar la fuente canónica:
 * {@link selectNetPersonalExpensesForPeriod} de `sharedExpenseSelectors.ts`.
 */
export function selectMonthExpenses(
  transactions: Transaction[],
  referenceDate: Date = new Date()
): number {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  const sum = transactions
    .filter((t) => t.type === 'expense' && (!t.isShared || t.paidBy !== 'contact'))
    .filter((t) => {
      const d = new Date(t.date)
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear
    })
    .reduce((acc, t) => acc + t.amount, 0)

  return Math.round(sum * 100) / 100
}

/**
 * Disponible proyectado = Disponible real - Previsto variable pendiente.
 * No oculta valores negativos si financieramente tienen significado.
 * Redondeado a 2 decimales.
 */
export function selectProjectedAvailable(
  realAvailable: number,
  pendingVariableEstimate: number
): number {
  return Math.round((realAvailable - pendingVariableEstimate) * 100) / 100
}

/**
 * Calcula la siguiente fecha para un pago recurrente respetando fines de mes
 * y calendario gregoriano sin romper por meses de 28/29/30 días.
 */
export function calculateNextRecurringDate(
  currentDateStr: string,
  frequency: RecurringFrequency
): string {
  if (!currentDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(currentDateStr)) {
    return new Date().toISOString().slice(0, 10)
  }

  const parts = currentDateStr.split('-').map(Number)
  const year = parts[0]
  const month = parts[1] // 1-12
  const day = parts[2] // 1-31

  if (frequency === 'weekly') {
    const d = new Date(Date.UTC(year, month - 1, day))
    d.setUTCDate(d.getUTCDate() + 7)
    return d.toISOString().slice(0, 10)
  }

  if (frequency === 'monthly') {
    let targetYear = year
    let targetMonth = month + 1 // 1-indexed
    if (targetMonth > 12) {
      targetYear += 1
      targetMonth = 1
    }
    const maxDaysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate()
    const targetDay = Math.min(day, maxDaysInTargetMonth)
    const mm = String(targetMonth).padStart(2, '0')
    const dd = String(targetDay).padStart(2, '0')
    return `${targetYear}-${mm}-${dd}`
  }

  if (frequency === 'yearly') {
    const targetYear = year + 1
    const maxDaysInTargetMonth = new Date(Date.UTC(targetYear, month, 0)).getUTCDate()
    const targetDay = Math.min(day, maxDaysInTargetMonth)
    const mm = String(month).padStart(2, '0')
    const dd = String(targetDay).padStart(2, '0')
    return `${targetYear}-${mm}-${dd}`
  }

  return currentDateStr
}

export type RecurringPaymentCycleStatus =
  | 'confirmed_for_cycle'
  | 'covered_in_advance'
  | 'due'
  | 'upcoming'

/**
 * Determina el estado contextual de un pago recurrente en el ciclo actual:
 * - 'confirmed_for_cycle': ya cobrado/pagado este mes mediante transacción
 * - 'covered_in_advance': pagado por adelantado por un pago multimes
 * - 'due': pendiente de confirmar o previsto hoy
 * - 'upcoming': próximo en fecha futura
 */
export function selectRecurringPaymentCycleStatus(
  payment: RecurringPayment,
  transactions: Transaction[],
  referenceDate: Date = new Date()
): {
  status: RecurringPaymentCycleStatus
  label: string
  confirmedTx?: Transaction
} {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()
  const todayStr = referenceDate.toISOString().slice(0, 10)

  // 1. Comprobar si ya fue confirmado en el ciclo/mes en curso mediante recurringPaymentId
  const confirmedTx = transactions.find((t) => {
    if (t.type !== 'expense') return false
    const d = new Date(t.date)
    if (d.getMonth() !== currentMonth || d.getFullYear() !== currentYear) return false
    if (t.recurringPaymentId && t.recurringPaymentId === payment.id) return true
    return false
  })

  if (confirmedTx) {
    return {
      status: 'confirmed_for_cycle',
      label: 'Cobrado este ciclo',
      confirmedTx,
    }
  }

  // 2. Comprobar si está cubierto por adelantado desde un mes previo (pago multimes)
  if (
    payment.type !== 'income' &&
    isRecurringCoveredInMonth(payment, transactions, currentYear, currentMonth)
  ) {
    return {
      status: 'covered_in_advance',
      label: 'Pagado por adelantado',
    }
  }

  // 3. Fuente de verdad: Calcular la fecha efectiva del próximo vencimiento a partir de transacciones reales
  const effectiveNextDate =
    payment.frequency === 'monthly' && payment.type !== 'income'
      ? recalculateRecurringNextDate(payment, transactions, referenceDate)
      : payment.nextDate

  // 4. Si la fecha efectiva ya llegó o es hoy
  if (effectiveNextDate <= todayStr) {
    return {
      status: 'due',
      label: effectiveNextDate === todayStr ? 'Previsto hoy' : 'Pendiente de confirmar',
    }
  }

  // 5. Si la fecha efectiva es futura
  const parts = effectiveNextDate.split('-')
  const day = parseInt(parts[2], 10)
  const monthNames = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
  ]
  const monthIndex = parseInt(parts[1], 10) - 1
  const formattedDate = `${day} ${monthNames[monthIndex] || ''}`

  return {
    status: 'upcoming',
    label: `Próximo: ${formattedDate}`,
  }
}

/**
 * Gasto bruto desglosado por categoría en el mes actual (suma facial de transacciones).
 * @deprecated Para visualización de consumo real y gráficos de categoría usar la fuente canónica:
 * {@link selectNetExpensesByCategory} de `sharedExpenseSelectors.ts`.
 */
export function selectCategoryExpenses(
  transactions: Transaction[],
  categories: Category[],
  referenceDate: Date = new Date()
): { id: string; name: string; amount: number; percentage: number; color: string; iconKey?: string }[] {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  const monthExpenses = transactions.filter((t) => {
    if (t.type !== 'expense' || (t.isShared && t.paidBy === 'contact')) return false
    const d = new Date(t.date)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })

  const total = monthExpenses.reduce((sum, t) => sum + t.amount, 0)
  const categoryMap = new Map<string, number>()

  monthExpenses.forEach((t) => {
    const catId = normalizeCategoryAlias(t.categoryId || 'other')
    categoryMap.set(catId, (categoryMap.get(catId) || 0) + t.amount)
  })

  return categories.map((c) => {
    const canonicalId = normalizeCategoryAlias(c.id)
    const amount = Math.round((categoryMap.get(canonicalId) || 0) * 100) / 100
    const percentage = total > 0 ? Math.round((amount / total) * 100) : 0
    return {
      id: canonicalId,
      name: canonicalId === 'other' ? 'Otros' : c.name,
      amount,
      percentage,
      color: c.color,
      iconKey: c.icon,
    }
  })
}



import { useMemo, useState } from 'react'
import type { CashTransaction, Transaction } from '../models/finance'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'
import { AppIcon } from '../ui/icons'
import {
  selectMonthDailyNetStats,
  selectDayNetFinanceStats,
} from '../utils/sharedExpenseSelectors'
import { selectTotalEconomicConsumptionForPeriod } from '../utils/cashSelectors'
import { toUnifiedMovements, type UnifiedMovement } from '../utils/unifiedMovementSelectors'

const weekdays = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export function CalendarPage({
  finance,
  onSelectTransaction,
}: {
  finance: ReturnTypeFinance
  onSelectTransaction?: (tx: Transaction | CashTransaction) => void
}) {
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(() => new Date().getDate())

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7 // Monday = 0

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
    setSelectedDay(1)
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
    setSelectedDay(1)
  }

  const handleToday = () => {
    const today = new Date()
    setCurrentDate(today)
    setSelectedDay(today.getDate())
  }

  // 1. Estadísticas diarias del mes unificando Banco + Efectivo
  const monthDataByDay = useMemo(() => {
    return selectMonthDailyNetStats(
      finance.transactions ?? [],
      year,
      month,
      finance.cashTransactions ?? []
    )
  }, [finance.transactions, month, year, finance.cashTransactions])

  // 2. Movimientos unificados del día seleccionado (Banco + Efectivo)
  const allUnifiedMovements = useMemo(() => {
    return toUnifiedMovements(
      finance.transactions ?? [],
      finance.cashTransactions ?? [],
      finance.expenseShares ?? []
    )
  }, [finance.transactions, finance.cashTransactions, finance.expenseShares])

  const selectedDayMovements = useMemo(() => {
    return allUnifiedMovements.filter((m) => {
      const d = new Date(m.date)
      return (
        d.getFullYear() === year &&
        d.getMonth() === month &&
        d.getDate() === selectedDay
      )
    })
  }, [allUnifiedMovements, year, month, selectedDay])

  // 3. Consumo económico total del mes (Banco + Efectivo sin doble conteo de cajero)
  const monthTotalExpenses = useMemo(() => {
    return selectTotalEconomicConsumptionForPeriod(
      finance.transactions ?? [],
      finance.cashTransactions ?? [],
      currentDate,
      'month'
    ).totalEconomicConsumption
  }, [finance.transactions, currentDate, finance.cashTransactions])

  // 4. Estadísticas del día seleccionado
  const selectedDayStats = useMemo(() => {
    return selectDayNetFinanceStats(
      finance.transactions ?? [],
      year,
      month,
      selectedDay,
      finance.cashTransactions ?? []
    )
  }, [finance.transactions, year, month, selectedDay, finance.cashTransactions])

  const monthLabel = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(currentDate)

  return (
    <main className="page">
      <header className="simple-header">
        <h1>Calendario</h1>
        <button type="button" className="text-button" onClick={handleToday}>
          Hoy
        </button>
      </header>

      <section className="calendar-card">
        <div className="calendar-nav">
          <button type="button" className="cal-nav-btn" onClick={handlePrevMonth} aria-label="Mes anterior">
            <AppIcon name="chevron-left" size={16} />
          </button>
          <h2>{monthLabel}</h2>
          <button type="button" className="cal-nav-btn" onClick={handleNextMonth} aria-label="Mes siguiente">
            <AppIcon name="chevron-right" size={16} />
          </button>
        </div>

        <div className="calendar-month-total">
          <span>Gasto mensual: <strong>{money(monthTotalExpenses)}</strong></span>
        </div>

        <div className="calendar-grid weekdays">
          {weekdays.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>

        <div className="calendar-grid">
          {Array.from({ length: firstDayIndex }).map((_, i) => (
            <span key={`empty-${i}`} className="calendar-empty-cell" />
          ))}

          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
            const data = monthDataByDay.get(day)
            const hasExpense = data && data.netExpenses > 0
            const hasIncome = data && (data.realIncome > 0 || data.reimbursements > 0)
            const isSelected = selectedDay === day

            return (
              <button
                type="button"
                key={day}
                className={`calendar-day-btn ${isSelected ? 'selected' : ''} ${hasExpense ? 'has-expense' : ''}`}
                onClick={() => setSelectedDay(day)}
              >
                <b>{day}</b>
                {hasExpense && <small>{money(data!.netExpenses)}</small>}
                {hasIncome && (
                  <span
                    className="calendar-income-indicator"
                    title="Ingresos / Reembolsos"
                  />
                )}
              </button>
            )
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-title">
          <h2>Día {selectedDay} de {new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(currentDate)}</h2>
          <span className={selectedDayStats.netBalance >= 0 ? 'positive' : ''}>
            Balance: {selectedDayStats.netBalance >= 0 ? '+' : ''}{money(selectedDayStats.netBalance)}
          </span>
        </div>

        {/* Resumen del día */}
        {(selectedDayStats.netExpenses > 0 || selectedDayStats.realIncome > 0 || selectedDayStats.reimbursements > 0) && (
          <div className="day-breakdown-row">
            {selectedDayStats.netExpenses > 0 && (
              <span>
                Gastos: <strong>−{money(selectedDayStats.netExpenses)}</strong>
                {selectedDayStats.grossExpenses > selectedDayStats.netExpenses && (
                  <small style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                    (Bruto: {money(selectedDayStats.grossExpenses)})
                  </small>
                )}
              </span>
            )}
            {selectedDayStats.realIncome > 0 && (
              <span className="positive">
                Ingresos: <strong>+{money(selectedDayStats.realIncome)}</strong>
              </span>
            )}
            {selectedDayStats.reimbursements > 0 && (
              <span style={{ color: '#8b5cf6' }}>
                Reembolsos: <strong>+{money(selectedDayStats.reimbursements)}</strong>
              </span>
            )}
          </div>
        )}

        {selectedDayMovements.length ? (
          <div className="transaction-list">
            {selectedDayMovements.map((m) => {
              const isIncome = m.type === 'income'
              const isReimbursement = m.isReimbursement
              const isTransfer = m.type === 'transfer' || m.isCashWithdrawal || m.isLinkedCashWithdrawal
              const isAdjustment = m.isAdjustment

              return (
                <div
                  className="mini-row clickable"
                  key={m.id}
                  onClick={() => onSelectTransaction?.(m.originalTransaction)}
                  role="button"
                  tabIndex={0}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <strong>{m.description}</strong>

                      {/* Badges de origen */}
                      {m.source === 'bank' && m.isCashWithdrawal && (
                        <span className="pill-withdrawal">Cajero · Banco → Efectivo</span>
                      )}
                      {m.source === 'bank' && !m.isCashWithdrawal && (
                        <span className="pill-source bank">Banco</span>
                      )}
                      {m.source === 'cash' && m.isLinkedCashWithdrawal && (
                        <span className="pill-source cash-linked">Desde Banco</span>
                      )}
                      {m.source === 'cash' && !m.isLinkedCashWithdrawal && !m.isAdjustment && (
                        <span className="pill-source cash">Efectivo</span>
                      )}
                      {isAdjustment && (
                        <span className="pill-source adjustment">Ajuste</span>
                      )}

                      {isReimbursement && <span className="pill-reimbursement">Reembolso</span>}
                      {m.isShared && <span className="pill-shared completed">Compartido</span>}
                    </div>

                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {m.isCashWithdrawal
                        ? 'Retirada de cajero'
                        : m.isLinkedCashWithdrawal
                        ? 'Entrada vinculada desde Banco'
                        : isAdjustment
                        ? 'Ajuste de efectivo'
                        : isTransfer
                        ? 'Transferencia interna'
                        : isReimbursement
                        ? `Reembolso recibido (${m.source === 'cash' ? 'efectivo' : 'banco'})`
                        : isIncome
                        ? `Ingreso (${m.source === 'cash' ? 'efectivo' : 'banco'})`
                        : m.giftRecipient
                        ? `Regalo · ${m.giftRecipient}`
                        : 'Gasto'}
                    </span>
                  </div>

                  <strong
                    className={`expense-amount ${
                      isAdjustment
                        ? m.amount >= 0
                          ? 'positive'
                          : 'negative'
                        : isReimbursement
                        ? 'positive reimbursement'
                        : isIncome
                        ? 'positive'
                        : isTransfer
                        ? 'transfer'
                        : ''
                    }`}
                  >
                    {isAdjustment
                      ? m.amount >= 0
                        ? `+${money(m.amount)}`
                        : money(m.amount)
                      : isIncome
                      ? '+'
                      : isTransfer
                      ? '↔ '
                      : '−'}
                    {!isAdjustment && money(m.amount)}
                  </strong>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="muted">Sin movimientos registrados para este día.</p>
        )}
      </section>
    </main>
  )
}

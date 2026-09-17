import { useMemo, useState } from 'react'
import type { Transaction } from '../models/finance'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'
import { AppIcon } from '../ui/icons'
import {
  selectNetPersonalExpensesForPeriod,
  selectMonthDailyNetStats,
  selectDayNetFinanceStats,
} from '../utils/sharedExpenseSelectors'

const weekdays = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export function CalendarPage({
  finance,
  onSelectTransaction,
}: {
  finance: ReturnTypeFinance
  onSelectTransaction?: (tx: Transaction) => void
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

  const monthDataByDay = useMemo(() => {
    return selectMonthDailyNetStats(finance.transactions, year, month)
  }, [finance.transactions, month, year])

  const selectedRows = useMemo(() => {
    return finance.transactions.filter((t) => {
      const d = new Date(t.date)
      return (
        d.getFullYear() === year &&
        d.getMonth() === month &&
        d.getDate() === selectedDay
      )
    })
  }, [finance.transactions, year, month, selectedDay])

  const monthTotalExpenses = useMemo(() => {
    return selectNetPersonalExpensesForPeriod(finance.transactions, currentDate, 'month')
  }, [finance.transactions, currentDate])

  const selectedDayStats = useMemo(() => {
    return selectDayNetFinanceStats(finance.transactions, year, month, selectedDay)
  }, [finance.transactions, year, month, selectedDay])

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
                    title={`Ingresos/Reembolsos`}
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
            {selectedDayStats.realIncome > 0 && <span className="positive">Ingresos: <strong>+{money(selectedDayStats.realIncome)}</strong></span>}
            {selectedDayStats.reimbursements > 0 && <span style={{ color: '#8b5cf6' }}>Reembolsos: <strong>+{money(selectedDayStats.reimbursements)}</strong></span>}
          </div>
        )}

        {selectedRows.length ? (
          <div className="transaction-list">
            {selectedRows.map((t) => {
              const isIncome = t.type === 'income'
              const isReimbursement = isIncome && t.incomeKind === 'reimbursement'
              const isTransfer = t.type === 'transfer'

              return (
                <div
                  className="mini-row clickable"
                  key={t.id}
                  onClick={() => onSelectTransaction?.(t)}
                  role="button"
                  tabIndex={0}
                >
                  <div>
                    <strong>{t.description}</strong>
                    <span>
                      {isTransfer
                        ? 'Transferencia'
                        : isReimbursement
                        ? 'Reembolso recibido'
                        : isIncome
                        ? 'Ingreso'
                        : 'Gasto'}
                    </span>
                  </div>
                  <strong
                    className={`expense-amount ${
                      isReimbursement
                        ? 'positive reimbursement'
                        : isIncome
                        ? 'positive'
                        : isTransfer
                        ? 'transfer'
                        : ''
                    }`}
                  >
                    {isIncome ? '+' : isTransfer ? '↔ ' : '−'}
                    {money(t.amount)}
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

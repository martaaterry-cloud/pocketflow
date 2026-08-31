import { useMemo, useState } from 'react'
import type { Transaction } from '../models/finance'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'

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

  const monthExpensesByDay = useMemo(() => {
    const map = new Map<number, number>()
    finance.transactions
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        const d = new Date(t.date)
        if (d.getFullYear() === year && d.getMonth() === month) {
          map.set(d.getDate(), (map.get(d.getDate()) ?? 0) + t.amount)
        }
      })
    return map
  }, [finance.transactions, month, year])

  const selectedRows = useMemo(() => {
    return finance.transactions.filter((t) => {
      const d = new Date(t.date)
      return (
        d.getFullYear() === year &&
        d.getMonth() === month &&
        d.getDate() === selectedDay &&
        t.type === 'expense'
      )
    })
  }, [finance.transactions, year, month, selectedDay])

  const monthTotal = useMemo(() => {
    let total = 0
    monthExpensesByDay.forEach((amount) => {
      total += amount
    })
    return total
  }, [monthExpensesByDay])

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
            ‹
          </button>
          <h2>{monthLabel}</h2>
          <button type="button" className="cal-nav-btn" onClick={handleNextMonth} aria-label="Mes siguiente">
            ›
          </button>
        </div>

        <div className="calendar-month-total">
          <span>Gasto mensual: <strong>{money(monthTotal)}</strong></span>
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
            const hasExpense = monthExpensesByDay.has(day)
            const isSelected = selectedDay === day
            const amount = monthExpensesByDay.get(day)

            return (
              <button
                type="button"
                key={day}
                className={`calendar-day-btn ${isSelected ? 'selected' : ''} ${hasExpense ? 'has-expense' : ''}`}
                onClick={() => setSelectedDay(day)}
              >
                <b>{day}</b>
                {hasExpense && <small>{Math.round(amount!)}€</small>}
              </button>
            )
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-title">
          <h2>Día {selectedDay} de {new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(currentDate)}</h2>
          <span>{money(selectedRows.reduce((s, t) => s + t.amount, 0))}</span>
        </div>

        {selectedRows.length ? (
          <div className="transaction-list">
            {selectedRows.map((t) => (
              <div
                className="mini-row clickable"
                key={t.id}
                onClick={() => onSelectTransaction?.(t)}
                role="button"
                tabIndex={0}
              >
                <div>
                  <strong>{t.description}</strong>
                  <span>Toca para editar o ver detalle</span>
                </div>
                <strong className="expense-amount">−{money(t.amount)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Sin gastos registrados para este día.</p>
        )}
      </section>
    </main>
  )
}

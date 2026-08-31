import { useState } from 'react'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'
import { AccountsPage } from './AccountsPage'
import { RecurringPaymentsPage } from './RecurringPaymentsPage'
import { SettingsPage } from './SettingsPage'

type MoreSubView = 'menu' | 'accounts' | 'settings' | 'recurring'

export function MorePage({
  finance,
  onNavigateToSavings,
}: {
  finance: ReturnTypeFinance
  onNavigateToSavings?: () => void
}) {
  const [subView, setSubView] = useState<MoreSubView>('menu')

  if (subView === 'accounts') {
    return <AccountsPage finance={finance} onBack={() => setSubView('menu')} />
  }

  if (subView === 'settings') {
    return <SettingsPage finance={finance} onBack={() => setSubView('menu')} />
  }

  if (subView === 'recurring') {
    return <RecurringPaymentsPage finance={finance} onBack={() => setSubView('menu')} />
  }

  return (
    <main className="page">
      <header className="simple-header">
        <h1>Más</h1>
      </header>

      {/* Resumen de Próximos Pagos */}
      <section className="section">
        <div className="section-title">
          <h2>Próximos pagos comprometidos</h2>
          <span>{money(finance.totals.committedAmount)} pendientes</span>
        </div>
        {finance.totals.pendingRecurring?.length ? (
          <div className="transaction-list">
            {finance.totals.pendingRecurring.map((r) => (
              <div className="mini-row clickable" key={r.id} onClick={() => setSubView('recurring')}>
                <div>
                  <strong>{r.name}</strong>
                  <span>Próximo cobro: {r.nextDate}</span>
                </div>
                <strong className="expense-amount">−{money(r.amount)}</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="transaction-list empty">
            <p className="muted">No tienes pagos comprometidos pendientes este mes.</p>
          </div>
        )}
      </section>

      {/* Menú de Opciones */}
      <section className="menu-card">
        <button type="button" onClick={() => setSubView('accounts')}>
          <span className="menu-icon">◫</span>
          <div>
            <strong>Cuentas</strong>
            <small>Cuenta diaria, Ahorro y saldos derivados</small>
          </div>
          <b className="chevron">›</b>
        </button>

        <button
          type="button"
          onClick={() => {
            if (onNavigateToSavings) {
              onNavigateToSavings()
            }
          }}
        >
          <span className="menu-icon">◇</span>
          <div>
            <strong>Objetivos de ahorro</strong>
            <small>
              {finance.goals.length} metas · {money(finance.totals.assignedSavings)} asignados
            </small>
          </div>
          <b className="chevron">›</b>
        </button>

        <button type="button" onClick={() => setSubView('recurring')}>
          <span className="menu-icon">↻</span>
          <div>
            <strong>Gastos recurrentes</strong>
            <small>
              {finance.recurring.length} suscripciones y pagos programados
            </small>
          </div>
          <b className="chevron">›</b>
        </button>

        <button type="button" onClick={() => setSubView('settings')}>
          <span className="menu-icon">⚙</span>
          <div>
            <strong>Ajustes</strong>
            <small>Saldos iniciales y privacidad local</small>
          </div>
          <b className="chevron">›</b>
        </button>

        <button type="button" className="menu-item-disabled" disabled>
          <span className="menu-icon">◎</span>
          <div>
            <strong>Estadísticas</strong>
            <small>Día, semana, mes y año</small>
          </div>
          <span className="badge-soon">Fase 4</span>
        </button>

        <button type="button" className="menu-item-disabled" disabled>
          <span className="menu-icon">◔</span>
          <div>
            <strong>Presupuestos</strong>
            <small>Límites opcionales por categoría</small>
          </div>
          <span className="badge-soon">Fase 4</span>
        </button>
      </section>
    </main>
  )
}

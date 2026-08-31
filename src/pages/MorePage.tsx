import { useState } from 'react'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'
import { AccountsPage } from './AccountsPage'
import { SettingsPage } from './SettingsPage'

type MoreSubView = 'menu' | 'accounts' | 'settings'

export function MorePage({ finance }: { finance: ReturnTypeFinance }) {
  const [subView, setSubView] = useState<MoreSubView>('menu')

  if (subView === 'accounts') {
    return <AccountsPage finance={finance} onBack={() => setSubView('menu')} />
  }

  if (subView === 'settings') {
    return <SettingsPage finance={finance} onBack={() => setSubView('menu')} />
  }

  return (
    <main className="page">
      <header className="simple-header">
        <h1>Más</h1>
      </header>

      <section className="section">
        <div className="section-title">
          <h2>Próximos pagos comprometidos</h2>
          <span>{money(finance.totals.committedAmount)} pendientes</span>
        </div>
        <div className="transaction-list">
          {finance.recurring.map((r) => (
            <div className="mini-row" key={r.id}>
              <div>
                <strong>{r.name}</strong>
                <span>Próximo cobro: {r.nextDate}</span>
              </div>
              <strong className="expense-amount">−{money(r.amount)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="menu-card">
        <button type="button" onClick={() => setSubView('accounts')}>
          <span className="menu-icon">◫</span>
          <div>
            <strong>Cuentas</strong>
            <small>Cuenta diaria, Ahorro y saldos derivados</small>
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

        <button type="button" className="menu-item-disabled" disabled>
          <span className="menu-icon">↻</span>
          <div>
            <strong>Gastos recurrentes</strong>
            <small>Gestión avanzada de suscripciones</small>
          </div>
          <span className="badge-soon">Fase 3</span>
        </button>
      </section>
    </main>
  )
}

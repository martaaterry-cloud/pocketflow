import { useState } from 'react'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'
import { AppIcon } from '../ui/icons'
import { BackupPage } from './BackupPage'
import { AccountsPage } from './AccountsPage'
import { BudgetsPage } from './BudgetsPage'
import { PlanFinancialPage } from './PlanFinancialPage'
import { RecurringPaymentsPage } from './RecurringPaymentsPage'
import { SettingsPage } from './SettingsPage'
import { StatisticsPage } from './StatisticsPage'

type MoreSubView = 'menu' | 'accounts' | 'settings' | 'recurring' | 'budgets' | 'statistics' | 'plan' | 'backup'

export function MorePage({
  finance,
  onNavigateToSavings,
  onToast,
}: {
  finance: ReturnTypeFinance
  onNavigateToSavings?: () => void
  onToast?: (message: string, type?: 'success' | 'error') => void
}) {
  const [subView, setSubView] = useState<MoreSubView>('menu')

  if (subView === 'backup') {
    return (
      <BackupPage
        finance={finance}
        onBack={() => setSubView('menu')}
        onToast={onToast ?? (() => {})}
      />
    )
  }

  if (subView === 'accounts') {
    return <AccountsPage finance={finance} onBack={() => setSubView('menu')} />
  }

  if (subView === 'settings') {
    return <SettingsPage finance={finance} onBack={() => setSubView('menu')} />
  }

  if (subView === 'recurring') {
    return <RecurringPaymentsPage finance={finance} onBack={() => setSubView('menu')} />
  }

  if (subView === 'budgets') {
    return <BudgetsPage finance={finance} onBack={() => setSubView('menu')} />
  }

  if (subView === 'statistics') {
    return <StatisticsPage finance={finance} onBack={() => setSubView('menu')} />
  }

  if (subView === 'plan') {
    return <PlanFinancialPage finance={finance} onBack={() => setSubView('menu')} />
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
        {/* Plan Financiero (Nueva Sección) */}
        <button type="button" onClick={() => setSubView('plan')}>
          <span className="menu-icon">
            <AppIcon name="shield" size={18} />
          </span>
          <div>
            <strong>Plan financiero</strong>
            <small>Fondo de emergencia, reservas y estacionalidad</small>
          </div>
          <b className="chevron">
            <AppIcon name="chevron-right" size={16} />
          </b>
        </button>

        <button type="button" onClick={() => setSubView('accounts')}>
          <span className="menu-icon">
            <AppIcon name="credit-card" size={18} />
          </span>
          <div>
            <strong>Cuentas</strong>
            <small>Cuenta diaria, Ahorro y saldos derivados</small>
          </div>
          <b className="chevron">
            <AppIcon name="chevron-right" size={16} />
          </b>
        </button>

        <button
          type="button"
          onClick={() => {
            if (onNavigateToSavings) {
              onNavigateToSavings()
            }
          }}
        >
          <span className="menu-icon">
            <AppIcon name="piggy-bank" size={18} />
          </span>
          <div>
            <strong>Objetivos de ahorro</strong>
            <small>
              {finance.goals.length} metas · {money(finance.totals.assignedSavings)} asignados
            </small>
          </div>
          <b className="chevron">
            <AppIcon name="chevron-right" size={16} />
          </b>
        </button>

        <button type="button" onClick={() => setSubView('recurring')}>
          <span className="menu-icon">
            <AppIcon name="refresh-cw" size={18} />
          </span>
          <div>
            <strong>Gastos recurrentes</strong>
            <small>
              {finance.recurring.length} suscripciones y pagos programados
            </small>
          </div>
          <b className="chevron">
            <AppIcon name="chevron-right" size={16} />
          </b>
        </button>

        <button type="button" onClick={() => setSubView('budgets')}>
          <span className="menu-icon">
            <AppIcon name="target" size={18} />
          </span>
          <div>
            <strong>Presupuestos</strong>
            <small>
              {finance.budgets.length} límites por categoría · {finance.totals.budgetsSummary.overallUsagePercentage}% consumido
            </small>
          </div>
          <b className="chevron">
            <AppIcon name="chevron-right" size={16} />
          </b>
        </button>

        <button type="button" onClick={() => setSubView('statistics')}>
          <span className="menu-icon">
            <AppIcon name="sliders" size={18} />
          </span>
          <div>
            <strong>Estadísticas</strong>
            <small>Día, semana, mes y año con comparativas</small>
          </div>
          <b className="chevron">
            <AppIcon name="chevron-right" size={16} />
          </b>
        </button>

        <button type="button" onClick={() => setSubView('backup')}>
          <span className="menu-icon">
            <AppIcon name="shield" size={18} />
          </span>
          <div>
            <strong>Copias de seguridad</strong>
            <small>Exportar, importar y restaurar en JSON seguro</small>
          </div>
          <b className="chevron">
            <AppIcon name="chevron-right" size={16} />
          </b>
        </button>

        <button type="button" onClick={() => setSubView('settings')}>
          <span className="menu-icon">
            <AppIcon name="sliders" size={18} />
          </span>
          <div>
            <strong>Ajustes</strong>
            <small>Saldos iniciales y privacidad local</small>
          </div>
          <b className="chevron">
            <AppIcon name="chevron-right" size={16} />
          </b>
        </button>
      </section>
    </main>
  )
}

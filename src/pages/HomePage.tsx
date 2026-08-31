import { DonutChart } from '../components/DonutChart'
import { TransactionList } from '../components/TransactionList'
import type { Transaction } from '../models/finance'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'

export function HomePage({
  finance,
  onAdd,
  onSelectTransaction,
}: {
  finance: ReturnTypeFinance
  onAdd: () => void
  onSelectTransaction?: (tx: Transaction) => void
}) {
  return (
    <main className="page">
      <header className="topbar">
        <div>
          <span className="eyebrow">Mi dinero</span>
          <h1>Hola</h1>
        </div>
        <button className="round-button" onClick={onAdd} aria-label="Añadir movimiento">
          ＋
        </button>
      </header>

      <section className="hero-card">
        <span className="hero-tag">Disponible real</span>
        <strong className="hero-main-number">{money(finance.totals.realAvailable)}</strong>

        <div className="hero-kpis">
          <div className="hero-kpi-item">
            <span>Dinero total</span>
            <strong>{money(finance.totals.totalMoney)}</strong>
          </div>
          <div className="hero-kpi-item">
            <span>Ahorrado</span>
            <strong>{money(finance.totals.savingsBalance)}</strong>
          </div>
          <div className="hero-kpi-item">
            <span>Gastado este mes</span>
            <strong>{money(finance.totals.monthExpenses)}</strong>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title">
          <h2>Gastos por categoría</h2>
          <span>{money(finance.totals.monthExpenses)} este mes</span>
        </div>
        <DonutChart transactions={finance.transactions} categories={finance.categories} />
      </section>

      <section className="section">
        <div className="section-title">
          <h2>Últimos movimientos</h2>
        </div>
        <TransactionList
          transactions={finance.transactions}
          categories={finance.categories}
          limit={5}
          onSelect={onSelectTransaction}
        />
      </section>
    </main>
  )
}

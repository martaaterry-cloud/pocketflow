import type { ReturnTypeFinance } from '../types'
import { DonutChart } from '../components/DonutChart'
import { TransactionList } from '../components/TransactionList'
import { money } from '../utils/money'

export function HomePage({ finance, onAdd }: { finance: ReturnTypeFinance; onAdd: () => void }) {
  return (
    <main className="page">
      <header className="topbar"><div><span className="eyebrow">Mi dinero</span><h1>Hola</h1></div><button className="round-button" onClick={onAdd}>＋</button></header>
      <section className="hero-card">
        <span>Disponible real</span>
        <strong>{money(finance.totals.available)}</strong>
        <div className="hero-meta"><span>Saldo diario {money(finance.totals.daily)}</span><span>Comprometido {money(finance.totals.committed)}</span></div>
      </section>
      <section className="section"><div className="section-title"><h2>Gastos</h2><span>{money(finance.totals.monthExpenses)} este mes</span></div><DonutChart transactions={finance.transactions} categories={finance.categories} /></section>
      <section className="section"><div className="section-title"><h2>Últimos movimientos</h2></div><TransactionList transactions={finance.transactions} categories={finance.categories} limit={5} /></section>
    </main>
  )
}

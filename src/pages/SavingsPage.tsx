import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'

export function SavingsPage({ finance }: { finance: ReturnTypeFinance }) {
  return <main className="page"><header className="simple-header"><h1>Ahorro</h1></header><section className="hero-card light"><span>Cuenta de ahorro</span><strong>{money(finance.totals.savings)}</strong><div className="hero-meta"><span>Patrimonio total {money(finance.totals.total)}</span></div></section><section className="section"><div className="section-title"><h2>Objetivos</h2><button className="text-button">+ Nuevo</button></div>{finance.goals.map(goal => { const pct=Math.min(100,(goal.current/goal.target)*100); return <div className="goal-card" key={goal.id}><div><strong>{goal.name}</strong><span>{money(goal.current)} de {money(goal.target)}</span></div><div className="progress"><i style={{width:`${pct}%`}} /></div><small>{Math.round(pct)}%</small></div>})}</section></main>
}

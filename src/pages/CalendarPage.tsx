import { useMemo, useState } from 'react'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'

const weekdays = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export function CalendarPage({ finance }: { finance: ReturnTypeFinance }) {
  const now = new Date()
  const [selected, setSelected] = useState(now.getDate())
  const year = now.getFullYear(); const month = now.getMonth()
  const days = new Date(year, month + 1, 0).getDate()
  const first = (new Date(year, month, 1).getDay() + 6) % 7
  const totals = useMemo(() => {
    const map = new Map<number, number>()
    finance.transactions.filter(t => t.type === 'expense').forEach(t => { const d = new Date(t.date); if (d.getFullYear() === year && d.getMonth() === month) map.set(d.getDate(), (map.get(d.getDate()) ?? 0) + t.amount) })
    return map
  }, [finance.transactions, month, year])
  const selectedRows = finance.transactions.filter(t => { const d = new Date(t.date); return d.getFullYear() === year && d.getMonth() === month && d.getDate() === selected && t.type === 'expense' })
  return <main className="page"><header className="simple-header"><h1>Calendario</h1></header><section className="calendar-card"><h2>{new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric'}).format(now)}</h2><div className="calendar-grid weekdays">{weekdays.map(w => <span key={w}>{w}</span>)}</div><div className="calendar-grid">{Array.from({length:first}).map((_,i)=><span key={`e${i}`} />)}{Array.from({length:days},(_,i)=>i+1).map(day => <button key={day} className={selected===day?'selected':''} onClick={()=>setSelected(day)}><b>{day}</b>{totals.has(day) && <small>{Math.round(totals.get(day)!)}€</small>}</button>)}</div></section><section className="section"><div className="section-title"><h2>Día {selected}</h2><span>{money(selectedRows.reduce((s,t)=>s+t.amount,0))}</span></div>{selectedRows.length ? selectedRows.map(t=><div className="mini-row" key={t.id}><span>{t.description}</span><strong>−{money(t.amount)}</strong></div>) : <p className="muted">Sin gastos registrados.</p>}</section></main>
}

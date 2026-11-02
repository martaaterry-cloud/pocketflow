import { useState } from 'react'
import type { ReturnTypeFinance } from '../types'
import type { SpecialPeriod } from '../models/finance'
import { AppIcon } from '../ui/icons'

const eur = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })
const dateToday = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-') }
const isFuture = (p: SpecialPeriod) => Boolean(p.futureStatus)

export function FutureExpensesPage({ finance, onBack }: { finance: ReturnTypeFinance; onBack: () => void }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [date, setDate] = useState(dateToday)
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<'confirmed' | 'possible'>('confirmed')
  const [note, setNote] = useState('')
  const [linkId, setLinkId] = useState<Record<string,string>>({})
  const items = (finance.specialPeriods || []).filter(isFuture).sort((a,b) => a.startDate.localeCompare(b.startDate))
  const pending = items.filter(p => p.futureStatus === 'confirmed' && Number(p.expectedExtraBudget) > 0)
  const possible = items.filter(p => p.futureStatus === 'possible' && Number(p.expectedExtraBudget) > 0)
  const reset = () => { setEditing(null); setName(''); setDate(dateToday()); setAmount(''); setStatus('confirmed'); setNote('') }
  const edit = (p: SpecialPeriod) => {
    setEditing(p.id); setName(p.name); setDate(p.startDate)
    setAmount(p.expectedExtraBudget == null ? '' : String(p.expectedExtraBudget).replace('.', ','))
    setStatus(p.futureStatus === 'possible' ? 'possible' : 'confirmed'); setNote(p.note || '')
  }
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const value = amount.trim().replace(',', '.')
    if (!name.trim() || !date || (value !== '' && (!/^\\d+(?:\\.\\d{1,2})?$/.test(value) || Number(value) < 0))) {
      window.alert('Revisa el nombre, la fecha y el importe.'); return
    }
    const data = { name: name.trim(), startDate: date, endDate: date,
      expectedExtraBudget: value === '' ? undefined : Number(value),
      type: status === 'confirmed' ? 'expected_high_spend' as const : 'normal' as const,
      futureStatus: status, note: note.trim() || undefined }
    try {
      if (editing) finance.updateSpecialPeriod(editing, data)
      else finance.addSpecialPeriod(data)
      reset()
    } catch (error) { window.alert(error instanceof Error ? error.message : 'No se pudo guardar.') }
  }
  const linkPayment = (p: SpecialPeriod) => {
    const tx = finance.transactions.find(t => t.id === linkId[p.id] && t.type === 'expense')
    if (!tx) return
    if (!window.confirm('¿Vincular el gasto real «' + tx.description + '» y marcar «' + p.name + '» como pagado? No se creará otro movimiento.')) return
    finance.updateSpecialPeriod(p.id, { futureStatus: 'paid', paidTransactionId: tx.id, type: 'normal', expectedExtraBudget: 0 })
  }
  return <main className="page" style={{ paddingBottom: 110 }}>
    <header className="simple-header">
      <button type="button" className="text-button back-button" onClick={onBack}><AppIcon name="chevron-left" size={16}/> Más</button>
      <h1>Gastos futuros</h1>
    </header>
    <p className="muted">Planifica gastos puntuales sin restarlos del saldo bancario. Los posibles no cuentan como comprometidos y los pagados no se duplican.</p>
    <div className="hero-card light" style={{ display:'flex', justifyContent:'space-between', gap:12, marginBottom:20 }}>
      <div><small>Confirmados pendientes</small><h2>{eur(pending.reduce((sum,p)=>sum+Number(p.expectedExtraBudget),0))}</h2></div>
      <div><small>Posibles</small><h2>{eur(possible.reduce((sum,p)=>sum+Number(p.expectedExtraBudget),0))}</h2></div>
    </div>
    <section className="section">
      <h2>{editing ? 'Editar gasto futuro' : 'Nuevo gasto futuro'}</h2>
      <form onSubmit={save} className="payroll-card" style={{ display:'grid', gap:12, padding:16, border:'1px solid var(--border, #ddd)', borderRadius:16 }}>
        <label className="form-group">Concepto <input type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="Dentista, vestido de graduación…" required/></label>
        <label className="form-group">Fecha prevista <input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>
        <label className="form-group">Importe estimado (€) <input type="text" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Opcional, ej. 40,00"/></label>
        <label className="form-group">Estado
          <select value={status} onChange={e=>setStatus(e.target.value as 'confirmed'|'possible')}>
            <option value="confirmed">Confirmado</option><option value="possible">Posible</option>
          </select>
        </label>
        <label className="form-group">Nota (opcional) <input type="text" value={note} onChange={e=>setNote(e.target.value)} placeholder="Cita, tienda, detalles…"/></label>
        <button type="submit" className="primary-button">{editing ? 'Guardar cambios' : 'Añadir gasto futuro'}</button>
        {editing && <button type="button" className="text-button" onClick={reset}>Cancelar edición</button>}
      </form>
    </section>
    <section className="section" style={{ marginTop:24 }}>
      <h2>Próximos gastos ({items.filter(p=>p.futureStatus !== 'paid').length})</h2>
      {!items.length && <p className="muted">Todavía no tienes gastos futuros. Añade los que quieras prever.</p>}
      {items.map(p => {
        const matches = finance.transactions.filter(t => t.type === 'expense' && !items.some(other => other.id !== p.id && other.paidTransactionId === t.id))
        return <div key={p.id} className="special-period-card" style={{ marginTop:12, padding:14 }}>
          <div style={{ display:'flex',justifyContent:'space-between',gap:12 }}>
            <div><strong>{p.name}</strong><div className="muted">{p.startDate} · {p.futureStatus === 'paid' ? 'Pagado' : p.futureStatus === 'possible' ? 'Posible' : 'Confirmado'}</div></div>
            <strong>{p.futureStatus === 'paid' ? 'Pagado' : p.expectedExtraBudget == null ? 'Por definir' : eur(p.expectedExtraBudget)}</strong>
          </div>
          {p.note && <p className="muted">{p.note}</p>}
          {p.futureStatus !== 'paid' && <>
            <div style={{display:'flex', gap:10,marginTop:10}}>
              <button type="button" className="text-button" onClick={()=>edit(p)}>Editar</button>
              <button type="button" className="text-button" onClick={()=>{if(window.confirm('¿Eliminar esta previsión? No se borrarán movimientos reales.')) finance.deleteSpecialPeriod(p.id)}}>Eliminar</button>
            </div>
            <label className="form-group" style={{marginTop:10}}>Si ya has pagado, vincula el movimiento existente
              <select value={linkId[p.id] || ''} onChange={e=>setLinkId(prev=>({...prev,[p.id]:e.target.value}))}>
                <option value="">Seleccionar gasto registrado</option>
                {matches.map(t=><option key={t.id} value={t.id}>{t.date} · {t.description} · {eur(t.amount)}</option>)}
              </select>
            </label>
            <button type="button" className="text-button" disabled={!linkId[p.id]} onClick={()=>linkPayment(p)}>Marcar como pagado sin duplicar</button>
          </>}
        </div>
      })}
    </section>
  </main>
}

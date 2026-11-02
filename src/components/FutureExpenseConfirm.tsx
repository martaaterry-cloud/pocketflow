import { useState } from 'react'
import type { ReturnTypeFinance } from '../types'
import type { SpecialPeriod } from '../models/finance'

const euro = (value: number) => value.toLocaleString('es-ES', {style:'currency', currency:'EUR'})
const localToday = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-') }

/** Confirmation creates exactly one real expense; never debits balances before confirmation. */
export function FutureExpenseConfirm({finance,expense}: {finance: ReturnTypeFinance; expense: SpecialPeriod}) {
  const [open,setOpen] = useState(false)
  const [amount,setAmount] = useState(expense.expectedExtraBudget == null ? '' : String(expense.expectedExtraBudget).replace('.',','))
  const [date,setDate] = useState(localToday)
  const [method,setMethod] = useState<'bank'|'bizum'|'cash'>(expense.futurePaymentMethod || 'bank')
  const [accountId,setAccountId] = useState(finance.accounts[0]?.id || 'daily')
  const [categoryId,setCategoryId] = useState(expense.futureCategoryId || 'other')
  const [busy,setBusy] = useState(false)
  const today = localToday()
  const due = expense.startDate <= today
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || expense.futureStatus === 'paid') return
    const value = Number(amount.trim().replace(',','.'))
    if (!Number.isFinite(value) || value <= 0 || !/^\d+(?:[.,]\d{1,2})?$/.test(amount.trim())) {
      window.alert('Introduce un importe pagado válido.'); return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) {
      window.alert('La fecha del pago no puede estar en el futuro.'); return
    }
    if (method !== 'cash' && !finance.accounts.some(a=>a.id===accountId)) {
      window.alert('Selecciona una cuenta válida.'); return
    }
    if (!finance.categories.some(c=>c.id===categoryId)) {
      window.alert('Selecciona una categoría válida.'); return
    }
    if (!window.confirm('¿Confirmar el pago de '+euro(value)+' por '+(method==='cash'?'efectivo':method==='bizum'?'Bizum':'tarjeta/banco')+'? Se creará un solo gasto real.')) return
    setBusy(true)
    try {
      // Prevent duplicates on repeated taps and after a transient sync problem.
      if (expense.paidTransactionId || finance.specialPeriods.some(p=>p.id===expense.id && p.futureStatus==='paid')) return
      const existing = method==='cash'
        ? finance.cashTransactions.some(t=>t.type==='expense' && t.note?.includes('[future:'+expense.id+']'))
        : finance.transactions.some(t=>t.type==='expense' && t.note?.includes('[future:'+expense.id+']'))
      if (existing) { window.alert('Este gasto ya tiene un movimiento registrado. No se añadirá otro.'); return }
      const note = [expense.note, '[future:'+expense.id+']'].filter(Boolean).join(' ')
      const tx = method==='cash'
        ? finance.addCashTransaction({type:'expense', amount:value, description:expense.name, date, categoryId, paymentMethod:'cash', note, expenseNature:'extraordinary'})
        : finance.addTransaction({type:'expense', amount:value, description:expense.name, date, categoryId, accountId, paymentMethod:method, note, expenseNature:'extraordinary'})
      finance.updateSpecialPeriod(expense.id, {futureStatus:'paid', paidTransactionId:tx.id, type:'normal'})
      setOpen(false)
    } catch(error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo confirmar el pago. Comprueba Movimientos antes de intentarlo otra vez.')
    } finally { setBusy(false) }
  }
  if (expense.futureStatus === 'paid') return <small>Pago confirmado</small>
  return <div style={{marginTop:8}}>
    <button type="button" className="text-button" onClick={()=>setOpen(v=>!v)}>
      {open ? 'Cancelar' : due ? 'Confirmar pago' : 'Confirmar pago anticipado'}
    </button>
    {open && <form onSubmit={submit} style={{display:'grid',gap:10,marginTop:10,padding:12,background:'var(--surface-secondary, #f8fafc)',borderRadius:12}}>
      <label className="form-group">Importe realmente pagado (€)
        <input type="text" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Ej. 40,00" required/>
      </label>
      <label className="form-group">Fecha real del pago
        <input type="date" value={date} max={today} onChange={e=>setDate(e.target.value)} required/>
      </label>
      <label className="form-group">Categoría
        <select value={categoryId} onChange={e=>setCategoryId(e.target.value)}>
          {finance.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="form-group">Método
        <select value={method} onChange={e=>setMethod(e.target.value as 'bank'|'bizum'|'cash')}>
          <option value="bank">Tarjeta / Banco</option><option value="bizum">Bizum</option><option value="cash">Efectivo</option>
        </select>
      </label>
      {method!=='cash' && <label className="form-group">Cuenta
        <select value={accountId} onChange={e=>setAccountId(e.target.value)}>
          {finance.accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>}
      <button type="submit" disabled={busy}>{busy ? 'Confirmando…' : 'Guardar pago real'}</button>
    </form>}
  </div>
}

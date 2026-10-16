import { useEffect, useMemo, useRef, useState } from 'react'
import type { PaymentMethod } from '../models/finance'
import type { ReturnTypeFinance } from '../types'
import { getSupabase } from '../services/supabase/supabaseClient'
import { AppIcon } from '../ui/icons'
import { money } from '../utils/money'

type Shortcut = {
  id: string
  user_id: string
  name: string
  icon_key: string
  amount: number
  category_id: string
  payment_method: PaymentMethod
  account_id: string | null
  pinned: boolean
  position: number
}
const ICONS = ['dumbbell', 'coffee', 'car', 'shopping-basket', 'ticket', 'heart-pulse', 'receipt', 'shirt'] as const
const LIMIT = 3
const amountValue = (value: string) => Number(value.replace(',', '.'))

export function QuickExpenseShortcuts({ finance }: { finance: ReturnTypeFinance }) {
  const userId = finance.userId
  const [items, setItems] = useState<Shortcut[]>([])
  const [menu, setMenu] = useState(false)
  const [managing, setManaging] = useState(false)
  const [active, setActive] = useState<Shortcut | null>(null)
  const [editing, setEditing] = useState<Shortcut | 'new' | null>(null)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<string>('receipt')
  const [amount, setAmount] = useState('1,50')
  const [categoryId, setCategoryId] = useState('')
  const [payment, setPayment] = useState<PaymentMethod>('bank')
  const [account, setAccount] = useState('')
  const [pinned, setPinned] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const accounts = finance.accounts.filter(a => a.type === 'spending')
  const defaultAccount = accounts.find(a => a.id === 'daily')?.id ?? accounts[0]?.id ?? ''
  const ordered = useMemo(() => [...items].sort((a,b) => a.position - b.position), [items])
  const featured = ordered.filter(s => s.pinned).slice(0, LIMIT)

  useEffect(() => {
    if (!userId) { setItems([]); return }
    let live = true
    const client = getSupabase()
    const refresh = async () => {
      const { data, error } = await client.from('quick_expense_shortcuts').select('*').eq('user_id', userId).order('position')
      if (!live) return
      if (error) { setMessage('No se pudieron cargar los accesos.'); return }
      setItems((data ?? []) as Shortcut[])
    }
    void refresh()
    const channel = client.channel('quick-expense-shortcuts-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quick_expense_shortcuts', filter: 'user_id=eq.' + userId }, () => { void refresh() })
      .subscribe()
    return () => { live = false; void client.removeChannel(channel) }
  }, [userId])

  const openEdit = (item: Shortcut | 'new') => {
    setEditing(item)
    setMenu(false)
    setName(item === 'new' ? '' : item.name)
    setIcon(item === 'new' ? 'receipt' : item.icon_key)
    setAmount(item === 'new' ? '1,50' : String(item.amount).replace('.', ','))
    setCategoryId(item === 'new' ? (finance.categories[0]?.id ?? 'other') : item.category_id)
    setPayment(item === 'new' ? 'bank' : item.payment_method)
    setAccount(item === 'new' ? defaultAccount : (item.account_id ?? defaultAccount))
    setPinned(item === 'new' ? featured.length < LIMIT : item.pinned)
    setMessage('')
  }
  const openRecord = (item: Shortcut) => {
    setActive(item); setMenu(false); setMessage('')
    setAmount(String(item.amount).replace('.', ','))
    setPayment(item.payment_method)
    setAccount(item.account_id && accounts.some(a => a.id === item.account_id) ? item.account_id : defaultAccount)
  }
  const refresh = async () => {
    if (!userId) return
    const { data } = await getSupabase().from('quick_expense_shortcuts').select('*').eq('user_id', userId).order('position')
    if (data) setItems(data as Shortcut[])
  }
  const save = async () => {
    const value = amountValue(amount)
    if (!userId || lock.current || !name.trim() || !Number.isFinite(value) || value <= 0 || !categoryId) { setMessage('Revisa nombre, importe y categoría.'); return }
    if (pinned && featured.length >= LIMIT && (editing === 'new' || (typeof editing === 'object' && editing !== null && !editing.pinned))) { setMessage('Solo puedes fijar tres accesos.'); return }
    lock.current = true; setBusy(true); setMessage('')
    try {
      const input = { name: name.trim(), icon_key: icon, amount: value, category_id: categoryId, payment_method: payment, account_id: payment === 'cash' ? null : account || defaultAccount, pinned, position: editing === 'new' ? ordered.length : (editing as Shortcut).position }
      const client = getSupabase()
      const result = editing === 'new'
        ? await client.from('quick_expense_shortcuts').insert({ ...input, user_id: userId })
        : await client.from('quick_expense_shortcuts').update(input).eq('id', (editing as Shortcut).id).eq('user_id', userId)
      if (result.error) throw result.error
      await refresh(); setEditing(null)
    } catch { setMessage('No se ha podido guardar el acceso.'); }
    finally { lock.current = false; setBusy(false) }
  }
  const remove = async (item: Shortcut) => {
    if (!userId || lock.current || !window.confirm('¿Eliminar este acceso? Tus gastos registrados se conservan.')) return
    lock.current = true; setBusy(true)
    try {
      const { error } = await getSupabase().from('quick_expense_shortcuts').delete().eq('id', item.id).eq('user_id', userId)
      if (error) throw error
      await refresh(); setEditing(null)
    } catch { setMessage('No se ha podido eliminar el acceso.') }
    finally { lock.current = false; setBusy(false) }
  }
  const record = () => {
    if (!active || lock.current) return
    const value = amountValue(amount)
    if (!Number.isFinite(value) || value <= 0) { setMessage('Introduce un importe válido.'); return }
    if (payment !== 'cash' && !account) { setMessage('Selecciona una cuenta.'); return }
    lock.current = true; setBusy(true)
    try {
      const common = { type: 'expense' as const, amount: value, description: active.name, date: new Date().toISOString(), categoryId: active.category_id, paymentMethod: payment }
      if (payment === 'cash') finance.addCashTransaction(common)
      else finance.addTransaction({ ...common, accountId: account, expenseNature: 'variable' })
      setActive(null)
    } catch { setMessage('No se ha podido registrar el gasto.') }
    finally { lock.current = false; setBusy(false) }
  }
  const togglePin = async (item: Shortcut) => {
    if (!userId || busy) return
    if (!item.pinned && featured.length >= LIMIT) { setMessage('Solo puedes fijar tres accesos.'); return }
    setBusy(true)
    const { error } = await getSupabase().from('quick_expense_shortcuts').update({ pinned: !item.pinned }).eq('id', item.id).eq('user_id', userId)
    if (error) setMessage('No se pudo actualizar el acceso.')
    await refresh(); setBusy(false)
  }
  return (
    <>
      <div className="quick-expense-bar" aria-label="Accesos rápidos personales">
        {featured.map(item => <button type="button" key={item.id} className="gym-quick-button" aria-label={'Registrar ' + item.name} title={item.name} onClick={() => openRecord(item)}><AppIcon name={item.icon_key} size={15}/></button>)}
        <button type="button" className="gym-quick-button" title="Mis accesos rápidos" aria-label="Abrir accesos rápidos" onClick={() => setMenu(true)}><AppIcon name="more-horizontal" size={17}/></button>
      </div>
      {menu && <div className="modal-backdrop" onClick={() => setMenu(false)}><div className="modal gym-register-modal" role="dialog" aria-modal="true" aria-label="Mis accesos rápidos" onClick={e => e.stopPropagation()}>
        <header className="modal-header"><h2>Mis accesos rápidos</h2><button type="button" className="close-button" onClick={() => setMenu(false)}>✕</button></header>
        <div className="gym-dialog-body">
          <button type="button" className="gym-cancel-button" onClick={() => setManaging(!managing)}>{managing ? 'Terminar de organizar' : 'Organizar accesos'}</button>
          {ordered.map(item => <div key={item.id} className="quick-expense-item"><AppIcon name={item.icon_key} size={18}/><span>{item.name} · {money(item.amount)}</span>{managing ? <><button type="button" disabled={busy} onClick={() => void togglePin(item)}>{item.pinned ? 'Desfijar' : 'Fijar'}</button><button type="button" onClick={() => openEdit(item)}>Editar</button></> : <button type="button" onClick={() => {setMenu(false);openRecord(item)}}>Registrar</button>}</div>)}
          {message && <p role="status">{message}</p>}
          <button type="button" className="primary-button" onClick={() => openEdit('new')}>+ Crear acceso rápido</button>
        </div>
      </div></div>}
      {editing && <div className="modal-backdrop" onClick={() => setEditing(null)}><div className="modal gym-register-modal" role="dialog" aria-modal="true" aria-label="Editar acceso rápido" onClick={e => e.stopPropagation()}>
        <header className="modal-header"><h2>{editing === 'new' ? 'Nuevo acceso rápido' : 'Editar acceso rápido'}</h2><button type="button" className="close-button" onClick={() => setEditing(null)}>✕</button></header>
        <div className="gym-dialog-body">
          <label className="gym-account-field"><span>Nombre</span><input value={name} maxLength={80} onChange={e => setName(e.target.value)}/></label>
          <label className="gym-account-field"><span>Icono</span><select value={icon} onChange={e => setIcon(e.target.value)}>{ICONS.map(key => <option key={key} value={key}>{key}</option>)}</select></label>
          <label className="gym-account-field"><span>Importe habitual (€)</span><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}/></label>
          <label className="gym-account-field"><span>Categoría</span><select value={categoryId} onChange={e => setCategoryId(e.target.value)}>{finance.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="gym-account-field"><span>Pago habitual</span><select value={payment} onChange={e => setPayment(e.target.value as PaymentMethod)}><option value="bank">Tarjeta</option><option value="bizum">Bizum</option><option value="cash">Efectivo</option></select></label>
          {payment !== 'cash' && <label className="gym-account-field"><span>Cuenta</span><select value={account} onChange={e => setAccount(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
          <label><input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)}/> Mostrar en Inicio (máximo 3)</label>
          {message && <p role="alert">{message}</p>}
          <div className="gym-dialog-actions"><button type="button" className="gym-cancel-button" onClick={() => setEditing(null)}>Cancelar</button><button type="button" className="primary-button" disabled={busy} onClick={() => void save()}>Guardar</button></div>
          {editing !== 'new' && <button type="button" className="gym-cancel-button" onClick={() => void remove(editing)}>Eliminar acceso</button>}
        </div>
      </div></div>}
      {active && <div className="modal-backdrop" onClick={() => setActive(null)}><div className="modal gym-register-modal" role="dialog" aria-modal="true" aria-label={'Registrar ' + active.name} onClick={e => e.stopPropagation()}>
        <header className="modal-header"><div className="gym-dialog-heading"><span className="gym-dialog-icon"><AppIcon name={active.icon_key} size={18}/></span><h2>{active.name}</h2></div><button className="close-button" type="button" onClick={() => setActive(null)}>✕</button></header>
        <div className="gym-dialog-body">
          <label className="gym-account-field"><span>Importe del gasto (€)</span><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}/></label>
          <fieldset className="gym-payment-methods"><legend>Método de pago</legend><div className="gym-payment-options">{([['bank','Tarjeta'],['bizum','Bizum'],['cash','Efectivo']] as const).map(([method,label]) => <button type="button" key={method} className={payment===method?'gym-payment-option selected':'gym-payment-option'} aria-pressed={payment===method} onClick={() => setPayment(method)}>{label}</button>)}</div></fieldset>
          {payment !== 'cash' && <label className="gym-account-field"><span>Cuenta</span><select value={account} onChange={e=>setAccount(e.target.value)}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
          {message && <p role="alert">{message}</p>}
          <div className="gym-dialog-actions"><button type="button" className="gym-cancel-button" onClick={() => setActive(null)}>Cancelar</button><button type="button" className="primary-button" disabled={busy} onClick={record}>Registrar gasto</button></div>
        </div>
      </div></div>}
    </>
  )
}

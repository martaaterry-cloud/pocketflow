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
const ICONS = [
  { key: 'dumbbell', label: 'Gimnasio' }, { key: 'coffee', label: 'Café' },
  { key: 'car', label: 'Coche' }, { key: 'shopping-basket', label: 'Compra' },
  { key: 'ticket', label: 'Ocio' }, { key: 'heart-pulse', label: 'Salud' },
  { key: 'shirt', label: 'Ropa' }, { key: 'gift', label: 'Regalos' },
  { key: 'plane', label: 'Viajes' }, { key: 'house', label: 'Hogar' },
  { key: 'laptop', label: 'Tecnología' }, { key: 'receipt', label: 'Otros' },
] as const
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
  const categoryName = (id: string) => finance.categories.find(c => c.id === id)?.name ?? 'Sin categoría'
  const paymentName = (method: PaymentMethod) => method === 'bank' ? 'Tarjeta' : method === 'bizum' ? 'Bizum' : 'Efectivo'
  const draftPreview = { name: name.trim() || 'Nuevo acceso', amount: amountValue(amount), icon, payment, categoryId }
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
      {menu && <div className="modal-backdrop" onClick={() => setMenu(false)}><div className="modal gym-register-modal shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-list-title" onClick={e => e.stopPropagation()}>
        <header className="modal-header shortcuts-modal-header">
          <div><h2 id="shortcuts-list-title">Mis accesos rápidos</h2><p>Hasta 3 visibles en Inicio. Los demás viven aquí.</p></div>
          <button type="button" className="close-button" aria-label="Cerrar" onClick={() => setMenu(false)}>✕</button>
        </header>
        <div className="gym-dialog-body shortcuts-modal-body">
          <div className="shortcuts-toolbar">
            <button type="button" className="shortcuts-ghost" onClick={() => setManaging(!managing)}><AppIcon name="sliders" size={15}/>{managing ? 'Terminar' : 'Organizar'}</button>
            <button type="button" className="shortcuts-new" onClick={() => openEdit('new')}><AppIcon name="plus" size={15}/> Nuevo</button>
          </div>
          {ordered.length === 0 && <div className="shortcuts-empty"><AppIcon name="receipt" size={27}/><strong>Aún no tienes accesos rápidos</strong><span>Crea uno para registrar tus gastos habituales en segundos.</span></div>}
          <div className="shortcuts-list">
            {ordered.map(item => <div key={item.id} className="shortcuts-row">
              <span className="shortcuts-row-icon"><AppIcon name={item.icon_key} size={19}/></span>
              <div className="shortcuts-row-info"><strong>{item.name}</strong><small>{money(item.amount)} · {paymentName(item.payment_method)} · {categoryName(item.category_id)}</small>{item.pinned && <span className="shortcuts-pinned"><AppIcon name="check" size={12}/> En Inicio</span>}</div>
              <div className="shortcuts-row-actions">{managing ? <>
                <button type="button" className="shortcuts-icon-action" disabled={busy} title={item.pinned ? 'Desfijar' : 'Mostrar en Inicio'} onClick={() => void togglePin(item)}><AppIcon name={item.pinned ? 'check' : 'plus'} size={16}/></button>
                <button type="button" className="shortcuts-ghost" onClick={() => openEdit(item)}>Editar</button>
              </> : <button type="button" className="shortcuts-register" onClick={() => openRecord(item)}>Registrar</button>}</div>
            </div>)}
          </div>
          {message && <p className="shortcuts-feedback" role="status">{message}</p>}
          <button type="button" className="primary-button shortcuts-bottom-add" onClick={() => openEdit('new')}><AppIcon name="plus" size={16}/> Crear acceso rápido</button>
        </div>
      </div></div>}
      {editing && <div className="modal-backdrop" onClick={() => setEditing(null)}><div className="modal gym-register-modal shortcuts-modal shortcuts-editor" role="dialog" aria-modal="true" aria-labelledby="shortcuts-editor-title" onClick={e => e.stopPropagation()}>
        <header className="modal-header shortcuts-modal-header"><div><h2 id="shortcuts-editor-title">{editing === 'new' ? 'Nuevo acceso rápido' : 'Editar acceso rápido'}</h2><p>Personaliza cómo registras tus gastos habituales.</p></div><button type="button" className="close-button" aria-label="Cerrar" onClick={() => setEditing(null)}>✕</button></header>
        <div className="shortcuts-editor-scroll">
          <div className="shortcuts-preview"><span className="shortcuts-preview-icon"><AppIcon name={draftPreview.icon} size={23}/></span><div><small>VISTA PREVIA</small><strong>{draftPreview.name}</strong><span>{Number.isFinite(draftPreview.amount) && draftPreview.amount > 0 ? money(draftPreview.amount) : '— €'} · {paymentName(draftPreview.payment)} · {categoryName(draftPreview.categoryId)}</span></div></div>
          <div className="shortcuts-fields">
            <label className="gym-account-field"><span>Nombre</span><input placeholder="Ej. Gimnasio Rafa" value={name} maxLength={80} onChange={e => setName(e.target.value)}/></label>
            <label className="gym-account-field"><span>Importe habitual (€)</span><input inputMode="decimal" placeholder="1,50" value={amount} onChange={e => setAmount(e.target.value)}/></label>
            <label className="gym-account-field"><span>Categoría</span><select value={categoryId} onChange={e => setCategoryId(e.target.value)}>{finance.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          </div>
          <fieldset className="shortcuts-icon-field"><legend>Elige un icono</legend><div className="shortcuts-icon-grid">{ICONS.map(choice => <button type="button" key={choice.key} className={icon === choice.key ? 'shortcuts-icon-choice selected' : 'shortcuts-icon-choice'} aria-label={choice.label} aria-pressed={icon === choice.key} onClick={() => setIcon(choice.key)}><AppIcon name={choice.key} size={21}/><span>{choice.label}</span></button>)}</div></fieldset>
          <fieldset className="gym-payment-methods"><legend>Pago habitual</legend><div className="gym-payment-options">{([['bank','Tarjeta'],['bizum','Bizum'],['cash','Efectivo']] as const).map(([method,label]) => <button type="button" key={method} className={payment===method?'gym-payment-option selected':'gym-payment-option'} aria-pressed={payment===method} onClick={() => setPayment(method)}>{label}</button>)}</div></fieldset>
          {payment !== 'cash' && <label className="gym-account-field"><span>Cuenta</span><select value={account} onChange={e => setAccount(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
          <label className="shortcuts-pin-toggle"><span><strong>Mostrar en Inicio</strong><small>Hasta 3 accesos visibles</small></span><input type="checkbox" checked={pinned} disabled={!pinned && featured.length >= LIMIT && (editing === 'new' || (editing !== null && typeof editing === 'object' && !editing.pinned))} onChange={e => setPinned(e.target.checked)}/></label>
          {message && <p role="alert" className="shortcuts-feedback">{message}</p>}
          {editing !== 'new' && <button type="button" className="shortcuts-delete" onClick={() => void remove(editing)}><AppIcon name="trash-2" size={15}/> Eliminar acceso</button>}
        </div>
        <div className="shortcuts-footer"><button type="button" className="gym-cancel-button" onClick={() => setEditing(null)}>Cancelar</button><button type="button" className="primary-button" disabled={busy} onClick={() => void save()}>Guardar acceso</button></div>
      </div></div>}
      {active && <div className="modal-backdrop" onClick={() => setActive(null)}><div className="modal gym-register-modal shortcuts-modal" role="dialog" aria-modal="true" aria-label={'Registrar ' + active.name} onClick={e => e.stopPropagation()}>
        <header className="modal-header shortcuts-modal-header"><div className="gym-dialog-heading"><span className="gym-dialog-icon"><AppIcon name={active.icon_key} size={19}/></span><div><h2>{active.name}</h2><p>Registrar gasto habitual</p></div></div><button type="button" className="close-button" aria-label="Cerrar" onClick={() => setActive(null)}>✕</button></header>
        <div className="gym-dialog-body">
          <label className="gym-account-field"><span>Importe del gasto (€)</span><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}/></label>
          <fieldset className="gym-payment-methods"><legend>Método de pago</legend><div className="gym-payment-options">{([['bank','Tarjeta'],['bizum','Bizum'],['cash','Efectivo']] as const).map(([method,label]) => <button type="button" key={method} className={payment===method?'gym-payment-option selected':'gym-payment-option'} aria-pressed={payment===method} onClick={() => setPayment(method)}>{label}</button>)}</div></fieldset>
          {payment !== 'cash' && <label className="gym-account-field"><span>Cuenta</span><select value={account} onChange={e=>setAccount(e.target.value)}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
          {message && <p role="alert" className="shortcuts-feedback">{message}</p>}
          <div className="gym-dialog-actions"><button type="button" className="gym-cancel-button" onClick={() => setActive(null)}>Cancelar</button><button type="button" className="primary-button" disabled={busy} onClick={record}>Registrar gasto</button></div>
        </div>
      </div></div>}
    </>
  )
}

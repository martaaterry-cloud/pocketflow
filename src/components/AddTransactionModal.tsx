import { useState } from 'react'
import type { Account, Category, TransactionType } from '../models/finance'

export function AddTransactionModal({ open, onClose, accounts, categories, onAdd }: {
  open: boolean
  onClose: () => void
  accounts: Account[]
  categories: Category[]
  onAdd: (value: { type: TransactionType; amount: number; description: string; categoryId?: string; accountId: string; toAccountId?: string; date: string }) => void
}) {
  const [type, setType] = useState<TransactionType>('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id)
  const [accountId, setAccountId] = useState(accounts[0]?.id)
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id)

  if (!open) return null

  const submit = () => {
    const numeric = Number(amount.replace(',', '.'))
    if (!numeric || !description.trim()) return
    onAdd({ type, amount: numeric, description: description.trim(), categoryId: type === 'expense' ? categoryId : undefined, accountId, toAccountId: type === 'transfer' ? toAccountId : undefined, date: new Date().toISOString() })
    setAmount('')
    setDescription('')
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>Añadir movimiento</h3><button onClick={onClose}>×</button></div>
        <div className="segmented">
          <button className={type === 'expense' ? 'active' : ''} onClick={() => setType('expense')}>Gasto</button>
          <button className={type === 'income' ? 'active' : ''} onClick={() => setType('income')}>Ingreso</button>
          <button className={type === 'transfer' ? 'active' : ''} onClick={() => setType('transfer')}>Transferencia</button>
        </div>
        <label>Importe<input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></label>
        <label>Concepto<input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mercadona, cena…" /></label>
        {type === 'expense' && <label>Categoría<select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        <label>Cuenta<select value={accountId} onChange={(e) => setAccountId(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        {type === 'transfer' && <label>Destino<select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>{accounts.filter(a => a.id !== accountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
        <button className="primary-button" onClick={submit}>Guardar</button>
      </div>
    </div>
  )
}

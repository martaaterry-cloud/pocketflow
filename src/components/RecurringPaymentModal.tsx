import { useEffect, useState, useMemo } from 'react'
import type {
  Account,
  Category,
  CreateRecurringPaymentInput,
  PaymentMethod,
  RecurringFrequency,
  RecurringIncomeSourceType,
  RecurringPayment,
  SharedContact,
  UpdateRecurringPaymentInput,
} from '../models/finance'
import { money } from '../utils/money'
import { splitExpenseEqually } from '../utils/sharedExpenseSelectors'
import { AppIcon } from '../ui/icons'

interface RecurringPaymentModalProps {
  open: boolean
  onClose: () => void
  accounts: Account[]
  categories: Category[]
  sharedContacts?: SharedContact[]
  payment?: RecurringPayment | null
  onSave: (data: CreateRecurringPaymentInput | UpdateRecurringPaymentInput, id?: string) => void
  onDelete?: (id: string) => void
}

interface ParticipantEntry {
  name: string
  contactId?: string
  customAmount?: number
  isUserShare?: boolean
}

export function RecurringPaymentModal({
  open,
  onClose,
  accounts,
  categories,
  sharedContacts = [],
  payment,
  onSave,
  onDelete,
}: RecurringPaymentModalProps) {
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [incomeSourceType, setIncomeSourceType] = useState<RecurringIncomeSourceType>('salary')
  const [accountId, setAccountId] = useState('')
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [nextDate, setNextDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank')
  const [active, setActive] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Estados para Gasto Compartido
  const [isShared, setIsShared] = useState(false)
  const [paidBy, setPaidBy] = useState<'user' | 'contact'>('user')
  const [payerName, setPayerName] = useState('')
  const [payerContactId, setPayerContactId] = useState<string | undefined>(undefined)
  const [expensePaymentMethod, setExpensePaymentMethod] = useState<PaymentMethod>('bank')
  const [settlementPaymentMethod, setSettlementPaymentMethod] = useState<PaymentMethod>('bizum')
  const [settlementAccountId, setSettlementAccountId] = useState('')

  const [selfParticipates, setSelfParticipates] = useState(true)
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal')
  const [participants, setParticipants] = useState<ParticipantEntry[]>([])
  const [newParticipantInput, setNewParticipantInput] = useState('')

  const isEditing = Boolean(payment)

  // Filtrar categorías históricas (como Cajero) para nuevas selecciones
  const selectableCategories = useMemo(() => {
    return categories.filter((c) => {
      if (c.id === 'atm' || c.name.toLowerCase() === 'cajero' || c.isHistorical) {
        return isEditing && payment?.categoryId === c.id
      }
      return true
    })
  }, [categories, isEditing, payment?.categoryId])

  useEffect(() => {
    const defaultAcc = accounts.find((a) => a.type === 'spending')?.id ?? accounts[0]?.id ?? 'daily'

    if (payment) {
      setType(payment.type || 'expense')
      setName(payment.name)
      setAmount(String(payment.amount).replace('.', ','))
      setCategoryId(payment.categoryId)
      setIncomeSourceType((payment.incomeSourceType as RecurringIncomeSourceType) || 'salary')
      setAccountId(payment.accountId || defaultAcc)
      setFrequency(payment.frequency)
      setNextDate(payment.nextDate)
      setPaymentMethod(payment.paymentMethod || 'bank')
      setActive(payment.active)

      const shared = Boolean(payment.isShared)
      setIsShared(shared)
      const pBy = payment.paidBy || payment.sharingTemplate?.payer || 'user'
      setPaidBy(pBy)
      setPayerName(payment.payerName || payment.sharingTemplate?.payerName || '')
      setPayerContactId(payment.payerContactId || payment.sharingTemplate?.payerContactId || undefined)
      setExpensePaymentMethod(payment.expensePaymentMethod || payment.paymentMethod || 'bank')
      setSettlementPaymentMethod(payment.settlementPaymentMethod || payment.sharingTemplate?.settlementPaymentMethod || 'bizum')
      setSettlementAccountId(payment.settlementAccountId || payment.sharingTemplate?.settlementAccountId || defaultAcc)

      setSelfParticipates(payment.sharingTemplate?.includePayer ?? true)
      setSplitType(payment.sharingTemplate?.splitType ?? 'equal')
      setParticipants(
        payment.sharingTemplate?.participants.map((p) => ({
          name: p.name,
          contactId: p.contactId,
          customAmount: p.amount,
          isUserShare: p.isUserShare,
        })) ?? []
      )
      setNewParticipantInput('')
      setConfirmDelete(false)
    } else {
      setType('expense')
      setName('')
      setAmount('')
      setCategoryId(selectableCategories[0]?.id ?? 'subscriptions')
      setIncomeSourceType('salary')
      setAccountId(defaultAcc)
      setFrequency('monthly')
      setNextDate(new Date().toISOString().slice(0, 10))
      setPaymentMethod('bank')
      setActive(true)
      setIsShared(false)
      setPaidBy('user')
      setPayerName('')
      setPayerContactId(undefined)
      setExpensePaymentMethod('bank')
      setSettlementPaymentMethod('bizum')
      setSettlementAccountId(defaultAcc)
      setSelfParticipates(true)
      setSplitType('equal')
      setParticipants([])
      setNewParticipantInput('')
      setConfirmDelete(false)
    }
  }, [payment, open, accounts, selectableCategories])

  const numericAmount = Number(amount.replace(',', '.')) || 0

  // Cálculo de reparto en tiempo real con exactitud de céntimos
  const computedShares = useMemo(() => {
    if (!isShared || numericAmount <= 0) return []

    if (paidBy === 'user') {
      if (splitType === 'equal') {
        const externalList = participants.map((p) => ({
          name: p.name,
          contactId: p.contactId,
        }))
        return splitExpenseEqually(numericAmount, externalList, selfParticipates, 'Tú')
      } else {
        const results = []
        if (selfParticipates) {
          const externalTotal = participants.reduce((s, p) => s + (p.customAmount || 0), 0)
          const payerAmount = Math.max(0, Math.round((numericAmount - externalTotal) * 100) / 100)
          results.push({
            participantName: 'Tú',
            isPayerShare: true,
            isUserShare: false,
            amount: payerAmount,
          })
        }
        participants.forEach((p) => {
          results.push({
            participantName: p.name,
            contactId: p.contactId,
            isPayerShare: false,
            isUserShare: false,
            amount: p.customAmount || 0,
          })
        })
        return results
      }
    } else {
      // Paga otra persona (paidBy === 'contact')
      const effectivePayerName = payerName.trim() || 'Contacto'
      if (splitType === 'equal') {
        const externalList = participants
          .filter((p) => p.name.toLowerCase() !== effectivePayerName.toLowerCase())
          .map((p) => ({
            name: p.name,
            contactId: p.contactId,
          }))

        // Si el pagador no está en la lista de participantes externos, lo incluimos
        const listWithPayer = [
          { name: effectivePayerName, contactId: payerContactId },
          ...externalList,
        ]

        const split = splitExpenseEqually(numericAmount, listWithPayer, selfParticipates, 'Tú')
        return split.map((s) => {
          const isPayer = s.participantName.toLowerCase() === effectivePayerName.toLowerCase()
          return {
            ...s,
            isPayerShare: isPayer,
            isUserShare: !isPayer && (s.participantName.toLowerCase() === 'tú' || s.isPayerShare),
          }
        })
      } else {
        // Personalizado
        const results: { participantName: string; contactId?: string; isPayerShare: boolean; isUserShare: boolean; amount: number }[] = []
        let userAmount = 0
        const userEntry = participants.find((p) => p.isUserShare || p.name.toLowerCase() === 'tú')
        if (userEntry) {
          userAmount = userEntry.customAmount || 0
        }

        if (selfParticipates && userAmount > 0) {
          results.push({
            participantName: 'Tú',
            isPayerShare: false,
            isUserShare: true,
            amount: userAmount,
          })
        }

        const others = participants.filter((p) => !p.isUserShare && p.name.toLowerCase() !== 'tú' && p.name.toLowerCase() !== effectivePayerName.toLowerCase())
        others.forEach((p) => {
          results.push({
            participantName: p.name,
            contactId: p.contactId,
            isPayerShare: false,
            isUserShare: false,
            amount: p.customAmount || 0,
          })
        })

        const nonPayerTotal = results.reduce((acc, r) => acc + r.amount, 0)
        const payerPart = Math.max(0, Math.round((numericAmount - nonPayerTotal) * 100) / 100)
        results.unshift({
          participantName: effectivePayerName,
          contactId: payerContactId,
          isPayerShare: true,
          isUserShare: false,
          amount: payerPart,
        })

        return results
      }
    }
  }, [isShared, numericAmount, paidBy, payerName, payerContactId, splitType, participants, selfParticipates])

  if (!open) return null

  const handleAddParticipant = (nameToAdd?: string) => {
    const rawName = (nameToAdd || newParticipantInput).trim()
    if (!rawName) return

    if (participants.some((p) => p.name.toLowerCase() === rawName.toLowerCase())) {
      setNewParticipantInput('')
      return
    }

    const matchedContact = sharedContacts.find(
      (c) => c.displayName.toLowerCase() === rawName.toLowerCase()
    )

    setParticipants((prev) => [
      ...prev,
      {
        name: rawName,
        contactId: matchedContact?.id,
        customAmount: 0,
      },
    ])
    setNewParticipantInput('')
  }

  const handleRemoveParticipant = (index: number) => {
    setParticipants((prev) => prev.filter((_, i) => i !== index))
  }

  const handleCustomAmountChange = (index: number, val: string) => {
    const num = Number(val.replace(',', '.')) || 0
    setParticipants((prev) =>
      prev.map((p, i) => (i === index ? { ...p, customAmount: num } : p))
    )
  }

  const handleSelectPayerContact = (nameVal: string) => {
    setPayerName(nameVal)
    const match = sharedContacts.find((c) => c.displayName.toLowerCase() === nameVal.toLowerCase())
    setPayerContactId(match?.id)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || numericAmount <= 0) return

    const effectiveExpenseMethod = isShared ? expensePaymentMethod : paymentMethod

    const data: CreateRecurringPaymentInput = {
      type,
      name: name.trim(),
      amount: numericAmount,
      categoryId: type === 'income' ? (categories.find((c) => c.id === 'income')?.id || 'income') : categoryId,
      incomeSourceType: type === 'income' ? incomeSourceType : undefined,
      accountId: effectiveExpenseMethod === 'cash' ? 'cash' : (accountId || 'daily'),
      frequency,
      nextDate,
      paymentMethod: effectiveExpenseMethod,
      expensePaymentMethod: type === 'expense' ? effectiveExpenseMethod : undefined,
      paidBy: type === 'expense' && isShared ? paidBy : 'user',
      payerName: type === 'expense' && isShared && paidBy === 'contact' ? (payerName.trim() || undefined) : undefined,
      payerContactId: type === 'expense' && isShared && paidBy === 'contact' ? (payerContactId || undefined) : undefined,
      settlementPaymentMethod: type === 'expense' && isShared ? settlementPaymentMethod : undefined,
      settlementAccountId: type === 'expense' && isShared && settlementPaymentMethod !== 'cash' ? settlementAccountId : undefined,
      active,
      isShared: type === 'expense' && isShared,
      sharingTemplate: type === 'expense' && isShared
        ? {
            splitType,
            includePayer: paidBy === 'user' ? selfParticipates : true,
            payer: paidBy,
            payerName: paidBy === 'contact' ? (payerName.trim() || undefined) : undefined,
            payerContactId: paidBy === 'contact' ? payerContactId : undefined,
            settlementPaymentMethod,
            settlementAccountId: settlementPaymentMethod !== 'cash' ? settlementAccountId : undefined,
            participants: computedShares
              .filter((s) => (paidBy === 'user' ? !s.isPayerShare : true))
              .map((s) => ({
                contactId: s.contactId,
                name: s.participantName,
                amount: s.amount,
                isUserShare: s.isUserShare,
              })),
          }
        : undefined,
    }

    if (isEditing && payment) {
      onSave(data, payment.id)
    } else {
      onSave(data)
    }
    onClose()
  }

  const handleDelete = () => {
    if (payment && onDelete) {
      onDelete(payment.id)
      onClose()
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h3>
            {isEditing
              ? type === 'income'
                ? 'Editar ingreso recurrente'
                : 'Editar pago recurrente'
              : type === 'income'
              ? 'Nuevo ingreso recurrente'
              : 'Nuevo pago recurrente'}
          </h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Cerrar">
            <AppIcon name="x" size={18} />
          </button>
        </div>

        {/* Selector de Tipo: Gasto vs Ingreso recurrente */}
        <div className="segmented" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className={type === 'expense' ? 'active' : ''}
            onClick={() => setType('expense')}
          >
            Gasto recurrente
          </button>
          <button
            type="button"
            className={type === 'income' ? 'active' : ''}
            onClick={() => {
              setType('income')
              setIsShared(false)
            }}
          >
            Ingreso previsto (Nómina)
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {/* DATOS DEL GASTO */}
          <div className="form-group">
            <label>
              {type === 'income' ? 'Nombre o concepto del ingreso' : 'Concepto del gasto'}
              <input
                type="text"
                placeholder={
                  type === 'income'
                    ? 'Nómina, pensión, alquiler...'
                    : 'Spotify, Gimnasio, Alquiler...'
                }
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </label>
          </div>

          <div className="form-group">
            <label>
              {type === 'income' ? 'Importe previsto (€)' : 'Importe total (€)'}
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label>
                Frecuencia
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
                >
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                  <option value="yearly">Anual</option>
                </select>
              </label>
            </div>

            <div className="form-group">
              <label>
                {type === 'income' ? 'Fecha estimada' : 'Próxima fecha'}
                <input
                  type="date"
                  value={nextDate}
                  onChange={(e) => setNextDate(e.target.value)}
                />
              </label>
            </div>
          </div>

          {/* Categoría para gastos, Tipo de ingreso para ingresos */}
          {type === 'expense' ? (
            <div className="form-group">
              <label>
                Categoría
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  {selectableCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="form-group">
              <label>
                Tipo de ingreso
                <select
                  value={incomeSourceType}
                  onChange={(e) => setIncomeSourceType(e.target.value as RecurringIncomeSourceType)}
                >
                  <option value="salary">Nómina</option>
                  <option value="pension">Pensión</option>
                  <option value="rental">Alquiler</option>
                  <option value="benefit">Prestación / ayuda</option>
                  <option value="other">Otros ingresos</option>
                </select>
              </label>
            </div>
          )}

          {/* CÓMO SE PAGA (Si NO es compartido) */}
          {type === 'expense' && !isShared && (
            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--bg-card-light, rgba(255,255,255,0.03))', border: '1px solid var(--border-color, rgba(255,255,255,0.08))', marginBottom: 14 }}>
              <label className="section-label" style={{ marginBottom: 6, display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Cómo se paga el gasto
              </label>
              <div className="segmented" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 10 }}>
                <button
                  type="button"
                  className={paymentMethod === 'bank' ? 'active' : ''}
                  onClick={() => setPaymentMethod('bank')}
                >
                  Banco / Tarjeta
                </button>
                <button
                  type="button"
                  className={paymentMethod === 'bizum' ? 'active' : ''}
                  onClick={() => setPaymentMethod('bizum')}
                >
                  Bizum
                </button>
                <button
                  type="button"
                  className={paymentMethod === 'cash' ? 'active' : ''}
                  onClick={() => setPaymentMethod('cash')}
                >
                  Efectivo
                </button>
              </div>

              {paymentMethod !== 'cash' ? (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: '0.82rem' }}>
                    Cuenta bancaria
                    <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.type === 'spending' ? 'Diaria' : 'Ahorro'})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Se registrará en Efectivo físico. Tu saldo bancario no cambiará.
                </div>
              )}
            </div>
          )}

          {type === 'income' && (
            <div className="form-group">
              <label>
                Cuenta de destino
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.type === 'spending' ? 'Diaria' : 'Ahorro'})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* SECCIÓN GASTO COMPARTIDO */}
          {type === 'expense' && (
            <div className="shared-expense-section" style={{ marginTop: 6, marginBottom: 14 }}>
              <div className="shared-toggle-row">
                <div className="shared-toggle-text">
                  <strong>Gasto compartido</strong>
                  <span>Suscripción o pago recurrente compartido entre varias personas</span>
                </div>
                <label className="switch mini">
                  <input
                    type="checkbox"
                    checked={isShared}
                    onChange={(e) => setIsShared(e.target.checked)}
                  />
                  <span className="slider round"></span>
                </label>
              </div>

              {isShared && (
                <div className="shared-config-box" style={{ marginTop: 12, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {/* ¿QUIÉN PAGA HABITUALMENTE ESTE GASTO? */}
                  <div className="form-group">
                    <label className="section-label" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      ¿Quién paga habitualmente este gasto?
                    </label>
                    <div className="segmented" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', marginTop: 4 }}>
                      <button
                        type="button"
                        className={paidBy === 'user' ? 'active' : ''}
                        onClick={() => setPaidBy('user')}
                      >
                        Yo
                      </button>
                      <button
                        type="button"
                        className={paidBy === 'contact' ? 'active' : ''}
                        onClick={() => setPaidBy('contact')}
                      >
                        Otra persona
                      </button>
                    </div>
                  </div>

                  {/* SI PAGO YO */}
                  {paidBy === 'user' ? (
                    <>
                      <div className="form-group" style={{ marginBottom: 12 }}>
                        <label className="section-label" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          Cómo pagas tú el servicio
                        </label>
                        <div className="segmented" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', marginTop: 4 }}>
                          <button
                            type="button"
                            className={expensePaymentMethod === 'bank' ? 'active' : ''}
                            onClick={() => setExpensePaymentMethod('bank')}
                          >
                            Banco / Tarjeta
                          </button>
                          <button
                            type="button"
                            className={expensePaymentMethod === 'bizum' ? 'active' : ''}
                            onClick={() => setExpensePaymentMethod('bizum')}
                          >
                            Bizum
                          </button>
                          <button
                            type="button"
                            className={expensePaymentMethod === 'cash' ? 'active' : ''}
                            onClick={() => setExpensePaymentMethod('cash')}
                          >
                            Efectivo
                          </button>
                        </div>
                      </div>

                      {expensePaymentMethod !== 'cash' && (
                        <div className="form-group">
                          <label style={{ fontSize: '0.82rem' }}>
                            Cuenta desde la que pagas
                            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                              {accounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name} ({a.type === 'spending' ? 'Diaria' : 'Ahorro'})
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      )}

                      {/* Reparto */}
                      <label className="checkbox-custom-row" style={{ marginTop: 8 }}>
                        <input
                          type="checkbox"
                          checked={selfParticipates}
                          onChange={(e) => setSelfParticipates(e.target.checked)}
                        />
                        <span>Yo también participo en este gasto</span>
                      </label>

                      <div className="segmented" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', margin: '10px 0' }}>
                        <button
                          type="button"
                          className={splitType === 'equal' ? 'active' : ''}
                          onClick={() => setSplitType('equal')}
                        >
                          A partes iguales
                        </button>
                        <button
                          type="button"
                          className={splitType === 'custom' ? 'active' : ''}
                          onClick={() => setSplitType('custom')}
                        >
                          Personalizado
                        </button>
                      </div>

                      {/* Añadir participantes */}
                      <div className="participant-add-container">
                        <div className="participant-input-wrapper">
                          <input
                            type="text"
                            className="participant-search-input"
                            placeholder="Añadir persona (ej. Andrés, María)..."
                            value={newParticipantInput}
                            onChange={(e) => setNewParticipantInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                handleAddParticipant()
                              }
                            }}
                            list="shared-recurring-contacts-list"
                          />
                          <datalist id="shared-recurring-contacts-list">
                            {sharedContacts.map((c) => (
                              <option key={c.id} value={c.displayName} />
                            ))}
                          </datalist>
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary btn-add-person"
                          onClick={() => handleAddParticipant()}
                        >
                          <AppIcon name="plus" size={14} />
                          <span>Añadir</span>
                        </button>
                      </div>

                      {/* Lista de participantes */}
                      {participants.length > 0 && (
                        <div className="participant-chips-wrap" style={{ marginTop: 8 }}>
                          {participants.map((p, idx) => (
                            <div className="participant-chip-item" key={idx}>
                              <span className="participant-name-label">{p.name}</span>
                              {splitType === 'custom' && (
                                <div className="participant-custom-field">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    className="participant-amount-input"
                                    value={String(p.customAmount ?? 0).replace('.', ',')}
                                    onChange={(e) => handleCustomAmountChange(idx, e.target.value)}
                                    placeholder="0,00"
                                  />
                                  <span className="unit-label">€</span>
                                </div>
                              )}
                              <button
                                type="button"
                                className="chip-delete-btn"
                                onClick={() => handleRemoveParticipant(idx)}
                                aria-label={`Quitar ${p.name}`}
                              >
                                <AppIcon name="x" size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* CÓMO ME PAGAN HABITUALMENTE (Cobro) */}
                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <label className="section-label" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          Cómo te pagan habitualmente (Default de cobro)
                        </label>
                        <div className="segmented" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', marginTop: 4, marginBottom: 10 }}>
                          <button
                            type="button"
                            className={settlementPaymentMethod === 'bizum' ? 'active' : ''}
                            onClick={() => setSettlementPaymentMethod('bizum')}
                          >
                            Bizum
                          </button>
                          <button
                            type="button"
                            className={settlementPaymentMethod === 'bank' ? 'active' : ''}
                            onClick={() => setSettlementPaymentMethod('bank')}
                          >
                            Banco
                          </button>
                          <button
                            type="button"
                            className={settlementPaymentMethod === 'cash' ? 'active' : ''}
                            onClick={() => setSettlementPaymentMethod('cash')}
                          >
                            Efectivo
                          </button>
                        </div>

                        {settlementPaymentMethod !== 'cash' && (
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: '0.82rem' }}>
                              Cuenta habitual de recepción
                              <select value={settlementAccountId} onChange={(e) => setSettlementAccountId(e.target.value)}>
                                {accounts.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name} ({a.type === 'spending' ? 'Diaria' : 'Ahorro'})
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    /* SI PAGA OTRA PERSONA */
                    <>
                      <div className="form-group" style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: '0.82rem' }}>
                          Pagador habitual
                          <input
                            type="text"
                            placeholder="Nombre (ej. Andrés, Netflix Sergi)..."
                            value={payerName}
                            onChange={(e) => handleSelectPayerContact(e.target.value)}
                            list="shared-recurring-contacts-list-payer"
                          />
                          <datalist id="shared-recurring-contacts-list-payer">
                            {sharedContacts.map((c) => (
                              <option key={c.id} value={c.displayName} />
                            ))}
                          </datalist>
                        </label>
                      </div>

                      {/* Reparto */}
                      <div className="segmented" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', margin: '10px 0' }}>
                        <button
                          type="button"
                          className={splitType === 'equal' ? 'active' : ''}
                          onClick={() => setSplitType('equal')}
                        >
                          A partes iguales
                        </button>
                        <button
                          type="button"
                          className={splitType === 'custom' ? 'active' : ''}
                          onClick={() => setSplitType('custom')}
                        >
                          Personalizado
                        </button>
                      </div>

                      {/* Añadir participantes adicionales si aplica */}
                      <div className="participant-add-container">
                        <div className="participant-input-wrapper">
                          <input
                            type="text"
                            className="participant-search-input"
                            placeholder="Añadir más participantes si hay..."
                            value={newParticipantInput}
                            onChange={(e) => setNewParticipantInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                handleAddParticipant()
                              }
                            }}
                            list="shared-recurring-contacts-list"
                          />
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary btn-add-person"
                          onClick={() => handleAddParticipant()}
                        >
                          <AppIcon name="plus" size={14} />
                          <span>Añadir</span>
                        </button>
                      </div>

                      {/* Lista de participantes en modo personalizado */}
                      {splitType === 'custom' && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Mi parte correspondiente (Tú):</span>
                            <div className="participant-custom-field" style={{ width: 100 }}>
                              <input
                                type="text"
                                inputMode="decimal"
                                className="participant-amount-input"
                                value={String(participants.find((p) => p.isUserShare || p.name.toLowerCase() === 'tú')?.customAmount ?? 0).replace('.', ',')}
                                onChange={(e) => {
                                  const num = Number(e.target.value.replace(',', '.')) || 0
                                  setParticipants((prev) => {
                                    const exists = prev.some((p) => p.isUserShare || p.name.toLowerCase() === 'tú')
                                    if (exists) {
                                      return prev.map((p) => (p.isUserShare || p.name.toLowerCase() === 'tú') ? { ...p, customAmount: num } : p)
                                    }
                                    return [...prev, { name: 'Tú', isUserShare: true, customAmount: num }]
                                  })
                                }}
                                placeholder="0,00"
                              />
                              <span className="unit-label">€</span>
                            </div>
                          </div>

                          {participants.filter((p) => !p.isUserShare && p.name.toLowerCase() !== 'tú').map((p, idx) => (
                            <div className="participant-chip-item" key={idx} style={{ marginTop: 6 }}>
                              <span className="participant-name-label">{p.name}</span>
                              <div className="participant-custom-field">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className="participant-amount-input"
                                  value={String(p.customAmount ?? 0).replace('.', ',')}
                                  onChange={(e) => {
                                    const num = Number(e.target.value.replace(',', '.')) || 0
                                    setParticipants((prev) =>
                                      prev.map((item) => item.name === p.name ? { ...item, customAmount: num } : item)
                                    )
                                  }}
                                  placeholder="0,00"
                                />
                                <span className="unit-label">€</span>
                              </div>
                              <button
                                type="button"
                                className="chip-delete-btn"
                                onClick={() => setParticipants((prev) => prev.filter((item) => item.name !== p.name))}
                                aria-label={`Quitar ${p.name}`}
                              >
                                <AppIcon name="x" size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* CÓMO LE PAGO HABITUALMENTE (Liquidación) */}
                      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <label className="section-label" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          Cómo le pagas habitualmente (Default de liquidación)
                        </label>
                        <div className="segmented" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', marginTop: 4, marginBottom: 10 }}>
                          <button
                            type="button"
                            className={settlementPaymentMethod === 'bizum' ? 'active' : ''}
                            onClick={() => setSettlementPaymentMethod('bizum')}
                          >
                            Bizum
                          </button>
                          <button
                            type="button"
                            className={settlementPaymentMethod === 'bank' ? 'active' : ''}
                            onClick={() => setSettlementPaymentMethod('bank')}
                          >
                            Banco
                          </button>
                          <button
                            type="button"
                            className={settlementPaymentMethod === 'cash' ? 'active' : ''}
                            onClick={() => setSettlementPaymentMethod('cash')}
                          >
                            Efectivo
                          </button>
                        </div>

                        {settlementPaymentMethod !== 'cash' ? (
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: '0.82rem' }}>
                              Desde qué cuenta bancaria le pagas
                              <select value={settlementAccountId} onChange={(e) => setSettlementAccountId(e.target.value)}>
                                {accounts.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name} ({a.type === 'spending' ? 'Diaria' : 'Ahorro'})
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            Le pagas en efectivo físico. Tu saldo bancario no cambiará.
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Previsualización del reparto exacto */}
                  {computedShares.length > 0 && (
                    <div className="split-preview-card" style={{ marginTop: 14 }}>
                      <span className="split-preview-header">Reparto previsto de cada ciclo</span>
                      <div className="split-preview-table">
                        {computedShares.map((s, idx) => (
                          <div className="split-preview-row" key={idx}>
                            <span className="split-person-name">
                              {s.participantName} {s.isPayerShare ? `(Pagador real)` : (s.isUserShare || s.participantName.toLowerCase() === 'tú') ? '(Tu cuota)' : ''}
                            </span>
                            <strong className="split-person-amount">{money(s.amount)}</strong>
                          </div>
                        ))}
                      </div>
                      <p className="split-preview-notice" style={{ marginTop: 6 }}>
                        {paidBy === 'contact'
                          ? `Cada ciclo registrará tu cuota como deuda con ${payerName.trim() || 'el pagador'} sin descontar automáticamente del banco.`
                          : 'Las cuotas se generarán en "Por cobrar" cada vez que se confirme el ciclo.'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Aviso informativo para ingresos recurrentes */}
          {type === 'income' && (
            <div className="info-callout" style={{ marginTop: 12 }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, fontSize: 12 }}>
                <AppIcon name="info" size={15} />
                <span>
                  <strong>Previsión sin dinero real:</strong> Este ingreso sirve únicamente para planificación.
                  No altera tu saldo ni crea transacciones automáticas.
                </span>
              </p>
            </div>
          )}

          <div className="toggle-row" style={{ marginTop: 16 }}>
            <span>Estado activo</span>
            <label className="switch">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              <span className="slider round"></span>
            </label>
          </div>

          <div className="modal-actions" style={{ marginTop: 20 }}>
            <button type="submit" className="primary-button">
              {isEditing
                ? 'Guardar cambios'
                : type === 'income'
                ? 'Crear previsión de ingreso'
                : 'Crear pago recurrente'}
            </button>

            {isEditing && onDelete && (
              <>
                {!confirmDelete ? (
                  <button
                    type="button"
                    className="danger-outline-button"
                    onClick={() => setConfirmDelete(true)}
                  >
                    {type === 'income' ? 'Eliminar ingreso recurrente' : 'Eliminar pago recurrente'}
                  </button>
                ) : (
                  <div className="confirm-delete-box">
                    <p>
                      {type === 'income'
                        ? '¿Seguro que deseas eliminar este ingreso recurrente previsto?'
                        : '¿Seguro que deseas eliminar este gasto recurrente?'}
                    </p>
                    <div className="confirm-delete-actions">
                      <button
                        type="button"
                        className="danger-button"
                        onClick={handleDelete}
                      >
                        Sí, eliminar
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setConfirmDelete(false)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { RecurringPaymentModal } from '../components/RecurringPaymentModal'
import { ConfirmRecurringPaymentModal } from '../components/ConfirmRecurringPaymentModal'
import type {
  CreateRecurringPaymentInput,
  PaymentMethod,
  RecurringIncomeSourceType,
  RecurringPayment,
  UpdateRecurringPaymentInput,
} from '../models/finance'
import { RECURRING_INCOME_SOURCE_LABELS } from '../models/finance'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'
import {
  recalculateRecurringNextDate,
  selectRecurringExpectedReimbursement,
  selectRecurringGrossAmount,
  selectRecurringPaymentCycleStatus,
  selectRecurringUserCashOutflow,
  selectRecurringUserEconomicShare,
  selectTotalPersonalRecurringExpenses,
} from '../utils/financeSelectors'
import { AppIcon } from '../ui/icons'

export function RecurringPaymentsPage({
  finance,
  onBack,
}: {
  finance: ReturnTypeFinance
  onBack: () => void
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPayment, setEditingPayment] = useState<RecurringPayment | null>(null)
  const [confirmModalPayment, setConfirmModalPayment] = useState<RecurringPayment | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'expense' | 'income'>('all')

  const handleConfirmAction = (payment: RecurringPayment) => {
    if (confirmingId) return
    if (payment.type !== 'income' && payment.frequency === 'monthly') {
      const effectiveNextDate = recalculateRecurringNextDate(payment, finance.transactions)
      setConfirmModalPayment({
        ...payment,
        nextDate: effectiveNextDate,
      })
    } else {
      handleDirectConfirm(payment.id, 1)
    }
  }

  const handleDirectConfirm = async (paymentId: string, monthsCount = 1, paymentMethod?: PaymentMethod) => {
    if (confirmingId) return
    setConfirmingId(paymentId)
    try {
      finance.confirmRecurringPayment(paymentId, monthsCount, undefined, paymentMethod)
    } finally {
      setTimeout(() => setConfirmingId(null), 300)
    }
  }

  const handleOpenCreate = () => {
    setEditingPayment(null)
    setModalOpen(true)
  }

  const handleOpenEdit = (payment: RecurringPayment) => {
    setEditingPayment(payment)
    setModalOpen(true)
  }

  const handleSave = (
    data: CreateRecurringPaymentInput | UpdateRecurringPaymentInput,
    id?: string
  ) => {
    if (id) {
      finance.updateRecurringPayment(id, data)
    } else {
      finance.addRecurringPayment(data as CreateRecurringPaymentInput)
    }
  }

  const frequencyLabel: Record<string, string> = {
    weekly: 'Semanal',
    monthly: 'Mensual',
    yearly: 'Anual',
  }

  const expensesCount = finance.recurring.filter((r) => r.type !== 'income').length
  const incomesCount = finance.recurring.filter((r) => r.type === 'income').length
  const totalPersonalRecurring = selectTotalPersonalRecurringExpenses(finance.recurring)

  const filteredRecurring = finance.recurring.filter((r) => {
    if (filter === 'expense') return r.type !== 'income'
    if (filter === 'income') return r.type === 'income'
    return true
  })

  return (
    <main className="page">
      <header className="simple-header">
        <button type="button" className="text-button back-button" onClick={onBack}>
          <AppIcon name="chevron-left" size={16} /> Más
        </button>
        <h1>Recurrentes</h1>
        <button type="button" className="round-button" onClick={handleOpenCreate} aria-label="Añadir recurrente">
          <AppIcon name="plus" size={18} />
        </button>
      </header>

      {/* Banner Principal de Gastos Recurrentes Personales */}
      <section className="hero-card light" style={{ marginBottom: 16 }}>
        <span>Gastos recurrentes personales</span>
        <strong style={{ fontSize: '2rem' }}>{money(totalPersonalRecurring)}/mes</strong>
        <div className="hero-meta" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, fontSize: '0.82rem', color: '#64748b' }}>
          <span>Liquidez comprometida pendiente: <strong>{money(finance.totals.committedAmount)}</strong> ({finance.totals.pendingRecurring?.length ?? 0} pendientes)</span>
          {incomesCount > 0 && (
            <span>· {incomesCount} {incomesCount === 1 ? 'ingreso previsto' : 'ingresos previstos'}</span>
          )}
        </div>
      </section>

      {/* Filtro de tipo: Todos / Gastos / Ingresos previstos */}
      <div className="filter-pills" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          Todos ({finance.recurring.length})
        </button>
        <button
          type="button"
          className={filter === 'expense' ? 'active' : ''}
          onClick={() => setFilter('expense')}
        >
          Gastos ({expensesCount})
        </button>
        <button
          type="button"
          className={filter === 'income' ? 'active' : ''}
          onClick={() => setFilter('income')}
        >
          Ingresos previstos ({incomesCount})
        </button>
      </div>

      {/* Lista de Movimientos Recurrentes */}
      <section className="section">
        <div className="section-title">
          <h2>
            {filter === 'income'
              ? 'Ingresos previstos'
              : filter === 'expense'
              ? 'Suscripciones y gastos programados'
              : 'Movimientos programados'}
          </h2>
        </div>

        {filteredRecurring.length === 0 ? (
          <div className="transaction-list empty">
            <p className="muted">
              {filter === 'income'
                ? 'No tienes ningún ingreso recurrente previsto.'
                : filter === 'expense'
                ? 'No tienes ningún gasto recurrente registrado.'
                : 'No tienes ningún movimiento recurrente registrado.'}
            </p>
            <button
              type="button"
              className="primary-button"
              style={{ marginTop: 14, maxWidth: 240 }}
              onClick={handleOpenCreate}
            >
              {filter === 'income' ? 'Añadir previsión de ingreso' : 'Añadir primer recurrente'}
            </button>
          </div>
        ) : (
          <div className="recurring-list">
            {filteredRecurring.map((r) => {
              const category = finance.categories.find((c) => c.id === r.categoryId)
              const cycleStatus = selectRecurringPaymentCycleStatus(r, finance.transactions)
              const isConfirming = confirmingId === r.id
              const isIncome = r.type === 'income'

              const grossAmount = selectRecurringGrossAmount(r, 1)
              const userEconomicShare = selectRecurringUserEconomicShare(r, 1)
              const userCashOutflow = selectRecurringUserCashOutflow(r, 1)
              const expectedReimbursement = selectRecurringExpectedReimbursement(r, 1)
              const isContactPaid = Boolean(r.isShared && (r.paidBy === 'contact' || r.sharingTemplate?.payer === 'contact'))

              const externalCount = r.sharingTemplate?.participants?.filter(
                (p) => !p.isUserShare && p.name.trim().toLowerCase() !== 'tú'
              )?.length ?? 0
              const sharedLabel = externalCount > 0
                ? (externalCount === 1 ? 'Con 1 persona' : `Con ${externalCount} personas`)
                : 'Compartido'

              const effectiveNextDate =
                r.frequency === 'monthly' && r.type !== 'income'
                  ? recalculateRecurringNextDate(r, finance.transactions)
                  : r.nextDate

              const humanNextDate = (() => {
                try {
                  const [y, m, d] = effectiveNextDate.split('-').map(Number)
                  if (!y || !m || !d) return effectiveNextDate
                  const dt = new Date(Date.UTC(y, m - 1, d))
                  return dt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
                } catch {
                  return effectiveNextDate
                }
              })()

              return (
                <div
                  className={`recurring-card ${!r.active ? 'inactive' : ''} ${cycleStatus.status}`}
                  key={r.id}
                >
                  <div className="recurring-top-row" onClick={() => handleOpenEdit(r)}>
                    <div className="recurring-title-group">
                      <div
                        className="category-dot"
                        style={{ background: isIncome ? '#5d9c74' : (category?.color ?? '#bbb') }}
                      >
                        <AppIcon
                          name={isIncome ? 'arrow-down-left' : (category?.iconKey || category?.icon || 'refresh-cw')}
                          size={15}
                          color="#fff"
                        />
                      </div>
                      <div className="recurring-names">
                        <strong className="recurring-name-text">{r.name}</strong>
                        <span className="recurring-sub-text">
                          {isIncome
                            ? (r.incomeSourceType && RECURRING_INCOME_SOURCE_LABELS[r.incomeSourceType as RecurringIncomeSourceType]
                                ? RECURRING_INCOME_SOURCE_LABELS[r.incomeSourceType as RecurringIncomeSourceType]
                                : 'Ingreso programado')
                            : (category?.name ?? 'Suscripción')} · {frequencyLabel[r.frequency] ?? 'Mensual'}
                          {!isIncome && r.isShared && isContactPaid && ` · Paga ${r.payerName || 'contacto'} · Servicio: ${money(grossAmount)}`}
                          {!isIncome && r.isShared && !isContactPaid && ` · Servicio: ${money(grossAmount)} · Pagas tú`}
                        </span>
                      </div>
                    </div>

                    <div className="recurring-amount-box">
                      {isIncome ? (
                        <strong className="positive">+{money(r.amount)}</strong>
                      ) : r.isShared ? (
                        <div>
                          <strong className="expense-amount">−{money(userEconomicShare)}</strong>
                          <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted, #888)', textAlign: 'right', marginTop: 2 }}>
                            {isContactPaid
                              ? `Tu parte (Bizum: ${money(userCashOutflow)})`
                              : `Tu parte (Factura: ${money(grossAmount)})`}
                          </span>
                        </div>
                      ) : (
                        <strong className="expense-amount">−{money(grossAmount)}</strong>
                      )}
                    </div>
                  </div>

                  <div className="recurring-bottom-row">
                    <div className="recurring-meta-chips" onClick={() => handleOpenEdit(r)}>
                      <span className="recurring-date-chip">
                        {isIncome ? `Cobro aprox.: ${humanNextDate}` : humanNextDate}
                      </span>
                      {isIncome && (
                        <span className="badge-status income-badge">
                          <AppIcon name="arrow-down-left" size={11} /> Ingreso previsto
                        </span>
                      )}
                      {!isIncome && r.isShared && (
                        <span className="badge-status shared-badge">
                          {isContactPaid
                            ? `Paga ${r.payerName || 'contacto'}`
                            : `Pagas tú (${money(userCashOutflow)})`}
                        </span>
                      )}
                      {!isIncome && r.isShared && isContactPaid && (
                        <span className="badge-status" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                          {`Le pagas: ${money(userCashOutflow)} · ${r.settlementPaymentMethod === 'bizum' ? 'Bizum' : r.settlementPaymentMethod === 'cash' ? 'Efectivo' : 'Banco'}`}
                        </span>
                      )}
                      {!isIncome && r.isShared && !isContactPaid && expectedReimbursement > 0 && (
                        <span className="badge-status" style={{ background: 'rgba(93,156,116,0.12)', color: '#2e7d32' }}>
                          {`Te deben: +${money(expectedReimbursement)}`}
                        </span>
                      )}
                      {!isIncome && r.active && cycleStatus.status === 'confirmed_for_cycle' && (
                        <span className="badge-status confirmed_for_cycle">
                          <AppIcon name="check" size={11} /> Pagado
                        </span>
                      )}
                      {!isIncome && r.active && cycleStatus.status === 'covered_in_advance' && (
                        <span className="badge-status covered_in_advance">
                          <AppIcon name="check" size={11} /> Pagado por adelantado
                        </span>
                      )}
                    </div>

                    <div className="recurring-switch-wrapper">
                      <label
                        className="switch mini"
                        onClick={(e) => e.stopPropagation()}
                        title={r.active ? 'Desactivar recurrente' : 'Activar recurrente'}
                      >
                        <input
                          type="checkbox"
                          checked={r.active}
                          onChange={() => finance.toggleRecurringPayment(r.id)}
                        />
                        <span className="slider round"></span>
                      </label>
                    </div>
                  </div>

                  {/* Acciones solo para gastos pendientes de confirmar en el mes */}
                  {!isIncome && r.active && cycleStatus.status === 'due' && (
                    <div className="recurring-action-footer">
                      <button
                        type="button"
                        className="recurring-confirm-btn"
                        disabled={isConfirming}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleConfirmAction(r)
                        }}
                      >
                        <AppIcon name="check" size={14} />
                        <span>{isConfirming ? 'Confirmando...' : 'Confirmar pago'}</span>
                      </button>
                      <button
                        type="button"
                        className="recurring-postpone-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          finance.postponeRecurringPayment(r.id, 7)
                        }}
                        title="Posponer fecha de cobro 7 días sin registrar gasto"
                      >
                        <AppIcon name="clock" size={13} />
                        <span>Posponer (+7d)</span>
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="info-callout" style={{ marginTop: 24 }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <AppIcon name="info" size={16} />
            <span>
              <strong>Coste personal vs Liquidez:</strong> El coste mensual muestra tu cuota real en cada servicio.
              El dinero comprometido indica la liquidez que necesitas tener disponible para atender los cargos pendientes de este mes.
            </span>
          </p>
        </div>
      </section>

      <RecurringPaymentModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditingPayment(null)
        }}
        accounts={finance.accounts}
        categories={finance.categories}
        sharedContacts={finance.sharedContacts}
        payment={editingPayment}
        onSave={handleSave}
        onDelete={finance.deleteRecurringPayment}
      />

      <ConfirmRecurringPaymentModal
        open={Boolean(confirmModalPayment)}
        payment={confirmModalPayment}
        onClose={() => setConfirmModalPayment(null)}
        onConfirm={(paymentId, monthsCount, paymentMethod) => {
          setConfirmModalPayment(null)
          handleDirectConfirm(paymentId, monthsCount, paymentMethod)
        }}
        isSubmitting={Boolean(confirmingId)}
      />
    </main>
  )
}

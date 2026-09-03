import { useState } from 'react'
import { RecurringPaymentModal } from '../components/RecurringPaymentModal'
import type {
  CreateRecurringPaymentInput,
  RecurringPayment,
  UpdateRecurringPaymentInput,
} from '../models/finance'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'
import { selectRecurringPaymentCycleStatus } from '../utils/financeSelectors'
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
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const handleConfirm = async (paymentId: string) => {
    if (confirmingId) return
    setConfirmingId(paymentId)
    try {
      finance.confirmRecurringPayment(paymentId)
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

      {/* Banner de Comprometido */}
      <section className="hero-card light" style={{ marginBottom: 20 }}>
        <span>Dinero comprometido pendiente</span>
        <strong>{money(finance.totals.committedAmount)}</strong>
        <div className="hero-meta">
          <span>{finance.totals.pendingRecurring?.length ?? 0} pagos pendientes este mes</span>
        </div>
      </section>

      {/* Lista de Gastos Recurrentes */}
      <section className="section">
        <div className="section-title">
          <h2>Suscripciones y pagos programados</h2>
        </div>

        {finance.recurring.length === 0 ? (
          <div className="transaction-list empty">
            <p className="muted">No tienes ningún pago recurrente registrado.</p>
            <button
              type="button"
              className="primary-button"
              style={{ marginTop: 14, maxWidth: 220 }}
              onClick={handleOpenCreate}
            >
              Añadir primer recurrente
            </button>
          </div>
        ) : (
          <div className="recurring-list">
            {finance.recurring.map((r) => {
              const category = finance.categories.find((c) => c.id === r.categoryId)
              const account = finance.accounts.find((a) => a.id === r.accountId)
              const cycleStatus = selectRecurringPaymentCycleStatus(r, finance.transactions)
              const isConfirming = confirmingId === r.id

              const externalCount = r.sharingTemplate?.participants?.length ?? 0
              const sharedLabel = externalCount > 0
                ? (externalCount === 1 ? 'Con 1 persona' : `Con ${externalCount} personas`)
                : 'Compartido'

              const humanNextDate = (() => {
                try {
                  const [y, m, d] = r.nextDate.split('-').map(Number)
                  if (!y || !m || !d) return r.nextDate
                  const dt = new Date(Date.UTC(y, m - 1, d))
                  return dt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
                } catch {
                  return r.nextDate
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
                        style={{ background: category?.color ?? '#bbb' }}
                      >
                        <AppIcon name={category?.iconKey || category?.icon || 'refresh-cw'} size={15} color="#fff" />
                      </div>
                      <div className="recurring-names">
                        <strong className="recurring-name-text">{r.name}</strong>
                        <span className="recurring-sub-text">
                          {category?.name ?? 'Suscripción'} · {frequencyLabel[r.frequency] ?? 'Mensual'}
                        </span>
                      </div>
                    </div>

                    <div className="recurring-amount-box">
                      <strong className="expense-amount">−{money(r.amount)}</strong>
                    </div>
                  </div>

                  <div className="recurring-bottom-row">
                    <div className="recurring-meta-chips" onClick={() => handleOpenEdit(r)}>
                      <span className="recurring-date-chip">
                        {humanNextDate}
                      </span>
                      {r.isShared && (
                        <span className="badge-status shared-badge">
                          {sharedLabel}
                        </span>
                      )}
                      {r.active && cycleStatus.status === 'confirmed_for_cycle' && (
                        <span className="badge-status confirmed_for_cycle">
                          <AppIcon name="check" size={11} /> Confirmado
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

                  {/* Acciones para pagos previstos o pendientes de confirmar */}
                  {r.active && cycleStatus.status === 'due' && (
                    <div className="recurring-action-footer">
                      <button
                        type="button"
                        className="recurring-confirm-btn"
                        disabled={isConfirming}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleConfirm(r.id)
                        }}
                      >
                        <AppIcon name="check" size={14} />
                        <span>{isConfirming ? 'Confirmando...' : 'Confirmar cobro'}</span>
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
              <strong>Cálculo sin duplicados:</strong> Solo los pagos recurrentes activos de tu
              Cuenta diaria que aún <strong>no</strong> hayan sido registrados como gasto en el mes en
              curso se descuentan de tu <em>Disponible real</em>.
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
    </main>
  )
}

import { useState } from 'react'
import { RecurringPaymentModal } from '../components/RecurringPaymentModal'
import type {
  CreateRecurringPaymentInput,
  RecurringPayment,
  UpdateRecurringPaymentInput,
} from '../models/finance'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'

export function RecurringPaymentsPage({
  finance,
  onBack,
}: {
  finance: ReturnTypeFinance
  onBack: () => void
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPayment, setEditingPayment] = useState<RecurringPayment | null>(null)

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
          ‹ Más
        </button>
        <h1>Recurrentes</h1>
        <button type="button" className="round-button" onClick={handleOpenCreate} aria-label="Añadir recurrente">
          ＋
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
              const isPendingThisMonth = finance.totals.pendingRecurring?.some((p) => p.id === r.id)

              return (
                <div
                  className={`recurring-card ${!r.active ? 'inactive' : ''}`}
                  key={r.id}
                >
                  <div className="recurring-main-row">
                    <div
                      className="category-dot"
                      style={{ background: category?.color ?? '#bbb' }}
                    >
                      {category?.icon ?? '○'}
                    </div>

                    <div className="recurring-info" onClick={() => handleOpenEdit(r)}>
                      <strong>{r.name}</strong>
                      <span>
                        {category?.name ?? 'Suscripción'} · {frequencyLabel[r.frequency] ?? 'Mensual'} ·{' '}
                        {account?.name ?? 'Cuenta diaria'}
                      </span>
                      <small className="recurring-next-date">
                        Próximo cobro: {r.nextDate}
                        {r.active && (
                          <span
                            className={`badge-status ${isPendingThisMonth ? 'pending' : 'paid'}`}
                          >
                            {isPendingThisMonth ? 'Pendiente' : 'Registrado'}
                          </span>
                        )}
                      </small>
                    </div>

                    <div className="recurring-end-box">
                      <strong className="expense-amount">−{money(r.amount)}</strong>
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
                </div>
              )
            })}
          </div>
        )}

        <div className="info-callout" style={{ marginTop: 24 }}>
          <p>
            ℹ️ <strong>Cálculo sin duplicados:</strong> Solo los pagos recurrentes activos de tu
            Cuenta diaria que aún <strong>no</strong> hayan sido registrados como gasto en el mes en
            curso se descuentan de tu <em>Disponible real</em>.
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
        payment={editingPayment}
        onSave={handleSave}
        onDelete={finance.deleteRecurringPayment}
      />
    </main>
  )
}

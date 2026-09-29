import { useState, useMemo } from 'react'
import type { ReturnTypeFinance } from '../types'
import type { ExpenseShare } from '../models/finance'
import { money, shortDate } from '../utils/money'
import {
  selectPendingDebtors,
  selectSettledReimbursements,
  selectPendingPayables,
  selectSettledPayables,
  selectSharedReceivablesSummary,
  selectSharedPayablesSummary,
  selectSharedSummaryByContact,
} from '../utils/sharedExpenseSelectors'
import { AppIcon } from '../ui/icons'
import { AdjustDebtModal } from '../components/AdjustDebtModal'

interface ReceivablesPageProps {
  finance: ReturnTypeFinance
  onBack: () => void
  onRecordReimbursement: (shareId: string) => void
  onRecordPayablePayment?: (shareId: string) => void
  onSelectTransaction?: (txId: string) => void
  initialMode?: 'receivables' | 'payables'
}

export function ReceivablesPage({
  finance,
  onBack,
  onRecordReimbursement,
  onRecordPayablePayment,
  initialMode = 'receivables',
}: ReceivablesPageProps) {
  const [mode, setMode] = useState<'receivables' | 'payables'>(initialMode)
  const [tab, setTab] = useState<'pending' | 'settled'>('pending')
  const [expandedDebtor, setExpandedDebtor] = useState<string | null>(null)
  const [adjustingDebtTarget, setAdjustingDebtTarget] = useState<{
    share: ExpenseShare
    isPayable: boolean
  } | null>(null)

  // Por cobrar (Receivables)
  const pendingDebtors = useMemo(() => {
    return selectPendingDebtors(
      finance.expenseShares ?? [],
      finance.transactions ?? [],
      finance.cashTransactions ?? []
    )
  }, [finance.expenseShares, finance.transactions, finance.cashTransactions])

  const settledList = useMemo(() => {
    return selectSettledReimbursements(
      finance.expenseShares ?? [],
      finance.transactions ?? [],
      finance.cashTransactions ?? []
    )
  }, [finance.expenseShares, finance.transactions, finance.cashTransactions])

  const receivablesSummary = useMemo(() => {
    return selectSharedReceivablesSummary(
      finance.expenseShares ?? [],
      finance.transactions ?? [],
      finance.cashTransactions ?? []
    )
  }, [finance.expenseShares, finance.transactions, finance.cashTransactions])

  // Por pagar (Payables)
  const pendingPayables = useMemo(() => {
    return selectPendingPayables(
      finance.expenseShares ?? [],
      finance.transactions ?? [],
      finance.cashTransactions ?? []
    )
  }, [finance.expenseShares, finance.transactions, finance.cashTransactions])

  const settledPayables = useMemo(() => {
    return selectSettledPayables(
      finance.expenseShares ?? [],
      finance.transactions ?? [],
      finance.cashTransactions ?? []
    )
  }, [finance.expenseShares, finance.transactions, finance.cashTransactions])

  const payablesSummary = useMemo(() => {
    return selectSharedPayablesSummary(
      finance.expenseShares ?? [],
      finance.transactions ?? [],
      finance.cashTransactions ?? []
    )
  }, [finance.expenseShares, finance.transactions, finance.cashTransactions])

  // Resumen por contacto
  const contactSummaries = useMemo(() => {
    return selectSharedSummaryByContact(
      finance.expenseShares ?? [],
      finance.transactions ?? [],
      finance.cashTransactions ?? []
    )
  }, [finance.expenseShares, finance.transactions, finance.cashTransactions])

  const receivablesContacts = useMemo(() => {
    return contactSummaries.filter((c) => c.expectedReceivable > 0)
  }, [contactSummaries])

  const payablesContacts = useMemo(() => {
    return contactSummaries.filter((c) => c.expectedPayable > 0)
  }, [contactSummaries])

  return (
    <main className="page">
      <header className="simple-header">
        <button type="button" className="text-button back-button" onClick={onBack}>
          <AppIcon name="chevron-left" size={16} /> Más
        </button>
        <h1>Cuentas Compartidas</h1>
        <div style={{ width: 44 }} />
      </header>

      {/* Selector principal: Por cobrar vs Por pagar */}
      <div className="segmented" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className={mode === 'receivables' ? 'active' : ''}
          onClick={() => {
            setMode('receivables')
            setTab('pending')
          }}
        >
          Por cobrar {pendingDebtors.length > 0 && `(${pendingDebtors.length})`}
        </button>
        <button
          type="button"
          className={mode === 'payables' ? 'active' : ''}
          onClick={() => {
            setMode('payables')
            setTab('pending')
          }}
        >
          Por pagar {pendingPayables.length > 0 && `(${pendingPayables.length})`}
        </button>
      </div>

      {/* Selector secundario: Pendiente vs Pagado/Cobrado */}
      <div className="segmented">
        <button
          type="button"
          className={tab === 'pending' ? 'active' : ''}
          onClick={() => setTab('pending')}
        >
          {mode === 'receivables' ? 'Pendiente cobro' : 'Pendiente pago'}
        </button>
        <button
          type="button"
          className={tab === 'settled' ? 'active' : ''}
          onClick={() => setTab('settled')}
        >
          {mode === 'receivables' ? 'Cobrado' : 'Pagado'}
        </button>
      </div>

      {/* Resumen de 3 métricas */}
      <div
        className="shared-metrics-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          marginTop: 14,
        }}
      >
        {mode === 'receivables' ? (
          <>
            <div
              className="stat-card"
              style={{
                background: 'rgba(124, 58, 237, 0.08)',
                border: '1px solid rgba(124, 58, 237, 0.2)',
                padding: '10px 8px',
                borderRadius: '12px',
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>
                Pendiente
              </span>
              <strong style={{ fontSize: '1.02rem', color: receivablesSummary.totalPending > 0 ? '#a855f7' : 'var(--text-main)' }}>
                {money(receivablesSummary.totalPending)}
              </strong>
            </div>
            <div
              className="stat-card"
              style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                padding: '10px 8px',
                borderRadius: '12px',
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>
                Cobrado
              </span>
              <strong style={{ fontSize: '1.02rem', color: '#10b981' }}>
                {money(receivablesSummary.totalReceived)}
              </strong>
            </div>
            <div
              className="stat-card"
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '10px 8px',
                borderRadius: '12px',
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>
                Perdonado por ti
              </span>
              <strong style={{ fontSize: '1.02rem', color: receivablesSummary.totalForgiven > 0 ? '#fbbf24' : 'var(--text-muted)' }}>
                {money(receivablesSummary.totalForgiven)}
              </strong>
            </div>
          </>
        ) : (
          <>
            <div
              className="stat-card"
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                padding: '10px 8px',
                borderRadius: '12px',
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>
                Pendiente
              </span>
              <strong style={{ fontSize: '1.02rem', color: payablesSummary.totalPending > 0 ? '#ef4444' : 'var(--text-main)' }}>
                {money(payablesSummary.totalPending)}
              </strong>
            </div>
            <div
              className="stat-card"
              style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                padding: '10px 8px',
                borderRadius: '12px',
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>
                Pagado
              </span>
              <strong style={{ fontSize: '1.02rem', color: '#10b981' }}>
                {money(payablesSummary.totalPaid)}
              </strong>
            </div>
            <div
              className="stat-card"
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '10px 8px',
                borderRadius: '12px',
                textAlign: 'center',
              }}
            >
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>
                Perdonado a ti
              </span>
              <strong style={{ fontSize: '1.02rem', color: payablesSummary.totalForgiven > 0 ? '#fbbf24' : 'var(--text-muted)' }}>
                {money(payablesSummary.totalForgiven)}
              </strong>
            </div>
          </>
        )}
      </div>

      {mode === 'receivables' ? (
        tab === 'pending' ? (
          <section className="receivables-section">
            {/* Lista agrupada por persona */}
            <div className="debtors-group-list" style={{ marginTop: 14 }}>
              {pendingDebtors.length === 0 ? (
                <div className="empty-state-box">
                  <span className="empty-icon">
                    <AppIcon name="check" size={24} color="#10b981" />
                  </span>
                  <p>No hay cobros pendientes en este momento.</p>
                </div>
              ) : (
                pendingDebtors.map((debtor) => {
                  const key = debtor.contactId || debtor.name
                  const isExpanded = expandedDebtor === key || pendingDebtors.length === 1

                  return (
                    <div className="debtor-card" key={key}>
                      <div
                        className="debtor-card-header clickable"
                        onClick={() =>
                          setExpandedDebtor(isExpanded && pendingDebtors.length > 1 ? null : key)
                        }
                        role="button"
                        tabIndex={0}
                      >
                        <div className="debtor-avatar">
                          {debtor.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="debtor-header-info">
                          <strong>{debtor.name}</strong>
                          <span>
                            {debtor.pendingShares.length}{' '}
                            {debtor.pendingShares.length === 1
                              ? 'gasto pendiente'
                              : 'gastos pendientes'}
                          </span>
                        </div>
                        <div className="debtor-header-amount">
                          <strong>{money(debtor.totalPending)}</strong>
                          <AppIcon
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color="var(--text-muted)"
                          />
                        </div>
                      </div>

                      {/* Desglose de gastos de esta persona */}
                      {isExpanded && (
                        <div className="debtor-shares-list">
                          {debtor.pendingShares.map((ps) => (
                            <div className="debtor-share-item" key={ps.share.id}>
                              <div className="debtor-share-info">
                                <strong>{ps.expenseDescription}</strong>
                                <span>
                                  Esperado: {money(ps.expectedAmount)} · Cobrado: {money(ps.appliedAmount)}
                                  {ps.forgivenAmount > 0 && ` · Perdonado: ${money(ps.forgivenAmount)}`}
                                </span>
                              </div>
                              <div
                                className="debtor-share-action"
                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                              >
                                <span className="debtor-share-amount">
                                  {money(ps.pendingAmount)}
                                </span>
                                <button
                                  type="button"
                                  className="small-action-button"
                                  onClick={() => onRecordReimbursement(ps.share.id)}
                                >
                                  Marcar recibido
                                </button>
                                <button
                                  type="button"
                                  className="secondary-button"
                                  style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                                  onClick={() =>
                                    setAdjustingDebtTarget({ share: ps.share, isPayable: false })
                                  }
                                >
                                  Ajustar
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </section>
        ) : (
          <section className="receivables-section" style={{ marginTop: 14 }}>
            {/* Histórico agrupado por persona */}
            {receivablesContacts.length > 0 && (
              <div className="settled-by-contact" style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                  Histórico acumulado por persona
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {receivablesContacts.map((c) => (
                    <div
                      key={c.name}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'rgba(255,255,255,0.03)',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        fontSize: '0.82rem',
                      }}
                    >
                      <strong>{c.name}</strong>
                      <span style={{ color: 'var(--text-muted)' }}>
                        Esperado: {money(c.expectedReceivable)} · Cobrado: {money(c.receivedReal)}
                        {c.forgivenByUser > 0 && ` · Perdonado: ${money(c.forgivenByUser)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {settledList.length === 0 ? (
              <div className="empty-state-box">
                <p>Aún no hay cobros finalizados.</p>
              </div>
            ) : (
              <div className="settled-shares-list">
                {settledList.map((item) => (
                  <div className="settled-share-row" key={item.share.id}>
                    <div className="settled-avatar">
                      <AppIcon name="check" size={14} color="#10b981" />
                    </div>
                    <div className="settled-info">
                      <strong>{item.participantName}</strong>
                      <span>
                        {item.expenseDescription} · {shortDate(item.settledDate)}
                      </span>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        <span>Esperado: {money(item.expectedAmount)}</span>
                        <span> · Cobrado: {money(item.appliedAmount)}</span>
                        {item.forgivenAmount > 0 && (
                          <span style={{ color: '#fbbf24' }}> · Perdonado: {money(item.forgivenAmount)}</span>
                        )}
                      </div>
                    </div>
                    <strong className="positive">+{money(item.appliedAmount)}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      ) : (
        /* Modo Por Pagar */
        tab === 'pending' ? (
          <section className="receivables-section">
            <div className="debtors-group-list" style={{ marginTop: 14 }}>
              {pendingPayables.length === 0 ? (
                <div className="empty-state-box">
                  <span className="empty-icon">
                    <AppIcon name="check" size={24} color="#10b981" />
                  </span>
                  <p>No tienes deudas pendientes.</p>
                </div>
              ) : (
                pendingPayables.map((creditor) => {
                  const key = creditor.creditorContactId || creditor.creditorName
                  const isExpanded = expandedDebtor === key || pendingPayables.length === 1

                  return (
                    <div className="debtor-card" key={key}>
                      <div
                        className="debtor-card-header clickable"
                        onClick={() =>
                          setExpandedDebtor(
                            isExpanded && pendingPayables.length > 1 ? null : key
                          )
                        }
                        role="button"
                        tabIndex={0}
                      >
                        <div
                          className="debtor-avatar"
                          style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                          }}
                        >
                          {creditor.creditorName.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="debtor-header-info">
                          <strong>Debes a {creditor.creditorName}</strong>
                          <span>
                            {creditor.pendingShares.length}{' '}
                            {creditor.pendingShares.length === 1
                              ? 'gasto pendiente'
                              : 'gastos pendientes'}
                          </span>
                        </div>
                        <div className="debtor-header-amount">
                          <strong style={{ color: '#ef4444' }}>
                            {money(creditor.totalPending)}
                          </strong>
                          <AppIcon
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color="var(--text-muted)"
                          />
                        </div>
                      </div>

                      {/* Desglose de gastos con este acreedor */}
                      {isExpanded && (
                        <div className="debtor-shares-list">
                          {creditor.pendingShares.map((ps) => (
                            <div className="debtor-share-item" key={ps.share.id}>
                              <div className="debtor-share-info">
                                <strong>{ps.expenseDescription}</strong>
                                <span>
                                  Esperado: {money(ps.expectedAmount)} · Pagado: {money(ps.appliedAmount)}
                                  {ps.forgivenAmount > 0 && ` · Perdonado a ti: ${money(ps.forgivenAmount)}`}
                                </span>
                              </div>
                              <div
                                className="debtor-share-action"
                                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                              >
                                <span className="debtor-share-amount" style={{ color: '#ef4444' }}>
                                  {money(ps.pendingAmount)}
                                </span>
                                {onRecordPayablePayment && (
                                  <button
                                    type="button"
                                    className="small-action-button"
                                    style={{ background: '#ef4444', color: '#fff' }}
                                    onClick={() => onRecordPayablePayment(ps.share.id)}
                                  >
                                    Pagar
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="secondary-button"
                                  style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                                  onClick={() =>
                                    setAdjustingDebtTarget({ share: ps.share, isPayable: true })
                                  }
                                >
                                  Ajustar
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </section>
        ) : (
          <section className="receivables-section" style={{ marginTop: 14 }}>
            {/* Histórico acumulado por acreedor */}
            {payablesContacts.length > 0 && (
              <div className="settled-by-contact" style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                  Histórico acumulado por acreedor
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {payablesContacts.map((c) => (
                    <div
                      key={c.name}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'rgba(255,255,255,0.03)',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        fontSize: '0.82rem',
                      }}
                    >
                      <strong>{c.name}</strong>
                      <span style={{ color: 'var(--text-muted)' }}>
                        Esperado: {money(c.expectedPayable)} · Pagado: {money(c.paidReal)}
                        {c.forgivenToUser > 0 && ` · Perdonado a ti: ${money(c.forgivenToUser)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {settledPayables.length === 0 ? (
              <div className="empty-state-box">
                <p>Aún no hay deudas saldadas.</p>
              </div>
            ) : (
              <div className="settled-shares-list">
                {settledPayables.map((item) => (
                  <div className="settled-share-row" key={item.share.id}>
                    <div
                      className="settled-avatar"
                      style={{
                        background: 'rgba(16, 185, 129, 0.1)',
                        color: '#10b981',
                      }}
                    >
                      <AppIcon name="check" size={14} color="#10b981" />
                    </div>
                    <div className="settled-info">
                      <strong>Pagado a {item.creditorName}</strong>
                      <span>
                        {item.expenseDescription} · {shortDate(item.settledDate)}
                      </span>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        <span>Esperado: {money(item.expectedAmount)}</span>
                        <span> · Pagado: {money(item.appliedAmount)}</span>
                        {item.forgivenAmount > 0 && (
                          <span style={{ color: '#fbbf24' }}> · Perdonado a ti: {money(item.forgivenAmount)}</span>
                        )}
                      </div>
                    </div>
                    <strong style={{ color: 'var(--text-main)' }}>-{money(item.appliedAmount)}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      )}

      {adjustingDebtTarget && (
        <AdjustDebtModal
          open={Boolean(adjustingDebtTarget)}
          share={adjustingDebtTarget.share}
          transactions={finance.transactions}
          cashTransactions={finance.cashTransactions}
          onClose={() => setAdjustingDebtTarget(null)}
          onAdjustDebt={(shareId, amount) => {
            finance.adjustDebt(shareId, amount)
            setAdjustingDebtTarget(null)
          }}
          isPayable={adjustingDebtTarget.isPayable}
        />
      )}
    </main>
  )
}

import { useState, useMemo } from 'react'
import type { ReturnTypeFinance } from '../types'
import { money, shortDate } from '../utils/money'
import {
  selectPendingDebtors,
  selectSettledReimbursements,
  selectPendingPayables,
  selectSettledPayables,
} from '../utils/sharedExpenseSelectors'
import { AppIcon } from '../ui/icons'

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

  const totalPending = useMemo(() => {
    return Math.round(pendingDebtors.reduce((acc, d) => acc + d.totalPending, 0) * 100) / 100
  }, [pendingDebtors])

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

  const totalPendingPayables = useMemo(() => {
    return Math.round(pendingPayables.reduce((acc, p) => acc + p.totalPending, 0) * 100) / 100
  }, [pendingPayables])

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

      {mode === 'receivables' ? (
        tab === 'pending' ? (
          <section className="receivables-section">
            {/* Tarjeta de Resumen */}
            <div className="hero-card light" style={{ marginTop: 16 }}>
              <span className="hero-tag">Total pendiente por cobrar</span>
              <strong className="hero-main-number" style={{ color: totalPending > 0 ? '#7c3aed' : 'var(--text-main)' }}>
                {money(totalPending)}
              </strong>
              <p className="hero-sub" style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                {pendingDebtors.length === 0
                  ? '¡Estás al día! No tienes dinero pendiente de recuperar.'
                  : `Repartido entre ${pendingDebtors.length} ${pendingDebtors.length === 1 ? 'persona' : 'personas'}`}
              </p>
            </div>

            {/* Lista agrupada por persona */}
            <div className="debtors-group-list" style={{ marginTop: 16 }}>
              {pendingDebtors.length === 0 ? (
                <div className="empty-state-box">
                  <span className="empty-icon"><AppIcon name="check" size={24} color="#10b981" /></span>
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
                        onClick={() => setExpandedDebtor(isExpanded && pendingDebtors.length > 1 ? null : key)}
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
                            {debtor.pendingShares.length === 1 ? 'gasto pendiente' : 'gastos pendientes'}
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
                                  Cuota: {money(ps.share.expectedAmount)} · {shortDate(ps.expenseDate)}
                                </span>
                              </div>
                              <div className="debtor-share-action">
                                <span className="debtor-share-amount">{money(ps.pendingAmount)}</span>
                                <button
                                  type="button"
                                  className="small-action-button"
                                  onClick={() => onRecordReimbursement(ps.share.id)}
                                >
                                  Marcar recibido
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
          <section className="receivables-section" style={{ marginTop: 16 }}>
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
                      <span>{item.expenseDescription} · {shortDate(item.settledDate)}</span>
                    </div>
                    <strong className="positive">+{money(item.amount)}</strong>
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
            <div className="hero-card light" style={{ marginTop: 16 }}>
              <span className="hero-tag">Total pendiente por pagar</span>
              <strong className="hero-main-number" style={{ color: totalPendingPayables > 0 ? '#ef4444' : 'var(--text-main)' }}>
                {money(totalPendingPayables)}
              </strong>
              <p className="hero-sub" style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                {pendingPayables.length === 0
                  ? '¡No debes nada a nadie! Todas tus cuentas compartidas están saldadas.'
                  : `${pendingPayables.length} ${pendingPayables.length === 1 ? 'deuda pendiente' : 'deudas pendientes'}`}
              </p>
            </div>

            <div className="debtors-group-list" style={{ marginTop: 16 }}>
              {pendingPayables.length === 0 ? (
                <div className="empty-state-box">
                  <span className="empty-icon"><AppIcon name="check" size={24} color="#10b981" /></span>
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
                        onClick={() => setExpandedDebtor(isExpanded && pendingPayables.length > 1 ? null : key)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="debtor-avatar" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                          {creditor.creditorName.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="debtor-header-info">
                          <strong>Debes a {creditor.creditorName}</strong>
                          <span>
                            {creditor.pendingShares.length}{' '}
                            {creditor.pendingShares.length === 1 ? 'gasto pendiente' : 'gastos pendientes'}
                          </span>
                        </div>
                        <div className="debtor-header-amount">
                          <strong style={{ color: '#ef4444' }}>{money(creditor.totalPending)}</strong>
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
                                  Cuota: {money(ps.share.expectedAmount)} · {shortDate(ps.expenseDate)}
                                </span>
                              </div>
                              <div className="debtor-share-action">
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
          <section className="receivables-section" style={{ marginTop: 16 }}>
            {settledPayables.length === 0 ? (
              <div className="empty-state-box">
                <p>Aún no hay deudas saldadas.</p>
              </div>
            ) : (
              <div className="settled-shares-list">
                {settledPayables.map((item) => (
                  <div className="settled-share-row" key={item.share.id}>
                    <div className="settled-avatar" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                      <AppIcon name="check" size={14} color="#10b981" />
                    </div>
                    <div className="settled-info">
                      <strong>Pagado a {item.creditorName}</strong>
                      <span>{item.expenseDescription} · {shortDate(item.settledDate)}</span>
                    </div>
                    <strong style={{ color: 'var(--text-main)' }}>-{money(item.amount)}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      )}
    </main>
  )
}


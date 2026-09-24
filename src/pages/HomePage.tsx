import { useState, useRef, useMemo } from 'react'
import { DonutChart } from '../components/DonutChart'
import { TransactionList } from '../components/TransactionList'
import { CategoryDetailModal } from '../components/CategoryDetailModal'
import { AddCashTransactionModal } from '../components/AddCashTransactionModal'
import { AdjustCashModal } from '../components/AdjustCashModal'
import { EditCashTransactionModal } from '../components/EditCashTransactionModal'
import { CashActionSelectorModal } from '../components/CashActionSelectorModal'
import { CashTransactionList } from '../components/CashTransactionList'
import { TotalDonutChart } from '../components/TotalDonutChart'
import { DeleteTransactionModal } from '../components/DeleteTransactionModal'
import type { Category, Transaction, CashTransaction } from '../models/finance'
import type { ReturnTypeFinance } from '../types'
import { money } from '../utils/money'
import { selectPendingVariableExpenseEstimate } from '../utils/variableEstimates'
import { normalizeCategoryAlias } from '../utils/categoryNormalization'
import {
  selectCashBalance,
  selectCashExpensesForPeriod,
  selectCashIncomeForPeriod,
  selectTotalAvailableMoney,
  selectTotalEconomicConsumptionForPeriod,
} from '../utils/cashSelectors'
import { selectLinkedReimbursementsForExpense } from '../utils/sharedExpenseSelectors'
import { calculateSwipeNextIndex, type HomeModeIndex } from '../utils/swipeGestures'
import { AppIcon } from '../ui/icons'

export function HomePage({
  finance,
  onAdd,
  onSelectTransaction,
  onSelectSharedExpense,
  onNavigateToVariableEstimates,
  onNavigateToReceivables,
  onNavigateToPlan,
}: {
  finance: ReturnTypeFinance
  onAdd: () => void
  onSelectTransaction?: (tx: Transaction) => void
  onSelectSharedExpense?: (tx: Transaction | CashTransaction) => void
  onNavigateToVariableEstimates?: () => void
  onNavigateToReceivables?: () => void
  onNavigateToPlan?: () => void
}) {
  // Modo activo: 0 = Banco, 1 = Efectivo, 2 = Total
  const [activeHomeMode, setActiveHomeMode] = useState<HomeModeIndex>(0)

  // Referencias para detección de swipe gestual
  const touchStartXRef = useRef<number | null>(null)
  const touchStartYRef = useRef<number | null>(null)

  // Estados vista Banco
  const [isExpanded, setIsExpanded] = useState(false)
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null)
  const [selectedCategoryForDetail, setSelectedCategoryForDetail] = useState<Category | null>(null)

  // Estados vista Efectivo
  const [isCashActionSelectorOpen, setIsCashActionSelectorOpen] = useState(false)
  const [isCashAddModalOpen, setIsCashAddModalOpen] = useState(false)
  const [cashAddModalType, setCashAddModalType] = useState<'income' | 'expense'>('expense')
  const [isAdjustCashModalOpen, setIsAdjustCashModalOpen] = useState(false)
  const [editingCashTx, setEditingCashTx] = useState<CashTransaction | null>(null)

  const displayName = finance.profile?.displayName?.trim()
  const greeting = displayName ? `Hola, ${displayName}` : 'Hola'

  const estimates = finance.variableExpenseEstimates ?? []
  const hasActiveEstimates = estimates.some((e) => e.active)
  const pendingVariableExpenses = selectPendingVariableExpenseEstimate(
    estimates,
    finance.transactions ?? []
  )

  // Cálculos de Efectivo
  const cashTransactions = finance.cashTransactions ?? []
  const cashBalance = useMemo(() => selectCashBalance(cashTransactions), [cashTransactions])
  const cashMonthExpenses = useMemo(
    () => selectCashExpensesForPeriod(cashTransactions, new Date(), 'month', finance.transactions ?? []),
    [cashTransactions, finance.transactions]
  )
  const cashMonthIncome = useMemo(
    () => selectCashIncomeForPeriod(cashTransactions, new Date(), 'month'),
    [cashTransactions]
  )

  // Gastos de efectivo convertidos a formato Transaction compatible para DonutChart
  const cashExpensesAsTransactions = useMemo<Transaction[]>(() => {
    return cashTransactions
      .filter((tx) => tx.type === 'expense')
      .map((tx) => {
        const linked = selectLinkedReimbursementsForExpense(tx.id, finance.transactions ?? [], cashTransactions)
        const netAmount = Math.max(0, Math.round((tx.amount - linked) * 100) / 100)
        return {
          id: tx.id,
          type: 'expense',
          amount: netAmount,
          description: tx.description,
          date: tx.date,
          categoryId: tx.categoryId,
          accountId: 'daily',
          incomeKind: 'income',
          note: tx.note,
          isShared: tx.isShared,
        }
      })
  }, [cashTransactions, finance.transactions])

  // Cálculos de Total
  const totalAvailable = useMemo(
    () => selectTotalAvailableMoney(finance.accounts ?? [], cashTransactions),
    [finance.accounts, cashTransactions]
  )

  const economicConsumption = useMemo(
    () =>
      selectTotalEconomicConsumptionForPeriod(
        finance.transactions ?? [],
        cashTransactions,
        new Date(),
        'month'
      ),
    [finance.transactions, cashTransactions]
  )

  // Handlers para Swipe táctil (Mobile First)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartXRef.current = e.touches[0].clientX
      touchStartYRef.current = e.touches[0].clientY
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return
    if (e.changedTouches.length >= 1) {
      const deltaX = e.changedTouches[0].clientX - touchStartXRef.current
      const deltaY = e.changedTouches[0].clientY - touchStartYRef.current
      const nextIndex = calculateSwipeNextIndex(activeHomeMode, deltaX, deltaY, 45)
      if (nextIndex !== activeHomeMode) {
        setActiveHomeMode(nextIndex)
      }
    }
    touchStartXRef.current = null
    touchStartYRef.current = null
  }

  // Título contextual para la barra superior
  const eyebrowLabel =
    activeHomeMode === 0
      ? 'Mi dinero · Banco'
      : activeHomeMode === 1
      ? 'Mi dinero · Efectivo'
      : 'Mi dinero · Total'

  return (
    <main className="page">
      {/* 1. Cabecera Común */}
      <header className="topbar">
        <div>
          <span className="eyebrow">{eyebrowLabel}</span>
          <h1>{greeting}</h1>
        </div>

        {activeHomeMode === 0 && (
          <button className="round-button" onClick={onAdd} aria-label="Añadir movimiento bancario">
            <AppIcon name="plus" size={18} />
          </button>
        )}

        {activeHomeMode === 1 && (
          <button
            className="round-button"
            onClick={() => setIsCashActionSelectorOpen(true)}
            aria-label="Añadir en Efectivo"
          >
            <AppIcon name="plus" size={18} />
          </button>
        )}
      </header>

      {/* 2. Selector Segmentado (Actualiza directamente activeHomeMode) */}
      <nav className="home-segmented-nav" aria-label="Seleccionar vista financiera" role="tablist">
        <button
          type="button"
          role="tab"
          className={`home-segmented-tab ${activeHomeMode === 0 ? 'active' : ''}`}
          onClick={() => setActiveHomeMode(0)}
          aria-selected={activeHomeMode === 0}
          aria-controls="home-mode-panel"
        >
          <AppIcon name="landmark" size={15} />
          <span>Banco</span>
        </button>
        <button
          type="button"
          role="tab"
          className={`home-segmented-tab ${activeHomeMode === 1 ? 'active' : ''}`}
          onClick={() => setActiveHomeMode(1)}
          aria-selected={activeHomeMode === 1}
          aria-controls="home-mode-panel"
        >
          <AppIcon name="banknote" size={15} />
          <span>Efectivo</span>
        </button>
        <button
          type="button"
          role="tab"
          className={`home-segmented-tab ${activeHomeMode === 2 ? 'active' : ''}`}
          onClick={() => setActiveHomeMode(2)}
          aria-selected={activeHomeMode === 2}
          aria-controls="home-mode-panel"
        >
          <AppIcon name="chart-pie" size={15} />
          <span>Total</span>
        </button>
      </nav>

      {/* 3. Indicadores de puntos (Navegables y sincronizados) */}
      <div className="home-carousel-dots" role="tablist" aria-label="Indicadores de vista">
        <button
          type="button"
          role="tab"
          className={`home-carousel-dot ${activeHomeMode === 0 ? 'active' : ''}`}
          onClick={() => setActiveHomeMode(0)}
          aria-label="Ver vista Banco"
          aria-selected={activeHomeMode === 0}
        />
        <button
          type="button"
          role="tab"
          className={`home-carousel-dot ${activeHomeMode === 1 ? 'active' : ''}`}
          onClick={() => setActiveHomeMode(1)}
          aria-label="Ver vista Efectivo"
          aria-selected={activeHomeMode === 1}
        />
        <button
          type="button"
          role="tab"
          className={`home-carousel-dot ${activeHomeMode === 2 ? 'active' : ''}`}
          onClick={() => setActiveHomeMode(2)}
          aria-label="Ver vista Total"
          aria-selected={activeHomeMode === 2}
        />
      </div>

      {/* 4. Contenedor de Contenido con Detección de Swipe y Renderizado Único */}
      <div
        id="home-mode-panel"
        className="home-mode-content-container"
        role="tabpanel"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* ==================================================================
            VISTA 0: BANCO (Home Tradicional)
            ================================================================== */}
        {activeHomeMode === 0 && (
          <div className="home-mode-view bank-view" key="bank-view">
            <section
              className={`hero-card interactive ${isExpanded ? 'expanded' : ''}`}
              onClick={() => setIsExpanded((prev) => !prev)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setIsExpanded((prev) => !prev)
                }
              }}
              role="button"
              tabIndex={0}
              aria-expanded={isExpanded}
              aria-label="Tarjeta de dinero disponible en banco. Toca para ver u ocultar el desglose."
            >
              <div className="hero-top-row">
                <span className="hero-tag">Disponible real</span>
                {finance.totals.committedAmount > 0 && (
                  <span className="hero-committed-pill">
                    {money(finance.totals.committedAmount)} comprometidos
                  </span>
                )}
              </div>

              <strong className="hero-main-number">{money(finance.totals.realAvailable)}</strong>

              {hasActiveEstimates && !isExpanded && (
                <div className="hero-projected-sub">
                  <span>Disponible proyectado:</span>
                  <strong>{money(finance.totals.projectedAvailable)}</strong>
                </div>
              )}

              <div className="hero-kpis">
                <div className="hero-kpi-item">
                  <span>Dinero total</span>
                  <strong>{money(finance.totals.totalMoney)}</strong>
                </div>
                <div className="hero-kpi-item">
                  <span>Ahorro total</span>
                  <strong>{money(finance.totals.savingsBalance)}</strong>
                  {finance.totals.assignedSavings > 0 && (
                    <small className="hero-kpi-sub">
                      {money(finance.totals.assignedSavings)} asignados
                    </small>
                  )}
                </div>
                <div className="hero-kpi-item">
                  <span>Gastado este mes</span>
                  <strong>{money(finance.totals.monthExpenses)}</strong>
                </div>
              </div>

              {isExpanded && (
                <div className="hero-breakdown">
                  <div className="hero-breakdown-divider" />
                  <div className="hero-breakdown-header">
                    <span>Desglose de liquidez y previsión</span>
                  </div>

                  <div className="hero-breakdown-row">
                    <div className="breakdown-label">
                      <span>Dinero total</span>
                      <small>Saldo actual en todas tus cuentas</small>
                    </div>
                    <strong className="breakdown-value">{money(finance.totals.totalMoney)}</strong>
                  </div>

                  {finance.totals.savingsBalance > 0 && (
                    <div className="hero-breakdown-row sub">
                      <div className="breakdown-label">
                        <span>· Ahorro reservado</span>
                        <small>Fondos separados en cuenta de ahorro</small>
                      </div>
                      <span className="breakdown-value text-muted">
                        {money(finance.totals.savingsBalance)}
                      </span>
                    </div>
                  )}

                  <div className="hero-breakdown-row">
                    <div className="breakdown-label">
                      <span>Comprometido pendiente</span>
                      <small>Pagos recurrentes previstos aún no cobrados</small>
                    </div>
                    <strong className="breakdown-value negative">
                      {finance.totals.committedAmount > 0 ? `-${money(finance.totals.committedAmount)}` : '0,00 €'}
                    </strong>
                  </div>

                  <div className="hero-breakdown-row highlight">
                    <div className="breakdown-label">
                      <span>= Disponible real</span>
                      <small>Dinero disponible tras compromisos conocidos</small>
                    </div>
                    <strong className="breakdown-value positive">
                      {money(finance.totals.realAvailable)}
                    </strong>
                  </div>

                  <div className="hero-breakdown-row">
                    <div className="breakdown-label">
                      <span>Previsto variable pendiente</span>
                      <small>Estimaciones habituales del mes (ej. Gimnasio Rafa)</small>
                    </div>
                    <strong className="breakdown-value negative">
                      {pendingVariableExpenses > 0 ? `-${money(pendingVariableExpenses)}` : '0,00 €'}
                    </strong>
                  </div>

                  <div className="hero-breakdown-row highlight projected">
                    <div className="breakdown-label">
                      <span>= Disponible proyectado</span>
                      <small>Guía de lo que probablemente te quedará</small>
                    </div>
                    <strong className="breakdown-value">
                      {money(finance.totals.projectedAvailable)}
                    </strong>
                  </div>

                  {finance.totals.grossMonthExpenses > 0 && (
                    <>
                      <div className="hero-breakdown-divider" />
                      <div className="hero-breakdown-header">
                        <span>Gastos de este mes</span>
                      </div>

                      <div className="hero-breakdown-row">
                        <div className="breakdown-label">
                          <span>Gasto bruto</span>
                          <small>Total salido de cuenta en compras y pagos</small>
                        </div>
                        <strong className="breakdown-value">{money(finance.totals.grossMonthExpenses)}</strong>
                      </div>

                      {finance.totals.linkedReimbursementsMonth > 0 && (
                        <div className="hero-breakdown-row sub">
                          <div className="breakdown-label">
                            <span>· Reembolsado de gastos del mes</span>
                            <small>Devoluciones recibidas de compras de este mes</small>
                          </div>
                          <span className="breakdown-value" style={{ color: '#8b5cf6', fontWeight: 600 }}>
                            -{money(finance.totals.linkedReimbursementsMonth)}
                          </span>
                        </div>
                      )}

                      <div className="hero-breakdown-row highlight">
                        <div className="breakdown-label">
                          <span>= Gasto neto personal</span>
                          <small>Lo que realmente te ha costado el mes</small>
                        </div>
                        <strong className="breakdown-value">
                          {money(finance.totals.netMonthExpenses)}
                        </strong>
                      </div>
                    </>
                  )}

                  {finance.totals.pendingReimbursements > 0 && (
                    <div
                      className="hero-breakdown-row sub clickable"
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onNavigateToReceivables?.()
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="breakdown-label">
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          Por recuperar (gastos compartidos)
                          <AppIcon name="chevron-right" size={14} color="#8b5cf6" />
                        </span>
                        <small>Toca para ver el desglose en Por cobrar</small>
                      </div>
                      <span className="breakdown-value" style={{ color: '#8b5cf6', fontWeight: 600 }}>
                        +{money(finance.totals.pendingReimbursements)}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Indicador compacto de gastos variables previstos */}
            {hasActiveEstimates && (
              <button
                type="button"
                className="variable-estimate-home-banner"
                onClick={onNavigateToVariableEstimates}
                aria-label="Ver gastos variables previstos"
              >
                <div className="variable-estimate-home-left">
                  <span className="variable-estimate-home-icon">
                    <AppIcon name="activity" size={16} />
                  </span>
                  <div className="variable-estimate-home-info">
                    <span className="variable-estimate-home-title">Previsto variable pendiente</span>
                    <span className="variable-estimate-home-sub">Previsión del mes sin computar en saldo</span>
                  </div>
                </div>
                <div className="variable-estimate-home-right">
                  <strong className="variable-estimate-home-amount">{money(pendingVariableExpenses)}</strong>
                  <span className="variable-estimate-home-chevron">
                    <AppIcon name="chevron-right" size={16} />
                  </span>
                </div>
              </button>
            )}

            {/* Tarjeta compacta: Plan del mes */}
            <div
              className="plan-month-home-card"
              onClick={onNavigateToPlan}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onNavigateToPlan?.()
                }
              }}
              aria-label="Ver plan del mes"
            >
              <div className="plan-month-card-header">
                <span className="plan-month-card-badge">Plan del mes</span>
                <button
                  type="button"
                  className="plan-month-card-action"
                  onClick={(e) => {
                    e.stopPropagation()
                    onNavigateToPlan?.()
                  }}
                >
                  Ver plan <AppIcon name="chevron-right" size={14} />
                </button>
              </div>

              {finance.totals.monthlyPlanSummary.hasConfiguredPlan ? (
                <div className="plan-month-card-body">
                  <div className="plan-month-card-metric-row">
                    <span className="plan-month-card-metric-label">Libre para gastar</span>
                    <strong
                      className={`plan-month-card-metric-value ${
                        finance.totals.monthlyPlanSummary.freeToSpend < 0 ? 'negative' : ''
                      }`}
                    >
                      {money(finance.totals.monthlyPlanSummary.freeToSpend)}
                    </strong>
                  </div>
                  <p className="plan-month-card-subtext">Tras ahorro y gastos comprometidos</p>
                </div>
              ) : (
                <div className="plan-month-card-body incomplete">
                  <p className="plan-month-card-prompt">
                    Configura ingresos y ahorro para calcular tu margen
                  </p>
                </div>
              )}
            </div>

            {/* Gastos por categoría bancaria */}
            <section className="section">
              <div className="section-title">
                <h2>Gastos por categoría</h2>
                <span>
                  {finance.totals.budgetsSummary.totalBudgeted > 0
                    ? `Presupuestos: ${finance.totals.budgetsSummary.overallUsagePercentage}% consumido`
                    : 'Desglose mensual'}
                </span>
              </div>
              <DonutChart
                transactions={finance.transactions}
                categories={finance.categories}
                netCategoryItems={finance.totals.netCategoryExpenses}
                onSelectCategoryFilter={(catId) => {
                  const canonical = normalizeCategoryAlias(catId)
                  const cat = finance.categories.find((c) => normalizeCategoryAlias(c.id) === canonical) || {
                    id: canonical,
                    name: canonical === 'other' ? 'Otros' : catId,
                    color: '#B9B9B9',
                    icon: 'ellipsis',
                  }
                  setSelectedCategoryForDetail(cat)
                }}
              />
            </section>

            {/* Últimos movimientos bancarios */}
            <section className="section">
              <div className="section-title">
                <h2>Últimos movimientos</h2>
              </div>
              <TransactionList
                transactions={finance.transactions}
                categories={finance.categories}
                expenseShares={finance.expenseShares}
                cashTransactions={finance.cashTransactions}
                allTransactions={finance.transactions}
                limit={5}
                onSelect={(t) => {
                  if (t.isShared && onSelectSharedExpense) {
                    onSelectSharedExpense(t)
                  } else {
                    onSelectTransaction?.(t)
                  }
                }}
                onEdit={onSelectTransaction}
                onDelete={(t) => setTxToDelete(t)}
              />
            </section>
          </div>
        )}

        {/* ==================================================================
            VISTA 1: EFECTIVO (Home Específica de Efectivo)
            ================================================================== */}
        {activeHomeMode === 1 && (
          <div className="home-mode-view cash-view" key="cash-view">
            <section className="hero-card cash-hero">
              <div className="hero-top-row">
                <span className="hero-tag">Efectivo disponible</span>
                <span
                  style={{
                    fontSize: '0.78rem',
                    padding: '3px 8px',
                    borderRadius: 9999,
                    background: 'rgba(255,255,255,0.12)',
                    color: '#ffffff',
                    fontWeight: 600,
                  }}
                >
                  Físico
                </span>
              </div>

              <strong className="hero-main-number">
                ≈ {money(cashBalance)}
              </strong>

              <div className="hero-kpis">
                <div className="hero-kpi-item">
                  <span>Disponible</span>
                  <strong>≈ {money(cashBalance)}</strong>
                </div>
                <div className="hero-kpi-item">
                  <span>Gastado este mes</span>
                  <strong>{money(cashMonthExpenses)}</strong>
                </div>
                <div className="hero-kpi-item">
                  <span>Entradas este mes</span>
                  <strong>+{money(cashMonthIncome)}</strong>
                </div>
              </div>
            </section>

            {/* Gastos por categoría en Efectivo */}
            <section className="section">
              <div className="section-title">
                <h2>Gastos en efectivo</h2>
                <span>Desglose mensual</span>
              </div>
              <DonutChart
                transactions={cashExpensesAsTransactions}
                categories={finance.categories}
              />
            </section>

            {/* Movimientos de Efectivo */}
            <section className="section">
              <div className="section-title">
                <h2>Movimientos de efectivo</h2>
                <span>{cashTransactions.length} registrados</span>
              </div>
              <CashTransactionList
                transactions={cashTransactions}
                categories={finance.categories}
                onEdit={(tx) => {
                  if (tx.isShared && onSelectSharedExpense) {
                    onSelectSharedExpense(tx)
                  } else {
                    setEditingCashTx(tx)
                  }
                }}
              />
            </section>
          </div>
        )}

        {/* ==================================================================
            VISTA 2: TOTAL (Visión Global de Liquidez y Consumo)
            ================================================================== */}
        {activeHomeMode === 2 && (
          <div className="home-mode-view total-view" key="total-view">
            <section className="hero-card total-hero">
              <div className="hero-top-row">
                <span className="hero-tag">Total disponible</span>
                <span
                  style={{
                    fontSize: '0.78rem',
                    padding: '3px 8px',
                    borderRadius: 9999,
                    background: 'rgba(255,255,255,0.12)',
                    color: '#ffffff',
                    fontWeight: 600,
                  }}
                >
                  Banco + Efectivo
                </span>
              </div>

              <strong className="hero-main-number">
                ≈ {money(totalAvailable.total)}
              </strong>

              <div className="hero-kpis">
                <div className="hero-kpi-item">
                  <span>En banco</span>
                  <strong>{money(totalAvailable.bank)}</strong>
                </div>
                <div className="hero-kpi-item">
                  <span>En efectivo</span>
                  <strong>≈ {money(totalAvailable.cash)}</strong>
                </div>
                <div className="hero-kpi-item">
                  <span>Consumo mes</span>
                  <strong>{money(economicConsumption.totalEconomicConsumption)}</strong>
                </div>
              </div>
            </section>

            {/* Rueda / Gráfico circular Total: Banco vs Efectivo */}
            <section className="section">
              <div className="section-title">
                <h2>¿Dónde está mi dinero?</h2>
                <span>Liquidez actual</span>
              </div>
              <TotalDonutChart
                bankAmount={totalAvailable.bank}
                cashAmount={totalAvailable.cash}
              />
            </section>

            {/* Consumo Total Observado del Mes */}
            <section className="section">
              <div className="section-title">
                <h2>Consumo total observado</h2>
                <span>Gasto real sin duplicidades</span>
              </div>

              <div className="consumption-summary-card">
                <div className="consumption-metric-large">
                  <span>Consumo económico total este mes</span>
                  <strong>{money(economicConsumption.totalEconomicConsumption)}</strong>
                </div>

                <div className="consumption-breakdown-list">
                  <div className="consumption-row">
                    <span>
                      <AppIcon name="landmark" size={15} color="#3b82f6" /> Gasto neto en banco:
                    </span>
                    <strong>{money(economicConsumption.bankNetExpenses)}</strong>
                  </div>

                  <div className="consumption-row">
                    <span>
                      <AppIcon name="banknote" size={15} color="#10b981" /> Gasto en efectivo:
                    </span>
                    <strong>+{money(economicConsumption.cashExpenses)}</strong>
                  </div>

                  {economicConsumption.linkedWithdrawalsDeducted > 0 && (
                    <div className="consumption-row deduction">
                      <span>
                        <AppIcon name="arrow-left-right" size={15} color="#2563eb" /> Cajero vinculado deducido (evita doble conteo):
                      </span>
                      <strong>-{money(economicConsumption.linkedWithdrawalsDeducted)}</strong>
                    </div>
                  )}

                  <div
                    className="consumption-row"
                    style={{
                      borderTop: '1px solid var(--border-light, #eaeae4)',
                      paddingTop: 8,
                      fontWeight: 700,
                    }}
                  >
                    <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>
                      = Consumo total neto del mes:
                    </span>
                    <strong style={{ fontSize: '1.05rem' }}>
                      {money(economicConsumption.totalEconomicConsumption)}
                    </strong>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Selector de Acciones de Efectivo */}
      <CashActionSelectorModal
        open={isCashActionSelectorOpen}
        onClose={() => setIsCashActionSelectorOpen(false)}
        onSelectIncome={() => {
          setCashAddModalType('income')
          setIsCashAddModalOpen(true)
        }}
        onSelectExpense={() => {
          setCashAddModalType('expense')
          setIsCashAddModalOpen(true)
        }}
        onSelectAdjust={() => {
          setIsAdjustCashModalOpen(true)
        }}
      />

      {/* Modales de Efectivo */}
      <AddCashTransactionModal
        open={isCashAddModalOpen}
        onClose={() => setIsCashAddModalOpen(false)}
        type={cashAddModalType}
        categories={finance.categories}
        sharedContacts={finance.sharedContacts}
        onSave={(input, shares) => finance.addCashTransaction(input, shares)}
      />

      <AdjustCashModal
        open={isAdjustCashModalOpen}
        onClose={() => setIsAdjustCashModalOpen(false)}
        currentBalance={cashBalance}
        onSave={(countedAmount, date, note) => {
          finance.adjustCashToAmount(countedAmount, date, note)
        }}
      />

      <EditCashTransactionModal
        open={Boolean(editingCashTx)}
        onClose={() => setEditingCashTx(null)}
        transaction={editingCashTx}
        categories={finance.categories}
        expenseShares={finance.expenseShares}
        sharedContacts={finance.sharedContacts}
        onUpdate={(id, patch, shares) => finance.updateCashTransaction(id, patch, shares)}
        onDelete={(id) => finance.deleteCashTransaction(id)}
      />

      {/* Modal de confirmación de eliminación bancaria con soporte de vínculo efectivo */}
      <DeleteTransactionModal
        open={Boolean(txToDelete)}
        transaction={txToDelete}
        cashTransactions={finance.cashTransactions}
        onClose={() => setTxToDelete(null)}
        onDeleteBankOnly={(id) => finance.deleteTransaction(id)}
        onDeleteBoth={(bankId, cashId) => {
          finance.deleteTransaction(bankId)
          finance.deleteCashTransaction(cashId)
        }}
      />

      {/* Modal de Detalle de Categoría Bancaria */}
      <CategoryDetailModal
        open={Boolean(selectedCategoryForDetail)}
        onClose={() => setSelectedCategoryForDetail(null)}
        category={selectedCategoryForDetail}
        transactions={finance.transactions}
        categories={finance.categories}
        expenseShares={finance.expenseShares}
        mode="net"
        periodLabel="Mes actual"
        onSelectTransaction={onSelectTransaction}
        onEditTransaction={onSelectTransaction}
        onDeleteTransaction={(t) => setTxToDelete(t)}
      />
    </main>
  )
}

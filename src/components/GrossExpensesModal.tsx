import { useState, useMemo } from 'react'
import type { Category, Transaction, CashTransaction } from '../models/finance'
import type { GrossExpensesBreakdown } from '../utils/sharedExpenseSelectors'
import { money, shortDate } from '../utils/money'
import { AppIcon } from '../ui/icons'
import { normalizeCategoryAlias } from '../utils/categoryNormalization'

interface GrossExpensesModalProps {
  open: boolean
  onClose: () => void
  breakdown: GrossExpensesBreakdown
  categories: Category[]
  onSelectTransaction?: (tx: Transaction | CashTransaction) => void
}

type TabFilter = 'all' | 'bank' | 'bizum' | 'cash'

export function GrossExpensesModal({
  open,
  onClose,
  breakdown,
  categories,
  onSelectTransaction,
}: GrossExpensesModalProps) {
  const [activeTab, setActiveTab] = useState<TabFilter>('all')

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>()
    categories.forEach((c) => {
      map.set(c.id, c)
      map.set(normalizeCategoryAlias(c.id), c)
    })
    return map
  }, [categories])

  const filteredItems = useMemo(() => {
    if (activeTab === 'all') return breakdown.items
    return breakdown.items.filter((item) => item.paymentMethod === activeTab)
  }, [breakdown.items, activeTab])

  if (!open) return null

  const activeTabTotal =
    activeTab === 'all'
      ? breakdown.total
      : activeTab === 'bank'
      ? breakdown.bank
      : activeTab === 'bizum'
      ? breakdown.bizum
      : breakdown.cash

  const activeTabLabel =
    activeTab === 'all'
      ? 'Todos los gastos'
      : activeTab === 'bank'
      ? 'Tarjeta / cuenta'
      : activeTab === 'bizum'
      ? 'Bizum'
      : 'Efectivo'

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal gross-expenses-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="modal-header">
          <div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted, #888)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Desglose mensual
            </span>
            <h3 style={{ margin: 0 }}>Gasto bruto</h3>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar">
            <AppIcon name="x" size={18} />
          </button>
        </div>

        {/* Tarjeta de Resumen Global */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 14,
            padding: '16px 18px',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted, #aaa)' }}>Total del mes</span>
            <strong style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-main, #fff)' }}>
              {money(breakdown.total)}
            </strong>
          </div>

          {/* Desglose por método */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: 10 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.86rem',
                cursor: 'pointer',
                opacity: activeTab === 'bank' || activeTab === 'all' ? 1 : 0.6,
              }}
              onClick={() => setActiveTab('bank')}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-main, #eee)' }}>
                <AppIcon name="landmark" size={15} color="#3b82f6" />
                Tarjeta / cuenta
              </span>
              <strong>{money(breakdown.bank)}</strong>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.86rem',
                cursor: 'pointer',
                opacity: activeTab === 'bizum' || activeTab === 'all' ? 1 : 0.6,
              }}
              onClick={() => setActiveTab('bizum')}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-main, #eee)' }}>
                <AppIcon name="smartphone" size={15} color="#10b981" />
                Bizum
              </span>
              <strong style={{ color: breakdown.bizum > 0 ? '#10b981' : 'inherit' }}>
                {money(breakdown.bizum)}
              </strong>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.86rem',
                cursor: 'pointer',
                opacity: activeTab === 'cash' || activeTab === 'all' ? 1 : 0.6,
              }}
              onClick={() => setActiveTab('cash')}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-main, #eee)' }}>
                <AppIcon name="banknote" size={15} color="#f59e0b" />
                Efectivo
              </span>
              <strong>{money(breakdown.cash)}</strong>
            </div>
          </div>
        </div>

        {/* Tabs de Filtro */}
        <div
          className="segmented"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            marginBottom: 12,
            gap: 2,
          }}
        >
          <button
            type="button"
            className={activeTab === 'all' ? 'active' : ''}
            onClick={() => setActiveTab('all')}
            style={{ fontSize: '0.78rem', padding: '6px 4px' }}
          >
            Todos
          </button>
          <button
            type="button"
            className={activeTab === 'bank' ? 'active' : ''}
            onClick={() => setActiveTab('bank')}
            style={{ fontSize: '0.78rem', padding: '6px 4px' }}
          >
            Tarjeta
          </button>
          <button
            type="button"
            className={activeTab === 'bizum' ? 'active' : ''}
            onClick={() => setActiveTab('bizum')}
            style={{ fontSize: '0.78rem', padding: '6px 4px' }}
          >
            Bizum
          </button>
          <button
            type="button"
            className={activeTab === 'cash' ? 'active' : ''}
            onClick={() => setActiveTab('cash')}
            style={{ fontSize: '0.78rem', padding: '6px 4px' }}
          >
            Efectivo
          </button>
        </div>

        {/* Cabecera del listado activo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 2px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #888)', fontWeight: 600 }}>
            {activeTabLabel} ({filteredItems.length})
          </span>
          <strong style={{ fontSize: '0.88rem', color: 'var(--text-main, #eee)' }}>
            {money(activeTabTotal)}
          </strong>
        </div>

        {/* Lista de Movimientos */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            maxHeight: 280,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            paddingRight: 2,
          }}
        >
          {filteredItems.length === 0 ? (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                color: 'var(--text-muted, #888)',
                fontSize: '0.86rem',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: 10,
              }}
            >
              No hay movimientos en este grupo este mes.
            </div>
          ) : (
            filteredItems.map((item) => {
              const cat = item.categoryId ? categoryMap.get(item.categoryId) : undefined
              const isBizum = item.paymentMethod === 'bizum'
              const isCash = item.paymentMethod === 'cash'

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (onSelectTransaction) {
                      onSelectTransaction(item.rawTx)
                      onClose()
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    cursor: onSelectTransaction ? 'pointer' : 'default',
                    transition: 'background 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: cat?.color || (isBizum ? '#10b981' : isCash ? '#f59e0b' : '#3b82f6'),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <AppIcon
                        name={cat?.iconKey || (isBizum ? 'smartphone' : isCash ? 'banknote' : 'shopping-basket')}
                        size={14}
                        color="#ffffff"
                      />
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <strong
                          style={{
                            fontSize: '0.88rem',
                            color: 'var(--text-main, #fff)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.description}
                        </strong>
                        {isBizum && (
                          <span className="pill-source bizum" style={{ fontSize: 9, padding: '1px 5px' }}>
                            Bizum
                          </span>
                        )}
                        {isCash && (
                          <span className="pill-source cash" style={{ fontSize: 9, padding: '1px 5px' }}>
                            Efectivo
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted, #888)', marginTop: 2 }}>
                        {cat ? `${cat.name} · ` : ''}
                        {shortDate(item.date)}
                      </div>
                    </div>
                  </div>

                  <strong style={{ fontSize: '0.92rem', color: 'var(--text-main, #fff)', marginLeft: 12, flexShrink: 0 }}>
                    {money(item.amount)}
                  </strong>
                </div>
              )
            })
          )}
        </div>

        <div className="modal-actions" style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <button type="button" className="secondary-button" onClick={onClose} style={{ width: '100%' }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

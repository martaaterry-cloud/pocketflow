import type { CashTransaction, Category } from '../models/finance'
import { money } from '../utils/money'
import { AppIcon } from '../ui/icons'

interface CashTransactionListProps {
  transactions: CashTransaction[]
  categories: Category[]
  limit?: number
  onEdit?: (tx: CashTransaction) => void
  onDelete?: (tx: CashTransaction) => void
}

export function CashTransactionList({
  transactions,
  categories,
  limit,
  onEdit,
  onDelete,
}: CashTransactionListProps) {
  const sorted = [...transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )
  const items = limit ? sorted.slice(0, limit) : sorted

  if (items.length === 0) {
    return (
      <div
        className="empty-state"
        style={{
          padding: '32px 20px',
          textAlign: 'center',
          background: 'var(--bg-card, #ffffff)',
          borderRadius: 'var(--radius-lg, 24px)',
          border: '1px solid var(--border-light, #eaeae4)',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: 'rgba(0,0,0,0.04)',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
          }}
        >
          <AppIcon name="banknote" size={24} />
        </div>
        <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: '0.98rem' }}>Sin movimientos de efectivo</p>
        <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-muted)' }}>
          Registra una entrada, salida o haz un ajuste rápido de tu efectivo físico.
        </p>
      </div>
    )
  }

  return (
    <div className="transaction-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((tx) => {
        const cat = categories.find((c) => c.id === tx.categoryId)
        const isIncome = tx.type === 'income'
        const isAdjustment = tx.type === 'adjustment'
        const isExpense = tx.type === 'expense'

        let badgeBg = 'rgba(239, 68, 68, 0.1)'
        let badgeColor = '#dc2626'
        let iconName = 'minus'

        if (isIncome) {
          badgeBg = 'rgba(34, 197, 94, 0.12)'
          badgeColor = '#16a34a'
          iconName = 'plus'
        } else if (isAdjustment) {
          badgeBg = 'rgba(59, 130, 246, 0.12)'
          badgeColor = '#2563eb'
          iconName = 'scale'
        }

        const formattedDate = new Date(tx.date).toLocaleDateString('es-ES', {
          day: 'numeric',
          month: 'short',
        })

        return (
          <div
            key={tx.id}
            className="transaction-item interactive"
            onClick={() => onEdit?.(tx)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onEdit?.(tx)
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'var(--bg-card, #ffffff)',
              borderRadius: 'var(--radius-md, 16px)',
              border: '1px solid var(--border-light, #eaeae4)',
              cursor: 'pointer',
              transition: 'transform 0.1s ease, box-shadow 0.1s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  background: cat?.color ? `${cat.color}22` : badgeBg,
                  color: cat?.color || badgeColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AppIcon name={cat?.iconKey || cat?.icon || iconName} size={18} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span
                  style={{
                    fontSize: '0.94rem',
                    fontWeight: 600,
                    color: 'var(--text-main)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tx.description}
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span>{formattedDate}</span>
                  {cat && <span>· {cat.name}</span>}
                  {tx.isShared && (
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: 6,
                        background: 'rgba(139, 92, 246, 0.12)',
                        color: '#7c3aed',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                      }}
                    >
                      Compartido
                    </span>
                  )}
                  {tx.bankTransactionId && (
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: 6,
                        background: 'rgba(59, 130, 246, 0.1)',
                        color: '#2563eb',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                      }}
                    >
                      Desde Banco
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <strong
                style={{
                  fontSize: '0.98rem',
                  fontWeight: 700,
                  color: isIncome
                    ? '#16a34a'
                    : isExpense
                    ? 'var(--text-main)'
                    : tx.amount >= 0
                    ? '#16a34a'
                    : '#dc2626',
                }}
              >
                {isIncome
                  ? `+${money(tx.amount)}`
                  : isExpense
                  ? `-${money(tx.amount)}`
                  : tx.amount >= 0
                  ? `+${money(tx.amount)}`
                  : money(tx.amount)}
              </strong>
              <AppIcon name="chevron-right" size={14} color="var(--text-dim)" />
            </div>
          </div>
        )
      })}
    </div>
  )
}

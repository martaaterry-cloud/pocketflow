import { useMemo } from 'react'
import { money } from '../utils/money'
import { AppIcon } from '../ui/icons'

interface TotalDonutChartProps {
  bankAmount: number
  cashAmount: number
}

export function TotalDonutChart({ bankAmount, cashAmount }: TotalDonutChartProps) {
  const safeBank = Math.max(0, bankAmount)
  const safeCash = Math.max(0, cashAmount)
  const total = safeBank + safeCash

  const bankPct = total > 0 ? Math.round((safeBank / total) * 100) : 0
  const cashPct = total > 0 ? Math.round((safeCash / total) * 100) : 0

  const gradient = useMemo(() => {
    if (total <= 0) return '#e2e8f0 0% 100%'
    const bankShare = (safeBank / total) * 100
    // Banco: color #22241f (dark slate) o #3b82f6 (blue), Efectivo: color #10b981 (emerald green)
    return `#3b82f6 0% ${bankShare}%, #10b981 ${bankShare}% 100%`
  }, [safeBank, safeCash, total])

  return (
    <div className="donut-container-card">
      <div className="donut-mode-header">
        <span className="donut-mode-label">Distribución de liquidez total</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>¿Dónde está mi dinero?</span>
      </div>

      <div className="donut-visual-wrap">
        <div className="donut-ring" style={{ background: `conic-gradient(${gradient})` }}>
          <div className="donut-center-interactive">
            <span className="donut-center-label">Total disponible</span>
            <strong className="donut-center-amount">≈ {money(total)}</strong>
            <span className="donut-center-sub">Banco + Efectivo</span>
          </div>
        </div>
      </div>

      <div className="donut-legend-section">
        <div className="donut-legend-list">
          {/* Banco */}
          <div className="donut-legend-row">
            <div className="donut-legend-left">
              <span className="donut-legend-dot" style={{ background: '#3b82f6' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AppIcon name="landmark" size={14} color="#3b82f6" />
                <span className="donut-legend-name">Dinero en banco</span>
              </div>
            </div>
            <div className="donut-legend-right">
              <strong className="donut-legend-amount">{money(safeBank)}</strong>
              <span className="donut-legend-percentage">{bankPct} %</span>
            </div>
          </div>

          {/* Efectivo */}
          <div className="donut-legend-row">
            <div className="donut-legend-left">
              <span className="donut-legend-dot" style={{ background: '#10b981' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AppIcon name="banknote" size={14} color="#10b981" />
                <span className="donut-legend-name">Efectivo físico</span>
              </div>
            </div>
            <div className="donut-legend-right">
              <strong className="donut-legend-amount">≈ {money(cashAmount)}</strong>
              <span className="donut-legend-percentage">{cashPct} %</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

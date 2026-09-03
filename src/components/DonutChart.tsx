import { useState, useMemo } from 'react'
import type { Category, Transaction } from '../models/finance'
import { money } from '../utils/money'
import {
  selectNetExpensesByCategory,
  type NetCategoryExpense,
} from '../utils/sharedExpenseSelectors'
import { selectCategoryExpenses } from '../utils/financeSelectors'
import { AppIcon } from '../ui/icons'

export interface DonutCategoryItem {
  id: string
  name: string
  amount: number
  percentage: number
  color: string
  iconKey?: string
}

interface DonutChartProps {
  transactions?: Transaction[]
  categories?: Category[]
  netCategoryItems?: NetCategoryExpense[]
  grossCategoryItems?: Array<{
    id: string
    name: string
    amount: number
    percentage: number
    color: string
    iconKey?: string
  }>
  referenceDate?: Date
  initialMode?: 'net' | 'gross'
  onSelectCategoryFilter?: (categoryId: string) => void
}

export function DonutChart({
  transactions = [],
  categories = [],
  netCategoryItems,
  grossCategoryItems,
  referenceDate = new Date(),
  initialMode = 'net',
  onSelectCategoryFilter,
}: DonutChartProps) {
  const [mode, setMode] = useState<'net' | 'gross'>(initialMode)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [showAllCategories, setShowAllCategories] = useState(false)

  // 1. Calcular categorías netas o brutas según el modo seleccionado
  const rawItems = useMemo<DonutCategoryItem[]>(() => {
    if (mode === 'net') {
      const items =
        netCategoryItems ??
        selectNetExpensesByCategory(transactions, categories, referenceDate, 'month')
      return items.map((i) => ({
        id: i.id,
        name: i.name,
        amount: i.amount,
        percentage: i.percentage,
        color: i.color,
        iconKey: (i as any).iconKey || (i as any).icon,
      }))
    } else {
      const items =
        grossCategoryItems ??
        selectCategoryExpenses(transactions, categories, referenceDate)
      return items.map((i) => ({
        id: i.id,
        name: i.name,
        amount: i.amount,
        percentage: i.percentage,
        color: i.color,
        iconKey: (i as any).iconKey || (i as any).icon,
      }))
    }
  }, [mode, netCategoryItems, grossCategoryItems, transactions, categories, referenceDate])

  // Filtrar solo categorías con gasto > 0 y ordenar de mayor a menor
  const activeItems = useMemo(() => {
    return rawItems
      .filter((item) => item.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  }, [rawItems])

  const total = useMemo(() => {
    return Math.round(activeItems.reduce((sum, item) => sum + item.amount, 0) * 100) / 100
  }, [activeItems])

  // Calcular porcentajes exactos sobre el total activo
  const itemsWithExactPercentage = useMemo(() => {
    if (total <= 0) return []
    return activeItems.map((item) => {
      const pct = Math.round((item.amount / total) * 100)
      return {
        ...item,
        percentage: pct,
      }
    })
  }, [activeItems, total])

  // Construcción del gradiente cónico para la rosquilla
  const gradient = useMemo(() => {
    if (total <= 0 || itemsWithExactPercentage.length === 0) {
      return '#e2e8f0 0% 100%'
    }

    let cursor = 0
    return itemsWithExactPercentage
      .map((item) => {
        const start = cursor
        const share = (item.amount / total) * 100
        cursor += share
        return `${item.color} ${start}% ${cursor}%`
      })
      .join(', ')
  }, [itemsWithExactPercentage, total])

  const selectedItem = useMemo(() => {
    if (!selectedCategoryId) return null
    return itemsWithExactPercentage.find((i) => i.id === selectedCategoryId) ?? null
  }, [selectedCategoryId, itemsWithExactPercentage])

  const handleToggleCategory = (id: string) => {
    setSelectedCategoryId((prev) => (prev === id ? null : id))
  }

  const displayedLegendItems = showAllCategories
    ? itemsWithExactPercentage
    : itemsWithExactPercentage.slice(0, 5)

  return (
    <div className="donut-container-card">
      {/* Selector compacto Neto / Bruto */}
      <div className="donut-mode-header">
        <span className="donut-mode-label">
          {mode === 'net' ? 'Gasto neto personal' : 'Gasto bruto total'}
        </span>
        <div className="donut-segmented-toggle" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'net'}
            className={`donut-toggle-btn ${mode === 'net' ? 'active' : ''}`}
            onClick={() => {
              setMode('net')
              setSelectedCategoryId(null)
            }}
          >
            Neto
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'gross'}
            className={`donut-toggle-btn ${mode === 'gross' ? 'active' : ''}`}
            onClick={() => {
              setMode('gross')
              setSelectedCategoryId(null)
            }}
          >
            Bruto
          </button>
        </div>
      </div>

      {/* Gráfico circular con centro interactivo */}
      <div className="donut-visual-wrap">
        <div
          className="donut-ring"
          style={{ background: `conic-gradient(${gradient})` }}
          onClick={() => setSelectedCategoryId(null)}
          title="Toca para deseleccionar"
        >
          <div
            className={`donut-center-interactive ${selectedItem ? 'highlighted' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              setSelectedCategoryId(null)
            }}
          >
            {selectedItem ? (
              <>
                <span className="donut-center-name" title={selectedItem.name}>
                  {selectedItem.name}
                </span>
                <strong className="donut-center-amount">{money(selectedItem.amount)}</strong>
                <span className="donut-center-sub">{selectedItem.percentage} % del gasto</span>
              </>
            ) : (
              <>
                <span className="donut-center-label">Gastado</span>
                <strong className="donut-center-amount">{money(total)}</strong>
                <span className="donut-center-sub">este mes</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Leyenda interactiva de categorías */}
      {itemsWithExactPercentage.length > 0 ? (
        <div className="donut-legend-section">
          <div className="donut-legend-list">
            {displayedLegendItems.map((item) => {
              const isSelected = selectedCategoryId === item.id
              return (
                <div
                  key={item.id}
                  className={`donut-legend-row ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleToggleCategory(item.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${item.name}: ${money(item.amount)}, ${item.percentage}% del gasto`}
                >
                  <div className="donut-legend-left">
                    <span className="donut-legend-dot" style={{ background: item.color }} />
                    <span className="donut-legend-name">{item.name}</span>
                  </div>
                  <div className="donut-legend-right">
                    <strong className="donut-legend-amount">{money(item.amount)}</strong>
                    <span className="donut-legend-percentage">{item.percentage} %</span>
                    {onSelectCategoryFilter && (
                      <button
                        type="button"
                        className="btn-icon-subtle"
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelectCategoryFilter(item.id)
                        }}
                        title={`Ver movimientos de ${item.name}`}
                        aria-label={`Ver movimientos de ${item.name}`}
                      >
                        <AppIcon name="chevron-right" size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {itemsWithExactPercentage.length > 5 && (
            <button
              type="button"
              className="donut-expand-btn"
              onClick={() => setShowAllCategories((prev) => !prev)}
            >
              {showAllCategories
                ? 'Mostrar menos'
                : `Ver todas (${itemsWithExactPercentage.length})`}
            </button>
          )}
        </div>
      ) : (
        <p className="donut-empty-notice">No hay gastos registrados en este mes.</p>
      )}
    </div>
  )
}

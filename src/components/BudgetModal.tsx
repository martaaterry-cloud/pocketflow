import { useEffect, useState } from 'react'
import type { Budget, Category, CreateBudgetInput, UpdateBudgetInput } from '../models/finance'

interface BudgetModalProps {
  open: boolean
  onClose: () => void
  categories: Category[]
  existingBudgets: Budget[]
  budget?: Budget | null
  onSave: (data: CreateBudgetInput | UpdateBudgetInput, id?: string) => void
  onDelete?: (id: string) => void
}

export function BudgetModal({
  open,
  onClose,
  categories,
  existingBudgets,
  budget,
  onSave,
  onDelete,
}: BudgetModalProps) {
  const [categoryId, setCategoryId] = useState('')
  const [amountLimit, setAmountLimit] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isEditing = Boolean(budget)

  // Categorías elegibles para nuevo presupuesto (no duplicadas)
  const availableCategories = isEditing
    ? categories
    : categories.filter((c) => !existingBudgets.some((b) => b.categoryId === c.id))

  useEffect(() => {
    if (budget) {
      setCategoryId(budget.categoryId)
      setAmountLimit(String(budget.amountLimit ?? budget.monthlyLimit ?? 0).replace('.', ','))
      setConfirmDelete(false)
    } else {
      const defaultCat = availableCategories[0]?.id ?? categories[0]?.id ?? 'food'
      setCategoryId(defaultCat)
      setAmountLimit('')
      setConfirmDelete(false)
    }
  }, [budget, open])

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const numericLimit = Number(amountLimit.replace(',', '.'))
    if (!categoryId || isNaN(numericLimit) || numericLimit <= 0) return

    if (isEditing && budget) {
      onSave({ amountLimit: numericLimit }, budget.id)
    } else {
      onSave({
        categoryId,
        amountLimit: numericLimit,
        period: 'monthly',
      })
    }
    onClose()
  }

  const handleDelete = () => {
    if (budget && onDelete) {
      onDelete(budget.id)
      onClose()
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEditing ? 'Editar presupuesto' : 'Nuevo presupuesto mensual'}</h3>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>
              Categoría
              {isEditing ? (
                <div className="static-field">
                  {categories.find((c) => c.id === categoryId)?.icon}{' '}
                  {categories.find((c) => c.id === categoryId)?.name}
                </div>
              ) : (
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  {availableCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </div>

          <div className="form-group">
            <label>
              Límite mensual (€)
              <input
                type="text"
                inputMode="decimal"
                placeholder="150,00"
                value={amountLimit}
                onChange={(e) => setAmountLimit(e.target.value)}
                autoFocus
              />
            </label>
          </div>

          <div className="info-callout" style={{ marginTop: 12 }}>
            <p>
              💡 <strong>Informativo:</strong> Un presupuesto no bloquea ningún pago ni impide
              registrar gastos. Solo te informa del ritmo de consumo durante el mes.
            </p>
          </div>

          <div className="modal-actions" style={{ marginTop: 20 }}>
            <button type="submit" className="primary-button">
              {isEditing ? 'Guardar cambios' : 'Crear presupuesto'}
            </button>

            {isEditing && onDelete && (
              <>
                {!confirmDelete ? (
                  <button
                    type="button"
                    className="danger-outline-button"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Eliminar presupuesto
                  </button>
                ) : (
                  <div className="confirm-delete-box">
                    <p>
                      ¿Seguro que deseas eliminar este presupuesto? Tus movimientos y gastos no se
                      verán afectados.
                    </p>
                    <div className="confirm-delete-actions">
                      <button
                        type="button"
                        className="danger-button"
                        onClick={handleDelete}
                      >
                        Sí, eliminar
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setConfirmDelete(false)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

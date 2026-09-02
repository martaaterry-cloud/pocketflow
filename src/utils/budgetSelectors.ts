import type { Budget, Category, Transaction } from '../models/finance'
import { selectLinkedReimbursementsForExpense } from './sharedExpenseSelectors'

export interface BudgetStatusItem {
  id: string
  categoryId: string
  categoryName: string
  categoryColor: string
  categoryIcon: string
  amountLimit: number
  spent: number
  remaining: number
  overBudget: number
  percentage: number
  isOverBudget: boolean
}

export interface BudgetsSummary {
  totalBudgeted: number
  totalSpentOnBudgetedCategories: number
  totalRemaining: number
  overallUsagePercentage: number
  items: BudgetStatusItem[]
}

/**
 * Calcula el gasto neto personal de una categoría en el mes y año de la fecha de referencia.
 * Regla de producto: gastos del mes menos los reembolsos vinculados a esos gastos.
 * Transferencias, ingresos y movimientos de ahorro quedan estrictamente excluidos.
 */
export function spentByCategoryThisMonth(
  transactions: Transaction[],
  categoryId: string,
  referenceDate: Date = new Date()
): number {
  const currentMonth = referenceDate.getMonth()
  const currentYear = referenceDate.getFullYear()

  const expenses = transactions
    .filter((t) => t.type === 'expense' && t.categoryId === categoryId)
    .filter((t) => {
      const d = new Date(t.date)
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear
    })

  let netSum = 0
  expenses.forEach((exp) => {
    const linked = selectLinkedReimbursementsForExpense(exp.id, transactions)
    netSum += Math.max(0, Math.round((exp.amount - linked) * 100) / 100)
  })

  return Math.round(netSum * 100) / 100
}

/**
 * Cantidad restante antes de alcanzar el límite presupuestado.
 */
export function budgetRemaining(amountLimit: number, spent: number): number {
  return Math.max(0, Math.round((amountLimit - spent) * 100) / 100)
}

/**
 * Cantidad gastada por encima del presupuesto.
 */
export function overBudgetAmount(amountLimit: number, spent: number): number {
  return Math.max(0, Math.round((spent - amountLimit) * 100) / 100)
}

/**
 * Porcentaje de consumo del presupuesto (puede superar el 100%).
 */
export function budgetUsagePercentage(amountLimit: number, spent: number): number {
  if (amountLimit <= 0) return 0
  return Math.round((spent / amountLimit) * 100)
}

/**
 * Genera el resumen consolidado de presupuestos del periodo sin duplicación de lógica.
 */
export function selectBudgetsSummary(
  budgets: Budget[],
  transactions: Transaction[],
  categories: Category[],
  referenceDate: Date = new Date()
): BudgetsSummary {
  let totalBudgeted = 0
  let totalSpentOnBudgetedCategories = 0

  const items: BudgetStatusItem[] = budgets.map((b) => {
    const limit = b.amountLimit ?? b.monthlyLimit ?? 0
    const spent = spentByCategoryThisMonth(transactions, b.categoryId, referenceDate)
    const remaining = budgetRemaining(limit, spent)
    const overBudget = overBudgetAmount(limit, spent)
    const percentage = budgetUsagePercentage(limit, spent)
    const category = categories.find((c) => c.id === b.categoryId)

    totalBudgeted += limit
    totalSpentOnBudgetedCategories += spent

    return {
      id: b.id,
      categoryId: b.categoryId,
      categoryName: category?.name ?? 'Categoría',
      categoryColor: category?.color ?? '#8b8d86',
      categoryIcon: category?.icon ?? '◔',
      amountLimit: limit,
      spent,
      remaining,
      overBudget,
      percentage,
      isOverBudget: spent > limit,
    }
  })

  totalBudgeted = Math.round(totalBudgeted * 100) / 100
  totalSpentOnBudgetedCategories = Math.round(totalSpentOnBudgetedCategories * 100) / 100
  const totalRemaining = Math.max(0, Math.round((totalBudgeted - totalSpentOnBudgetedCategories) * 100) / 100)
  const overallUsagePercentage =
    totalBudgeted > 0 ? Math.round((totalSpentOnBudgetedCategories / totalBudgeted) * 100) : 0

  return {
    totalBudgeted,
    totalSpentOnBudgetedCategories,
    totalRemaining,
    overallUsagePercentage,
    items,
  }
}

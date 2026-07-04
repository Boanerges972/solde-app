import type { Transaction } from '../types'

export interface CategoryBudget {
  id: string
  category: string
  amount: number
  rollover: boolean
}

export type BudgetStatus = 'ok' | 'warn' | 'over'

export interface BudgetProgress {
  budget: CategoryBudget
  /** budget effectif du mois = amount + report éventuel */
  effective: number
  spent: number
  ratio: number
  status: BudgetStatus
}

/** Mois précédent d'un YYYY-MM (gère le passage d'année). */
function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

/** Total dépensé (valeur positive) pour une catégorie sur un mois (YYYY-MM). */
export function spentForCategory(txs: Transaction[], category: string, month: string): number {
  return txs
    .filter(t => t.amt < 0 && t.cat === category && t.cat !== 'Virement interne' && t.dt.slice(0, 7) === month)
    .reduce((s, t) => s + Math.abs(t.amt), 0)
}

/** Progression de tous les budgets pour un mois donné. */
export function budgetProgress(budgets: CategoryBudget[], txs: Transaction[], month: string): BudgetProgress[] {
  const prev = prevMonth(month)
  return budgets.map(b => {
    const spent = spentForCategory(txs, b.category, month)
    const carry = b.rollover ? Math.max(0, b.amount - spentForCategory(txs, b.category, prev)) : 0
    const effective = b.amount + carry
    const ratio = effective > 0 ? spent / effective : 0
    const status: BudgetStatus = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok'
    return { budget: b, effective, spent, ratio, status }
  })
}

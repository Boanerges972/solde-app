import type { Transaction } from '../types'

export interface CategoryBudget {
  id: string
  category: string
  amount: number
  rollover: boolean
  /** Mois de création (YYYY-MM). Le report ne peut pas démarrer avant. */
  createdMonth?: string
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

/** Nombre max de mois remontés pour cumuler un report (borne le calcul). */
const MAX_ROLLOVER_MONTHS = 24

/** Total dépensé (valeur positive) pour une catégorie sur un mois (YYYY-MM).
 *  Utilise `tx_date` (date réelle) et NON `dt`, qui est un libellé d'affichage
 *  posé par useData ('today'/'yesterday') : 'today'.slice(0,7) ne matchait
 *  aucun mois, donc les dépenses du JOUR étaient invisibles pour les budgets. */
export function spentForCategory(txs: Transaction[], category: string, month: string): number {
  return txs
    .filter(t => t.amt < 0 && t.cat === category && t.cat !== 'Virement interne'
      && (t.tx_date || '').slice(0, 7) === month)
    .reduce((s, t) => s + Math.abs(t.amt), 0)
}

/** Budget effectif d'un mois = montant nominal + report CUMULÉ.
 *
 *  L'ancien calcul faisait `max(0, amount - spent(mois-1))` : il ne reprenait
 *  que le budget NOMINAL du mois précédent et perdait tout report antérieur.
 *  Trois mois sans dépense donnaient 2× le budget au lieu de 4×.
 *  Ici le report se propage : effective(m) = amount + max(0, effective(m-1) −
 *  spent(m-1)), en remontant jusqu'au premier mois connu (borné). */
export function rolloverStartMonth(b: CategoryBudget, month: string): string | null {
  if (!b.rollover || !b.createdMonth) return null
  // Borne basse : la création du budget, jamais avant (sinon on inventerait du
  // report), et au plus MAX_ROLLOVER_MONTHS en arrière.
  let floor = month
  for (let i = 0; i < MAX_ROLLOVER_MONTHS - 1; i++) floor = prevMonth(floor)
  return b.createdMonth > floor ? b.createdMonth : floor
}

/** ⚠️ CONTRAT : `txs` DOIT couvrir tout [rolloverStartMonth(b, month), month].
 *  Un historique tronqué ferait lire `spent = 0` sur les mois manquants et
 *  gonflerait le report. BudgetsScreen charge explicitement cette période au
 *  lieu de réutiliser les 50 dernières transactions de l'écran d'accueil. */
export function effectiveBudget(b: CategoryBudget, txs: Transaction[], month: string): number {
  if (!b.rollover) return b.amount

  // Sans date de création on ne peut PAS deviner d'où partir : remonter au plus
  // ancien mois des transactions ferait hériter un budget créé hier de mois de
  // report inventés, et le résultat dépendrait de l'activité récente plutôt
  // que du budget. Dans le doute : pas de report.
  const start = rolloverStartMonth(b, month)
  if (!start) return b.amount
  if (start >= month) return b.amount // budget créé ce mois-ci : rien à reporter

  // Chaîne des mois, du plus ancien jusqu'à `month`.
  const months: string[] = []
  let m = month
  for (let i = 0; i < MAX_ROLLOVER_MONTHS && m >= start; i++) {
    months.push(m)
    m = prevMonth(m)
  }
  months.reverse()

  let effective = b.amount // le mois le plus ancien n'a aucun report entrant
  for (let i = 1; i < months.length; i++) {
    const carry = Math.max(0, effective - spentForCategory(txs, b.category, months[i - 1]))
    effective = b.amount + carry
  }
  return effective
}

/** Progression de tous les budgets pour un mois donné. */
export function budgetProgress(budgets: CategoryBudget[], txs: Transaction[], month: string): BudgetProgress[] {
  return budgets.map(b => {
    const spent = spentForCategory(txs, b.category, month)
    const effective = effectiveBudget(b, txs, month)
    const ratio = effective > 0 ? spent / effective : 0
    const status: BudgetStatus = ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok'
    return { budget: b, effective, spent, ratio, status }
  })
}

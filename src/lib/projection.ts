import type { Transaction } from '../types'

export interface ProjRecurring {
  name: string
  amount: number   // valeur positive = montant prélevé
  day: number      // jour du mois (1-31)
}

export interface ProjPoint {
  date: string     // ISO YYYY-MM-DD
  balance: number
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Moyenne journalière des dépenses variables sur les 90 derniers jours.
 *  Variables = dépenses (amt < 0) hors virements internes et hors lignes
 *  correspondant à un prélèvement connu (même nom, insensible à la casse). */
function avgDailyVariable(txs: Transaction[], recurrings: ProjRecurring[], now: Date): number {
  const from = iso(new Date(now.getTime() - 90 * 86400000))
  const recNames = new Set(recurrings.map(r => r.name.trim().toLowerCase()))
  const total = txs
    .filter(t => t.amt < 0
      && t.cat !== 'Virement interne'
      && t.dt >= from
      && !recNames.has((t.m || '').trim().toLowerCase()))
    .reduce((s, t) => s + Math.abs(t.amt), 0)
  return total / 90
}

/** Projection quotidienne du solde sur `horizon` jours. Retourne horizon+1 points (jour 0 inclus). */
export function projectBalance(
  balance: number,
  recurrings: ProjRecurring[],
  txs90j: Transaction[],
  horizon: 30 | 60 | 90 | number,
  now: Date = new Date(),
): ProjPoint[] {
  const daily = avgDailyVariable(txs90j, recurrings, now)
  const points: ProjPoint[] = []
  let bal = balance
  for (let i = 0; i <= horizon; i++) {
    const d = new Date(now.getTime() + i * 86400000)
    if (i > 0) {
      bal -= daily
      const dayOfMonth = d.getDate()
      recurrings.forEach(r => { if (r.day === dayOfMonth) bal -= r.amount })
    }
    points.push({ date: iso(d), balance: Math.round(bal * 100) / 100 })
  }
  return points
}

/** Variante retournant aussi le point le plus bas (risque de découvert). */
export function projectBalanceWithMin(
  balance: number,
  recurrings: ProjRecurring[],
  txs90j: Transaction[],
  horizon: number,
  now: Date = new Date(),
): { points: ProjPoint[]; minPoint: ProjPoint } {
  const points = projectBalance(balance, recurrings, txs90j, horizon, now)
  const minPoint = points.reduce((a, b) => (b.balance < a.balance ? b : a))
  return { points, minPoint }
}

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

/** Fenêtre d'observation maximale des dépenses variables. */
const WINDOW_DAYS = 90

/** `dt` porte parfois un libellé d'affichage ('today'/'yesterday') posé par
 *  useData au lieu d'une date ISO. On le ramène à une date avant toute
 *  comparaison — sinon le tri et les bornes se font sur du texte. */
function resolveDt(dt: string, now: Date): string {
  if (dt === 'today') return iso(now)
  if (dt === 'yesterday') return iso(new Date(now.getTime() - 86400000))
  return dt
}

/** Nombre de jours couverts entre `oldest` (ISO) et `now`, bornes incluses. */
function spanDays(oldest: string, now: Date): number {
  const oldestMs = Date.parse(oldest + 'T00:00:00Z')
  const nowMs = Date.parse(iso(now) + 'T00:00:00Z')
  if (Number.isNaN(oldestMs) || Number.isNaN(nowMs)) return WINDOW_DAYS
  return Math.floor((nowMs - oldestMs) / 86400000) + 1
}

/** Dernier jour du mois de `d` (28/29/30/31). */
function lastDayOfMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

/** Jour où un prélèvement tombe RÉELLEMENT dans le mois de `d` : un
 *  prélèvement le 31 est débité le 30 en avril, le 28/29 en février. */
function dueDay(day: number, d: Date): number {
  return Math.max(1, Math.min(day, lastDayOfMonth(d)))
}

/** Moyenne journalière des dépenses variables sur les 90 derniers jours.
 *  Variables = dépenses (amt < 0) hors virements internes et hors lignes
 *  correspondant à un prélèvement connu (même nom, insensible à la casse).
 *
 *  Le total est divisé par la période RÉELLEMENT couverte par l'historique,
 *  pas par 90 en dur : un compte de 30 jours divisé par 90 sous-estimerait la
 *  dépense quotidienne d'un facteur 3 et rendrait la projection trop
 *  optimiste — exactement là où le risque de découvert compte le plus. */
function avgDailyVariable(txs: Transaction[], recurrings: ProjRecurring[], now: Date): number {
  const from = iso(new Date(now.getTime() - WINDOW_DAYS * 86400000))
  const recNames = new Set(recurrings.map(r => r.name.trim().toLowerCase()))

  const inWindow = txs
    .map(t => ({ t, d: resolveDt(t.dt, now) }))
    .filter(({ d }) => d >= from)

  const variable = inWindow.filter(({ t }) =>
    t.amt < 0
    && t.cat !== 'Virement interne'
    && !recNames.has((t.m || '').trim().toLowerCase()))

  if (variable.length === 0) return 0
  const total = variable.reduce((s, { t }) => s + Math.abs(t.amt), 0)

  // La couverture se mesure sur TOUTES les lignes de la fenêtre (y compris
  // revenus) : elles attestent qu'on a des données à cette date, même sans
  // dépense variable ce jour-là.
  const oldest = inWindow.reduce((m, { d }) => (d < m ? d : m), inWindow[0].d)
  const days = Math.max(1, Math.min(WINDOW_DAYS, spanDays(oldest, now)))
  return total / days
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
      // Un prélèvement au 31 ne doit pas DISPARAÎTRE des mois plus courts :
      // il est débité le dernier jour du mois (30 en avril, 28/29 en février).
      recurrings.forEach(r => { if (dueDay(r.day, d) === dayOfMonth) bal -= r.amount })
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

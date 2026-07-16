import type { Transaction } from '../types'
import { isoLocal, addDaysLocal, isCalendarDate } from './dates'

export interface ProjRecurring {
  name: string
  amount: number   // valeur positive = montant prélevé
  day: number      // jour du mois (1-31)
}

export interface ProjPoint {
  date: string     // ISO YYYY-MM-DD
  balance: number
}

// Dates calendaires LOCALES (voir lib/dates.ts) : toISOString() convertit en
// UTC et ferait diverger l'étiquette d'un point de la date d'échéance lue en
// local — en Guyane, tous les soirs après 21 h.
const iso = isoLocal
const addDays = addDaysLocal

/** Fenêtre d'observation maximale des dépenses variables. */
const WINDOW_DAYS = 90

/** Date réelle d'une transaction. On lit `tx_date` et NON `dt` : ce dernier est
 *  un libellé d'affichage posé par useData ('today'/'yesterday'), qui ferait
 *  comparer des dates sur du texte. */
const dateOf = (t: Transaction) => t.tx_date || ''

/** Nombre de jours couverts entre `oldest` (YYYY-MM-DD) et `now`, bornes
 *  incluses. Comparaison de dates calendaires : on les lit en UTC des deux
 *  côtés pour que la soustraction ne dépende pas du fuseau. */
function spanDays(oldest: string, now: Date): number {
  const oldestMs = Date.parse(oldest + 'T00:00:00Z')
  const nowMs = Date.parse(iso(now) + 'T00:00:00Z')
  if (Number.isNaN(oldestMs) || Number.isNaN(nowMs)) return WINDOW_DAYS
  return Math.floor((nowMs - oldestMs) / 86400000) + 1
}

const isDate = isCalendarDate

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
  const from = iso(addDays(now, -WINDOW_DAYS))
  const today = iso(now)
  const recNames = new Set(recurrings.map(r => r.name.trim().toLowerCase()))

  // Bornée des DEUX côtés : une opération datée dans le futur (import erroné,
  // saisie fautive) gonflerait le total et, en devenant la « plus ancienne »,
  // ramènerait la couverture à 1 jour — la dépense quotidienne exploserait.
  const inWindow = txs
    .map(t => ({ t, d: dateOf(t) }))
    .filter(({ d }) => isDate(d) && d >= from && d <= today)

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
    const d = addDays(now, i)
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

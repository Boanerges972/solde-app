import type { Transaction } from '../types'
import { fmt } from './currency'
import { isoLocal, monthLocal, addDaysLocal } from './dates'

export type InsightKind = 'category-trend' | 'biggest-week' | 'unusual'

export interface Insight {
  id: string
  kind: InsightKind
  icon: string
  title: string
  detail: string
  tone: 'up' | 'down' | 'neutral'
}

const monthKey = (d: string) => d.slice(0, 7)

/** Date réelle d'une transaction. On lit `tx_date`, JAMAIS `dt` : ce dernier
 *  est un champ calculé d'affichage posé par useData, qui vaut 'today' /
 *  'yesterday' pour les 2 derniers jours. Comparer `dt` à une date excluait
 *  silencieusement les opérations les plus récentes de tous les calculs. */
const dateOf = (t: Transaction) => t.tx_date || ''

export function buildInsights(txs: Transaction[], now: Date = new Date()): Insight[] {
  const out: Insight[] = []
  const spent = txs.filter(t => t.amt < 0 && t.cat !== 'Virement interne')
  if (spent.length === 0) return out

  const curMonth = monthLocal(now)
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15)
  const prevMonth = monthLocal(prev)
  const prevLabel = prev.toLocaleDateString('fr-FR', { month: 'long' })

  // 1) Variation par catégorie vs mois précédent (seuil ±15 %)
  const byCatMonth: Record<string, Record<string, number>> = {}
  spent.forEach(t => {
    const mk = monthKey(dateOf(t))
    if (mk !== curMonth && mk !== prevMonth) return
    const cat = t.cat || 'Autre'
    byCatMonth[cat] = byCatMonth[cat] || {}
    byCatMonth[cat][mk] = (byCatMonth[cat][mk] || 0) + Math.abs(t.amt)
  })
  Object.entries(byCatMonth).forEach(([cat, months]) => {
    const cur = months[curMonth] || 0
    const before = months[prevMonth] || 0
    if (before < 10 || cur === 0) return
    const pct = Math.round(((cur - before) / before) * 100)
    if (Math.abs(pct) < 15) return
    out.push({
      id: `trend-${cat}`,
      kind: 'category-trend',
      icon: pct > 0 ? '📈' : '📉',
      title: `${cat} : ${pct > 0 ? '+' : ''}${pct}% vs ${prevLabel}`,
      detail: `${fmt(cur)} ce mois contre ${fmt(before)} le mois dernier`,
      tone: pct > 0 ? 'up' : 'down',
    })
  })

  // 2) Plus grosse dépense des 7 derniers jours
  const weekAgo = isoLocal(addDaysLocal(now, -7))
  const nowIso = isoLocal(now)
  const week = spent.filter(t => dateOf(t) >= weekAgo && dateOf(t) <= nowIso)
  if (week.length > 0) {
    const biggest = week.reduce((a, b) => (Math.abs(b.amt) > Math.abs(a.amt) ? b : a))
    out.push({
      id: 'biggest-week',
      kind: 'biggest-week',
      icon: biggest.ico || '💸',
      title: `Plus grosse dépense : ${biggest.m}`,
      detail: `${fmt(Math.abs(biggest.amt))} cette semaine (${biggest.cat || 'Autre'})`,
      tone: 'neutral',
    })
  }

  // 3) Dépense inhabituelle ce mois (> 2× la moyenne historique de sa catégorie)
  const histByCat: Record<string, number[]> = {}
  spent.forEach(t => {
    if (monthKey(dateOf(t)) === curMonth) return
    const cat = t.cat || 'Autre'
    ;(histByCat[cat] = histByCat[cat] || []).push(Math.abs(t.amt))
  })
  const curTxs = spent.filter(t => monthKey(dateOf(t)) === curMonth)
  for (const t of curTxs) {
    const hist = histByCat[t.cat || 'Autre']
    if (!hist || hist.length < 3) continue
    const avg = hist.reduce((s, v) => s + v, 0) / hist.length
    if (Math.abs(t.amt) > 2 * avg) {
      out.push({
        id: `unusual-${t.id}`,
        kind: 'unusual',
        icon: '👀',
        title: `Dépense inhabituelle : ${t.m}`,
        detail: `${fmt(Math.abs(t.amt))}, soit ${Math.round(Math.abs(t.amt) / avg)}× votre moyenne ${t.cat || 'Autre'}`,
        tone: 'up',
      })
      break
    }
  }

  return out
}

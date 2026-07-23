import type { Transaction, DetectedRecurring } from '../types'

/** Détecte les flux récurrents mensuels dans l'historique.
 *  direction='debit' → dépenses (amt<0) ; 'credit' → revenus (amt>0).
 *  Montants toujours manipulés en valeur absolue ; `kind` porte le sens. */
export function detectRecurrings(
  txs: Transaction[],
  minMonths = 2,
  direction: 'debit' | 'credit' = 'debit',
): DetectedRecurring[] {
  const flows = direction === 'credit'
    ? txs.filter(tx => tx.amt > 0 && tx.cat !== 'Virement interne' && tx.m)
    : txs.filter(tx => tx.amt < 0 && tx.cat !== 'Virement interne' && tx.m)

  const norm = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim().substring(0, 25)

  const map: Record<string, { name: string; key: string; txs: Transaction[]; months: Set<string>; accounts: Record<string, number> }> = {}
  flows.forEach(tx => {
    const key = norm(tx.m)
    if (!map[key]) map[key] = { name: tx.m, key, txs: [], months: new Set(), accounts: {} }
    const ym = tx.tx_date ? tx.tx_date.substring(0, 7) : ''
    if (ym) map[key].months.add(ym)
    map[key].txs.push(tx)
    const aid = tx.acc || ''
    map[key].accounts[aid] = (map[key].accounts[aid] || 0) + 1
  })

  return Object.values(map)
    .filter(g => g.months.size >= minMonths)
    .map(g => {
      const months = [...g.months].sort()
      const nMonths = g.months.size
      const amts = g.txs.map(tx => Math.abs(tx.amt))
      const avg = amts.reduce((s, a) => s + a, 0) / amts.length
      const std = Math.sqrt(amts.map(a => (a - avg) ** 2).reduce((s, v) => s + v, 0) / amts.length)
      const isRegularAmt = std / avg < 0.15

      const days = g.txs.map(tx => tx.tx_date ? parseInt(tx.tx_date.split('-')[2]) : 1)
      const dayFreq: Record<number, number> = {}
      days.forEach(d => dayFreq[d] = (dayFreq[d] || 0) + 1)
      const typicalDay = parseInt(Object.entries(dayFreq).sort(([, a], [, b]) => b - a)[0][0])

      const topAcc = Object.entries(g.accounts).sort(([, a], [, b]) => b - a)[0][0]

      let consecutive = 0
      for (let i = 1; i < months.length; i++) {
        const [y1, m1] = months[i - 1].split('-').map(Number)
        const [y2, m2] = months[i].split('-').map(Number)
        const diff = (y2 - y1) * 12 + (m2 - m1)
        if (diff === 1) consecutive++
      }
      const consecutiveRate = months.length > 1 ? consecutive / (months.length - 1) : 0

      let confidence: 'confirmed' | 'probable' | 'watching'
      if (nMonths >= 6 && consecutiveRate >= 0.8 && isRegularAmt) confidence = 'confirmed'
      else if (nMonths >= 6 || (nMonths >= 3 && consecutiveRate >= 0.6)) confidence = 'probable'
      else confidence = 'watching'

      return {
        name: g.name, key: g.key, nMonths, avg, std, typicalDay,
        topAcc, consecutive, consecutiveRate, isRegularAmt, confidence,
        lastDate: months[months.length - 1], txs: g.txs,
        kind: direction,
      }
    })
    .filter(g => g.confidence !== 'watching' || g.nMonths >= 3)
    .sort((a, b) => {
      const rank: Record<string, number> = { confirmed: 0, probable: 1, watching: 2 }
      return rank[a.confidence] - rank[b.confidence] || b.nMonths - a.nMonths
    })
}

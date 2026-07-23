import type { Account, Recurring, AppData, Transaction } from '../types'

export type ScoreStatus = 'recommended' | 'acceptable' | 'risky' | 'discouraged'

export interface AccountScore {
  accountId: string
  score: number           // 0–100
  status: ScoreStatus
  previsionnel: number    // acc.bal - amount - committed
  soldeApres: number      // acc.bal - amount
  committed: number       // prélèvements restants dans 31j
  finDeMois: number       // alias de previsionnel
  breakdown: {
    previsionnel: number  // pts earned (0|20|40)
    marge: number         // pts earned (0|10|20)
    prelevements: number  // pts earned (0|15)
    revenus: number       // pts earned (0|10)
    budget: number        // pts earned (0|10)
    preference: number    // toujours 5
  }
}

export function scoreAccounts(
  accounts: Account[],
  recurrings: Recurring[],
  amount: number,
  D: AppData,
  allHistory: Transaction[]
): AccountScore[] {
  if (amount <= 0 || accounts.length === 0) return []

  // Filtrer aux comptes perso si disponibles
  const eligible = D.persoAccs && D.persoAccs.length > 0
    ? accounts.filter(a => D.persoAccs.some(p => p.id === a.id))
    : accounts
  const targets = eligible.length > 0 ? eligible : accounts

  // Date cutoff pour revenus récents (60 jours)
  const today = new Date()
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - 60)
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`

  // Critère budget : identique pour tous les comptes
  const budgetPts = D.monthBudget > 0 && D.monthSpent / D.monthBudget < 0.80 ? 10 : 0

  // Pre-index recent income by account for O(1) lookup
  const recentIncomeAccs = new Set<string>()
  for (const tx of allHistory) {
    if (tx.amt > 0 && tx.tx_date >= cutoffStr) {
      if (tx.acc) recentIncomeAccs.add(tx.acc)
      if (tx.account_id) recentIncomeAccs.add(tx.account_id)
    }
  }

  const results: AccountScore[] = targets.map(acc => {
    // Calcul committed : prélèvements récurrents dus dans 31j
    const committed = recurrings
      .filter(r => r.account_id === acc.id && r.kind !== 'credit')
      .reduce((sum, r) => {
        const dayOfMonth = parseInt(String(r.date_label || '1'), 10)
        const next = new Date(today.getFullYear(), today.getMonth(), dayOfMonth)
        if (next < today) next.setMonth(next.getMonth() + 1)
        const daysUntil = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        const amt = parseFloat(String(r.amount))
        return daysUntil <= 31 && !isNaN(amt) ? sum + amt : sum
      }, 0)

    const soldeApres = acc.bal - amount
    const previsionnel = soldeApres - committed
    const overdraft = parseFloat(String(acc.overdraft || 0))

    // a) Solde prévisionnel (40 pts)
    let prevPts = 0
    if (previsionnel > 0) prevPts = 40
    else if (previsionnel > -overdraft) prevPts = 20

    // b) Marge de sécurité (20 pts)
    let margePts = 0
    if (acc.bal > 0) {
      const marge = soldeApres / acc.bal
      if (marge >= 0.30) margePts = 20
      else if (marge >= 0.10) margePts = 10
    }

    // c) Prélèvements couverts (15 pts)
    const prelevPts = soldeApres > committed ? 15 : 0

    // d) Revenus récents sur ce compte dans 60j (10 pts)
    const revenusPts = recentIncomeAccs.has(acc.id) ? 10 : 0

    // e) Budget mensuel (10 pts) — calculé avant la boucle
    // f) Préférence utilisateur (5 pts) — toujours 5

    const score = prevPts + margePts + prelevPts + revenusPts + budgetPts + 5

    let status: ScoreStatus
    if (score >= 70) status = 'recommended'
    else if (score >= 45) status = 'acceptable'
    else if (score >= 20) status = 'risky'
    else status = 'discouraged'

    return {
      accountId: acc.id,
      score,
      status,
      previsionnel,
      soldeApres,
      committed,
      finDeMois: previsionnel,
      breakdown: {
        previsionnel: prevPts,
        marge: margePts,
        prelevements: prelevPts,
        revenus: revenusPts,
        budget: budgetPts,
        preference: 5,
      },
    }
  })

  // Sort by score descending; on tie, higher balance wins
  const balMap = new Map(targets.map(a => [a.id, a.bal]))
  return results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return (balMap.get(b.accountId) ?? 0) - (balMap.get(a.accountId) ?? 0)
  })
}

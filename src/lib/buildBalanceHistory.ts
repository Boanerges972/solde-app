import type { Account, Transaction } from '../types'

function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Reconstruct daily end-of-day balance history for an account.
 *
 * Precondition: `account.bal` must be the current end-of-day balance
 * (i.e., after all transactions that have occurred today).
 */
export function buildBalanceHistory(
  account: Account,
  allTxs: Transaction[],
  days: number
): { date: string; bal: number }[] {
  const today = new Date()
  const todayStr = localDateStr(today)
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = localDateStr(cutoff)

  // Filter to this account and this date range
  const accountTxs = allTxs.filter(tx =>
    (tx.account_id === account.id || tx.acc === account.id) &&
    tx.tx_date >= cutoffStr &&
    tx.tx_date <= todayStr
  )

  // Net balance change per date
  const netByDate: Record<string, number> = {}
  for (const tx of accountTxs) {
    netByDate[tx.tx_date] = (netByDate[tx.tx_date] || 0) + tx.amt
  }

  // Generate all calendar days in range (cutoff → today inclusive)
  const dates: string[] = []
  const cursor = new Date(cutoff)
  while (cursor.getTime() <= today.getTime()) {
    dates.push(localDateStr(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  // Walk backwards: end-of-day balance for each date
  const result: { date: string; bal: number }[] = []
  let bal = account.bal
  for (let i = dates.length - 1; i >= 0; i--) {
    const date = dates[i]
    result.unshift({ date, bal: parseFloat(bal.toFixed(2)) })
    bal -= (netByDate[date] || 0)
  }

  // Downsample to max 60 points for large ranges
  const MAX_CHART_POINTS = 60
  if (result.length <= MAX_CHART_POINTS) return result
  const step = Math.ceil(result.length / MAX_CHART_POINTS)
  return result.filter((_, i) => i % step === 0 || i === result.length - 1)
}

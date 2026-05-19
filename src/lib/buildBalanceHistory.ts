import type { Account, Transaction } from '../types'

export function buildBalanceHistory(
  account: Account,
  allTxs: Transaction[],
  days: number
): { date: string; bal: number }[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().slice(0, 10)
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

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
  while (cursor <= today) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() + 1)
  }

  // Walk backwards: end-of-day balance for each date
  // Start from today's current balance (account.bal = balance after all txs today)
  const result: { date: string; bal: number }[] = []
  let bal = account.bal
  for (let i = dates.length - 1; i >= 0; i--) {
    const date = dates[i]
    result.unshift({ date, bal: parseFloat(bal.toFixed(2)) })
    // Undo this day's net change to get balance at start of day (= end of previous day)
    bal -= (netByDate[date] || 0)
  }

  // Downsample to max 60 points for large ranges
  if (result.length <= 60) return result
  const step = Math.ceil(result.length / 60)
  return result.filter((_, i) => i % step === 0 || i === result.length - 1)
}

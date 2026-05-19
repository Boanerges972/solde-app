import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildBalanceHistory } from '../buildBalanceHistory'
import type { Account, Transaction } from '../../types'

// Pin date to 2026-05-19
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-05-19T12:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

const ACC: Account = { id: 'acc1', name: 'Test', bal: 1000, col: '#0f0', type: 'Courant', overdraft: 0 } as Account

function tx(date: string, amt: number, accId = 'acc1'): Transaction {
  return { id: date + amt, tx_date: date, amt, acc: accId, cat: 'Test', m: 'Merchant', account_id: accId } as unknown as Transaction
}

describe('buildBalanceHistory', () => {
  it('no transactions → all days have account.bal', () => {
    const pts = buildBalanceHistory(ACC, [], 7)
    expect(pts).toHaveLength(8) // 7 past days + today
    pts.forEach(p => expect(p.bal).toBe(1000))
    expect(pts[pts.length - 1].date).toBe('2026-05-19')
    expect(pts[0].date).toBe('2026-05-12')
  })

  it('expense -50 on May 18 → May 18 bal=1000 (end-of-day after deduction), May 17 bal=1050', () => {
    const pts = buildBalanceHistory(ACC, [tx('2026-05-18', -50)], 7)
    const may18 = pts.find(p => p.date === '2026-05-18')!
    const may17 = pts.find(p => p.date === '2026-05-17')!
    expect(may18.bal).toBe(1000)   // today's bal=1000 includes this expense already
    expect(may17.bal).toBe(1050)   // before the expense
  })

  it('deposit +500 on May 17 → May 17 bal=1000 (end-of-day), May 16 bal=500', () => {
    const pts = buildBalanceHistory(ACC, [tx('2026-05-17', 500)], 7)
    const may17 = pts.find(p => p.date === '2026-05-17')!
    const may16 = pts.find(p => p.date === '2026-05-16')!
    expect(may17.bal).toBe(1000)
    expect(may16.bal).toBe(500)
  })

  it('filters out transactions from other accounts', () => {
    const pts = buildBalanceHistory(ACC, [tx('2026-05-18', -200, 'other-acc')], 7)
    pts.forEach(p => expect(p.bal).toBe(1000))
  })

  it('filters out transactions outside date range', () => {
    const pts = buildBalanceHistory(ACC, [tx('2026-05-01', -300)], 7)
    // May 1 is outside 7-day window (cutoff = May 12)
    pts.forEach(p => expect(p.bal).toBe(1000))
  })

  it('gap fill: tx on May 15 (-100) → May 16+ show 1000, May 14 and before show 1100', () => {
    const pts = buildBalanceHistory(ACC, [tx('2026-05-15', -100)], 7)
    const may16 = pts.find(p => p.date === '2026-05-16')!
    const may15 = pts.find(p => p.date === '2026-05-15')!
    const may14 = pts.find(p => p.date === '2026-05-14')!
    expect(may16.bal).toBe(1000)
    expect(may15.bal).toBe(1000)  // end-of-day on May 15 includes the -100
    expect(may14.bal).toBe(1100) // before the -100 was applied
  })
})

import { describe, it, expect } from 'vitest'
import { applyOptimisticTx } from '../useOfflineSync'
import type { AppData, Transaction } from '../../types'

const BASE_DATA: AppData = {
  user: 'Test', week: 1, wk: 1,
  budget: 400, spent: 100, rem: 300,
  accounts: [
    { id: 'acc1', name: 'Main', short: 'M', bal: 1000, col: '#0f0',
      type: 'Courant', isPro: false, overdraft: 0, debits: [] }
  ],
  txs: [],
  cats: [],
  persoAccs: [], proAccs: [], persoTxs: [], proTxs: [],
  persoBal: 1000, proBal: 0,
  proMonthSpent: 0, proMonthIncome: 0, proNet: 0,
  monthBudget: 1600, monthSpent: 400, monthIncome: 0, monthRem: 1200,
  monthLabel: 'mai 2026',
}

const FAKE_TX: Transaction = {
  id: 'pending-1', merchant: 'Carrefour', category: 'Courses',
  icon: '🛒', amount: -42, tx_date: '2026-05-20',
  account_id: 'acc1',
  acc: 'acc1', dt: 'today', m: 'Carrefour', cat: 'Courses', ico: '🛒', amt: -42,
  isTransfer: false, isPro: false, isProPerso: false, pending: true,
}

describe('applyOptimisticTx', () => {
  it('prepends pending tx to txs list', () => {
    const result = applyOptimisticTx(BASE_DATA, FAKE_TX)
    expect(result!.txs[0].id).toBe('pending-1')
    expect(result!.txs[0].pending).toBe(true)
  })

  it('deducts amount from matching account balance', () => {
    const result = applyOptimisticTx(BASE_DATA, FAKE_TX)
    expect(result!.accounts[0].bal).toBe(958) // 1000 - 42
  })

  it('updates spent and rem', () => {
    const result = applyOptimisticTx(BASE_DATA, FAKE_TX)
    expect(result!.spent).toBe(142)  // 100 + 42
    expect(result!.rem).toBe(258)    // 300 - 42
  })

  it('returns null if prev is null', () => {
    expect(applyOptimisticTx(null, FAKE_TX)).toBeNull()
  })

  it('does not touch other accounts', () => {
    const data: AppData = {
      ...BASE_DATA,
      accounts: [
        ...BASE_DATA.accounts,
        { id: 'acc2', name: 'Savings', short: 'S', bal: 500, col: '#00f',
          type: 'Épargne', isPro: false, overdraft: 0, debits: [] }
      ]
    }
    const result = applyOptimisticTx(data, FAKE_TX)
    expect(result!.accounts.find(a => a.id === 'acc2')!.bal).toBe(500)
  })
})

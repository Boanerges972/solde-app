import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { scoreAccounts } from '../scoreAccounts'
import type { Account, Recurring, AppData, Transaction } from '../../types'

// Pin date to 2026-05-25
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-05-25T12:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

function mkAcc(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1', name: 'Compte Principal', short: 'CP',
    bal: 1000, col: '#10E8C0', type: 'Courant',
    isPro: false, overdraft: 0, debits: [],
    ...overrides,
  } as Account
}

function mkD(overrides: Partial<AppData> = {}): AppData {
  const base = mkAcc(overrides.accounts?.[0] ? {} : {})
  return {
    user: 'U', week: 1, wk: 1,
    budget: 400, spent: 100, rem: 300,
    accounts: [base], txs: [], cats: [],
    persoAccs: [base], proAccs: [],
    persoTxs: [], proTxs: [],
    persoBal: 1000, proBal: 0,
    proMonthSpent: 0, proMonthIncome: 0, proNet: 0,
    monthBudget: 1600, monthSpent: 400, monthIncome: 2000,
    monthRem: 1200, monthLabel: 'Mai 2026',
    ...overrides,
  } as AppData
}

function mkTx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 't1', merchant: 'Test', category: 'Test',
    icon: '📦', amount: 0, tx_date: '2026-05-01',
    account_id: 'a1', acc: 'a1', dt: 'today', m: 'Test', cat: 'Test',
    ico: '📦', amt: 0, isTransfer: false, isPro: false, isProPerso: false,
    ...overrides,
  } as Transaction
}

describe('scoreAccounts', () => {
  it('returns [] when amount is 0', () => {
    const acc = mkAcc()
    const D = mkD({ accounts: [acc], persoAccs: [acc] })
    expect(scoreAccounts([acc], [], 0, D, [])).toEqual([])
  })

  it('returns [] when amount is negative', () => {
    const acc = mkAcc()
    const D = mkD({ accounts: [acc], persoAccs: [acc] })
    expect(scoreAccounts([acc], [], -5, D, [])).toEqual([])
  })

  it('returns [] when accounts array is empty', () => {
    const D = mkD({ accounts: [], persoAccs: [] })
    expect(scoreAccounts([], [], 50, D, [])).toEqual([])
  })

  it('high-balance account gets score 90 and recommended status', () => {
    // bal=2000, amount=85, no recurrings, monthSpent=400/1600=25%<80%
    // previsionnel=1915>0 → 40pts | marge=1915/2000=95.7%≥30% → 20pts
    // prelevements: 1915>0 → 15pts | revenus: 0pts | budget: 10pts | pref: 5pts = 90
    const acc = mkAcc({ bal: 2000 })
    const D = mkD({ accounts: [acc], persoAccs: [acc], monthBudget: 1600, monthSpent: 400 })
    const results = scoreAccounts([acc], [], 85, D, [])
    expect(results).toHaveLength(1)
    expect(results[0].score).toBe(90)
    expect(results[0].status).toBe('recommended')
  })

  it('tight balance account gets score 60 and acceptable status', () => {
    // bal=200, amount=195: soldeApres=5, marge=5/200=2.5%<10% → 0pts
    // previsionnel=5>0 → 40pts | prelevements: 5>0 → 15pts
    // revenus: 0pts | budget: monthSpent=1400/1600=87.5%≥80% → 0pts | pref: 5pts = 60
    const acc = mkAcc({ bal: 200 })
    const D = mkD({ accounts: [acc], persoAccs: [acc], monthBudget: 1600, monthSpent: 1400 })
    const results = scoreAccounts([acc], [], 195, D, [])
    expect(results[0].score).toBe(60)
    expect(results[0].status).toBe('acceptable')
  })

  it('criterion c = 0 when soldeApres <= committed', () => {
    // bal=300, amount=50 → soldeApres=250
    // rec=400 due in 3 days → committed=400 → 250<=400 → criterion c=0
    // previsionnel=250-400=-150≤0 and overdraft=0 → criterion a=0
    // marge=250/300=83.3%≥30% → 20pts | budget: 400/1600=25%<80% → 10pts | pref: 5pts = 35
    const acc = mkAcc({ bal: 300, overdraft: 0 })
    const rec: Recurring = {
      id: 'r1', user_id: 'u', account_id: 'a1',
      name: 'Loyer', amount: '400', date_label: '28',
    }
    const D = mkD({ accounts: [acc], persoAccs: [acc], monthBudget: 1600, monthSpent: 400 })
    const results = scoreAccounts([acc], [rec], 50, D, [])
    expect(results[0].breakdown.prelevements).toBe(0)
    expect(results[0].score).toBe(35)
    expect(results[0].status).toBe('risky')
  })

  it('soldeApres within overdraft earns partial previsionnel 20pts', () => {
    // bal=100, overdraft=200, amount=150 → soldeApres=-50, previsionnel=-50>-200 → 20pts
    // marge=-50/100<0 → 0pts | prelevements: -50≤0 → 0pts
    // revenus: 0pts | budget: 0pts (overspent) | pref: 5pts = 25
    const acc = mkAcc({ bal: 100, overdraft: 200 })
    const D = mkD({ accounts: [acc], persoAccs: [acc], monthBudget: 1600, monthSpent: 1400 })
    const results = scoreAccounts([acc], [], 150, D, [])
    expect(results[0].breakdown.previsionnel).toBe(20)
    expect(results[0].score).toBe(25)
    expect(results[0].status).toBe('risky')
  })

  it('sorts results by score descending', () => {
    const acc1 = mkAcc({ id: 'a1', bal: 2000 })
    const acc2 = mkAcc({ id: 'a2', bal: 100 })
    const D = mkD({ accounts: [acc1, acc2], persoAccs: [acc1, acc2] })
    const results = scoreAccounts([acc1, acc2], [], 50, D, [])
    expect(results[0].score).toBeGreaterThan(results[1].score)
    expect(results[0].accountId).toBe('a1')
  })

  it('excludes Pro accounts when persoAccs is set', () => {
    const persoAcc = mkAcc({ id: 'a1', isPro: false })
    const proAcc = mkAcc({ id: 'a2', isPro: true })
    const D = mkD({ accounts: [persoAcc, proAcc], persoAccs: [persoAcc], proAccs: [proAcc] })
    const results = scoreAccounts([persoAcc, proAcc], [], 50, D, [])
    expect(results).toHaveLength(1)
    expect(results[0].accountId).toBe('a1')
  })

  it('marge >= 30% earns 20pts on breakdown.marge', () => {
    // bal=1000, amount=300 → soldeApres=700, marge=700/1000=70%≥30% → 20pts
    const acc = mkAcc({ bal: 1000 })
    const D = mkD({ accounts: [acc], persoAccs: [acc] })
    const results = scoreAccounts([acc], [], 300, D, [])
    expect(results[0].breakdown.marge).toBe(20)
  })

  it('recent income within 60 days earns 10pts on breakdown.revenus', () => {
    const acc = mkAcc({ bal: 500 })
    const incomeTx = mkTx({ account_id: 'a1', acc: 'a1', amt: 2000, tx_date: '2026-05-01' })
    const D = mkD({ accounts: [acc], persoAccs: [acc] })
    const results = scoreAccounts([acc], [], 50, D, [incomeTx])
    expect(results[0].breakdown.revenus).toBe(10)
  })

  it('budget over 80% earns 0pts on breakdown.budget', () => {
    const acc = mkAcc({ bal: 1000 })
    const D = mkD({
      accounts: [acc], persoAccs: [acc],
      monthBudget: 1600, monthSpent: 1400, // 87.5% > 80%
    })
    const results = scoreAccounts([acc], [], 50, D, [])
    expect(results[0].breakdown.budget).toBe(0)
  })
})

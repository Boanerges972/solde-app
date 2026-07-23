import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { vi } from 'vitest'
import { calcARD } from '../../components/RejectionAlert'
import type { Account, Recurring } from '../../types'

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-19T12:00:00Z'))
})
afterAll(() => {
  vi.useRealTimers()
})

const makeAccount = (id: string, bal: number, overdraft = 0): Account => ({
  id,
  name: `Compte ${id}`,
  short: 'X',
  bal,
  col: '#10E8C0',
  type: 'Courant',
  isPro: false,
  overdraft,
  debits: [],
})

const makeRecurring = (account_id: string, amount: number, date_label: string): Recurring => ({
  id: `rec-${account_id}-${amount}`,
  user_id: 'u1',
  account_id,
  name: 'Prélèvement',
  amount,
  date_label,
})

describe('calcARD', () => {
  it('no recurrings → status ok, committed 0', () => {
    const result = calcARD([makeAccount('a1', 500)], [])
    expect(result['a1'].status).toBe('ok')
    expect(result['a1'].committed).toBe(0)
  })

  it('exclut les revenus (kind credit) du committed', () => {
    const salaire: Recurring = { ...makeRecurring('a1', 1650, '02'), kind: 'credit' }
    const result = calcARD([makeAccount('a1', 1000)], [salaire], 31)
    expect(result['a1'].committed).toBe(0)
    expect(result['a1'].ard).toBe(1000) // bal 1000 + overdraft 0 - committed 0
  })

  it('committed < balance → status ok', () => {
    const result = calcARD(
      [makeAccount('a1', 500)],
      [makeRecurring('a1', 100, '25')], // daysUntil=6, within 31 days
    )
    expect(result['a1'].status).toBe('ok')
    expect(result['a1'].ard).toBe(400) // 500 - 100
  })

  it('committed > balance → status danger', () => {
    const result = calcARD(
      [makeAccount('a1', 50)],
      [makeRecurring('a1', 200, '25')], // 200 > 50
    )
    expect(result['a1'].status).toBe('danger')
    expect(result['a1'].ard).toBe(-150) // 50 - 200
  })

  it('overdraft covers committed → status ok', () => {
    // bal=50, overdraft=200, committed=100 → ard=50+200-100=150 → ok
    const result = calcARD(
      [makeAccount('a1', 50, 200)],
      [makeRecurring('a1', 100, '25')],
    )
    expect(result['a1'].status).toBe('ok')
    expect(result['a1'].ard).toBe(150)
  })

  it('overdraft not enough → status danger', () => {
    // bal=50, overdraft=30, committed=200 → ard=50+30-200=-120 → danger
    const result = calcARD(
      [makeAccount('a1', 50, 30)],
      [makeRecurring('a1', 200, '25')],
    )
    expect(result['a1'].status).toBe('danger')
    expect(result['a1'].ard).toBe(-120)
  })

  it('recurring outside days window → not committed', () => {
    // date_label='5' → June 5 → daysUntil=17; days=14 → excluded
    const result = calcARD(
      [makeAccount('a1', 500)],
      [makeRecurring('a1', 400, '5')],
      14,
    )
    expect(result['a1'].committed).toBe(0)
    expect(result['a1'].status).toBe('ok')
  })

  it('multiple accounts computed independently', () => {
    const result = calcARD(
      [makeAccount('a1', 1000), makeAccount('a2', 50)],
      [
        makeRecurring('a1', 100, '25'), // a1: ard=900, ok
        makeRecurring('a2', 200, '25'), // a2: ard=-150, danger
      ],
    )
    expect(result['a1'].status).toBe('ok')
    expect(result['a2'].status).toBe('danger')
  })
})

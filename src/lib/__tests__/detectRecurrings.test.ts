import { describe, it, expect } from 'vitest'
import { detectRecurrings } from '../detectRecurrings'
import type { Transaction } from '../../types'

const tx = (date: string, amt: number, m: string): Transaction =>
  ({ id: Math.random().toString(), tx_date: date, dt: date, amt, m,
     cat: 'Salaire', ico: '💰', acc: 'acc1' } as Transaction)

const salaire: Transaction[] = [
  tx('2026-02-02', 1650, 'VIR SALAIRE ACME'),
  tx('2026-03-02', 1650, 'VIR SALAIRE ACME'),
  tx('2026-04-02', 1650, 'VIR SALAIRE ACME'),
  tx('2026-05-02', 1650, 'VIR SALAIRE ACME'),
  tx('2026-06-02', 1650, 'VIR SALAIRE ACME'),
  tx('2026-07-02', 1650, 'VIR SALAIRE ACME'),
]

describe('detectRecurrings — crédits', () => {
  it('détecte un salaire mensuel régulier avec kind credit', () => {
    const res = detectRecurrings(salaire, 2, 'credit')
    expect(res).toHaveLength(1)
    expect(res[0].kind).toBe('credit')
    expect(res[0].typicalDay).toBe(2)
    expect(res[0].avg).toBeCloseTo(1650, 0)
    expect(res[0].confidence).toBe('confirmed')
  })

  it('en mode debit, ignore les crédits', () => {
    const res = detectRecurrings(salaire, 2, 'debit')
    expect(res).toHaveLength(0)
  })

  it('en mode credit, ignore les débits', () => {
    const debits: Transaction[] = [
      tx('2026-05-05', -750, 'LOYER'),
      tx('2026-06-05', -750, 'LOYER'),
      tx('2026-07-05', -750, 'LOYER'),
    ]
    const res = detectRecurrings(debits, 2, 'credit')
    expect(res).toHaveLength(0)
  })
})

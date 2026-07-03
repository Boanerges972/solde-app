import { describe, it, expect } from 'vitest'
import { projectBalance, type ProjRecurring } from '../projection'
import type { Transaction } from '../../types'

const tx = (dt: string, amt: number, m = 'X'): Transaction =>
  ({ id: Math.random().toString(), dt, amt, m, cat: 'Courses', ico: '🛒' } as Transaction)

const NOW = new Date('2026-07-15T12:00:00')

describe('projectBalance', () => {
  it('retourne horizon+1 points, en commençant au solde actuel', () => {
    const pts = projectBalance(1000, [], [], 30, NOW)
    expect(pts).toHaveLength(31)
    expect(pts[0].balance).toBe(1000)
    expect(pts[0].date).toBe('2026-07-15')
  })

  it('déduit un prélèvement à sa date (jour du mois)', () => {
    const recs: ProjRecurring[] = [{ name: 'Loyer', amount: 750, day: 20 }]
    const pts = projectBalance(1000, recs, [], 30, NOW)
    const before = pts.find(p => p.date === '2026-07-19')!
    const after = pts.find(p => p.date === '2026-07-20')!
    expect(before.balance - after.balance).toBe(750)
  })

  it('applique le prélèvement chaque mois sur l’horizon', () => {
    const recs: ProjRecurring[] = [{ name: 'Loyer', amount: 750, day: 20 }]
    const pts = projectBalance(2000, recs, [], 60, NOW)
    const last = pts[pts.length - 1]
    // 20 juillet + 20 août = 2 échéances
    expect(last.balance).toBe(2000 - 1500)
  })

  it('déduit la moyenne journalière des dépenses variables', () => {
    // 90 € de dépenses variables sur les 90 derniers jours → 1 €/jour
    const txs = [tx('2026-06-01', -30), tx('2026-05-15', -30), tx('2026-04-20', -30)]
    const pts = projectBalance(500, [], txs, 30, NOW)
    expect(pts[pts.length - 1].balance).toBeCloseTo(500 - 30, 0)
  })

  it('minPoint = point le plus bas de la série', () => {
    const recs: ProjRecurring[] = [{ name: 'Loyer', amount: 900, day: 20 }]
    const { minPoint } = projectBalanceWithMin(1000, recs, [], 30, NOW)
    expect(minPoint.balance).toBe(100)
  })

  it('les revenus (amt > 0) sont exclus de la moyenne des dépenses', () => {
    const txs = [tx('2026-06-01', -90), tx('2026-06-05', 2000)]
    const pts = projectBalance(500, [], txs, 30, NOW)
    expect(pts[pts.length - 1].balance).toBeCloseTo(500 - 30, 0)
  })
})

// helper importé aussi
import { projectBalanceWithMin } from '../projection'

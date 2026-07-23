import { describe, it, expect } from 'vitest'
import { projectBalance, type ProjRecurring } from '../projection'
import type { Transaction } from '../../types'

const tx = (date: string, amt: number, m = 'X'): Transaction =>
  ({ id: Math.random().toString(), tx_date: date, dt: date, amt, m, cat: 'Courses', ico: '🛒' } as Transaction)

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
    // 90 € étalés sur 90 jours d'historique (la plus ancienne à J-89) → 1 €/jour
    const txs = [tx('2026-04-17', -30), tx('2026-05-15', -30), tx('2026-06-01', -30)]
    const pts = projectBalance(500, [], txs, 30, NOW)
    expect(pts[pts.length - 1].balance).toBeCloseTo(500 - 30, 0)
  })

  it('minPoint = point le plus bas de la série', () => {
    const recs: ProjRecurring[] = [{ name: 'Loyer', amount: 900, day: 20 }]
    const { minPoint } = projectBalanceWithMin(1000, recs, [], 30, NOW)
    expect(minPoint.balance).toBe(100)
  })

  it('ajoute un revenu (kind credit) à sa date', () => {
    const recs: ProjRecurring[] = [{ name: 'Salaire', amount: 1650, day: 2, kind: 'credit' }]
    const pts = projectBalance(1000, recs, [], 30, NOW)
    const before = pts.find(p => p.date === '2026-08-01')!
    const after = pts.find(p => p.date === '2026-08-02')!
    expect(after.balance - before.balance).toBe(1650)
  })

  it('mélange débit et crédit sur le même horizon', () => {
    const recs: ProjRecurring[] = [
      { name: 'Loyer', amount: 750, day: 5, kind: 'debit' },
      { name: 'Salaire', amount: 1650, day: 2, kind: 'credit' },
    ]
    const pts = projectBalance(1000, recs, [], 30, NOW)
    const last = pts[pts.length - 1]
    expect(last.balance).toBe(1000 + 1650 - 750)
  })

  it('un récurrent sans kind est traité comme un débit (rétrocompat)', () => {
    const recs: ProjRecurring[] = [{ name: 'Loyer', amount: 750, day: 20 }]
    const pts = projectBalance(1000, recs, [], 30, NOW)
    const before = pts.find(p => p.date === '2026-07-19')!
    const after = pts.find(p => p.date === '2026-07-20')!
    expect(before.balance - after.balance).toBe(750)
  })

  it('les revenus (amt > 0) sont exclus de la moyenne des dépenses', () => {
    // 90 € de dépenses sur 90 jours → 1 €/jour ; le revenu ne doit rien changer.
    const txs = [tx('2026-04-17', -90), tx('2026-06-05', 2000)]
    const pts = projectBalance(500, [], txs, 30, NOW)
    expect(pts[pts.length - 1].balance).toBeCloseTo(500 - 30, 0)
  })

  it('un revenu récurrent ne retire pas une dépense homonyme de la moyenne', () => {
    // recNames (noms des récurrents exclus de la moyenne variable) ne doit
    // contenir QUE des débits. Un crédit récurrent homonyme d'une dépense ne
    // doit pas faire disparaître cette dépense de la moyenne (projection trop
    // optimiste sinon). Dépense ACME −30 sur 30j couverts → 1 €/j.
    const recs: ProjRecurring[] = [{ name: 'ACME', amount: 1650, day: 2, kind: 'credit' }]
    const txs = [tx('2026-06-16', -30, 'ACME')]
    const pts = projectBalance(500, recs, txs, 30, NOW)
    // −30 (dépense comptée) + 1650 (salaire le 2 août, dans l'horizon)
    expect(pts[pts.length - 1].balance).toBeCloseTo(500 - 30 + 1650, 0)
  })

  it('divise par la période RÉELLEMENT couverte, pas par 90 en dur', () => {
    // Compte récent : 30 € dépensés sur 30 jours d'historique = 1 €/jour.
    // L'ancien code divisait par 90 → 0,33 €/jour, soit une projection 3x trop
    // optimiste précisément pour un compte jeune.
    const txs = [tx('2026-06-16', -30)] // J-29 → 30 jours couverts
    const pts = projectBalance(500, [], txs, 30, NOW)
    expect(pts[pts.length - 1].balance).toBeCloseTo(500 - 30, 0)
  })

  it('historique vide → aucune dépense variable projetée', () => {
    const pts = projectBalance(500, [], [], 30, NOW)
    expect(pts[pts.length - 1].balance).toBe(500)
  })

  it('se base sur tx_date, pas sur le libellé d\'affichage dt', () => {
    // useData pose dt='today'/'yesterday' pour l'UI. Se fier à dt ferait
    // comparer des dates sur du texte ('t' > '2' passait par accident).
    const txs = [
      { ...tx('2026-07-15', -10), dt: 'today' } as Transaction,
      { ...tx('2026-07-14', -10), dt: 'yesterday' } as Transaction,
    ]
    const pts = projectBalance(500, [], txs, 10, NOW)
    // 20 € sur 2 jours couverts = 10 €/jour → 10 jours = 100 €
    expect(pts[pts.length - 1].balance).toBeCloseTo(400, 0)
  })
})

describe('projectBalance — prélèvements en fin de mois', () => {
  it('un prélèvement au 31 est débité le 30 en avril (il ne disparaît plus)', () => {
    const recs: ProjRecurring[] = [{ name: 'Loyer', amount: 500, day: 31 }]
    const avril = new Date('2026-04-01T12:00:00')
    const pts = projectBalance(1000, recs, [], 30, avril)
    const j29 = pts.find(p => p.date === '2026-04-29')!
    const j30 = pts.find(p => p.date === '2026-04-30')!
    expect(j29.balance - j30.balance).toBe(500)
    expect(pts[pts.length - 1].balance).toBe(500) // débité une fois, pas zéro
  })

  it('un prélèvement au 30 est débité le 28 en février (année non bissextile)', () => {
    const recs: ProjRecurring[] = [{ name: 'Assurance', amount: 100, day: 30 }]
    const fevrier = new Date('2026-02-01T12:00:00')
    const pts = projectBalance(1000, recs, [], 27, fevrier)
    const j27 = pts.find(p => p.date === '2026-02-27')!
    const j28 = pts.find(p => p.date === '2026-02-28')!
    expect(j27.balance - j28.balance).toBe(100)
  })

  it('un prélèvement au 31 tombe bien le 29 en février bissextile', () => {
    const recs: ProjRecurring[] = [{ name: 'Loyer', amount: 500, day: 31 }]
    const fev2024 = new Date('2024-02-01T12:00:00')
    const pts = projectBalance(1000, recs, [], 28, fev2024)
    const j28 = pts.find(p => p.date === '2024-02-28')!
    const j29 = pts.find(p => p.date === '2024-02-29')!
    expect(j28.balance - j29.balance).toBe(500)
  })

  it('un prélèvement au 15 n\'est pas affecté', () => {
    const recs: ProjRecurring[] = [{ name: 'Abo', amount: 20, day: 15 }]
    const avril = new Date('2026-04-01T12:00:00')
    const pts = projectBalance(1000, recs, [], 30, avril)
    const j14 = pts.find(p => p.date === '2026-04-14')!
    const j15 = pts.find(p => p.date === '2026-04-15')!
    expect(j14.balance - j15.balance).toBe(20)
  })

  it('ne débite pas deux fois dans un même mois', () => {
    const recs: ProjRecurring[] = [{ name: 'Loyer', amount: 500, day: 31 }]
    const avril = new Date('2026-04-01T12:00:00')
    const pts = projectBalance(1000, recs, [], 29, avril) // jusqu'au 30 avril
    expect(pts[pts.length - 1].balance).toBe(500)
  })
})

// helper importé aussi
import { projectBalanceWithMin } from '../projection'

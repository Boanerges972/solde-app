import { describe, it, expect } from 'vitest'
import { buildInsights } from '../insights'
import type { Transaction } from '../../types'

const tx = (date: string, amt: number, cat = 'Courses', m = 'Carrefour'): Transaction =>
  ({ id: Math.random().toString(), tx_date: date, dt: date, amt, cat, m, ico: '🛒' } as Transaction)

const NOW = new Date('2026-07-15T12:00:00')

describe('buildInsights', () => {
  it('détecte une variation de catégorie > +15% vs mois précédent', () => {
    const txs = [
      tx('2026-06-05', -100), tx('2026-06-20', -100),
      tx('2026-07-03', -150), tx('2026-07-10', -150),
    ]
    const ins = buildInsights(txs, NOW)
    const varIns = ins.find(i => i.kind === 'category-trend')
    expect(varIns).toBeDefined()
    expect(varIns!.title).toContain('Courses')
    expect(varIns!.title).toContain('+50')
  })

  it('ignore les variations < 15%', () => {
    const txs = [tx('2026-06-05', -100), tx('2026-07-03', -110)]
    expect(buildInsights(txs, NOW).find(i => i.kind === 'category-trend')).toBeUndefined()
  })

  it('trouve la plus grosse dépense de la semaine', () => {
    const txs = [tx('2026-07-13', -25), tx('2026-07-14', -180, 'Loisirs', 'Fnac')]
    const big = buildInsights(txs, NOW).find(i => i.kind === 'biggest-week')
    expect(big).toBeDefined()
    expect(big!.title).toContain('Fnac')
  })

  it('détecte une dépense inhabituelle (> 2× moyenne de sa catégorie)', () => {
    const txs = [
      tx('2026-05-01', -20), tx('2026-05-15', -25), tx('2026-06-01', -22),
      tx('2026-07-10', -90),
    ]
    const unusual = buildInsights(txs, NOW).find(i => i.kind === 'unusual')
    expect(unusual).toBeDefined()
  })

  it('liste vide → aucun insight, pas de crash', () => {
    expect(buildInsights([], NOW)).toEqual([])
  })
})

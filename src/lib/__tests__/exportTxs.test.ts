import { describe, it, expect } from 'vitest'
import { buildCsv } from '../exportTxs'
import type { Transaction } from '../../types'

const tx = (dt: string, amt: number, m: string, cat = 'Courses'): Transaction =>
  ({ id: '1', dt, amt, m, cat, ico: '🛒', acc: 'acc1' } as Transaction)

describe('buildCsv', () => {
  it('en-tête + une ligne par transaction, séparateur point-virgule', () => {
    const csv = buildCsv([tx('2026-07-01', -45.9, 'Carrefour')])
    const lines = csv.split('\n')
    expect(lines[0]).toBe('Date;Marchand;Catégorie;Montant;Compte')
    expect(lines[1]).toBe('2026-07-01;Carrefour;Courses;-45.90;acc1')
  })

  it('échappe les points-virgules et guillemets dans les libellés', () => {
    const csv = buildCsv([tx('2026-07-01', -10, 'A;B "C"')])
    expect(csv.split('\n')[1]).toContain('"A;B ""C"""')
  })

  it('liste vide → en-tête seul', () => {
    expect(buildCsv([]).split('\n')).toHaveLength(1)
  })
})

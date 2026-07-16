import { describe, it, expect } from 'vitest'
import { buildCsv } from '../exportTxs'
import type { Transaction } from '../../types'

const tx = (date: string, amt: number, m: string, cat = 'Courses'): Transaction =>
  ({ id: '1', tx_date: date, dt: date, amt, m, cat, ico: '🛒', acc: 'acc1' } as Transaction)

describe('buildCsv — la date exportée est la vraie date', () => {
  it('exporte tx_date, jamais le libellé d\'affichage « today »', () => {
    // useData pose dt='today' pour les opérations du jour : l'export écrivait
    // donc « today » dans la colonne Date du CSV/Excel de l'utilisateur.
    const t = { ...tx('2026-07-15', -10, 'Carrefour'), dt: 'today' } as Transaction
    const csv = buildCsv([t])
    expect(csv).toContain('2026-07-15;')
    expect(csv).not.toContain('today')
  })
})

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

  it('neutralise les formules (injection CSV) — marchand commençant par =', () => {
    const csv = buildCsv([tx('2026-07-01', -10, '=HYPERLINK("http://evil")')])
    const cell = csv.split('\n')[1]
    // préfixé par une apostrophe, donc plus interprété comme formule
    expect(cell).toContain("'=HYPERLINK")
    expect(cell).not.toMatch(/;=HYPERLINK/)
  })

  it('neutralise aussi + - @ en tête de champ', () => {
    expect(buildCsv([tx('2026-07-01', -1, '+A1')]).split('\n')[1]).toContain("'+A1")
    expect(buildCsv([tx('2026-07-01', -1, '-2+3')]).split('\n')[1]).toContain("'-2+3")
    expect(buildCsv([tx('2026-07-01', -1, '@SUM')]).split('\n')[1]).toContain("'@SUM")
  })
})

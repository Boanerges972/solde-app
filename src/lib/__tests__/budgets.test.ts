import { describe, it, expect } from 'vitest'
import { spentForCategory, budgetProgress, type CategoryBudget } from '../budgets'
import type { Transaction } from '../../types'

const tx = (dt: string, amt: number, cat = 'Courses'): Transaction =>
  ({ id: Math.random().toString(), dt, amt, cat, m: 'X', ico: '🛒' } as Transaction)

const budget = (category: string, amount: number, rollover = false): CategoryBudget =>
  ({ id: category, category, amount, rollover })

describe('spentForCategory', () => {
  it('somme uniquement la bonne catégorie et le bon mois, valeur positive', () => {
    const txs = [
      tx('2026-07-02', -30), tx('2026-07-15', -20),
      tx('2026-07-10', -99, 'Loisirs'),
      tx('2026-06-10', -50),
      tx('2026-07-20', 100, 'Courses'), // revenu ignoré
    ]
    expect(spentForCategory(txs, 'Courses', '2026-07')).toBe(50)
  })

  it('exclut les virements internes', () => {
    const txs = [tx('2026-07-02', -30, 'Virement interne')]
    expect(spentForCategory(txs, 'Virement interne', '2026-07')).toBe(0)
  })

  it('liste vide → 0', () => {
    expect(spentForCategory([], 'Courses', '2026-07')).toBe(0)
  })
})

describe('budgetProgress', () => {
  it('statuts ok / warn / over à 50%, 85%, 120%', () => {
    const budgets = [budget('A', 100), budget('B', 100), budget('C', 100)]
    const txs = [
      tx('2026-07-01', -50, 'A'),
      tx('2026-07-01', -85, 'B'),
      tx('2026-07-01', -120, 'C'),
    ]
    const prog = budgetProgress(budgets, txs, '2026-07')
    expect(prog.find(p => p.budget.category === 'A')!.status).toBe('ok')
    expect(prog.find(p => p.budget.category === 'B')!.status).toBe('warn')
    expect(prog.find(p => p.budget.category === 'C')!.status).toBe('over')
  })

  it('rollover : budget 100, 60 dépensés le mois dernier → effective 140', () => {
    const txs = [tx('2026-06-05', -60), tx('2026-07-05', -10)]
    const prog = budgetProgress([budget('Courses', 100, true)], txs, '2026-07')
    expect(prog[0].effective).toBe(140)
    expect(prog[0].spent).toBe(10)
  })

  it('rollover : dépassement le mois dernier → pas de report négatif', () => {
    const txs = [tx('2026-06-05', -150)]
    const prog = budgetProgress([budget('Courses', 100, true)], txs, '2026-07')
    expect(prog[0].effective).toBe(100)
  })

  it('rollover à cheval sur l’année (2026-01 → prev 2025-12)', () => {
    const txs = [tx('2025-12-10', -40)]
    const prog = budgetProgress([budget('Courses', 100, true)], txs, '2026-01')
    expect(prog[0].effective).toBe(160)
  })

  it('sans rollover, le mois précédent est ignoré', () => {
    const txs = [tx('2026-06-05', -10)]
    const prog = budgetProgress([budget('Courses', 100, false)], txs, '2026-07')
    expect(prog[0].effective).toBe(100)
  })

  it('txs vides → spent 0, ratio 0, status ok', () => {
    const prog = budgetProgress([budget('Courses', 100)], [], '2026-07')
    expect(prog[0]).toMatchObject({ spent: 0, ratio: 0, status: 'ok' })
  })

  it('effective 0 → ratio 0, pas de division par zéro', () => {
    const prog = budgetProgress([budget('Courses', 0)], [tx('2026-07-01', -10)], '2026-07')
    expect(prog[0].ratio).toBe(0)
  })
})

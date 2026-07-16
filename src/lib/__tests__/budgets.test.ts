import { describe, it, expect } from 'vitest'
import { spentForCategory, budgetProgress, type CategoryBudget } from '../budgets'
import type { Transaction } from '../../types'

const tx = (date: string, amt: number, cat = 'Courses'): Transaction =>
  ({ id: Math.random().toString(), tx_date: date, dt: date, amt, cat, m: 'X', ico: '🛒' } as Transaction)

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

  it('compte les dépenses du JOUR (dt = « today » ne doit pas les masquer)', () => {
    // useData pose dt='today' pour l'UI. L'ancien filtre comparait
    // dt.slice(0,7) au mois → 'today' ne matchait jamais : les dépenses du
    // jour étaient invisibles pour les budgets.
    const t = { ...tx('2026-07-15', -30), dt: 'today' } as Transaction
    expect(spentForCategory([t], 'Courses', '2026-07')).toBe(30)
  })

  it('compte les dépenses d\'hier (dt = « yesterday »)', () => {
    const t = { ...tx('2026-07-14', -20), dt: 'yesterday' } as Transaction
    expect(spentForCategory([t], 'Courses', '2026-07')).toBe(20)
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

  it('rollover CUMULATIF : le report se propage de mois en mois', () => {
    // Historique depuis mai (une ligne d'une autre catégorie fixe le début),
    // rien dépensé en Courses : mai 100 → juin 200 → juillet 300 → août 400.
    // L'ancien calcul ne reprenait que le budget NOMINAL du mois précédent
    // (max(0, 100 - spent(juillet))) et plafonnait à 200 : tout report
    // antérieur était perdu.
    const txs = [tx('2026-05-10', -5, 'Loisirs')]
    const prog = budgetProgress([budget('Courses', 100, true)], txs, '2026-08')
    expect(prog[0].effective).toBe(400)
  })

  it('rollover cumulatif avec dépenses partielles', () => {
    // mai : effectif 100, dépensé 60 → report 40
    // juin : effectif 140, dépensé 40 → report 100
    // juillet : effectif 200
    const txs = [tx('2026-05-10', -60), tx('2026-06-10', -40)]
    const prog = budgetProgress([budget('Courses', 100, true)], txs, '2026-07')
    expect(prog[0].effective).toBe(200)
  })

  it('rollover cumulatif : un dépassement remet le report à zéro sans le rendre négatif', () => {
    // mai : eff 100, dépensé 0 → report 100
    // juin : eff 200, dépensé 250 (dépassement) → report 0
    // juillet : eff 100 (nominal seul)
    const txs = [tx('2026-05-10', -5, 'Loisirs'), tx('2026-06-10', -250)]
    const prog = budgetProgress([budget('Courses', 100, true)], txs, '2026-07')
    expect(prog[0].effective).toBe(100)
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

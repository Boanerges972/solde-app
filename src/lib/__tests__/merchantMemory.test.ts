import { describe, it, expect } from 'vitest'
import { buildMerchantMemory, searchMerchants } from '../merchantMemory'
import type { Transaction } from '../../types'

const tx = (m: string, amt: number, cat: string, acc = 'acc1', ico = '🛒'): Transaction =>
  ({ id: Math.random().toString(), m, amt, cat, acc, ico, dt: '2026-07-01' } as Transaction)

describe('buildMerchantMemory', () => {
  it('agrège par marchand avec catégorie et compte majoritaires', () => {
    const mem = buildMerchantMemory([
      tx('Carrefour', -20, 'Courses', 'acc1'),
      tx('Carrefour', -35, 'Courses', 'acc1'),
      tx('Carrefour', -12, 'Maison', 'acc2'),
    ])
    expect(mem['carrefour'].cat).toBe('Courses')
    expect(mem['carrefour'].accId).toBe('acc1')
    expect(mem['carrefour'].count).toBe(3)
  })

  it('ignore revenus et virements internes', () => {
    const mem = buildMerchantMemory([
      tx('Salaire', 2000, 'Salaire'),
      tx('Épargne', -100, 'Virement interne'),
    ])
    expect(Object.keys(mem)).toHaveLength(0)
  })
})

describe('searchMerchants', () => {
  const mem = buildMerchantMemory([
    tx('Carrefour', -20, 'Courses'),
    tx('Carrefour Market', -15, 'Courses'),
    tx('Amazon', -30, 'Loisirs'),
  ])

  it('retourne les marchands correspondants triés par fréquence', () => {
    const res = searchMerchants('carr', mem)
    expect(res.map(r => r.name)).toEqual(['Carrefour', 'Carrefour Market'])
  })

  it('requête < 2 caractères → vide', () => {
    expect(searchMerchants('c', mem)).toEqual([])
  })
})

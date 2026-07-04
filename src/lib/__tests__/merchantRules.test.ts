import { describe, it, expect } from 'vitest'
import { normalizePattern, matchRule, type MerchantRule } from '../merchantRules'

const rule = (pattern: string, category: string): MerchantRule =>
  ({ id: pattern, pattern, category })

describe('normalizePattern', () => {
  it('uppercase + trim', () => {
    expect(normalizePattern('  Carrefour Cayenne ')).toBe('CARREFOUR CAYENNE')
  })
})

describe('matchRule', () => {
  const rules = [rule('CARREFOUR', 'Courses'), rule('SNCF', 'Transport')]

  it('matche par inclusion insensible à la casse', () => {
    expect(matchRule('Paiement carrefour market cayenne', rules)?.category).toBe('Courses')
  })

  it('retourne null si aucun match', () => {
    expect(matchRule('AMAZON EU', rules)).toBeNull()
  })

  it('le pattern le plus long gagne (plus spécifique)', () => {
    const r = [rule('CARREFOUR', 'Courses'), rule('CARREFOUR STATION', 'Transport')]
    expect(matchRule('CARREFOUR STATION SERVICE', r)?.category).toBe('Transport')
  })

  it('label vide → null', () => {
    expect(matchRule('', rules)).toBeNull()
  })
})

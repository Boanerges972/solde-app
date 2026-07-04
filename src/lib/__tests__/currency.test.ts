import { describe, it, expect, afterEach } from 'vitest'
import { fmt, fmtS, setCurrency } from '../../lib/currency'

// Reset module-level CURRENCY state to EUR after each test that changes it
afterEach(() => {
  setCurrency({ sym: '€', pos: 'after', dec: ',' })
})

describe('fmt — EUR (default)', () => {
  it('formats zero', () => {
    expect(fmt(0)).toBe('0,00 €')
  })

  it('formats integer', () => {
    expect(fmt(100)).toBe('100,00 €')
  })

  it('formats amount with thousands separator', () => {
    expect(fmt(1234.5)).toBe('1 234,50 €')
  })

  it('returns absolute value — sign is stripped', () => {
    expect(fmt(-50)).toBe('50,00 €')
  })

  it('respects decimal places param', () => {
    expect(fmt(9.99, 0)).toBe('10 €')
  })
})

describe('fmtS — signed formatting', () => {
  it('positive amount: no prefix', () => {
    expect(fmtS(100)).toBe('100,00 €')
  })

  it('negative amount: prefixes minus sign (−)', () => {
    expect(fmtS(-100)).toBe('−100,00 €')
  })
})

describe('setCurrency', () => {
  it('USD — symbol before, dot decimal', () => {
    setCurrency({ code: 'USD', sym: '$', pos: 'before', dec: '.' })
    expect(fmt(10)).toBe('$10.00')
  })

  it('XOF — symbol after, space thousands, comma decimal', () => {
    setCurrency({ code: 'XOF', sym: 'FCFA', pos: 'after', dec: ',' })
    expect(fmt(1000)).toBe('1 000,00 FCFA')
  })
})

import { describe, it, expect } from 'vitest'
import { parseAmountFR, splitCsvLine } from '../amount'

describe('parseAmountFR', () => {
  it('virgule décimale FR', () => {
    expect(parseAmountFR('18,57')).toBe(18.57)
    expect(parseAmountFR('-1066,76')).toBe(-1066.76)
  })

  it('espace milliers (le bug d\'origine : donnait 2)', () => {
    expect(parseAmountFR('2 880,88')).toBe(2880.88)
    expect(parseAmountFR('-1 234,56')).toBe(-1234.56)
  })

  it('NBSP et fine comme séparateur de milliers', () => {
    expect(parseAmountFR('2 880,88')).toBe(2880.88)
    expect(parseAmountFR('2 880,88')).toBe(2880.88)
  })

  it('apostrophe milliers (suisse) — donnait 1 avant', () => {
    expect(parseAmountFR("1'234,56")).toBe(1234.56)
  })

  it('SIGNE TERMINAL — donnait +123.45 avant (débit devenu crédit !)', () => {
    expect(parseAmountFR('123,45-')).toBe(-123.45)
    expect(parseAmountFR('123,45+')).toBe(123.45)
    expect(parseAmountFR('1 234,56-')).toBe(-1234.56)
  })

  it('format comptable entre parenthèses = négatif', () => {
    expect(parseAmountFR('(1 234,56)')).toBe(-1234.56)
    expect(parseAmountFR('(18,57)')).toBe(-18.57)
  })

  it('point décimal (accountbalance Boursorama)', () => {
    expect(parseAmountFR('2880.88')).toBe(2880.88)
  })

  it('point milliers + virgule décimale', () => {
    expect(parseAmountFR('1.234,56')).toBe(1234.56)
  })

  it('virgule milliers + point décimal', () => {
    expect(parseAmountFR('1,234.56')).toBe(1234.56)
  })

  it('guillemets autour', () => {
    expect(parseAmountFR('"2 880,88"')).toBe(2880.88)
  })

  it('REJETTE les résidus (parseFloat les acceptait)', () => {
    expect(parseAmountFR('12abc')).toBeNaN()
    expect(parseAmountFR('abc')).toBeNaN()
    expect(parseAmountFR('')).toBeNaN()
    expect(parseAmountFR('1..2')).toBeNaN()
    expect(parseAmountFR(null)).toBeNaN()
    expect(parseAmountFR(undefined)).toBeNaN()
  })

  it('nombre passé directement', () => {
    expect(parseAmountFR(12.34)).toBe(12.34)
    expect(parseAmountFR(NaN)).toBeNaN()
    expect(parseAmountFR(Infinity)).toBeNaN()
  })
})

describe('splitCsvLine', () => {
  it('découpe simple', () => {
    expect(splitCsvLine('a;b;c')).toEqual(['a', 'b', 'c'])
  })
  it('respecte les champs quotés contenant le délimiteur', () => {
    expect(splitCsvLine('a;"b;c";d')).toEqual(['a', 'b;c', 'd'])
  })
  it('gère les guillemets échappés ("")', () => {
    expect(splitCsvLine('a;"b""c";d')).toEqual(['a', 'b"c', 'd'])
  })
  it('champs vides', () => {
    expect(splitCsvLine('a;;c')).toEqual(['a', '', 'c'])
  })
})

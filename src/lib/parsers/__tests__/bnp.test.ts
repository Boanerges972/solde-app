import { describe, it, expect } from 'vitest'
import { parseBNP } from '../bnp'

// BNP Paribas CSV: Date;Libellé;Montant;
const SAMPLE_BNP = `Date;Libellé;Montant;
15/01/2024;CARREFOUR CITY PARIS;-45,50;
01/01/2024;VIR SEPA SALAIRE ENTREPRISE;+2500,00;
16/01/2024;FRAIS DE TENUE DE COMPTE;-3,00;
`

describe('parseBNP', () => {
  it('parses 3 transactions', () => {
    expect(parseBNP(SAMPLE_BNP)).toHaveLength(3)
  })
  it('parses debit correctly', () => {
    const txs = parseBNP(SAMPLE_BNP)
    expect(txs[0].amount).toBe(-45.50)
  })
  it('parses credit correctly', () => {
    const txs = parseBNP(SAMPLE_BNP)
    expect(txs[1].amount).toBe(2500)
  })
  it('formats date as YYYY-MM-DD', () => {
    const txs = parseBNP(SAMPLE_BNP)
    expect(txs[0].dt).toBe('2024-01-15')
  })
  it('returns empty array for header-only', () => {
    expect(parseBNP('Date;Libellé;Montant;\n')).toEqual([])
  })
})

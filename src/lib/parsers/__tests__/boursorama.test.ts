import { describe, it, expect } from 'vitest'
import { parseBoursorama } from '../boursorama'

// Boursorama CSV: dateOp;dateVal;label;category;supplierFound;amount;...
const SAMPLE_BOURSO = `dateOp;dateVal;label;category;supplierFound;amount;accountNum;addressContractor;postal;city;paymentType
2024-01-15;2024-01-15;" CARREFOUR CITY";;CARREFOUR;-45,50;FR76123;;75001;PARIS;CB
2024-01-01;2024-01-01;" VIR SALAIRE";;;+2500,00;FR76123;;;; VIR
2024-01-16;2024-01-16;" NETFLIX";;NETFLIX;-13,99;FR76123;;;;CB
`

describe('parseBoursorama', () => {
  it('parses 3 transactions', () => {
    expect(parseBoursorama(SAMPLE_BOURSO)).toHaveLength(3)
  })
  it('trims label quotes and spaces', () => {
    const txs = parseBoursorama(SAMPLE_BOURSO)
    expect(txs[0].merchant).toBe('CARREFOUR CITY')
  })
  it('parses debit correctly', () => {
    const txs = parseBoursorama(SAMPLE_BOURSO)
    expect(txs[0].amount).toBe(-45.50)
  })
  it('parses date correctly', () => {
    const txs = parseBoursorama(SAMPLE_BOURSO)
    expect(txs[0].dt).toBe('2024-01-15')
  })
  it('categorizes NETFLIX as Abonnement', () => {
    const txs = parseBoursorama(SAMPLE_BOURSO)
    expect(txs[2].category).toBe('Abonnement')
  })
})

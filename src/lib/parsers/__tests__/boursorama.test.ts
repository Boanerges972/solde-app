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

// Format Boursorama ACTUEL (2026) : BOM UTF-8, colonnes suggestedLabel/
// category/categoryParent insérées (amount = index 6), montant "2 880,88"
// (espace milliers + virgule), champs quotés.
const SAMPLE_BOURSO_2026 = '﻿dateOp;dateVal;label;suggestedLabel;category;categoryParent;amount;comment;accountNum;accountLabel;accountbalance;mark\n'
  + '2026-06-30;2026-06-30;"VIR INST GF CONSULTING INFORMATIQ";"Vir Inst";"Electronique et informatique";"Vie quotidienne";"2 880,88";;00040791262;BoursoBank;2880.88;Non\n'
  + '2026-06-29;2026-06-29;"PAIEMENT CB; AVEC POINT-VIRGULE";"x";"y";"z";"-1 234,56";;00040791262;BoursoBank;1646.32;Non\n'

describe('parseBoursorama — format 2026 (BOM, amount col 6, espace milliers)', () => {
  it('parse les 2 transactions (colonnes détectées par en-tête)', () => {
    expect(parseBoursorama(SAMPLE_BOURSO_2026)).toHaveLength(2)
  })
  it('parse le montant à espace milliers + virgule', () => {
    const txs = parseBoursorama(SAMPLE_BOURSO_2026)
    expect(txs[0].amount).toBe(2880.88)   // PAS 2
  })
  it('parse un débit négatif à espace milliers', () => {
    const txs = parseBoursorama(SAMPLE_BOURSO_2026)
    expect(txs[1].amount).toBe(-1234.56)
  })
  it('gère un libellé contenant un point-virgule (champ quoté)', () => {
    const txs = parseBoursorama(SAMPLE_BOURSO_2026)
    expect(txs[1].merchant).toBe('PAIEMENT CB; AVEC POINT-VIRGULE')
  })
  it('strip le BOM sur la 1re colonne d\'en-tête', () => {
    const txs = parseBoursorama(SAMPLE_BOURSO_2026)
    expect(txs[0].dt).toBe('2026-06-30')
    expect(txs[0].merchant).toBe('VIR INST GF CONSULTING INFORMATIQ')
  })
})

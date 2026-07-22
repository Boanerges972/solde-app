import { describe, it, expect } from 'vitest'
import { extractClosingBalance } from '../closingBalance'

describe('extractClosingBalance', () => {
  it('lit le Solde ET la date de la ligne la plus récente (Crédit Mutuel)', () => {
    const csv = [
      'Date;Date de valeur;Débit;Crédit;Libellé;Solde',
      '02/05/2023;02/05/2023;;1000,00;VIR;-160,15',
      '14/07/2026;14/07/2026;-100,00;;VIR NICKEL;-843,75',
    ].join('\n')
    expect(extractClosingBalance(csv)).toEqual({ balance: -843.75, date: '2026-07-14' })
  })

  it('prend le solde de la DATE max, pas la dernière ligne (ordre décroissant)', () => {
    const csv = [
      'Date;Débit;Crédit;Libellé;Solde',
      '14/07/2026;-100,00;;RECENT;-843,75',
      '02/05/2023;;1000,00;ANCIEN;-160,15',
    ].join('\n')
    expect(extractClosingBalance(csv)).toEqual({ balance: -843.75, date: '2026-07-14' })
  })

  it('retourne null sans colonne Solde', () => {
    expect(extractClosingBalance('Date;Libellé;Montant\n14/07/2026;COURSES;-42,00')).toBeNull()
  })

  it('retourne null sans colonne Date exploitable (on ne devine pas)', () => {
    expect(extractClosingBalance('Libellé;Solde\nVIR;-843,75')).toBeNull()
  })

  it('gère le BOM et un solde positif, avec sa date', () => {
    const csv = '﻿' + 'Date;Libellé;Solde\n01/03/2024;VIREMENT;1 734,90'
    expect(extractClosingBalance(csv)).toEqual({ balance: 1734.90, date: '2024-03-01' })
  })

  it('si la ligne récente n\'a pas de solde, renvoie la date ANCIENNE (l\'appelant refusera un solde périmé)', () => {
    const csv = [
      'Date;Libellé;Solde',
      '01/01/2024;A;10,00',
      '02/01/2024;B;', // pas de solde sur la ligne la plus récente
    ].join('\n')
    // La valeur renvoyée porte la date du 01/01, PAS du 02/01 : le garde-fou de
    // fraîcheur côté import comparera cette date au max des transactions.
    expect(extractClosingBalance(csv)).toEqual({ balance: 10, date: '2024-01-01' })
  })
})

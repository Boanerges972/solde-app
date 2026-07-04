import { describe, it, expect } from 'vitest'
import { parseCM } from '../cm'

describe('parseCM', () => {
  it('Format A — 5 colonnes montant signé', () => {
    const csv = 'Date;Valeur;Montant;Libellé;Solde\n02/06/2026;02/06/2026;-45,90;CARREFOUR CAYENNE;1204,60\n03/06/2026;03/06/2026;1500,00;VIR SALAIRE;2704,60'
    const res = parseCM(csv)
    expect(res).toHaveLength(2)
    expect(res[0]).toMatchObject({ dt: '2026-06-02', amount: -45.9 })
    expect(res[1].amount).toBe(1500)
  })

  it('Format B — colonnes débit/crédit', () => {
    const csv = 'Date;Date valeur;Libellé;Référence;Info;Débit;Crédit\n02/06/2026;02/06/2026;CARREFOUR;REF1;;45,90;\n03/06/2026;03/06/2026;VIR SALAIRE;REF2;;;1500,00'
    const res = parseCM(csv)
    expect(res[0].amount).toBe(-45.9)
    expect(res[1].amount).toBe(1500)
  })

  it('BOM et lignes vides ignorés', () => {
    const csv = '﻿Date;Valeur;Montant;Libellé;Solde\n\n02/06/2026;02/06/2026;-10,00;TEST;100,00\n'
    expect(parseCM(csv)).toHaveLength(1)
  })
})

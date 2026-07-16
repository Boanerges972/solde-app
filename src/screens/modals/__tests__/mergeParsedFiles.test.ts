import { describe, it, expect } from 'vitest'
import { mergeParsedFiles } from '../ImportUniversal'
import type { ParsedTx } from '../../../lib/parsers/index'

const cafe = (): ParsedTx => ({ dt: '2026-07-01', merchant: 'CAFE', category: 'Restaurant', icon: '☕', amount: -2 })
const pain = (): ParsedTx => ({ dt: '2026-07-01', merchant: 'PAIN', category: 'Courses', icon: '🥖', amount: -1.5 })

describe('mergeParsedFiles', () => {
  it('un seul fichier : garde TOUTES les occurrences réelles (3 cafés = 3)', () => {
    // Le bug : réduire à 1 sous-comptait le solde alors que la banque a débité 3.
    const out = mergeParsedFiles([[cafe(), cafe(), cafe(), pain()]])
    expect(out.filter(t => t.merchant === 'CAFE')).toHaveLength(3)
    expect(out).toHaveLength(4)
  })

  it('deux relevés qui se chevauchent : ne double PAS (max, pas somme)', () => {
    const out = mergeParsedFiles([[cafe(), cafe()], [cafe(), cafe()]])
    expect(out).toHaveLength(2)
  })

  it('chevauchement partiel : garde le fichier le plus complet', () => {
    // Le relevé B couvre plus large (3 cafés) que A (2) → on garde 3.
    const out = mergeParsedFiles([[cafe(), cafe()], [cafe(), cafe(), cafe()]])
    expect(out).toHaveLength(3)
  })

  it('fichiers disjoints : tout est conservé', () => {
    const autre: ParsedTx = { dt: '2026-07-02', merchant: 'X', category: 'Autre', icon: '📦', amount: -5 }
    const out = mergeParsedFiles([[cafe()], [autre]])
    expect(out).toHaveLength(2)
  })

  it('distingue les clés (date, montant, libellé)', () => {
    const jour2: ParsedTx = { ...cafe(), dt: '2026-07-02' }
    const autreMontant: ParsedTx = { ...cafe(), amount: -3 }
    const out = mergeParsedFiles([[cafe(), jour2, autreMontant]])
    expect(out).toHaveLength(3)
  })

  it('aucun fichier → tableau vide', () => {
    expect(mergeParsedFiles([])).toEqual([])
    expect(mergeParsedFiles([[]])).toEqual([])
  })
})

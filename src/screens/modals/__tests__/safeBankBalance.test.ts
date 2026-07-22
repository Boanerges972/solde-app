import { describe, it, expect } from 'vitest'
import { safeBankBalance } from '../ImportUniversal'

const closing = { balance: -843.75, date: '2026-07-14' }

describe('safeBankBalance — quand poser le solde du relevé', () => {
  it('pose le solde quand tout est cohérent (complet, récent, plus neuf que la base)', () => {
    expect(safeBankBalance({ closing, allMaxDt: '2026-07-14', allSelected: true, accountLatestDt: '2026-07-01' })).toBe(-843.75)
  })

  it('compte neuf (aucune opération en base) → pose le solde', () => {
    expect(safeBankBalance({ closing, allMaxDt: '2026-07-14', allSelected: true, accountLatestDt: null })).toBe(-843.75)
  })

  it('pas de solde dans le relevé → delta (null)', () => {
    expect(safeBankBalance({ closing: null, allMaxDt: '2026-07-14', allSelected: true, accountLatestDt: null })).toBeNull()
  })

  it('sélection PARTIELLE → delta (le solde ne correspondrait pas aux tx)', () => {
    expect(safeBankBalance({ closing, allMaxDt: '2026-07-14', allSelected: false, accountLatestDt: null })).toBeNull()
  })

  it('un fichier plus récent apporte des opérations postérieures au solde → delta', () => {
    // allMaxDt (15/07) > date du solde (14/07) : snapshot périmé.
    expect(safeBankBalance({ closing, allMaxDt: '2026-07-15', allSelected: true, accountLatestDt: null })).toBeNull()
  })

  it('relevé plus ANCIEN que des opérations déjà en base → delta (pas d\'écrasement rétrograde)', () => {
    expect(safeBankBalance({ closing, allMaxDt: '2026-07-14', allSelected: true, accountLatestDt: '2026-07-20' })).toBeNull()
  })

  it('relevé à la même date que la dernière opération connue → autorisé', () => {
    expect(safeBankBalance({ closing, allMaxDt: '2026-07-14', allSelected: true, accountLatestDt: '2026-07-14' })).toBe(-843.75)
  })
})

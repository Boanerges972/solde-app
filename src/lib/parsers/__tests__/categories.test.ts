import { describe, it, expect } from 'vitest'
import { catFromLabel, ICONS } from '../categories'

describe('catFromLabel', () => {
  it('detects Courses from CARREFOUR', () => {
    expect(catFromLabel('CARREFOUR CITY')).toBe('Courses')
  })
  it('detects Abonnement from NETFLIX', () => {
    expect(catFromLabel('NETFLIX FRANCE')).toBe('Abonnement')
  })
  it('detects Transport from SNCF', () => {
    expect(catFromLabel('SNCF BILLET')).toBe('Transport')
  })
  it('detects Salaire from SALAIRE', () => {
    expect(catFromLabel('VIREMENT SALAIRE JANVIER')).toBe('Salaire')
  })
  it('detects Loyer from LOYER', () => {
    expect(catFromLabel('VIREMENT LOYER MARS')).toBe('Loyer')
  })
  it('returns Autre for unknown', () => {
    expect(catFromLabel('XYZ INCONNU 123')).toBe('Autre')
  })
  it('ICONS has entry for every category', () => {
    const cats = ['Courses','Transport','Restaurant','Santé','Abonnement','Loyer','Assurance','Banque','Sport','Cinéma','Salaire','Virement','Prélèvement','Autre']
    cats.forEach(c => expect(ICONS[c]).toBeDefined())
  })
})

import { describe, it, expect } from 'vitest'
import { isoLocal, monthLocal, addDaysLocal, addMonths, isCalendarDate } from '../dates'

describe('isoLocal / monthLocal — calendrier LOCAL, jamais UTC', () => {
  it('un soir tardif reste le MÊME jour (toISOString basculerait au lendemain)', () => {
    // C'est le bug : en Guyane (UTC−3), 22 h locales = 01 h UTC le lendemain.
    // toISOString() aurait renvoyé 2026-07-16.
    const d = new Date(2026, 6, 15, 22, 30) // 15 juillet 2026, 22 h 30 locales
    expect(isoLocal(d)).toBe('2026-07-15')
  })

  it('le dernier jour du mois au soir reste dans le MÊME mois', () => {
    // Le cas qui vidait le rapport mensuel : 31 juillet 22 h → août en UTC.
    const d = new Date(2026, 6, 31, 22, 30)
    expect(monthLocal(d)).toBe('2026-07')
  })

  it('tôt le matin aussi', () => {
    const d = new Date(2026, 6, 1, 0, 5)
    expect(isoLocal(d)).toBe('2026-07-01')
    expect(monthLocal(d)).toBe('2026-07')
  })

  it('pad correctement mois et jour', () => {
    expect(isoLocal(new Date(2026, 0, 5, 12))).toBe('2026-01-05')
  })
})

describe('addDaysLocal', () => {
  it('avance et recule d\'un jour calendaire', () => {
    const d = new Date(2026, 6, 15, 12)
    expect(isoLocal(addDaysLocal(d, 1))).toBe('2026-07-16')
    expect(isoLocal(addDaysLocal(d, -1))).toBe('2026-07-14')
  })

  it('franchit les fins de mois et d\'année', () => {
    expect(isoLocal(addDaysLocal(new Date(2026, 6, 31, 12), 1))).toBe('2026-08-01')
    expect(isoLocal(addDaysLocal(new Date(2026, 11, 31, 12), 1))).toBe('2027-01-01')
  })

  it('gère le 29 février d\'une année bissextile', () => {
    expect(isoLocal(addDaysLocal(new Date(2024, 1, 28, 12), 1))).toBe('2024-02-29')
    expect(isoLocal(addDaysLocal(new Date(2026, 1, 28, 12), 1))).toBe('2026-03-01')
  })

  it('reste stable même en partant d\'un bord de journée', () => {
    // addDaysLocal normalise à midi : un décalage horaire ne fait pas
    // basculer le résultat d'un jour.
    expect(isoLocal(addDaysLocal(new Date(2026, 6, 15, 23, 59), 1))).toBe('2026-07-16')
    expect(isoLocal(addDaysLocal(new Date(2026, 6, 15, 0, 1), 1))).toBe('2026-07-16')
  })
})

describe('addMonths', () => {
  it('avance et recule, en franchissant l\'année', () => {
    expect(addMonths('2026-07', -1)).toBe('2026-06')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
  })

  it('recule de plusieurs mois', () => {
    expect(addMonths('2026-07', -23)).toBe('2024-08')
  })
})

describe('isCalendarDate', () => {
  it('accepte une date ISO, rejette les libellés d\'affichage', () => {
    expect(isCalendarDate('2026-07-15')).toBe(true)
    expect(isCalendarDate('today')).toBe(false)
    expect(isCalendarDate('yesterday')).toBe(false)
    expect(isCalendarDate('')).toBe(false)
    expect(isCalendarDate('2026-07')).toBe(false)
  })
})

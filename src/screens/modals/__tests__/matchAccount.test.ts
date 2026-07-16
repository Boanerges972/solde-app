import { describe, it, expect } from 'vitest'
import { matchAccount } from '../ImportUniversal'
import type { Account } from '../../../types'

/** Fabrique un compte minimal (seuls id/name comptent pour le matching). */
const acc = (id: string, name: string) => ({ id, name } as Account)

const BOURSO = { id: 'boursorama', name: 'Boursorama' }
const CM = { id: 'cm', name: 'Crédit Mutuel' }
const CA = { id: 'ca', name: 'Crédit Agricole' }
const NICKEL = { id: 'nickel', name: 'Nickel' }

describe('matchAccount', () => {
  it('matche le compte de la banque importée par nom', () => {
    const accounts = [acc('nickel_x', 'Nickel'), acc('bso_x', 'Boursorama')]
    expect(matchAccount(accounts, BOURSO)?.id).toBe('bso_x')
  })

  it('ne prend PAS le premier compte venu (bug Boursorama -> Nickel)', () => {
    const accounts = [acc('nickel_x', 'Nickel'), acc('bso_x', 'Boursorama')]
    expect(matchAccount(accounts, BOURSO)?.id).not.toBe('nickel_x')
  })

  it('matche malgré accents et séparateurs dans le nom', () => {
    const accounts = [acc('credit_mutuel_29d8a5_51q4', 'Crédit Mutuel')]
    expect(matchAccount(accounts, CM)?.id).toBe('credit_mutuel_29d8a5_51q4')
  })

  it('ne matche pas un nom trop court (compte « A » vs Crédit Agricole)', () => {
    const accounts = [acc('a', 'A')]
    expect(matchAccount(accounts, CA)).toBeUndefined()
  })

  it('ne confond pas deux banques distinctes', () => {
    const accounts = [acc('cm_x', 'Crédit Mutuel')]
    expect(matchAccount(accounts, CA)).toBeUndefined()
    expect(matchAccount(accounts, NICKEL)).toBeUndefined()
  })

  it('renvoie undefined si aucun compte ne correspond (=> mode création)', () => {
    const accounts = [acc('nickel_x', 'Nickel')]
    expect(matchAccount(accounts, BOURSO)).toBeUndefined()
  })
})

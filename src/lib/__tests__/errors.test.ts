import { describe, it, expect, vi, beforeEach } from 'vitest'
import { friendlyError } from '../errors'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('friendlyError', () => {
  it('traduit les refus des RPC en message actionnable', () => {
    expect(friendlyError({ message: 'Account not found or forbidden', code: '42501' }))
      .toMatch(/introuvable ou inaccessible/i)
    expect(friendlyError({ message: 'Use rpc_delete_transfer for internal transfers', code: '22023' }))
      .toMatch(/virement se supprime en entier/i)
    expect(friendlyError({ message: 'batch too large (max 2000)', code: '54000' }))
      .toMatch(/2000 lignes/i)
    expect(friendlyError({ message: 'Not a member of this group', code: '42501' }))
      .toMatch(/pas partie de ce groupe/i)
  })

  it('session expirée (RLS/JWT) → invite à se reconnecter', () => {
    expect(friendlyError({ message: 'new row violates row-level security policy', code: '42501' }))
      .toMatch(/session expirée/i)
    expect(friendlyError({ message: 'JWT expired', code: 'PGRST301' }))
      .toMatch(/session expirée/i)
  })

  it('absence de code = réseau → message rassurant (l\'op est en file)', () => {
    expect(friendlyError({ message: 'TypeError: fetch failed' }))
      .toMatch(/connexion perdue/i)
  })

  it('erreur inconnue → message générique, PAS le message brut', () => {
    const raw = 'PL/pgSQL function rpc_add_tx(uuid,text) line 42 at RAISE'
    const shown = friendlyError({ message: raw, code: 'XX000' })
    expect(shown).not.toContain('rpc_add_tx')
    expect(shown).not.toContain('PL/pgSQL')
    expect(shown).toMatch(/une erreur est survenue/i)
  })

  it('ne fuite JAMAIS de détail interne (fonctions, contraintes, colonnes)', () => {
    const internals = [
      { message: 'permission denied for column balance', code: '42501' },
      { message: 'duplicate key value violates unique constraint "transactions_operation_id_uidx"', code: '23505' },
      { message: 'PL/pgSQL function public.rpc_transfer(uuid,text,text,numeric,date,text) line 19', code: 'XX000' },
    ]
    for (const e of internals) {
      const shown = friendlyError(e)
      expect(shown).not.toMatch(/pl\/pgsql|constraint|column|rpc_|uidx|public\./i)
    }
  })

  it('journalise le détail technique en console (diagnostic)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    friendlyError({ message: 'boom', code: 'XX000' })
    expect(spy).toHaveBeenCalled()
  })

  it('null/undefined → fallback', () => {
    expect(friendlyError(null)).toMatch(/une erreur est survenue/i)
    expect(friendlyError(undefined, 'custom')).toBe('custom')
  })
})

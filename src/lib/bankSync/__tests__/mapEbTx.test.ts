import { describe, it, expect } from 'vitest'
import { mapEbTx, mapEbTransactions, type EbTransaction } from '../mapEbTx'

// Transaction Enable Banking minimale, complétée par override.
const eb = (o: Partial<EbTransaction> = {}): EbTransaction => ({
  transaction_amount: { currency: 'EUR', amount: '12.34' },
  credit_debit_indicator: 'DBIT',
  booking_date: '2026-07-15',
  ...o,
})

describe('mapEbTx — Enable Banking → ParsedTx', () => {
  it('un DÉBIT devient un montant négatif', () => {
    const r = mapEbTx(eb({ credit_debit_indicator: 'DBIT', transaction_amount: { currency: 'EUR', amount: '12.34' } }))
    expect(r?.amount).toBe(-12.34)
  })

  it('un CRÉDIT devient un montant positif', () => {
    const r = mapEbTx(eb({ credit_debit_indicator: 'CRDT', transaction_amount: { currency: 'EUR', amount: '900.00' } }))
    expect(r?.amount).toBe(900)
  })

  it('l\'indicateur prime sur le signe du montant brut (montant déjà négatif + DBIT ne double pas le signe)', () => {
    // Certains ASPSP renvoient le montant signé ; d'autres non. L'indicateur
    // est la source de vérité du sens → on part de la valeur absolue.
    const r = mapEbTx(eb({ credit_debit_indicator: 'DBIT', transaction_amount: { currency: 'EUR', amount: '-12.34' } }))
    expect(r?.amount).toBe(-12.34)
  })

  it('tolère la variante d\'orthographe DBTO comme un débit', () => {
    const r = mapEbTx(eb({ credit_debit_indicator: 'DBTO' }))
    expect(r?.amount).toBeLessThan(0)
  })

  it('REJETTE un indicateur de sens inconnu (on ne devine pas un mouvement d\'argent)', () => {
    expect(mapEbTx(eb({ credit_debit_indicator: 'XXXX' }))).toBeNull()
    expect(mapEbTx(eb({ credit_debit_indicator: '' }))).toBeNull()
  })

  it('REJETTE une devise différente de celle attendue (100 USD ≠ 100 €)', () => {
    expect(mapEbTx(eb({ transaction_amount: { currency: 'USD', amount: '100' } }))).toBeNull()
    // devise attendue paramétrable
    expect(mapEbTx(eb({ transaction_amount: { currency: 'USD', amount: '100' } }), 'USD')?.amount).toBe(-100)
  })

  it('parse STRICT : « 12.34EUR » est rejeté, pas tronqué à 12.34', () => {
    expect(mapEbTx(eb({ transaction_amount: { currency: 'EUR', amount: '12.34EUR' } }))).toBeNull()
    expect(mapEbTx(eb({ transaction_amount: { currency: 'EUR', amount: '  8.50  ' } }))?.amount).toBe(-8.5)
  })

  it('date : booking_date prioritaire, sinon value_date, sinon transaction_date', () => {
    expect(mapEbTx(eb({ booking_date: '2026-07-15', value_date: '2026-07-10' }))?.dt).toBe('2026-07-15')
    expect(mapEbTx(eb({ booking_date: undefined, value_date: '2026-07-10' }))?.dt).toBe('2026-07-10')
    expect(mapEbTx(eb({ booking_date: undefined, value_date: undefined, transaction_date: '2026-07-08' }))?.dt).toBe('2026-07-08')
  })

  it('marchand : creditor.name pour un débit, debtor.name pour un crédit', () => {
    expect(mapEbTx(eb({ credit_debit_indicator: 'DBIT', creditor: { name: 'CARREFOUR' } }))?.merchant).toBe('CARREFOUR')
    expect(mapEbTx(eb({ credit_debit_indicator: 'CRDT', debtor: { name: 'EMPLOYEUR SARL' } }))?.merchant).toBe('EMPLOYEUR SARL')
  })

  it('marchand : repli sur remittance_information nettoyée quand pas de contrepartie nommée', () => {
    const r = mapEbTx(eb({ creditor: undefined, remittance_information: ['PAIEMENT CB   ', '  FNAC PARIS'] }))
    expect(r?.merchant).toBe('PAIEMENT CB FNAC PARIS')
  })

  it('catégorise et attribue une icône via les règles existantes', () => {
    const r = mapEbTx(eb({ creditor: { name: 'CARREFOUR MARKET' } }))
    expect(r?.category).toBeTruthy()
    expect(r?.icon).toBeTruthy()
  })

  it('conserve l\'identifiant externe (transaction_id prioritaire) pour la dédup exacte', () => {
    expect(mapEbTx(eb({ transaction_id: 'tx-1', entry_reference: 'e-1' }))?.externalId).toBe('tx-1')
    expect(mapEbTx(eb({ transaction_id: undefined, entry_reference: 'e-1' }))?.externalId).toBe('e-1')
  })

  it('rejette une transaction sans montant exploitable ou de montant nul', () => {
    expect(mapEbTx(eb({ transaction_amount: { currency: 'EUR', amount: '0' } }))).toBeNull()
    expect(mapEbTx(eb({ transaction_amount: { currency: 'EUR', amount: 'abc' } }))).toBeNull()
    expect(mapEbTx(eb({ booking_date: undefined, value_date: undefined, transaction_date: undefined }))).toBeNull()
  })

  it('mapEbTransactions filtre les lignes invalides', () => {
    const out = mapEbTransactions([
      eb({ transaction_amount: { currency: 'EUR', amount: '10' } }),
      eb({ transaction_amount: { currency: 'EUR', amount: '0' } }), // rejetée
      eb({ transaction_amount: { currency: 'EUR', amount: '5' } }),
    ])
    expect(out).toHaveLength(2)
  })
})

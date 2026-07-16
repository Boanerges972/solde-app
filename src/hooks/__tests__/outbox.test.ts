import { describe, it, expect } from 'vitest'
import { entryToOp } from '../useOfflineSync'
import type { PendingEntry } from '../../lib/idb'

const UID = 'user-1'

describe('entryToOp — conversion des entrées de file', () => {
  it('renvoie l\'op telle quelle au nouveau format', () => {
    const entry: PendingEntry = {
      id: 1,
      op: {
        kind: 'add_tx', operation_id: 'op-1', uid: UID, account_id: 'acc-1',
        merchant: 'Carrefour', category: 'Courses', amount: -45, tx_date: '2026-07-15',
      },
      timestamp: 0, retries: 0,
    }
    expect(entryToOp(entry)).toEqual(entry.op)
  })

  it('LEGACY : le montant était stocké POSITIF → doit devenir négatif (dépense)', () => {
    // Piège : sans négation, une dépense en attente deviendrait un CRÉDIT.
    const entry: PendingEntry = {
      id: 2,
      action: 'addTx',
      payload: {
        uid: UID, merchant: 'Carrefour', category: 'Courses',
        amount: 45, // positif dans l'ancien format
        account_id: 'acc-1', tx_date: '2026-07-15', operation_id: 'op-legacy',
      },
      timestamp: 0, retries: 0,
    }
    const op = entryToOp(entry)
    expect(op).toMatchObject({ kind: 'add_tx', amount: -45, operation_id: 'op-legacy' })
  })

  it('LEGACY sans operation_id → chaîne vide (le replay en génère un et le persiste)', () => {
    const entry: PendingEntry = {
      id: 3,
      action: 'addTx',
      payload: {
        uid: UID, merchant: 'X', category: 'Autre', amount: 10,
        account_id: 'acc-1', tx_date: '2026-07-15',
      },
      timestamp: 0, retries: 0,
    }
    expect(entryToOp(entry)?.operation_id).toBe('')
  })

  it('conserve group_id / paid_by des entrées legacy', () => {
    const entry: PendingEntry = {
      id: 4,
      action: 'addTx',
      payload: {
        uid: UID, merchant: 'Resto', category: 'Restaurant', amount: 60,
        account_id: 'acc-1', tx_date: '2026-07-15',
        group_id: 'grp-1', paid_by: 'user-2', operation_id: 'op-4',
      },
      timestamp: 0, retries: 0,
    }
    expect(entryToOp(entry)).toMatchObject({ group_id: 'grp-1', paid_by: 'user-2' })
  })

  it('entrée illisible → null (sera purgée)', () => {
    expect(entryToOp({ id: 5, timestamp: 0, retries: 0 } as PendingEntry)).toBeNull()
  })

  it('porte les virements et les imports', () => {
    const transfer: PendingEntry = {
      id: 6,
      op: {
        kind: 'transfer', operation_id: 'op-6', uid: UID,
        from_account_id: 'acc-1', to_account_id: 'acc-2', amount: 200, tx_date: '2026-07-15',
      },
      timestamp: 0, retries: 0,
    }
    const imp: PendingEntry = {
      id: 7,
      op: {
        kind: 'import', operation_id: 'op-7', uid: UID, account_id: 'acc-1',
        txs: [{ merchant: 'A', category: 'Courses', amount: -10, tx_date: '2026-07-01' }],
      },
      timestamp: 0, retries: 0,
    }
    expect(entryToOp(transfer)?.kind).toBe('transfer')
    expect(entryToOp(imp)?.kind).toBe('import')
  })
})

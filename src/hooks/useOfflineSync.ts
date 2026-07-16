import { useState, useEffect, useRef, useCallback } from 'react'
import { loadQueue, removeFromQueue, updateQueueEntry } from '../lib/idb'
import type { PendingEntry, PendingOp } from '../lib/idb'
import { newOpId, rpcAddTx, rpcTransfer, rpcImportBatch } from '../lib/rpc'
import type { AppData, Transaction } from '../types'

export interface OfflineSyncState {
  isOnline: boolean
  pendingCount: number
  failedCount: number
  isSyncing: boolean
}

/** Normalise une entrée de file (nouveau format ou legacy) en opération.
 *  Legacy : `amount` était stocké POSITIF et nié au replay — on le nie ici pour
 *  conserver exactement la même sémantique (sinon une dépense en attente
 *  deviendrait un crédit). Exporté pour test. */
export function entryToOp(entry: PendingEntry): PendingOp | null {
  if (entry.op) return entry.op
  const p = entry.payload
  if (!p) return null
  return {
    kind: 'add_tx',
    operation_id: p.operation_id ?? '',
    uid: p.uid,
    account_id: p.account_id,
    merchant: p.merchant,
    category: p.category,
    icon: p.icon,
    amount: -Math.abs(p.amount), // legacy = dépense, montant positif en base
    tx_date: p.tx_date,
    group_id: p.group_id ?? null,
    paid_by: p.paid_by ?? null,
  }
}

/** Rejoue une opération via sa RPC. Idempotent grâce à op.operation_id. */
async function replayOp(op: PendingOp): Promise<{ message: string } | null> {
  switch (op.kind) {
    case 'add_tx':
      return (await rpcAddTx({
        operationId: op.operation_id, accountId: op.account_id,
        merchant: op.merchant, category: op.category, icon: op.icon,
        amount: op.amount, txDate: op.tx_date, budget: op.budget,
        groupId: op.group_id ?? null, paidBy: op.paid_by ?? null,
      })).error
    case 'transfer':
      return (await rpcTransfer({
        operationId: op.operation_id, fromAccountId: op.from_account_id,
        toAccountId: op.to_account_id, amount: op.amount,
        txDate: op.tx_date, note: op.note,
      })).error
    case 'import':
      return (await rpcImportBatch({
        operationId: op.operation_id, accountId: op.account_id, txs: op.txs,
      })).error
  }
}

// Pure function — exported for testing
export function applyOptimisticTx(prev: AppData | null, tx: Transaction): AppData | null {
  if (!prev) return null
  const n = Math.abs(tx.amt)
  return {
    ...prev,
    txs: [tx, ...prev.txs],
    spent: parseFloat((prev.spent + n).toFixed(2)),
    rem: parseFloat((prev.rem - n).toFixed(2)),
    monthSpent: parseFloat((prev.monthSpent + n).toFixed(2)),
    monthRem: parseFloat((prev.monthRem - n).toFixed(2)),
    accounts: prev.accounts.map(a =>
      a.id === tx.account_id
        ? { ...a, bal: parseFloat((a.bal - n).toFixed(2)) }
        : a
    ),
  }
}

export function useOfflineSync(
  uid: string | null,
  reloadData: () => void
): OfflineSyncState {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [pendingCount, setPendingCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const syncingRef = useRef(false)
  const reloadRef = useRef(reloadData)
  reloadRef.current = reloadData

  const refreshCounts = useCallback(async () => {
    const queue = await loadQueue()
    setPendingCount(queue.filter(e => !e.failed).length)
    setFailedCount(queue.filter(e => e.failed).length)
  }, [])

  const syncQueue = useCallback(async () => {
    if (!uid || syncingRef.current) return
    const queue = await loadQueue()
    // Only replay entries belonging to this user
    const pending = queue
      .filter(e => !e.failed && entryToOp(e)?.uid === uid)
      .sort((a, b) => ((a.id ?? 0) - (b.id ?? 0)))
    if (pending.length === 0) { await refreshCounts(); return }

    syncingRef.current = true
    setIsSyncing(true)
    try {
      for (const entry of pending) {
        try {
          const op = entryToOp(entry)
          if (!op) { await removeFromQueue(entry.id!); continue } // entrée illisible

          // Entrée héritée sans operation_id : on en génère un et on le PERSISTE
          // AVANT l'appel. Sans ça chaque retry utiliserait un id neuf →
          // l'idempotence ne protégerait plus (doublon).
          let ready = op
          if (!ready.operation_id) {
            ready = { ...op, operation_id: newOpId() }
            await updateQueueEntry({ ...entry, op: ready, action: undefined, payload: undefined })
          }

          const error = await replayOp(ready)
          if (error) throw new Error(error.message)
          await removeFromQueue(entry.id!)
        } catch (err) {
          console.error('[syncQueue] replay failed for entry', entry.id, err)
          const updated = { ...entry, retries: entry.retries + 1 }
          if (updated.retries >= 3) updated.failed = true
          await updateQueueEntry(updated)
        }
      }
    } finally {
      syncingRef.current = false
      setIsSyncing(false)
      await refreshCounts()
      reloadRef.current()
    }
  }, [uid, refreshCounts])

  useEffect(() => {
    refreshCounts()
    if (navigator.onLine) syncQueue()

    const onOnline = () => { setIsOnline(true); syncQueue() }
    const onOffline = () => setIsOnline(false)

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [uid, refreshCounts, syncQueue])

  return { isOnline, pendingCount, failedCount, isSyncing }
}

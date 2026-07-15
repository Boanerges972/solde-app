import { useState, useEffect, useRef, useCallback } from 'react'
import { db } from '../lib/supabase'
import { loadQueue, removeFromQueue, updateQueueEntry } from '../lib/idb'
import { USE_RPC, newOpId, rpcAddTx } from '../lib/rpc'
import type { AppData, Transaction } from '../types'

export interface OfflineSyncState {
  isOnline: boolean
  pendingCount: number
  failedCount: number
  isSyncing: boolean
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
    const pending = queue.filter(e => !e.failed && e.payload.uid === uid).sort((a, b) => ((a.id ?? 0) - (b.id ?? 0)))
    if (pending.length === 0) { await refreshCounts(); return }

    syncingRef.current = true
    setIsSyncing(true)
    try {

      // Fetch current account balances from Supabase
      const { data: accRows, error: accErr } = await db.from('accounts').select('id, balance').eq('user_id', uid)
      if (accErr) throw accErr
      const balMap: Record<string, number> = {}
      for (const a of (accRows || [])) {
        balMap[a.id] = parseFloat(a.balance)
      }

      for (const entry of pending) {
        try {
          const p = entry.payload
          const n = Math.abs(p.amount)

          // Chemin RPC : insert + solde + budget atomiques et IDEMPOTENTS.
          // operation_id figé à la mise en file → un replay après crash ne
          // crée pas de doublon (financial_ops rejette le 2e appel).
          if (USE_RPC) {
            const { error } = await rpcAddTx({
              operationId: p.operation_id || newOpId(),
              accountId: p.account_id, merchant: p.merchant, category: p.category,
              icon: p.icon, amount: -n, txDate: p.tx_date,
            })
            if (error) throw new Error(error.message)
            await removeFromQueue(entry.id!)
            continue
          }

          // ── Chemin legacy (flag off) — non idempotent ──────────
          // Insert transaction
          const { error } = await db.from('transactions').insert({
            user_id: p.uid, merchant: p.merchant, category: p.category,
            icon: p.icon, amount: -n, account_id: p.account_id,
            tx_date: p.tx_date, group_id: p.group_id || null, paid_by: p.paid_by || null,
          })
          if (error) throw error

          // Update account balance
          if (balMap[p.account_id] !== undefined) {
            const newBal = parseFloat((balMap[p.account_id] - n).toFixed(2))
            const { error: balErr } = await db.from('accounts')
              .update({ balance: newBal, free: newBal })
              .eq('id', p.account_id).eq('user_id', uid)
            if (balErr) throw balErr
            balMap[p.account_id] = newBal
          }

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

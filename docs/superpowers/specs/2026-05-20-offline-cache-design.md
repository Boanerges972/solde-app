# Offline Cache — Design Spec

**Date:** 2026-05-20  
**Status:** Approved

## Goal

Enable QDQ PWA to work offline: display cached data when no network, allow adding expenses (`addTx`) while offline, and automatically sync to Supabase when back online.

## Decisions

- **Offline writes:** `addTx` only (deposits, deletes, transfers remain online-only)
- **Conflict resolution:** strict queue replay in order; Supabase recalculates balance server-side
- **Cached data:** accounts + last 50 transactions (minimum — matches current `useData` fetch)
- **Approach:** App-level IndexedDB (no Service Worker changes) — chosen for iOS Safari compatibility

---

## Architecture

### New files
- `src/lib/idb.ts` — IndexedDB wrapper: open DB, CRUD for accounts/transactions/queue
- `src/hooks/useOfflineSync.ts` — online/offline detection, cache population, queue replay

### Modified files
- `src/hooks/useData.ts` — populate IDB after each Supabase load; intercept `addTx` when offline
- `src/App.tsx` — render `<OfflineBanner>` component
- `src/components/OfflineBanner.tsx` — NEW: offline status + pending count indicator

### No new npm dependencies — native IndexedDB API only

---

## IndexedDB Schema

**DB name:** `qdq-offline`  
**Version:** 1

| Store | keyPath | Index | Content |
|-------|---------|-------|---------|
| `accounts` | `id` | — | Account objects (same shape as useData) |
| `transactions` | `id` | — | Last 50 Transaction objects |
| `pending_queue` | `id` (autoIncrement) | — | `{ id, action, payload, timestamp, retries }` |

### Pending queue entry shape
```ts
interface PendingEntry {
  id?: number          // auto-assigned by IDB
  action: 'addTx'
  payload: {
    uid: string
    amount: number
    merchant: string
    category: string
    account_id: string
    tx_date: string
    icon?: string
    note?: string
    group_id?: string
  }
  timestamp: number    // Date.now() when queued
  retries: number      // incremented on each failed replay attempt
  failed?: boolean     // true after 3 failed retries
}
```

---

## `src/lib/idb.ts`

Pure IndexedDB wrapper. No React. Exportable functions:

```ts
openDB(): Promise<IDBDatabase>

// Accounts
saveAccounts(accounts: Account[]): Promise<void>
loadAccounts(): Promise<Account[]>

// Transactions
saveTransactions(txs: Transaction[]): Promise<void>
loadTransactions(): Promise<Transaction[]>

// Pending queue
enqueue(entry: Omit<PendingEntry, 'id'>): Promise<number>
loadQueue(): Promise<PendingEntry[]>
removeFromQueue(id: number): Promise<void>
updateQueueEntry(entry: PendingEntry): Promise<void>
clearQueue(): Promise<void>
```

**Error handling:** all functions wrapped in try/catch — if IDB unavailable, resolve with empty/noop silently.

---

## `src/hooks/useOfflineSync.ts`

```ts
interface OfflineSyncState {
  isOnline: boolean
  pendingCount: number
  failedCount: number
  isSyncing: boolean
}

export function useOfflineSync(
  uid: string | null,
  reloadData: () => void
): OfflineSyncState
```

**Responsibilities:**
1. Listen to `window` `online`/`offline` events → update `isOnline`
2. On `online` event → trigger queue replay
3. Queue replay: load all pending entries → for each (in order by id):
   - Call real Supabase `addTx` with `entry.payload`
   - Success → `removeFromQueue(entry.id)`
   - Failure → increment `entry.retries`; if `retries >= 3` → set `entry.failed = true`; update entry
4. After replay completes → call `reloadData()` to refresh from Supabase
5. Return `{ isOnline, pendingCount, failedCount, isSyncing }`

**Initialization:** reads `navigator.onLine` for initial state.

---

## Changes to `src/hooks/useData.ts`

### After successful Supabase load
```ts
// Save to IDB after every successful fetch
import { saveAccounts, saveTransactions } from '../lib/idb'
// ...after building accs and txs arrays:
saveAccounts(accs)        // fire-and-forget, no await
saveTransactions(txs)
```

### On startup offline
```ts
// If Supabase load fails and navigator.onLine === false:
import { loadAccounts, loadTransactions } from '../lib/idb'
const cachedAccs = await loadAccounts()
const cachedTxs = await loadTransactions()
if (cachedAccs.length > 0) {
  // Reconstruct minimal AppData: reuse accounts/txs as-is, budget defaults
  setData({ accounts: cachedAccs, txs: cachedTxs, budget: 400, spent: 0, week: wk, cats: [], proAccs: [] })
  setLoading(false)
  return
}
// else: show "no data" error
```

### `addTx` offline intercept
```ts
export async function addTx(params) {
  if (!navigator.onLine) {
    // Write to queue
    const id = await enqueue({
      action: 'addTx',
      payload: { uid, ...params },
      timestamp: Date.now(),
      retries: 0,
    })
    // Optimistic local update: add tx with pending:true, deduct from account balance
    const fakeTx: Transaction = {
      id: `pending-${id}`,
      // Map addTx params to Transaction shape (same fields as online path)
      id: `pending-${id}`, acc: params.account_id, account_id: params.account_id,
      tx_date: params.tx_date, amt: -Math.abs(params.amount),
      m: params.merchant, cat: params.category, ico: params.icon || '💳',
      pending: true,
    }
    // applyOptimisticTx: returns new AppData with fakeTx prepended to txs
    // and account.bal decremented by Math.abs(params.amount)
    setData(prev => applyOptimisticTx(prev, fakeTx))
    return { error: null }
  }
  // ...existing online logic
}
```

**`applyOptimisticTx`:** returns new AppData with:
- `txs` prepended with `fakeTx`
- account `bal` decremented by `params.amount`

---

## `src/components/OfflineBanner.tsx`

```ts
interface OfflineBannerProps {
  isOnline: boolean
  pendingCount: number
  failedCount: number
  isSyncing: boolean
  t: Theme
}
```

**Renders nothing** when `isOnline && pendingCount === 0 && failedCount === 0`.

**Offline + pending:**
```
📵 Hors-ligne · {pendingCount} action(s) en attente
```
Background: `t.rD`, text: `t.rose`, padding 10px, full width.

**Online + syncing:**
```
🔄 Synchronisation en cours...
```
Background: `t.mD`, text: `t.mint`.

**Failed entries:**
```
⚠ {failedCount} action(s) non synchronisée(s)
```
Background: `t.rD`, text: `t.rose`, persistent (user must reload to retry).

---

## Transaction pending indicator

In `src/components/TxRow.tsx` (or wherever transactions render):
- If `tx.pending === true`: wrap in container with `opacity: 0.6`, prepend `⏳` to merchant name

The `pending` field must be added to the `Transaction` type as optional: `pending?: boolean`.

---

## Data Flow

```
1. NORMAL LOAD (online)
   Supabase → useData → React state
                      → IDB (saveAccounts + saveTransactions)

2. COLD START OFFLINE
   Supabase fails + navigator.onLine=false
   → loadAccounts/loadTransactions from IDB → React state
   → OfflineBanner: "Hors-ligne"

3. ADD EXPENSE OFFLINE
   addTx() → navigator.onLine=false
   → enqueue() → IDB pending_queue
   → applyOptimisticTx() → React state (⏳ tx appears, balance updated)

4. BACK ONLINE
   window 'online' event → useOfflineSync
   → loadQueue() → replay each entry in order
   → Supabase addTx → success: removeFromQueue
   → reloadData() → fresh Supabase data replaces optimistic state

5. REPLAY FAILURE
   Supabase error → retries++
   if retries >= 3: failed=true
   OfflineBanner: "⚠ action non synchronisée"
```

---

## Error / Edge Cases

| Condition | Behavior |
|-----------|----------|
| IDB not supported | Silent noop — app works online-only, no crash |
| IDB empty + offline at startup | "Pas de données — reconnectez-vous une fois" |
| Replay fails ≤ 2 times | Retry on next `online` event |
| Replay fails 3 times | `failed=true`, persistent warning banner |
| Multiple pending entries | Replayed strictly in ascending `id` order |
| User adds tx while syncing | New entry added to queue, replayed after current sync completes |

---

## What Is NOT in Scope

- Offline support for `addDeposit`, `deleteTx`, `addTransfer`
- Background sync when app is closed (iOS limitation)
- Offline access to Analyse / Abonnements historical data
- Manual retry button for failed entries (future feature)
- Conflict detection beyond strict queue replay

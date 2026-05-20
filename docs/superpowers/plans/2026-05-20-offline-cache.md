# Offline Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable QDQ PWA to work offline — display cached data when no network, allow adding expenses while offline, and automatically sync to Supabase when back online.

**Architecture:** App-level IndexedDB (no Service Worker changes). `src/lib/idb.ts` is a pure IDB wrapper. `useOfflineSync` hook detects online/offline and replays the queue. `useData.ts` populates IDB after each load and intercepts `addTx` when offline. `OfflineBanner` shows status.

**Tech Stack:** React 18, TypeScript 5, native IndexedDB API (no new dependencies)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/types/index.ts` | Modify | Add `pending?: boolean` to `Transaction` |
| `src/lib/idb.ts` | Create | IndexedDB wrapper: accounts, transactions, queue CRUD |
| `src/hooks/useOfflineSync.ts` | Create | Online/offline detection, queue replay |
| `src/hooks/__tests__/useOfflineSync.test.ts` | Create | Tests for `applyOptimisticTx` + queue replay |
| `src/components/OfflineBanner.tsx` | Create | Offline status banner |
| `src/hooks/useData.ts` | Modify | IDB save after load, IDB fallback offline, offline `addTx` |
| `src/components/TxRow.tsx` | Modify | ⏳ indicator for `tx.pending === true` |
| `src/App.tsx` | Modify | Mount `OfflineBanner`, use `useOfflineSync` |

---

### Task 1: Types + `idb.ts`

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/lib/idb.ts`

- [ ] **Step 1: Add `pending` field to Transaction type**

In `src/types/index.ts`, find the `Transaction` interface and add one field:

```ts
export interface Transaction {
  id: string; merchant: string; category: string
  icon: string; amount: number; tx_date: string
  account_id: string; group_id?: string | null; paid_by?: string | null
  // champs calculés
  acc: string; dt: string; m: string; cat: string; ico: string; amt: number
  isTransfer: boolean; isPro: boolean; isProPerso: boolean
  pending?: boolean   // ← ADD THIS LINE
}
```

- [ ] **Step 2: Create `src/lib/idb.ts`**

```ts
import type { Account, Transaction } from '../types'

const DB_NAME = 'qdq-offline'
const DB_VERSION = 1

export interface PendingEntry {
  id?: number
  action: 'addTx'
  payload: {
    uid: string
    merchant: string
    category: string
    icon?: string
    amount: number
    account_id: string
    tx_date: string
    group_id?: string | null
    paid_by?: string | null
  }
  timestamp: number
  retries: number
  failed?: boolean
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('accounts'))
        db.createObjectStore('accounts', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('transactions'))
        db.createObjectStore('transactions', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('pending_queue'))
        db.createObjectStore('pending_queue', { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  })
}

async function clearAndPut(storeName: string, items: unknown[]): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    store.clear()
    items.forEach(item => store.put(item))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function saveAccounts(accounts: Account[]): Promise<void> {
  try { await clearAndPut('accounts', accounts) } catch { /* IDB unavailable */ }
}

export async function loadAccounts(): Promise<Account[]> {
  try { return await getAll<Account>('accounts') } catch { return [] }
}

export async function saveTransactions(txs: Transaction[]): Promise<void> {
  try { await clearAndPut('transactions', txs) } catch { /* IDB unavailable */ }
}

export async function loadTransactions(): Promise<Transaction[]> {
  try { return await getAll<Transaction>('transactions') } catch { return [] }
}

export async function enqueue(entry: Omit<PendingEntry, 'id'>): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending_queue', 'readwrite')
    const req = tx.objectStore('pending_queue').add(entry)
    req.onsuccess = () => resolve(req.result as number)
    req.onerror = () => reject(req.error)
  })
}

export async function loadQueue(): Promise<PendingEntry[]> {
  try { return await getAll<PendingEntry>('pending_queue') } catch { return [] }
}

export async function removeFromQueue(id: number): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('pending_queue', 'readwrite')
      const req = tx.objectStore('pending_queue').delete(id)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch { /* silent */ }
}

export async function updateQueueEntry(entry: PendingEntry): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('pending_queue', 'readwrite')
      const req = tx.objectStore('pending_queue').put(entry)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch { /* silent */ }
}
```

- [ ] **Step 3: Verify TypeScript**

```
cd C:\Users\Administrateur\OneDrive\Bureau\CLAUDE\QDQ\qdq-pwa
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/lib/idb.ts
git commit -m "feat: add pending type + IndexedDB wrapper"
```

---

### Task 2: `useOfflineSync` hook + tests

**Files:**
- Create: `src/hooks/useOfflineSync.ts`
- Create: `src/hooks/__tests__/useOfflineSync.test.ts`

- [ ] **Step 1: Write failing tests first**

Create `src/hooks/__tests__/useOfflineSync.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { applyOptimisticTx } from '../useOfflineSync'
import type { AppData, Transaction } from '../../types'

// ── applyOptimisticTx pure function tests ─────────────────────

const BASE_DATA: AppData = {
  user: 'Test', week: 1, wk: 1,
  budget: 400, spent: 100, rem: 300,
  accounts: [
    { id: 'acc1', name: 'Main', short: 'M', bal: 1000, col: '#0f0',
      type: 'Courant', isPro: false, overdraft: 0, debits: [] }
  ],
  txs: [],
  cats: [],
  persoAccs: [], proAccs: [], persoTxs: [], proTxs: [],
  persoBal: 1000, proBal: 0,
  proMonthSpent: 0, proMonthIncome: 0, proNet: 0,
  monthBudget: 1600, monthSpent: 400, monthIncome: 0, monthRem: 1200,
  monthLabel: 'mai 2026',
}

const FAKE_TX: Transaction = {
  id: 'pending-1', merchant: 'Carrefour', category: 'Courses',
  icon: '🛒', amount: -42, tx_date: '2026-05-20',
  account_id: 'acc1',
  acc: 'acc1', dt: 'today', m: 'Carrefour', cat: 'Courses', ico: '🛒', amt: -42,
  isTransfer: false, isPro: false, isProPerso: false, pending: true,
}

describe('applyOptimisticTx', () => {
  it('prepends pending tx to txs list', () => {
    const result = applyOptimisticTx(BASE_DATA, FAKE_TX)
    expect(result!.txs[0].id).toBe('pending-1')
    expect(result!.txs[0].pending).toBe(true)
  })

  it('deducts amount from matching account balance', () => {
    const result = applyOptimisticTx(BASE_DATA, FAKE_TX)
    expect(result!.accounts[0].bal).toBe(958) // 1000 - 42
  })

  it('updates spent and rem', () => {
    const result = applyOptimisticTx(BASE_DATA, FAKE_TX)
    expect(result!.spent).toBe(142)  // 100 + 42
    expect(result!.rem).toBe(258)    // 300 - 42
  })

  it('returns null if prev is null', () => {
    expect(applyOptimisticTx(null, FAKE_TX)).toBeNull()
  })

  it('does not touch other accounts', () => {
    const data = {
      ...BASE_DATA,
      accounts: [
        ...BASE_DATA.accounts,
        { id: 'acc2', name: 'Savings', short: 'S', bal: 500, col: '#00f',
          type: 'Épargne', isPro: false, overdraft: 0, debits: [] }
      ]
    }
    const result = applyOptimisticTx(data, FAKE_TX)
    expect(result!.accounts.find(a => a.id === 'acc2')!.bal).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```
npx vitest run src/hooks/__tests__/useOfflineSync.test.ts
```

Expected: FAIL — `applyOptimisticTx` not found.

- [ ] **Step 3: Create `src/hooks/useOfflineSync.ts`**

```ts
import { useState, useEffect, useRef, useCallback } from 'react'
import { db } from '../lib/supabase'
import { loadQueue, removeFromQueue, updateQueueEntry } from '../lib/idb'
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
    syncingRef.current = true
    setIsSyncing(true)
    try {
      const queue = await loadQueue()
      const pending = queue.filter(e => !e.failed).sort((a, b) => (a.id! - b.id!))
      if (pending.length === 0) return

      // Fetch current account balances from Supabase
      const { data: accRows } = await db.from('accounts').select('id, balance').eq('user_id', uid)
      const balMap: Record<string, number> = {}
      for (const a of (accRows || [])) {
        balMap[a.id] = parseFloat(a.balance)
      }

      for (const entry of pending) {
        try {
          const p = entry.payload
          const n = Math.abs(p.amount)

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
            await db.from('accounts')
              .update({ balance: newBal, free: newBal })
              .eq('id', p.account_id).eq('user_id', uid)
            balMap[p.account_id] = newBal
          }

          await removeFromQueue(entry.id!)
        } catch {
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
```

- [ ] **Step 4: Run tests — verify 5/5 pass**

```
npx vitest run src/hooks/__tests__/useOfflineSync.test.ts
```

Expected: 5/5 PASS.

- [ ] **Step 5: Run full suite**

```
npx vitest run
```

Expected: no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useOfflineSync.ts src/hooks/__tests__/useOfflineSync.test.ts
git commit -m "feat: add useOfflineSync hook with applyOptimisticTx (5 tests)"
```

---

### Task 3: `OfflineBanner` component

**Files:**
- Create: `src/components/OfflineBanner.tsx`

No unit tests — pure rendering, tested visually.

- [ ] **Step 1: Create `src/components/OfflineBanner.tsx`**

```tsx
import { sp } from '../lib/theme'
import type { Theme } from '../types'

interface OfflineBannerProps {
  isOnline: boolean
  pendingCount: number
  failedCount: number
  isSyncing: boolean
  t: Theme
}

export const OfflineBanner = ({ isOnline, pendingCount, failedCount, isSyncing, t }: OfflineBannerProps) => {
  // Nothing to show
  if (isOnline && pendingCount === 0 && failedCount === 0 && !isSyncing) return null

  let bg = t.rD
  let color = t.rose
  let text = ''

  if (!isOnline) {
    text = pendingCount > 0
      ? `📵 Hors-ligne · ${pendingCount} action${pendingCount > 1 ? 's' : ''} en attente`
      : '📵 Hors-ligne'
  } else if (isSyncing) {
    bg = t.mD; color = t.mint
    text = '🔄 Synchronisation en cours...'
  } else if (failedCount > 0) {
    text = `⚠ ${failedCount} action${failedCount > 1 ? 's' : ''} non synchronisée${failedCount > 1 ? 's' : ''}`
  } else if (pendingCount > 0) {
    bg = t.mD; color = t.mint
    text = `🔄 ${pendingCount} action${pendingCount > 1 ? 's' : ''} en attente de sync`
  }

  if (!text) return null

  return (
    <div style={{
      background: bg, color, padding: '10px 16px',
      fontSize: 13, textAlign: 'center',
      ...sp('o', 500),
    }}>
      {text}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/OfflineBanner.tsx
git commit -m "feat: add OfflineBanner component"
```

---

### Task 4: Modify `useData.ts`

**Files:**
- Modify: `src/hooks/useData.ts`

**Three changes:**
1. After successful load → save to IDB (fire-and-forget)
2. In catch block → IDB fallback when offline
3. In `addTx` → intercept when offline, enqueue + optimistic update

- [ ] **Step 1: Read the file**

Read `src/hooks/useData.ts` to get exact line numbers before editing.

- [ ] **Step 2: Add imports at top of `useData.ts`**

Current import block (lines 1–3):
```ts
import { useState, useEffect, useCallback } from 'react'
import { db } from '../lib/supabase'
import type { AppData, Transaction, Account } from '../types'
```

Replace with:
```ts
import { useState, useEffect, useCallback } from 'react'
import { db } from '../lib/supabase'
import { saveAccounts, saveTransactions, loadAccounts, loadTransactions, enqueue } from '../lib/idb'
import { applyOptimisticTx } from './useOfflineSync'
import type { AppData, Transaction, Account } from '../types'
```

- [ ] **Step 3: Save to IDB after successful Supabase load**

Find the line:
```ts
      setData({
        user: bud.user_name || 'Utilisateur', week: wk, budget, spent, rem: budget - spent,
```

Add these two lines BEFORE `setData(...)`:
```ts
      saveAccounts(accs)        // fire-and-forget — no await
      saveTransactions(txs)     // fire-and-forget — no await
```

- [ ] **Step 4: Add IDB fallback in catch block**

Current catch block (near end of `load`):
```ts
    } catch (e: any) { setError(e.message || 'Erreur') }
    setLoading(false)
```

Replace with:
```ts
    } catch (e: any) {
      if (!navigator.onLine) {
        // Offline fallback: serve cached data from IndexedDB
        try {
          const cachedAccs = await loadAccounts()
          const cachedTxs = await loadTransactions()
          if (cachedAccs.length > 0) {
            const now = new Date()
            const wkFb = Math.ceil((Number(now) - Number(new Date(now.getFullYear(), 0, 1))) / 604800000)
            setData({
              user: 'Utilisateur', week: wkFb, wk: wkFb,
              budget: 400, spent: 0, rem: 400,
              accounts: cachedAccs, txs: cachedTxs, cats: [],
              persoAccs: cachedAccs.filter(a => !a.isPro),
              proAccs: cachedAccs.filter(a => a.isPro),
              persoTxs: cachedTxs.filter(tx => !tx.isPro),
              proTxs: cachedTxs.filter(tx => tx.isPro),
              persoBal: cachedAccs.filter(a => !a.isPro).reduce((s, a) => s + a.bal, 0),
              proBal: cachedAccs.filter(a => a.isPro).reduce((s, a) => s + a.bal, 0),
              proMonthSpent: 0, proMonthIncome: 0, proNet: 0,
              monthBudget: 400, monthSpent: 0, monthIncome: 0, monthRem: 400,
              monthLabel: now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
            })
            setError(null)
          } else {
            setError('Pas de données — reconnectez-vous une fois')
          }
        } catch {
          setError('Pas de données — reconnectez-vous une fois')
        }
      } else {
        setError(e.message || 'Erreur')
      }
    }
    setLoading(false)
```

- [ ] **Step 5: Add offline intercept to `addTx`**

Current `addTx` starts with (inside the callback):
```ts
    const n = Math.abs(parseFloat(String(payload.amount)))
    const wk = Math.ceil(...)
    const { error: e } = await db.from('transactions').insert({
```

Add the offline intercept BEFORE `const n = ...`:
```ts
    // ── Offline path ──────────────────────────────────────────
    if (!navigator.onLine) {
      const today = new Date().toISOString().slice(0, 10)
      const n = Math.abs(parseFloat(String(payload.amount)))
      const pendingId = await enqueue({
        action: 'addTx',
        payload: {
          uid: uid!,
          merchant: payload.merchant,
          category: payload.category,
          icon: payload.icon,
          amount: n,
          account_id: payload.account_id,
          tx_date: today,
          group_id: payload.group_id || null,
          paid_by: payload.paid_by || null,
        },
        timestamp: Date.now(),
        retries: 0,
      })
      const fakeTx: Transaction = {
        id: `pending-${pendingId}`,
        merchant: payload.merchant,
        category: payload.category,
        icon: payload.icon || '💳',
        amount: -n,
        tx_date: today,
        account_id: payload.account_id,
        group_id: payload.group_id || null,
        paid_by: payload.paid_by || null,
        acc: payload.account_id,
        dt: 'today',
        m: payload.merchant,
        cat: payload.category,
        ico: payload.icon || '💳',
        amt: -n,
        isTransfer: false,
        isPro: false,
        isProPerso: false,
        pending: true,
      }
      setData(prev => applyOptimisticTx(prev, fakeTx))
      return null
    }
    // ── Online path (existing code below) ─────────────────────
```

- [ ] **Step 6: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: no errors. If `setData` is not in scope inside `addTx`, check that it is defined at the top of `useData` as `const [data, setData] = useState<AppData | null>(null)` — it IS in scope since addTx is defined inside the same function body.

- [ ] **Step 7: Run full test suite**

```
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useData.ts
git commit -m "feat: useData saves to IDB, offline fallback, offline addTx"
```

---

### Task 5: Pending indicator in `TxRow` + wire `App.tsx`

**Files:**
- Modify: `src/components/TxRow.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add ⏳ indicator in `TxRow.tsx`**

Read `src/components/TxRow.tsx`. Find the merchant name div:
```tsx
          <div style={{ fontSize: 14, ...sp('o', 500), color: t.tx,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
            {tx.m}
          </div>
```

The parent `<div style={{ flex: 1, minWidth: 0 }}>` wraps this. Add `opacity` to the outer row container and prepend ⏳:

Find the outer click container:
```tsx
      <div onClick={() => setExpanded(s => !s)}
        style={{ display: 'flex', alignItems: 'center', gap: 12,
          padding: '11px 0', cursor: 'pointer',
          borderBottom: expanded ? 'none' : '1px solid ' + t.bo + '66' }}>
```

Replace with (add `opacity` for pending):
```tsx
      <div onClick={() => setExpanded(s => !s)}
        style={{ display: 'flex', alignItems: 'center', gap: 12,
          padding: '11px 0', cursor: 'pointer',
          opacity: tx.pending ? 0.6 : 1,
          borderBottom: expanded ? 'none' : '1px solid ' + t.bo + '66' }}>
```

And change the merchant name line from:
```tsx
            {tx.m}
```
to:
```tsx
            {tx.pending ? '⏳ ' : ''}{tx.m}
```

- [ ] **Step 2: Add imports in `App.tsx`**

Find the imports block in `src/App.tsx`. After the existing hook imports, add:
```ts
import { useOfflineSync } from './hooks/useOfflineSync'
import { OfflineBanner } from './components/OfflineBanner'
```

- [ ] **Step 3: Add `useOfflineSync` call in `App.tsx`**

Find this line in `App.tsx`:
```ts
  const { data, loading, error, reload: reloadData, addTx, deleteTx, addTransfer, addDeposit } = useData(session ? session.user.id : null);
```

Add AFTER it:
```ts
  const { isOnline, pendingCount, failedCount, isSyncing } = useOfflineSync(
    session ? session.user.id : null,
    reload
  );
```

Note: `reload` is defined two lines later as `const reload = () => { setAlertDismissed(false); reloadData(); }` — move the `reload` definition to BEFORE the `useOfflineSync` call, or use `reloadData` directly:
```ts
  const { isOnline, pendingCount, failedCount, isSyncing } = useOfflineSync(
    session ? session.user.id : null,
    reloadData
  );
```

- [ ] **Step 4: Add `OfflineBanner` in `App.tsx` JSX**

Find in the return JSX:
```tsx
      <main style={{ height: 'calc(100vh - 64px - env(safe-area-inset-top,0px))', overflowY: 'auto', paddingBottom: 80 }}>
        {renderMain()}
      </main>
```

Add `OfflineBanner` BEFORE `<main>`:
```tsx
      <OfflineBanner isOnline={isOnline} pendingCount={pendingCount} failedCount={failedCount} isSyncing={isSyncing} t={t} />
      <main style={{ height: 'calc(100vh - 64px - env(safe-area-inset-top,0px))', overflowY: 'auto', paddingBottom: 80 }}>
        {renderMain()}
      </main>
```

- [ ] **Step 5: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Run full test suite**

```
npx vitest run
```

Expected: 5 new tests pass, no regressions.

- [ ] **Step 7: Build**

```
npm run build
```

Expected: build succeeds (only chunk size warning, no errors).

- [ ] **Step 8: Commit + push**

```bash
git add src/components/TxRow.tsx src/App.tsx
git commit -m "feat: wire OfflineBanner and pending tx indicator"
git push origin master:main
```

---

## Self-Review

**Spec coverage:**
- ✅ IDB schema: accounts, transactions, pending_queue stores
- ✅ `PendingEntry` interface with all required fields
- ✅ `idb.ts` exports: saveAccounts, loadAccounts, saveTransactions, loadTransactions, enqueue, loadQueue, removeFromQueue, updateQueueEntry
- ✅ `useOfflineSync`: online/offline detection, queue replay in order, retry ≥3 → failed
- ✅ Account balance updated during replay (fetched fresh from Supabase)
- ✅ `applyOptimisticTx`: prepends tx, deducts balance, updates spent/rem
- ✅ `OfflineBanner`: offline/syncing/failed states
- ✅ `useData`: IDB save after load, IDB fallback offline, offline addTx intercept
- ✅ `TxRow`: ⏳ + opacity for pending transactions
- ✅ `App.tsx`: OfflineBanner mounted, useOfflineSync wired
- ✅ Empty IDB at startup offline → "Pas de données — reconnectez-vous une fois"
- ✅ IDB unavailable → silent noop (all functions wrapped in try/catch)

**Placeholder scan:** None found — all code complete.

**Type consistency:**
- `PendingEntry` defined in `idb.ts`, imported where used ✅
- `applyOptimisticTx` exported from `useOfflineSync.ts`, imported in `useData.ts` ✅
- `Transaction.pending?: boolean` added to types, used in TxRow and fakeTx ✅
- `OfflineSyncState` interface matches `useOfflineSync` return and `OfflineBanner` props ✅

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

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
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
    req.onerror = () => { dbPromise = null; reject(req.error) }
  })
  return dbPromise
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
  try { await clearAndPut('accounts', accounts) } catch (e) { console.error('[IDB] saveAccounts failed:', e) }
}

export async function loadAccounts(): Promise<Account[]> {
  try { return await getAll<Account>('accounts') } catch (e) { console.error('[IDB] loadAccounts failed:', e); return [] }
}

export async function saveTransactions(txs: Transaction[]): Promise<void> {
  try { await clearAndPut('transactions', txs) } catch (e) { console.error('[IDB] saveTransactions failed:', e) }
}

export async function loadTransactions(): Promise<Transaction[]> {
  try { return await getAll<Transaction>('transactions') } catch (e) { console.error('[IDB] loadTransactions failed:', e); return [] }
}

export async function enqueue(entry: Omit<PendingEntry, 'id'>): Promise<number | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pending_queue', 'readwrite')
      const req = tx.objectStore('pending_queue').add(entry)
      req.onsuccess = () => resolve(req.result as number)
      req.onerror = () => reject(req.error)
    })
  } catch (e) { console.error('[IDB] enqueue failed:', e); return null }
}

export async function loadQueue(): Promise<PendingEntry[]> {
  try { return await getAll<PendingEntry>('pending_queue') } catch (e) { console.error('[IDB] loadQueue failed:', e); return [] }
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
  } catch (e) { console.error('[IDB] removeFromQueue failed:', e) }
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
  } catch (e) { console.error('[IDB] updateQueueEntry failed:', e) }
}

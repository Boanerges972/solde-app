// ── RPC financières transactionnelles ────────────────────────────────────
// Câblage client des RPC Postgres (migration 20260714_rpc_financial.sql).
// Derrière un feature flag : tant que VITE_USE_RPC ≠ 'true', l'app garde les
// anciens chemins d'écriture (rollback = couper le flag).
//
// Chaque écriture financière porte un operation_id (uuid). Généré une seule
// fois par opération logique ; RÉUTILISÉ tel quel au retry (online ou replay
// offline) → l'idempotence côté base (financial_ops) empêche tout doublon.

import { db } from './supabase'

/** Flag global : RPC actives seulement si VITE_USE_RPC='true'. */
export const USE_RPC = import.meta.env.VITE_USE_RPC === 'true'

/** Nouvel operation_id. crypto.randomUUID dispo en contexte sécurisé (HTTPS/PWA). */
export function newOpId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // Fallback (contextes non sécurisés / vieux navigateurs) — RFC4122 v4.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

type RpcResult = { data: unknown; error: { message: string } | null }

/** Dépense (amount<0) ou entrée (amount>0). amount SIGNÉ. */
export function rpcAddTx(p: {
  operationId: string; accountId: string; merchant: string; category: string
  icon?: string; amount: number; txDate: string; budget?: number
}): Promise<RpcResult> {
  return db.rpc('rpc_add_tx', {
    p_operation_id: p.operationId, p_account_id: p.accountId,
    p_merchant: p.merchant, p_category: p.category, p_icon: p.icon ?? null,
    p_amount: p.amount, p_tx_date: p.txDate, p_budget: p.budget ?? 400,
  }) as unknown as Promise<RpcResult>
}

export function rpcDeleteTx(p: { operationId: string; transactionId: number }): Promise<RpcResult> {
  return db.rpc('rpc_delete_tx', {
    p_operation_id: p.operationId, p_transaction_id: p.transactionId,
  }) as unknown as Promise<RpcResult>
}

export function rpcTransfer(p: {
  operationId: string; fromAccountId: string; toAccountId: string
  amount: number; txDate: string; note?: string
}): Promise<RpcResult> {
  return db.rpc('rpc_transfer', {
    p_operation_id: p.operationId, p_from_account_id: p.fromAccountId,
    p_to_account_id: p.toAccountId, p_amount: p.amount, p_tx_date: p.txDate,
    p_note: p.note ?? null,
  }) as unknown as Promise<RpcResult>
}

export function rpcDeleteTransfer(p: { operationId: string; transferId: string }): Promise<RpcResult> {
  return db.rpc('rpc_delete_transfer', {
    p_operation_id: p.operationId, p_transfer_id: p.transferId,
  }) as unknown as Promise<RpcResult>
}

/** Import en lot : N tx + UN delta. amount SIGNÉ par ligne. */
export function rpcImportBatch(p: {
  operationId: string; accountId: string
  txs: { merchant: string; category: string; icon?: string; amount: number; tx_date: string }[]
}): Promise<RpcResult> {
  return db.rpc('rpc_import_batch', {
    p_operation_id: p.operationId, p_account_id: p.accountId, p_txs: p.txs,
  }) as unknown as Promise<RpcResult>
}

export function rpcSetReserved(p: { accountId: string; reserved: number }): Promise<RpcResult> {
  return db.rpc('rpc_set_reserved', {
    p_account_id: p.accountId, p_reserved: p.reserved,
  }) as unknown as Promise<RpcResult>
}

/** Override manuel du solde (EditAccount). Recalcule free côté base. */
export function rpcSetBalance(p: { accountId: string; balance: number }): Promise<RpcResult> {
  return db.rpc('rpc_set_balance', {
    p_account_id: p.accountId, p_balance: p.balance,
  }) as unknown as Promise<RpcResult>
}

// ── RPC financières transactionnelles ────────────────────────────────────
// Câblage client des RPC Postgres (migration 20260714_rpc_financial.sql).
// SEULE voie d'écriture des soldes : depuis la Section 7 de la migration, le
// client n'a plus le privilège d'UPDATE sur accounts.balance/free/reserved.
// Il n'y a donc PAS de chemin de repli — un feature flag ne serait pas un
// rollback valide (il produirait des écritures partielles : tx insérée, solde
// refusé). Rollback réel = revert du client ET re-GRANT des privilèges.
//
// Chaque écriture financière porte un operation_id (uuid). Généré une seule
// fois par opération logique ; RÉUTILISÉ tel quel au retry (online ou replay
// offline) → l'idempotence côté base (financial_ops) empêche tout doublon.

import { db } from './supabase'

/** Nouvel operation_id. crypto.randomUUID dispo en contexte sécurisé (HTTPS/PWA). */
export function newOpId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // Fallback (contextes non sécurisés / vieux navigateurs) — RFC4122 v4.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/** `code` est présent quand PostgreSQL/PostgREST a RÉPONDU (erreur métier :
 *  validation, droits, contrainte). Son absence = la réponse n'est jamais
 *  arrivée (réseau) — l'opération a PEUT-ÊTRE été commitée côté base. */
export type RpcError = { message: string; code?: string }
type RpcResult = { data: unknown; error: RpcError | null }

/** Vrai si l'échec est réseau (réponse perdue) et non un refus de la base.
 *  Dans ce cas il ne faut JAMAIS rejouer avec un nouvel operation_id : la
 *  première tentative peut avoir commité → double débit. */
export function isNetworkError(e: RpcError | null): boolean {
  return !!e && !e.code
}

/** Dépense (amount<0) ou entrée (amount>0). amount SIGNÉ.
 *  groupId/paidBy : dépense de groupe — la RPC vérifie l'appartenance. */
export function rpcAddTx(p: {
  operationId: string; accountId: string; merchant: string; category: string
  icon?: string; amount: number; txDate: string; budget?: number
  groupId?: string | null; paidBy?: string | null
}): Promise<RpcResult> {
  return db.rpc('rpc_add_tx', {
    p_operation_id: p.operationId, p_account_id: p.accountId,
    p_merchant: p.merchant, p_category: p.category, p_icon: p.icon ?? null,
    p_amount: p.amount, p_tx_date: p.txDate, p_budget: p.budget ?? 400,
    p_group_id: p.groupId ?? null, p_paid_by: p.paidBy ?? null,
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

/** Import CSV/relevé : dédup par multiplicité + solde AUTORITAIRE optionnel.
 *  Si `bankBalance` est fourni (colonne « Solde » du relevé), il POSE le solde
 *  du compte dessus (le relevé fait foi) ; sinon delta comme l'import legacy. */
export function rpcImportCsv(p: {
  operationId: string; accountId: string
  txs: { merchant: string; category: string; icon?: string; amount: number; tx_date: string }[]
  bankBalance: number | null
}): Promise<RpcResult> {
  return db.rpc('rpc_import_csv', {
    p_operation_id: p.operationId, p_account_id: p.accountId, p_txs: p.txs, p_bank_balance: p.bankBalance,
  }) as unknown as Promise<RpcResult>
}

/** Synchro bancaire ATOMIQUE (Open Banking) : dédup EXACTE par external_id
 *  (sans toucher le solde par delta) + pose du solde = snapshot banque, dans une
 *  seule transaction. `bankBalance: null` → le solde n'est pas modifié. */
export function rpcSyncAccount(p: {
  operationId: string; accountId: string
  txs: { merchant: string; category: string; icon?: string; amount: number; tx_date: string; external_id: string }[]
  bankBalance: number | null
}): Promise<RpcResult> {
  return db.rpc('rpc_sync_account', {
    p_operation_id: p.operationId, p_account_id: p.accountId, p_txs: p.txs, p_bank_balance: p.bankBalance,
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

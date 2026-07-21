import { db } from '../supabase'
import { mapEbTransactions, type EbTransaction } from './mapEbTx'
import { rpcImportExt, newOpId } from '../rpc'

export interface BankLink {
  id: string
  aspsp_name: string
  eb_name: string | null
  iban: string | null
  account_id: string | null
  last_sync_at: string | null
  last_tx_date: string | null
  consent_expires: string | null
}

/** Appelle l'Edge Function bank-sync et normalise les erreurs (métier + réseau). */
async function invoke(action: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const { data, error } = await db.functions.invoke('bank-sync', { body: { action, ...extra } })
  if (error) throw new Error(error.message)
  const d = (data || {}) as Record<string, unknown>
  if (d.error) throw new Error(d.detail ? `${d.error} — ${JSON.stringify(d.detail)}` : String(d.error))
  return d
}

export const listLinks = () => invoke('list').then(d => (d.links as BankLink[]) || [])
export const listAspsps = (country = 'FR') =>
  invoke('aspsps', { country }).then(d => (d.aspsps as { name: string; country: string }[]) || [])
export const startAuth = (aspsp_name: string, aspsp_country = 'FR') =>
  invoke('start_auth', { aspsp_name, aspsp_country }).then(d => d.url as string)
export const linkAccount = (link_id: string, account_id: string) =>
  invoke('link', { link_id, account_id })

export interface SyncResult {
  imported: number
  skipped: number
  complete: boolean           // false = fenêtre tronquée, watermark NON avancé
  balance: number | null      // solde banque (référence)
  localBalance: number | null // solde QDQ après import
  ecart: number | null        // banque − QDQ, arrondi au centime
}

/** Tire une liaison, mappe, importe via le RPC blindé, réconcilie le solde.
 *  L'écriture passe EXCLUSIVEMENT par rpcImportBatch (dédup + delta verrouillé) :
 *  la synchro n'ouvre aucune voie d'écriture parallèle. */
export async function syncLink(link_id: string): Promise<SyncResult> {
  const data = await invoke('fetch', { link_id })
  const account_id = data.account_id as string
  const complete = data.complete !== false
  const mapped = mapEbTransactions((data.transactions as EbTransaction[]) || [])

  // La dédup exacte EXIGE un external_id ; Enable Banking en fournit toujours un
  // (transaction_id ∥ entry_reference). Une ligne sans identifiant est écartée
  // plutôt qu'importée sans filet de dédup.
  const withId = mapped.filter(t => t.externalId)
  let imported = 0, skipped = mapped.length - withId.length
  if (withId.length) {
    const rows = withId.map(t => ({
      merchant: t.merchant, category: t.category, icon: t.icon,
      amount: t.amount, tx_date: t.dt, external_id: t.externalId as string,
    }))
    const { data: imp, error } = await rpcImportExt({ operationId: newOpId(), accountId: account_id, txs: rows })
    if (error) throw new Error(error.message)
    const r = imp as { imported?: number; skipped?: number } | null
    imported = r?.imported ?? 0
    skipped += r?.skipped ?? 0
  }

  // Enregistre la synchro. last_tx_date est informatif (la fenêtre de lecture
  // est fixe à 90 j côté serveur) : on transmet la dernière date vue, ou rien
  // si aucune transaction, pour ne pas effacer l'info sur une synchro vide.
  // On ne marque QUE si la pagination était complète.
  if (complete) {
    const maxDt = mapped.reduce((m, t) => (t.dt > m ? t.dt : m), '')
    await invoke('mark_synced', maxDt ? { link_id, last_tx_date: maxDt } : { link_id })
  }

  let localBalance: number | null = null, ecart: number | null = null
  const { data: acc } = await db.from('accounts').select('balance').eq('id', account_id).maybeSingle()
  const bank = (data.balance as number | null)
  if (acc) {
    localBalance = Number((acc as { balance: number }).balance)
    if (bank != null) ecart = Math.round((bank - localBalance) * 100) / 100
  }
  return { imported, skipped, complete, balance: bank, localBalance, ecart }
}

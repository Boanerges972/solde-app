import { db } from '../supabase'
import { mapEbTransactions, type EbTransaction } from './mapEbTx'
import { rpcImportBatch, newOpId } from '../rpc'

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

  let imported = 0, skipped = 0
  if (mapped.length) {
    const rows = mapped.map(t => ({ merchant: t.merchant, category: t.category, icon: t.icon, amount: t.amount, tx_date: t.dt }))
    const { data: imp, error } = await rpcImportBatch({ operationId: newOpId(), accountId: account_id, txs: rows })
    if (error) throw new Error(error.message)
    const r = imp as { imported?: number; skipped?: number } | null
    imported = r?.imported ?? 0
    skipped = r?.skipped ?? 0
  }

  // On n'avance le watermark QUE si la pagination a été complète : sinon des
  // pages non lues antérieures à max(dt) deviendraient définitivement
  // inaccessibles (finding Codex #2). Importer le partiel reste sûr — la dédup
  // ignore les doublons au prochain passage.
  if (complete) {
    const lastDate = mapped.reduce((m, t) => (t.dt > m ? t.dt : m), (data.date_from as string) || '')
    await invoke('mark_synced', { link_id, last_tx_date: lastDate })
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

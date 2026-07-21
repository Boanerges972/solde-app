import { db } from '../supabase'
import { mapEbTransactions, type EbTransaction } from './mapEbTx'
import { rpcSyncAccount, newOpId } from '../rpc'

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
  complete: boolean       // false = fenêtre tronquée
  balance: number | null  // solde banque, qui fait foi
  aligned: boolean        // true = solde QDQ aligné sur la banque
}

/** Tire une liaison et la synchronise en UN appel atomique (rpc_sync_account) :
 *  dédup exacte des transactions + pose du solde = snapshot banque, dans une
 *  seule transaction.
 *
 *  Modèle : la BANQUE fait foi pour le solde. L'import ne touche JAMAIS le solde
 *  par delta (sinon un re-tirage de 90 j s'ajouterait à un solde déjà à jour et
 *  le gonflerait) ; le solde est posé = valeur /balances, atomiquement avec
 *  l'import. Snapshot absent → solde inchangé (jamais de faux). Résultat :
 *  QDQ = banque, exactement, à chaque synchro. */
export async function syncLink(link_id: string): Promise<SyncResult> {
  const data = await invoke('fetch', { link_id })
  const account_id = data.account_id as string
  const complete = data.complete !== false
  const mapped = mapEbTransactions((data.transactions as EbTransaction[]) || [])

  // La dédup exacte EXIGE un external_id ; Enable Banking en fournit toujours un
  // (transaction_id ∥ entry_reference). Une ligne sans identifiant est écartée.
  const withId = mapped.filter(t => t.externalId)
  const rows = withId.map(t => ({
    merchant: t.merchant, category: t.category, icon: t.icon,
    amount: t.amount, tx_date: t.dt, external_id: t.externalId as string,
  }))
  const bank = (data.balance as number | null)

  const { data: res, error } = await rpcSyncAccount({
    operationId: newOpId(), accountId: account_id, txs: rows, bankBalance: bank,
  })
  if (error) throw new Error(error.message)
  const r = res as { imported?: number; skipped?: number; balance_set?: boolean } | null
  const imported = r?.imported ?? 0
  const skipped = (mapped.length - withId.length) + (r?.skipped ?? 0)
  const aligned = !!r?.balance_set

  // Enregistre la synchro. last_tx_date est informatif (fenêtre fixe à 90 j) ;
  // on ne marque QUE si la pagination était complète, et on n'écrase pas la
  // dernière date connue sur une synchro vide.
  if (complete) {
    const maxDt = mapped.reduce((m, t) => (t.dt > m ? t.dt : m), '')
    await invoke('mark_synced', maxDt ? { link_id, last_tx_date: maxDt } : { link_id })
  }

  return { imported, skipped, complete, balance: bank, aligned }
}

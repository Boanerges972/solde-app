import { db } from './supabase'
import type { Transaction } from '../types'

/** Taille de page. Supabase tronque silencieusement à sa limite serveur
 *  (~1000 lignes) : sans pagination, les transactions manquantes seraient lues
 *  comme des mois « moins dépensés » et gonfleraient les reports de budget. */
const PAGE = 1000

export interface TxWindow {
  txs: Transaction[]
  /** true seulement si TOUTE la fenêtre a été chargée sans erreur.
   *  Un appelant qui calcule un report DOIT le vérifier : un échec réseau
   *  renvoyé comme liste vide produirait le report maximal fictif. */
  complete: boolean
}

/** Charge toutes les transactions d'un utilisateur depuis `sinceDate` (incluse),
 *  en paginant jusqu'à épuisement. Ordre stable pour que la pagination ne
 *  saute ni ne duplique de ligne. */
export async function fetchTxsSince(uid: string, sinceDate: string): Promise<TxWindow> {
  const out: Transaction[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('transactions')
      .select('id,amount,tx_date,category,merchant,account_id')
      .eq('user_id', uid)
      .gte('tx_date', sinceDate)
      .order('tx_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)

    // Une erreur ne doit JAMAIS se confondre avec « aucune transaction ».
    if (error) { console.error('[fetchTxsSince]', error); return { txs: out, complete: false } }

    const page = (data || []) as Record<string, unknown>[]
    out.push(...page.map(r => ({
      id: String(r.id),
      tx_date: r.tx_date as string,
      amt: parseFloat(String(r.amount)),
      cat: (r.category as string) || '',
      m: (r.merchant as string) || '',
      acc: (r.account_id as string) || '',
    }) as Transaction))

    if (page.length < PAGE) return { txs: out, complete: true }
  }
}

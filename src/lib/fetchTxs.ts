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

/** Charge toutes les transactions d'un utilisateur depuis `sinceDate` (incluse).
 *
 *  Pagination KEYSET sur (tx_date, id) et non par offset : une insertion
 *  antidatée ou une suppression entre deux pages décalerait les offsets et
 *  ferait sauter ou dupliquer une transaction — donc fausser un solde de
 *  budget. Le curseur suit la dernière ligne lue, il est insensible aux
 *  décalages. `id` départage les ex æquo de date (ordre total déterministe).
 *
 *  Garde-fou : la boucle s'arrête aussi sur un curseur qui n'avance pas. */
export async function fetchTxsSince(uid: string, sinceDate: string): Promise<TxWindow> {
  const out: Transaction[] = []
  let lastDate: string | null = null
  let lastId: number | null = null

  // Nombre attendu, mesuré côté serveur. Il sert de preuve d'exhaustivité :
  // une insertion antidatée concurrente (le replay de l'outbox, par exemple)
  // atterrit AVANT le curseur et serait manquée sans jamais être détectée — la
  // pagination keyset résiste aux décalages, pas à ça. Si le compte final ne
  // correspond pas, on renvoie `complete:false` : aucun report ne sera calculé
  // sur une fenêtre dont on ne peut pas prouver qu'elle est entière.
  const { count, error: countErr } = await db
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', uid)
    .gte('tx_date', sinceDate)
  if (countErr) { console.error('[fetchTxsSince] count', countErr); return { txs: out, complete: false } }

  for (let guard = 0; guard < 500; guard++) {
    let q = db
      .from('transactions')
      .select('id,amount,tx_date,category,merchant,account_id,icon')
      .eq('user_id', uid)
      .gte('tx_date', sinceDate)
      .order('tx_date', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE)

    // Reprend STRICTEMENT après la dernière ligne lue.
    if (lastDate !== null && lastId !== null) {
      q = q.or(`tx_date.gt.${lastDate},and(tx_date.eq.${lastDate},id.gt.${lastId})`)
    }

    const { data, error } = await q
    // Une erreur ne doit JAMAIS se confondre avec « aucune transaction » :
    // un historique vide produirait le report maximal fictif.
    if (error) { console.error('[fetchTxsSince]', error); return { txs: out, complete: false } }

    const page = (data || []) as Record<string, unknown>[]
    // SEULE une page vide prouve l'épuisement. `page.length < PAGE` ne prouve
    // rien : PostgREST plafonne silencieusement une réponse à son `max_rows`,
    // qui peut être inférieur à PAGE — on s'arrêterait alors sur un historique
    // tronqué en le déclarant complet.
    if (page.length === 0) {
      const complete = count === null || out.length === count
      if (!complete) console.error('[fetchTxsSince] fenêtre incomplète', { attendu: count, lu: out.length })
      return { txs: out, complete }
    }

    out.push(...page.map(r => ({
      id: String(r.id),
      tx_date: r.tx_date as string,
      amt: parseFloat(String(r.amount)),
      cat: (r.category as string) || '',
      m: (r.merchant as string) || '',
      acc: (r.account_id as string) || '',
      ico: (r.icon as string) || '💳',
    }) as Transaction))

    const last = page[page.length - 1]
    const nextDate = last.tx_date as string
    const nextId = Number(last.id)
    // Curseur qui n'avance pas : on préfère renvoyer incomplet que boucler.
    if (nextDate === lastDate && nextId === lastId) return { txs: out, complete: false }
    lastDate = nextDate
    lastId = nextId
    // Pas de sortie sur `page.length < PAGE` : voir ci-dessus, elle mentirait.
    // On boucle jusqu'à une page vide, au prix d'une requête supplémentaire.
  }
  return { txs: out, complete: false } // garde-fou atteint
}

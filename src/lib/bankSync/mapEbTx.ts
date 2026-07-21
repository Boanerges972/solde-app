import type { ParsedTx } from '../parsers/ofx'
import { catFromLabel, iconForCat } from '../parsers/categories'

/** Transaction telle que renvoyée par Enable Banking (GET /accounts/{uid}/transactions).
 *  Seuls les champs exploités sont typés ; le reste de la charge est ignoré. */
export interface EbTransaction {
  transaction_amount: { currency: string; amount: string }
  // Typé large : une valeur hors CRDT/DBIT/DBTO doit pouvoir arriver et être rejetée.
  credit_debit_indicator: 'CRDT' | 'DBIT' | 'DBTO' | string
  booking_date?: string
  value_date?: string
  transaction_date?: string
  creditor?: { name?: string }
  debtor?: { name?: string }
  remittance_information?: string[]
  transaction_id?: string
  entry_reference?: string
}

/** ParsedTx + identifiant externe stable, pour une dédup exacte (phase 2). */
export interface ParsedTxExt extends ParsedTx {
  externalId?: string
}

/** Parse STRICT d'un montant : rejette « 12.34EUR », « », « abc ».
 *  parseFloat serait trop permissif et laisserait passer une écriture plausible
 *  mais fausse (finding Codex). */
function strictAmount(raw: string | undefined): number | null {
  const s = (raw ?? '').trim()
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Une transaction Enable Banking → ParsedTx du pipeline d'import, ou `null`
 *  si elle est inexploitable (date/montant/devise/indicateur invalides).
 *
 *  Choix de conception :
 *  - Le SENS vient de `credit_debit_indicator`, pas du signe du montant : les
 *    ASPSP ne sont pas cohérents sur le signe. On part de la valeur absolue et
 *    on applique l'indicateur. CRDT → crédit, DBIT/DBTO → débit ; toute autre
 *    valeur est REJETÉE (ne jamais deviner le sens d'un mouvement d'argent).
 *  - La DEVISE doit correspondre à celle attendue (défaut EUR) : importer
 *    « 100 USD » comme 100 € fausserait le solde. Non concordant → rejeté.
 *  - La DATE est calendaire (YYYY-MM-DD) : Enable Banking renvoie déjà des dates
 *    sans heure, aucun risque de bascule UTC ici. booking_date fait foi.
 *  - Le MARCHAND est la contrepartie : pour un débit c'est le créditeur (chez
 *    qui on paie), pour un crédit le débiteur (qui nous paie). */
export function mapEbTx(tx: EbTransaction, expectedCurrency = 'EUR'): ParsedTxExt | null {
  const dt = tx.booking_date || tx.value_date || tx.transaction_date
  if (!dt) return null

  const cur = tx.transaction_amount?.currency
  if (cur && cur !== expectedCurrency) return null

  const raw = strictAmount(tx.transaction_amount?.amount)
  if (raw === null || raw === 0) return null

  const ind = tx.credit_debit_indicator
  const isDebit = ind === 'DBIT' || ind === 'DBTO'
  const isCredit = ind === 'CRDT'
  if (!isDebit && !isCredit) return null // sens inconnu → on refuse
  const amount = Math.abs(raw) * (isDebit ? -1 : 1)

  const counterparty = isDebit ? tx.creditor?.name : tx.debtor?.name
  const remittance = (tx.remittance_information || [])
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  const merchant = (counterparty?.trim() || remittance || 'Opération').trim()

  const category = catFromLabel(merchant)

  return {
    dt,
    merchant,
    category,
    icon: iconForCat(category),
    amount,
    externalId: tx.transaction_id || tx.entry_reference || undefined,
  }
}

/** Mappe une liste et écarte les lignes inexploitables. */
export function mapEbTransactions(txs: EbTransaction[]): ParsedTxExt[] {
  const out: ParsedTxExt[] = []
  for (const tx of txs) {
    const m = mapEbTx(tx)
    if (m) out.push(m)
  }
  return out
}

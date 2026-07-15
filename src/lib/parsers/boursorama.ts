import { catFromLabel, iconForCat } from './categories'
import { parseAmountFR, splitCsvLine } from './amount'
import type { ParsedTx } from './ofx'

/**
 * Parse un export CSV Boursorama.
 * Colonnes détectées PAR NOM d'en-tête (robuste aux évolutions de format :
 * l'export récent a inséré suggestedLabel/category/categoryParent, décalant
 * `amount` de l'index 5 à 6). BOM UTF-8 en tête retiré. Montant type
 * "2 880,88" (espace milliers + virgule) géré par parseAmountFR.
 */
export function parseBoursorama(text: string): ParsedTx[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s)
  const header = splitCsvLine(lines[0]).map(h => stripBom(h).trim().toLowerCase())
  let iDate = header.indexOf('dateop')
  let iLabel = header.indexOf('label')
  let iAmount = header.indexOf('amount')

  // Repli sur positions historiques si en-tête non reconnu.
  if (iDate < 0) iDate = 0
  if (iLabel < 0) iLabel = 2
  if (iAmount < 0) iAmount = 5

  const txs: ParsedTx[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i])
    if (cols.length <= iAmount) continue

    const dateRaw = (cols[iDate] || '').trim()
    const libelle = (cols[iLabel] || '').replace(/^["'\s]+|["'\s]+$/g, '').trim()
    const amount = parseAmountFR(cols[iAmount] || '')
    if (!dateRaw || !libelle || isNaN(amount) || amount === 0) continue

    const category = catFromLabel(libelle)
    txs.push({
      dt: dateRaw.slice(0, 10),
      merchant: libelle.slice(0, 80),
      category,
      icon: iconForCat(category),
      amount,
    })
  }
  return txs
}

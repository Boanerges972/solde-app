import { catFromLabel, iconForCat } from './categories'
import type { ParsedTx } from './ofx'

export function parseBoursorama(text: string): ParsedTx[] {
  const lines = text.split('\n').filter(Boolean)
  const txs: ParsedTx[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';')
    if (cols.length < 6) continue

    const dateRaw = cols[0].trim()         // YYYY-MM-DD
    const labelRaw = cols[2].trim()        // " LABEL" with quotes/spaces
    const amtRaw   = cols[5].trim().replace(',', '.').replace('+', '')

    const libelle = labelRaw.replace(/^["'\s]+|["'\s]+$/g, '').trim()
    if (!dateRaw || !libelle || !amtRaw) continue

    const amount = parseFloat(amtRaw)
    if (isNaN(amount)) continue

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

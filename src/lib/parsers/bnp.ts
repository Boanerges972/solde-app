import { catFromLabel, iconForCat } from './categories'
import type { ParsedTx } from './ofx'

export function parseBNP(text: string): ParsedTx[] {
  const lines = text.split('\n').filter(Boolean)
  const txs: ParsedTx[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';')
    if (cols.length < 3) continue

    const dateRaw = cols[0].trim()   // DD/MM/YYYY
    const libelle = cols[1].trim()
    const amtRaw  = cols[2].trim().replace(',', '.').replace('+', '')

    if (!dateRaw || !libelle || !amtRaw) continue

    const parts = dateRaw.split('/')
    if (parts.length < 3) continue
    const [d, m, y] = parts
    if (!d || !m || !y) continue

    const amount = parseFloat(amtRaw)
    if (isNaN(amount)) continue

    const category = catFromLabel(libelle)
    txs.push({
      dt: `${y}-${m}-${d}`,
      merchant: libelle.slice(0, 80),
      category,
      icon: iconForCat(category),
      amount,
    })
  }

  return txs
}

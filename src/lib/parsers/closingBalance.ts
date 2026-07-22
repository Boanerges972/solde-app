import { parseAmountFR, splitCsvLine } from './amount'

const stripQuotes = (s: string) => s.trim().replace(/^["']|["']$/g, '')

/** Solde de clôture d'un relevé + LA DATE à laquelle il s'applique. */
export interface ClosingBalance {
  balance: number
  date: string // YYYY-MM-DD, date de l'opération portant ce solde
}

/** DD/MM/YYYY ou YYYY-MM-DD → YYYY-MM-DD, ou null. */
function toIso(raw: string): string | null {
  const s = (raw || '').trim()
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

/** Solde de clôture d'un relevé CSV : la valeur de la colonne « Solde » sur la
 *  ligne à la DATE la plus récente, AVEC cette date.
 *
 *  Renvoie `null` — et l'appelant retombe alors sur l'accumulation par delta —
 *  si l'une de ces conditions manque :
 *   - pas de colonne « Solde » ;
 *   - pas de colonne « Date » exploitable (on ne DEVINE pas une date) ;
 *   - la ligne la plus récente n'a pas de solde lisible.
 *  On ne renvoie JAMAIS le solde d'une ligne ancienne comme s'il était récent :
 *  la date accompagne toujours la valeur, l'appelant vérifie sa fraîcheur. */
export function extractClosingBalance(text: string): ClosingBalance | null {
  const clean = (text || '').replace(/^﻿/, '')
  const lines = clean.split('\n').map(l => l.trimEnd()).filter(Boolean)
  if (lines.length < 2) return null

  const header = splitCsvLine(lines[0]).map(h => stripQuotes(h).toLowerCase())
  const soldeIdx = header.findIndex(h => h.includes('solde'))
  const dateIdx = header.findIndex(h => h.includes('date'))
  if (soldeIdx < 0 || dateIdx < 0) return null

  let best: ClosingBalance | null = null
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]).map(stripQuotes)
    if (cols.length <= Math.max(soldeIdx, dateIdx)) continue
    const iso = toIso(cols[dateIdx])
    if (!iso) continue
    const bal = parseAmountFR(cols[soldeIdx])
    if (isNaN(bal)) continue
    // `>=` : à date égale, la dernière ligne physique du jour l'emporte
    // (relevés chronologiques). C'est le solde de fin de journée.
    if (!best || iso >= best.date) best = { balance: bal, date: iso }
  }
  return best
}

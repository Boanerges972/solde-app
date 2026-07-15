// ── Normalisation des montants bancaires FR ──────────────────────────────
// Gère : virgule décimale, espace/NBSP/fine milliers, guillemets, signe +,
// et les deux séparateurs mélangés (ex: "1.234,56" vs "1,234.56").

/** Convertit un montant texte (formats FR/banques) en nombre. NaN si invalide. */
export function parseAmountFR(raw: string | number | null | undefined): number {
  if (raw == null) return NaN
  if (typeof raw === 'number') return raw
  let s = String(raw).trim().replace(/^["']+|["']+$/g, '').trim()
  s = s.replace(/\s/g, '').replace(/\+/g, '') // \s couvre espace, NBSP, fine
  if (!s) return NaN
  const hasComma = s.includes(','), hasDot = s.includes('.')
  if (hasComma && hasDot) {
    // Le séparateur le plus à DROITE est le décimal ; l'autre = milliers.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (hasComma) {
    s = s.replace(',', '.')
  }
  // Cas "seulement point" ou "chiffres seuls" : laissé tel quel (point décimal).
  return parseFloat(s)
}

/** Découpe une ligne CSV en respectant les champs entre guillemets. */
export function splitCsvLine(line: string, delim = ';'): string[] {
  const out: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ } // guillemet échappé ""
      else inQ = !inQ
    } else if (c === delim && !inQ) {
      out.push(cur); cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out
}

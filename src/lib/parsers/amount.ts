// ── Normalisation des montants bancaires FR ──────────────────────────────
// Gère : virgule décimale, espace/NBSP/fine milliers, guillemets, signe +,
// et les deux séparateurs mélangés (ex: "1.234,56" vs "1,234.56").

/** Convertit un montant texte (formats FR/banques) en nombre. NaN si invalide.
 *  Gère : signe en tête OU en fin ("123,45-"), format comptable "(1 234,56)",
 *  milliers en espace/NBSP/apostrophe, virgule ou point décimal.
 *  N'utilise PAS parseFloat : celui-ci parse un PRÉFIXE et accepterait
 *  silencieusement "12abc" (→12) ou "123,45-" (→+123.45, signe inversé !). */
export function parseAmountFR(raw: string | number | null | undefined): number {
  if (raw == null) return NaN
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN
  let s = String(raw).trim().replace(/^["']+|["']+$/g, '').trim()
  if (!s) return NaN

  let neg = false
  // Format comptable : (1 234,56) = négatif
  const paren = s.match(/^\((.*)\)$/)
  if (paren) { neg = true; s = paren[1].trim() }
  // Signe terminal : "123,45-" (certains exports bancaires)
  const trail = s.match(/^(.*?)\s*([+-])$/)
  if (trail) { s = trail[1].trim(); if (trail[2] === '-') neg = !neg }
  // Signe en tête
  const lead = s.match(/^([+-])\s*(.*)$/)
  if (lead) { s = lead[2].trim(); if (lead[1] === '-') neg = !neg }

  // Séparateurs de milliers : espace, NBSP, fine, apostrophe (format suisse)
  s = s.replace(/[\s'’]/g, '')
  if (!s) return NaN

  const hasComma = s.includes(','), hasDot = s.includes('.')
  if (hasComma && hasDot) {
    // Le séparateur le plus à DROITE est le décimal ; l'autre = milliers.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(/,/g, '.')
    else s = s.replace(/,/g, '')
  } else if (hasComma) {
    // Dernière virgule = décimale ; les précédentes = milliers.
    const i = s.lastIndexOf(',')
    s = s.slice(0, i).replace(/,/g, '') + '.' + s.slice(i + 1)
  }

  // Valide la chaîne ENTIÈRE — rejette tout résidu ("12abc", "1..2", "").
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN
  const n = Number(s)
  if (!Number.isFinite(n)) return NaN
  return neg ? -n : n
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

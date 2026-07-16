// ── Dates calendaires LOCALES ────────────────────────────────────────────
//
// `toISOString()` convertit en UTC. En Guyane (UTC−3), après 21 h locales, il
// renvoie déjà la date du LENDEMAIN — et le dernier jour du mois, le MOIS
// suivant. Un rapport mensuel ou un insight calculé ainsi bascule de période
// un soir sur deux.
//
// `tx_date` est une date calendaire (pas un instant) : tout ce qui la compare
// doit rester en calendrier local.

/** Date calendaire locale au format YYYY-MM-DD. */
export const isoLocal = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Mois calendaire local au format YYYY-MM. */
export const monthLocal = (d: Date): string => isoLocal(d).slice(0, 7)

/** Jour local décalé de `n` jours. Passe par le calendrier plutôt que par
 *  `+ n * 86400000` : l'arithmétique en millisecondes dérive d'une heure aux
 *  changements d'heure. Midi évite les bords de journée. */
export const addDaysLocal = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12, 0, 0)

/** Mois local décalé de `n` mois (YYYY-MM en entrée et sortie). */
export const addMonths = (month: string, n: number): string => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return monthLocal(d)
}

/** Date calendaire valide (rejette '', 'today', un libellé d'affichage…). */
export const isCalendarDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s)

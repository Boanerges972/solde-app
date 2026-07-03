export interface MerchantRule {
  id: string
  pattern: string
  category: string
}

/** Normalise un marchand en pattern de règle : uppercase + trim. */
export function normalizePattern(merchant: string): string {
  return merchant.trim().toUpperCase()
}

/** Première règle dont le pattern est contenu dans le label (insensible à la casse).
 *  En cas de matches multiples, le pattern le plus long (plus spécifique) gagne. */
export function matchRule(label: string, rules: MerchantRule[]): MerchantRule | null {
  if (!label) return null
  const up = label.toUpperCase()
  const matches = rules.filter(r => r.pattern && up.includes(r.pattern.toUpperCase()))
  if (matches.length === 0) return null
  return matches.sort((a, b) => b.pattern.length - a.pattern.length)[0]
}

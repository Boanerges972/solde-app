// ─────────────────────────────────────────────────────────────
// Direction visuelle V3 — « hybride indigo + menthe d'accent »
// Palette validée avec l'agence (Lots 1→2). Source unique de vérité.
//
// ⚠️ PRÉ-CÂBLAGE : ce module n'est PAS encore branché sur l'UI.
// Le jour du switch, on remplacera `T` (src/lib/theme.ts) par `TV3`
// ci-dessous — les composants consomment déjà la forme `Theme`,
// donc le basculement est quasi instantané.
//
// Règle d'accent (non négociable) :
//   • indigo  = structure & actions (boutons, nav, identité)
//   • menthe  = UNIQUEMENT le positif (gains, épargne, succès)
//               → fill vif `mintFill`, texte assombri `mintText` (AA)
//   • rouge   = sorties / dépassements
//   • violet  = accent décoratif, jamais porteur de sens
// ─────────────────────────────────────────────────────────────
import type { Theme } from '../types'

/** Valeurs brutes de marque (indépendantes du thème clair/sombre).
 *  Alignées sur le handoff agence (tokens/color.json), avec 2 corrections
 *  contraste appliquées côté code (voir `dangerBtn` et `mintTextLight`). */
export const BRAND = {
  indigo: '#4F46E5',   // brand.primary.500 — structure & actions
  indigoHover: '#4338CA', // brand.primary.600
  violet: '#7C3AED',   // accent décoratif
  mintFill: '#10E8C0', // menthe vif — fills, icônes, gros éléments
  // menthe texte sur fond clair — assombrie pour l'AA réel (5.47:1). L'agence a
  // fini par retenir la même valeur ; l'ancien #0BAF8C donnait 2.8:1 (non conforme).
  mintTextLight: '#0F766E',
  // Sémantiques (distinctes de la menthe pour ne pas confondre « validé » et « marque »)
  success: '#22C55E',
  alert: '#F59E0B',
  danger: '#EF4444',
  // FIX contraste : blanc sur #EF4444 = 3.76:1 (échec). Fond des boutons danger foncé.
  dangerBtn: '#DC2626', // brand danger-600 — blanc dessus ≥ 4.5:1
  // FIX contraste : #EF4444 en TEXTE sur blanc = 3.76:1 (échec). Rouge foncé pour texte.
  dangerTextLight: '#B91C1C', // danger-700 — sur blanc ≈ 5.9:1
  info: '#3B82F6',
  neutral: '#64748B',
} as const

export const TV3: { light: Theme; dark: Theme } = {
  light: {
    // theme.light.surface / text / border (valeurs exactes color.json)
    bg: '#F8FAFC', card: '#FFFFFF', el: '#F1F5F9',
    tx: '#0F172A', sub: '#475569', muted: '#64748B',
    bo: '#E2E8F0',
    primary: BRAND.indigo, secondary: BRAND.violet,
    mint: BRAND.mintFill, rose: BRAND.danger, amber: BRAND.alert,
    mD: 'rgba(16,232,192,0.10)', rD: 'rgba(239,68,68,0.10)', aD: 'rgba(245,158,11,0.12)',
    rB: 'rgba(239,68,68,0.22)',
    mintFill: BRAND.mintFill, mintText: BRAND.mintTextLight,
    indigo: BRAND.indigo, violet: BRAND.violet, dangerBtn: BRAND.dangerBtn,
    dangerText: BRAND.dangerTextLight,
    success: BRAND.success, alert: BRAND.alert, danger: BRAND.danger,
    info: BRAND.info, neutral: BRAND.neutral,
  },
  dark: {
    bg: '#0B1020', card: '#111827', el: '#1E293B',
    tx: '#F8FAFC', sub: '#CBD5E1', muted: '#94A3B8',
    bo: '#334155',
    primary: '#6366F1', secondary: BRAND.violet, // indigo plus clair pour le sombre
    mint: BRAND.mintFill, rose: '#F87171', amber: '#FBBF24',
    mD: 'rgba(16,232,192,0.16)', rD: 'rgba(248,113,113,0.16)', aD: 'rgba(251,191,36,0.16)',
    rB: 'rgba(248,113,113,0.28)',
    // Sur fond sombre, la menthe vive passe le contraste en texte : mintText = mintFill
    mintFill: BRAND.mintFill, mintText: BRAND.mintFill,
    indigo: '#6366F1', violet: BRAND.violet, dangerBtn: '#DC2626',
    dangerText: '#F87171', // rouge clair — texte sur fond sombre
    success: '#4ADE80', alert: '#FBBF24', danger: '#F87171',
    info: '#7DA2F2', neutral: '#94A3B8',
  },
}

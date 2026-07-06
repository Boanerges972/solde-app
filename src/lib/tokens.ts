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

/** Valeurs brutes de marque (indépendantes du thème clair/sombre). */
export const BRAND = {
  indigo: '#4F46E5',   // structure & actions
  violet: '#7C3AED',   // accent décoratif
  mintFill: '#10E8C0', // menthe vif — fills, icônes, gros éléments
  // menthe texte sur fond clair — DOIT être assombrie pour l'AA réel.
  // (La valeur #0BAF8C proposée par l'agence ne donne que ~2.8:1 sur blanc — non conforme.)
  mintTextLight: '#0F766E', // vérifié ≥ 4.5:1 sur blanc
  // Sémantiques (distinctes de l'accent menthe pour ne pas confondre « validé » et « marque »)
  success: '#22C55E',
  alert: '#F5A524',
  danger: '#EF4444',
  info: '#5B8DEF',
  neutral: '#64748B',
} as const

export const TV3: { light: Theme; dark: Theme } = {
  light: {
    bg: '#F8FAFC', card: '#FFFFFF', el: '#F1F5F9',
    tx: '#0F172A', sub: '#64748B', muted: '#94A3B8',
    bo: '#E2E8F0',
    // Compat clés existantes : `primary` = indigo (marque/action), `mint` = menthe vif
    primary: BRAND.indigo, secondary: BRAND.violet,
    mint: BRAND.mintFill, rose: BRAND.danger, amber: BRAND.alert,
    mD: 'rgba(16,232,192,0.10)', rD: 'rgba(239,68,68,0.10)', aD: 'rgba(245,165,36,0.12)',
    rB: 'rgba(239,68,68,0.22)',
    // Tokens V3
    mintFill: BRAND.mintFill, mintText: BRAND.mintTextLight,
    indigo: BRAND.indigo, violet: BRAND.violet,
    success: BRAND.success, alert: BRAND.alert, danger: BRAND.danger,
    info: BRAND.info, neutral: BRAND.neutral,
  },
  dark: {
    bg: '#0E1524', card: '#1E293B', el: '#273449',
    tx: '#F1F5F9', sub: '#94A3B8', muted: '#64748B',
    bo: 'rgba(255,255,255,0.08)',
    primary: '#6366F1', secondary: BRAND.violet, // indigo légèrement plus clair pour le sombre
    mint: BRAND.mintFill, rose: '#F87171', amber: '#FBBF24',
    mD: 'rgba(16,232,192,0.16)', rD: 'rgba(248,113,113,0.16)', aD: 'rgba(251,191,36,0.16)',
    rB: 'rgba(248,113,113,0.28)',
    // Sur fond sombre, la menthe vive passe le contraste en texte : mintText = mintFill
    mintFill: BRAND.mintFill, mintText: BRAND.mintFill,
    indigo: '#6366F1', violet: BRAND.violet,
    success: '#4ADE80', alert: '#FBBF24', danger: '#F87171',
    info: '#7DA2F2', neutral: '#94A3B8',
  },
}

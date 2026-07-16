// ── Traduction des erreurs base/réseau en messages utilisateur ───────────
// Les messages PostgreSQL bruts exposent des noms de fonctions, de contraintes
// et de colonnes, et n'indiquent pas quoi faire. Le détail technique part dans
// la console (diagnostic) ; l'UI ne reçoit qu'un message actionnable.

export type AppError = { message: string; code?: string } | null | undefined

/** Message générique quand aucune règle ne correspond. */
const FALLBACK = 'Une erreur est survenue. Réessaie.'

/** Réseau : la base n'a jamais répondu (pas de code). L'opération est mise en
 *  file et repartira seule — le message doit rassurer, pas alarmer. */
const NETWORK = 'Connexion perdue — l\'opération repartira automatiquement.'

/** Règles ordonnées : 1re correspondance gagne. Basées sur les `raise` des RPC
 *  (voir supabase/migrations/20260714_rpc_financial.sql). */
const RULES: [RegExp, string][] = [
  [/authentication required|jwt|token|expired|row-level security/i,
    'Session expirée — reconnecte-toi puis réessaie.'],
  [/account not found or forbidden/i,
    'Compte introuvable ou inaccessible.'],
  [/transaction not found or forbidden/i,
    'Transaction introuvable — elle a peut-être déjà été supprimée.'],
  [/not a member of this group/i,
    'Tu ne fais pas partie de ce groupe.'],
  [/paid_by must be a member/i,
    'La personne qui a payé doit être membre du groupe.'],
  [/use rpc_delete_transfer|internal transfers/i,
    'Un virement se supprime en entier, pas une seule de ses deux lignes.'],
  [/transfer accounts must be different/i,
    'Choisis deux comptes différents.'],
  [/invalid transfer structure|not conservative/i,
    'Ce virement est incohérent et n\'a pas été touché. Signale-le.'],
  [/transfer not found/i,
    'Virement introuvable — il a peut-être déjà été supprimé.'],
  [/transfer amount invalid/i,
    'Montant de virement invalide (positif, 2 décimales maximum).'],
  [/amount invalid|balance invalid|reserved invalid/i,
    'Montant invalide (2 décimales maximum).'],
  [/stored amount invalid/i,
    'Cette transaction a un montant anormal : le solde n\'a pas été modifié.'],
  [/imported row invalid/i,
    'Le fichier contient une ligne invalide (montant ou date).'],
  [/batch too large/i,
    'Fichier trop volumineux (2000 lignes maximum) — découpe-le.'],
  [/operation_id already used/i,
    'Cette opération a déjà été enregistrée.'],
  [/permission denied/i,
    'Action non autorisée.'],
  [/duplicate key|unique constraint/i,
    'Cet élément existe déjà.'],
]

/** Convertit une erreur en message affichable. Journalise le détail technique. */
export function friendlyError(e: AppError, fallback: string = FALLBACK): string {
  if (!e) return fallback
  // Détail complet pour le diagnostic — jamais montré à l'utilisateur.
  console.error('[qdq] erreur:', e)
  // Pas de code = la base n'a pas répondu (réseau).
  if (!e.code) return NETWORK
  for (const [re, msg] of RULES) {
    if (re.test(e.message || '')) return msg
  }
  return fallback
}

# Tokens de design — direction V3 (hybride indigo + menthe)

Palette validée avec l'agence (Lots 1→2). Source de vérité côté code : `src/lib/tokens.ts` (`TV3`, `BRAND`).

## État

**Pré-câblé, pas encore branché.** L'app tourne toujours sur l'ancien thème menthe/navy (`T` dans `src/lib/theme.ts`). `TV3` a la même forme (`Theme`) et pourra le remplacer d'un branchement quand le design system final sera livré.

## Règle d'accent (non négociable)

| Rôle | Couleur | Usage |
|------|---------|-------|
| **Indigo** | `#4F46E5` | Structure & actions : boutons primaires, navigation active, éléments d'identité |
| **Menthe (fill)** | `#10E8C0` | Positif — remplissages, icônes, gros éléments : gains, épargne, succès |
| **Menthe (texte)** | `#0F766E` | Menthe en **texte sur fond clair** — assombrie, AA 5.47:1 |
| **Rouge** | `#EF4444` | Sorties, dépassements, alertes critiques |
| **Violet** | `#7C3AED` | Accent **décoratif uniquement**, jamais porteur de sens |

Menthe = jamais pour un élément neutre/informatif, jamais pour une action principale (indigo uniquement).

## Sémantiques (distinctes de l'accent de marque)

| Rôle | Clair | Note |
|------|-------|------|
| Succès | `#22C55E` | Distinct de la menthe de marque — « validé » ≠ « identité » |
| Alerte | `#F5A524` | Seuil 80 % des jauges de budget |
| Danger | `#EF4444` | |
| Info | `#5B8DEF` | |
| Neutre | `#64748B` | |

## Contraste (AA)

⚠️ **Correction vs livrable agence.** Les ratios annoncés par l'agence au Lot 2 sont **faux** — vérification par calcul WCAG :

| Couleur agence | Ratio annoncé | Ratio réel sur blanc | Verdict |
|----------------|---------------|----------------------|---------|
| `#0BAF8C` | 4.72 | **2.79** | ❌ échec |
| `#0F9D81` | 4.58 | ~3.1 | ❌ échec |
| `#138D77` | 4.51 | ~3.5 | ❌ échec |

La menthe est intrinsèquement trop claire : pour atteindre 4.5:1 en texte sur blanc il faut descendre à un teal foncé. Valeur retenue côté code :

| Usage | Couleur | Ratio réel |
|-------|---------|-----------|
| Menthe texte / fond clair | `#0F766E` | **5.47** ✅ |

Un test automatique (`src/lib/__tests__/tokens.test.ts`) verrouille ce contraste : impossible de réintroduire une menthe-texte non conforme sans casser le build.

En thème **sombre**, la menthe vive `#10E8C0` passe le contraste en texte → `mintText = mintFill`.

## Bascule (le jour J)

1. Vérifier que le design system final ne change pas ces valeurs (sinon mettre à jour `BRAND`/`TV3`).
2. Dans `src/hooks/useTheme.ts`, remplacer l'import de `T` par `TV3`.
3. Introduire progressivement `t.mintText` là où de la menthe est utilisée en **texte** sur fond clair (revenus, « Meilleur choix », suggestions), et `t.indigo` pour les actions.
4. Deux logos : `Logo` (Q-Question) reste l'icône ; le wordmark devient le logo horizontal.

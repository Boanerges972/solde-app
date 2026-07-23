# Revenus récurrents dans la projection du solde

**Date** : 2026-07-22
**Statut** : design validé, en attente de plan d'implémentation

## Problème

La projection du solde (`ProjectionChart`, `Analyse` → onglet Prélèvements) ne
modélise que des **sorties**. La courbe ne fait que décroître : elle soustrait
chaque jour la moyenne des dépenses variables et, aux jours d'échéance, les
prélèvements récurrents — mais elle n'ajoute **jamais** de revenu. Le salaire
régulier de l'utilisateur n'est donc jamais crédité, ce qui produit des soldes
projetés faussement catastrophiques (ex. `−5 045 €` à 30 jours alors que le
salaire arrive chaque mois).

La cause est structurelle, à trois niveaux :

1. `src/lib/projection.ts:106` → `bal -= r.amount` : les récurrents sont
   toujours soustraits.
2. `src/components/ProjectionChart.tsx:33` → `Math.abs(...)` : tout récurrent
   est forcé positif, donc traité comme un débit.
3. `src/hooks/useRecurring.ts:34` + table `next_debits` : la table ne stocke
   que des débits (`amount` forcé en valeur absolue), sans notion de direction.

Le salaire n'existe nulle part comme récurrent — uniquement comme transactions
`amt > 0`.

## Objectif

Permettre à la projection de tenir compte des **revenus récurrents** (salaire
et assimilés), en réutilisant le mécanisme de détection/confirmation qui existe
déjà pour les prélèvements. Approche **hybride** : l'app détecte le revenu
depuis l'historique, l'utilisateur confirme et ajuste (montant, jour, compte),
la valeur confirmée est persistée.

Critère de succès : après confirmation d'un salaire, la courbe de projection
remonte au jour d'échéance du salaire, et le solde projeté à 30/60/90 jours
reflète l'entrée régulière.

## Décisions de conception (verrouillées)

| Dimension | Décision |
|-----------|----------|
| Persistance | Table `next_debits` existante + colonne `kind` (`debit`\|`credit`) |
| Détection | Réutiliser `detectRecurrings`, symétrisée côté crédit |
| Placement UI | Nouvelle section « Revenus récurrents » dans `RecurringManager` |
| Représentation | Colonne `kind`, `amount` reste positif (pas de montant signé) |

## Architecture

Modèle récurrent unifié dans `next_debits` : une ligne = un flux mensuel
récurrent, `amount` positif, `kind` porte la direction. La détection produit
des candidats débit **et** crédit. La projection ajoute les crédits et
soustrait les débits à leur jour d'échéance. Tous les consommateurs qui
supposaient « débits seuls » filtrent désormais sur `kind`.

### 1. Modèle de données — migration

```sql
ALTER TABLE next_debits ADD COLUMN kind text NOT NULL DEFAULT 'debit'
  CHECK (kind IN ('debit','credit'));
```

- Les lignes existantes prennent `kind = 'debit'` : aucun changement de
  comportement pour les prélèvements déjà saisis.
- `amount` reste stocké en valeur absolue ; `kind` porte le sens.
- La RLS row-level existante de `next_debits` couvre la nouvelle colonne (elle
  filtre par `user_id`, indépendamment des colonnes). Aucune nouvelle policy
  requise. À **vérifier** en revue : que la policy `INSERT`/`UPDATE` n'a pas de
  liste de colonnes explicite qui exclurait `kind`.
- La migration est écrite dans un fichier
  `supabase/migrations/2026xxxx_recurring_kind.sql` (source de vérité
  reproductible). Si appliquée via MCP, elle est répercutée dans ce fichier.

`next_debits` est écrit côté client (`db.from('next_debits').insert/update/delete`
dans `useRecurring`), **pas** via RPC. Aucune RPC nouvelle n'est nécessaire —
contrairement à `accounts`, dont l'`UPDATE` client est révoqué.

### 2. Détection — `RecurringManager.detectRecurrings`

Généraliser la fonction, aujourd'hui limitée aux débits (`tx.amt < 0`, ligne
15) :

- Débits : `tx.amt < 0` (hors `Virement interne`) → candidats `kind = 'debit'`.
- Crédits : `tx.amt > 0` (hors `Virement interne`) → candidats `kind = 'credit'`.
- Même logique de regroupement (nom marchand normalisé), même calcul de
  confiance (`nMonths`, `consecutiveRate`, `isRegularAmt`), mêmes seuils.
  L'algo utilise déjà `Math.abs(tx.amt)` pour les montants, donc aucun
  changement de maths.
- `DetectedRecurring` gagne un champ `kind: 'debit' | 'credit'`.

La fonction peut soit prendre un paramètre `direction`, soit retourner les deux
types dans une liste taguée. Le plan d'implémentation tranchera ; l'important
est que les deux catégories soient détectables avec les mêmes seuils.

### 3. Projection — `projection.ts` + `ProjectionChart`

- `ProjRecurring` gagne `kind: 'debit' | 'credit'`.
- `ProjectionChart` : `projRecs` mappe les lignes `next_debits` avec leur
  `kind`, `amount` en valeur absolue.
- `projection.ts` (boucle jour, ligne 106) :
  ```ts
  recurrings.forEach(r => {
    if (dueDay(r.day, d) === dayOfMonth) {
      bal += r.kind === 'credit' ? r.amount : -r.amount
    }
  })
  ```
- `avgDailyVariable` reste inchangé : il ne considère que `amt < 0`, donc les
  revenus ne sont **pas** comptés dans la moyenne des dépenses. Pas de double
  comptage (le revenu est modélisé comme crédit discret au jour d'échéance,
  pas dilué dans la moyenne quotidienne).

### 4. Consommateurs à corriger (rayon d'action)

Ajouter des crédits à `next_debits` casse tout code qui suppose « débits
seuls ». À traiter dans le même lot :

| Fichier | Correctif |
|---------|-----------|
| `src/lib/scoreAccounts.ts:58` | `committed` ne somme que `kind === 'debit'` (sinon le salaire gonfle les prélèvements à venir et fausse le scoring ExpEntry) |
| `src/screens/modals/ExpEntry.tsx` | La liste « Voir le détail des prélèvements » n'affiche que les débits |
| `supabase/functions/send-notifications/index.ts:65` | Ne notifier « … sera prélevé » que pour `kind = 'debit'` (v1 ; un message crédit distinct est hors scope) |
| `src/hooks/useRecurring.ts` | `addRecurring` accepte un paramètre `kind` (défaut `'debit'`) ; conserve `Math.abs` sur `amount` |

`Recurring` (type) gagne `kind?: 'debit' | 'credit'` (optionnel pour
compatibilité de lecture ; les lignes DB l'ont toujours grâce au `DEFAULT`).

### 5. UI — `RecurringManager`

Nouvelle section **« Revenus récurrents »**, à côté de « Prélèvements
récurrents » :

- Liste les crédits détectés non encore confirmés, rankés par confiance,
  avec le même contrôle d'ajustement du jour (`typicalDay` éditable) que les
  prélèvements.
- Confirmation → `onAdd({ account_id, name, amount, date_label, kind: 'credit' })`.
- Liste les revenus déjà confirmés (lignes `next_debits` avec `kind = 'credit'`)
  avec suppression.
- Réutilise les composants et le flux `confirmDetected` existants.

### 6. Tests

- `src/lib/__tests__/projection.test.ts` :
  - un crédit récurrent est **ajouté** au solde à son jour d'échéance ;
  - scénario mixte débit + crédit sur le même horizon ;
  - le test existant « les revenus (amt > 0) sont exclus de la moyenne des
    dépenses » reste vert (garde le non-double-comptage).
- Détection : une entrée mensuelle positive et régulière est détectée avec
  `kind = 'credit'` et la bonne confiance.
- `scoreAccounts` : `committed` exclut les lignes `kind = 'credit'`.

Un test doit échouer **avant** le correctif (règle du projet). Les fixtures
utilisent des montants et dates réalistes.

## Hors scope (YAGNI)

- Multi-devises.
- Moyenne de revenus variables (on ne modélise que les revenus **récurrents**
  identifiés, pas une moyenne d'entrées irrégulières).
- Notifications push dédiées aux crédits (« … sera crédité »).
- Nudge de découverte sur `ProjectionChart` (bannière « salaire détecté »).
- Brancher `BalanceCurve` (composant mort, sujet distinct).

## Vérification avant commit

Touche `src/lib/**`, `src/hooks/**`, `supabase/migrations/**` → **revue croisée
Codex obligatoire** (`/codex-review`) avant tout commit, puis triage des
findings.

```
npx tsc --noEmit && npx vitest run && npm run build
```

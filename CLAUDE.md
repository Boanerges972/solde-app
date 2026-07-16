# QDQ — règles de travail

PWA de finances personnelles **en production, avec de vraies données bancaires**.
Une erreur ici ne casse pas un écran : elle fausse un solde.

## Revue croisée par Codex — OBLIGATOIRE

**Avant tout commit touchant** : `src/lib/**`, `src/hooks/**`, `supabase/migrations/**`,
ou l'import/export → lancer `/codex-review` et traiter les findings.

Raison (constatée, pas théorique) : sur 3 revues, Codex a trouvé **à chaque fois**
de vrais défauts qu'une relecture par l'auteur avait manqués — dont deux
régressions introduites par les correctifs eux-mêmes. L'auteur relit en
connaissant son intention ; c'est précisément l'angle mort.

Ne pas se contenter d'accepter : **trier**. Codex se trompe aussi (il a signalé
BLOQUANT une prod saine parce que le *fichier* de migration avait dérivé).
Vérifier chaque finding contre le code réel avant de corriger, et dire ce qu'on
écarte et pourquoi.

## Pièges de ce codebase

### `Transaction.dt` n'est PAS une date
C'est un **libellé d'affichage** posé par `useData` : il vaut `'today'` /
`'yesterday'` pour les deux derniers jours.

- **Logique métier → toujours `tx_date`.** Jamais `dt`.
- `dt` ne se lit que pour grouper à l'écran (`Feed`, `TxRow`, `Depenses`).
- Symptôme quand on l'oublie : les opérations récentes disparaissent
  silencieusement des calculs, ou `new Date('today')` → `Invalid Date`.
- (`ParsedTx.dt`, côté import, est un autre type : vraie date ISO.)

### Les RPC sont l'UNIQUE voie d'écriture des soldes
La Section 7 de `supabase/migrations/20260714_rpc_financial.sql` a révoqué
`UPDATE` sur `accounts` pour le client. `balance/free/reserved` ne changent que
via les RPC (`SECURITY DEFINER`).

- **Il n'y a pas de feature flag de repli.** Un flag produirait des écritures
  partielles (tx insérée, solde refusé).
- **Rollback réel** = revert du client **ET** `grant update on accounts to authenticated`.

### Toute RPC appliquée via MCP doit être répercutée dans le fichier de migration
`apply_migration` change la base, pas le repo. Le fichier est la source de
vérité reproductible : s'il diverge, il ment (et une revue le signalera à juste
titre comme bloquant).

### `useData` ne charge que les 50 dernières transactions
Tout calcul sur plusieurs mois (budgets, reports) doit **charger sa propre
fenêtre**. Sinon les mois anciens sont lus à `spent = 0` et le résultat dépend
de l'activité récente.

### `ResetModal` fonctionne par liste **keep**
Toute nouvelle clé de déverrouillage doit y figurer. Garder `qdq-pin-enabled`
en perdant l'empreinte **enferme l'utilisateur dehors**.

### Idempotence : l'`operation_id` se fige AVANT l'appel
Il est généré une fois par opération logique et **persisté** (outbox IndexedDB)
avant l'envoi, puis réutilisé au rejeu. Erreur **métier** (code PostgreSQL
présent) → remonter ; erreur **réseau** (pas de code) → mettre en file avec le
**même** id. En générer un nouveau au retry = double débit.

## Correctifs : le rayon d'action avant la ligne

Avant de corriger une classe de bug, **chercher partout où le motif existe** :

```
grep -rn "<motif>" src/ --include=*.ts --include=*.tsx | grep -v __tests__
```

Le bug `dt` a coûté trois passes parce que j'ai corrigé les appelants un par un
au lieu de les recenser d'abord.

## Tests

- Un test doit **échouer avant le correctif**. Sinon il ne teste pas le bug.
- Un test existant qui casse après un fix : se demander **s'il encodait le bug**
  (ils divisaient par 90 en dur, ils testaient un chemin mort) avant de
  l'« ajuster ».
- Caler les fixtures sur l'intention du scénario : un `createdMonth` lointain
  par défaut a produit 19 mois de report et fait échouer des tests **corrects**.
- Les montants et les dates sont le cœur du produit : les tester avec les
  formats réels des banques (espace milliers, virgule, signe terminal, BOM).

## Vérification avant commit

```
npx tsc --noEmit && npx vitest run && npm run build
```

## Conventions

- Commits en français, `Co-Authored-By: Claude ...`.
- Push : `git push origin HEAD:main` (contourne le lock OneDrive).
- Ne jamais afficher un message d'erreur PostgreSQL brut : passer par
  `friendlyError()` (`src/lib/errors.ts`).

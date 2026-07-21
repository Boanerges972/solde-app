# Plan technique — Synchronisation bancaire automatique (Open Banking / DSP2)

État : **proposition, non implémenté.** Objectif : supprimer les écarts de solde en
récupérant automatiquement les transactions des comptes, sans saisie manuelle et
sans jamais manipuler les identifiants bancaires.

---

## 1. Objectif & périmètre

- **But** : les soldes de l'app suivent la banque sans import CSV/PDF manuel.
- **Comptes visés** :
  - **Boursorama** → auto ✅ (intégré Enable Banking)
  - **Crédit Mutuel / CIC** → auto ✅ (flux redirect unique)
  - **Nickel** → **à confirmer** via l'endpoint `/aspsps` ; probablement non couvert
    → reste en **import manuel** (solde marginal 44,50 €).
- **Non-but** : offrir la synchro à d'autres utilisateurs. L'app reste
  **mono-utilisateur** (contrainte du tier gratuit, cf. §3).

## 2. Fournisseur retenu — Enable Banking

Décision documentée le 2026-07-21 après élimination de GoCardless (nouveaux
comptes fermés depuis juillet 2025, service en extinction).

| Critère | Enable Banking |
|---|---|
| Gratuit | ✅ tier « Restricted Production » sur **ses propres comptes** |
| Inscription | Self-serve, sans contrat, ouverte aux particuliers/devs |
| Statut légal | AISP agréé → flux **redirect + SCA** sur la banque |
| Durée consentement | **jusqu'à 180 jours** (max ASPSP) → ré-auth ~2×/an |
| Historique | ≥ 90 jours de transactions selon banque |
| Modèle payant | Au volume (nb comptes/paiements par mois), au-delà du gratuit |

**Contrainte du gratuit à respecter** : « une application ne peut pas être rendue
publique sans contrat ». Ici l'agrégation ne vise que **les comptes whitelistés
du propriétaire** → usage prévu du tier gratuit. Ne pas ouvrir la synchro à des
tiers sans passer un contrat.

## 3. Modèle de sécurité (ligne rouge)

- **Identifiants bancaires : jamais.** L'utilisateur s'authentifie sur la page de
  sa banque (redirection + SCA). L'app ne reçoit qu'un **jeton d'accès en lecture**.
- **Authentification appli ↔ Enable Banking** : paire de clés.
  `application_id` (public) + **clé privée RS256** qui signe un JWT.
  → La clé privée est un **secret Edge Function** (comme `VAPID_PRIVATE_KEY`),
  jamais côté client, jamais versionnée.
- **Lecture seule.** Aucun scope de paiement demandé (AIS uniquement, pas PIS).
- **Écriture DB** : exclusivement via les **RPC d'import existants**
  (`rpc_import_batch`, `SECURITY DEFINER`, dédup + soldes verrouillés Section 7).
  La synchro n'ouvre **aucune** nouvelle voie d'écriture des soldes.
- **RLS** : la nouvelle table de liaison porte une policy `user_id = auth.uid()`.
- **Secrets** à créer dans le dashboard (Edge Functions → Secrets) :
  `EB_APPLICATION_ID`, `EB_PRIVATE_KEY`, `EB_REDIRECT_URI`.

## 4. Architecture

```
┌──────────────┐   1. « Connecter ma banque »      ┌──────────────────────┐
│  Client PWA  │ ────────────────────────────────► │ Edge Fn: bank-auth   │
│ (Réglages)   │                                    │  - JWT signé (privé) │
│              │ ◄──── URL d'autorisation ───────── │  - POST /auth        │
└──────┬───────┘                                    └──────────────────────┘
       │ 2. redirection navigateur (SCA sur la banque)
       ▼
  ┌─────────────┐   3. redirect ?code=… &state=…
  │  Banque     │ ───────────────────────────────►  ┌──────────────────────┐
  │ (Bourso/CM) │                                    │ Edge Fn: bank-callback│
  └─────────────┘                                    │  - POST /sessions    │
                                                     │  - liste comptes     │
                                                     │  - upsert bank_links │
                                                     └──────────────────────┘
       ┌──────────────────────┐   4. « Synchroniser » (bouton + cron)
       │ Edge Fn: bank-sync    │ ◄──────────────────── Client / pg_cron
       │  - GET /transactions  │
       │  - GET /balances      │
       │  - map → RPC import    │ ──► rpc_import_batch (dédup + delta solde)
       │  - écart solde         │ ──► signalé (option rpc_set_balance)
       └──────────────────────┘
```

3 responsabilités, regroupables en **1 Edge Function** avec routage par `action`
(comme `send-notifications` fait de l'auth custom). `verify_jwt` reste géré :
appels client authentifiés par le JWT Supabase de l'utilisateur.

## 5. Flux Enable Banking (détail API)

1. **Enregistrement appli** (une fois, côté toi) : créer l'application sur le
   portail, enregistrer la **clé publique**, récupérer `application_id`. La clé
   privée reste secrète.
2. **Auth appli** : chaque appel API porte un `Authorization: Bearer <JWT>` où le
   JWT est signé RS256 avec la clé privée (`iss`, `aud=api.enablebanking.com`,
   `exp` court).
3. **Découverte** : `GET /aspsps?country=FR` → repérer `Boursorama`, `Crédit
   Mutuel`/`CIC`, et **vérifier Nickel** définitivement.
4. **Démarrer l'autorisation** : `POST /auth` avec l'ASPSP, `redirect_url`,
   `state` (anti-CSRF, lié à l'utilisateur), `access` (valid_until ≤ 180 j,
   comptes/soldes/transactions). → renvoie une **URL d'autorisation**.
5. **Redirection + SCA** : le client ouvre l'URL, l'utilisateur valide sur sa
   banque, la banque redirige vers `EB_REDIRECT_URI?code=…&state=…`.
6. **Créer la session** : `POST /sessions` avec `code` → renvoie `session_id` +
   la liste des **comptes** (chacun un `account_uid`, IBAN, nom).
7. **Lier** : l'utilisateur associe chaque `account_uid` à un compte local
   (`accounts.id`) → écrit dans `bank_links`.
8. **Tirer les données** :
   - `GET /accounts/{account_uid}/transactions?date_from=<last_sync>` (paginé via
     `continuation_key`).
   - `GET /accounts/{account_uid}/balances` → solde de référence pour l'écart.

## 6. Modèle de données (nouvelle migration)

Aucune colonne IBAN/réf externe n'existe sur `accounts`. On ajoute une table de
liaison plutôt que de polluer `accounts` :

```sql
create table public.bank_links (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id),
  provider       text not null default 'enablebanking',
  aspsp_name     text not null,               -- 'Boursorama', 'Credit Mutuel'
  eb_account_uid text not null,               -- identifiant compte côté EB
  account_id     text not null references public.accounts(id), -- compte local
  session_id     text,
  consent_expires timestamptz,                -- pour prévenir la ré-auth
  last_sync_at   timestamptz,
  last_tx_date   date,                        -- borne basse du prochain tirage
  created_at     timestamptz default now(),
  unique (user_id, eb_account_uid)
);
alter table public.bank_links enable row level security;
create policy bank_links_owner on public.bank_links
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```

**Dédup** : le MVP réutilise la dédup existante de `rpc_import_batch`
(`(tx_date, amount, merchant)` par multiplicité) en ne tirant que les
transactions **depuis `last_tx_date`** (fenêtre courte, chevauchement d'un jour
absorbé par la multiplicité). Suffisant et cohérent avec l'import CSV actuel.

> **Amélioration (phase 2)** : ajouter `transactions.external_id text` +
> index unique partiel `(user_id, external_id)` alimenté par le
> `entry_reference`/`transaction_id` d'Enable Banking → dédup exacte, insensible
> aux variations de libellé. Nécessite une variante `rpc_import_batch_ext`.

## 7. Mapping transaction EB → schéma QDQ

| Champ QDQ | Source Enable Banking |
|---|---|
| `tx_date` | `booking_date` (fallback `value_date`) — **jamais** l'heure, format `YYYY-MM-DD` local |
| `amount` | `transaction_amount.amount` signé selon `credit_debit_indicator` (DBIT → négatif) |
| `merchant` | `creditor.name` / `debtor.name` sinon `remittance_information` nettoyé |
| `category` | `catFromLabel(merchant)` (règles existantes `src/lib/categories.ts`) |
| `icon` | `iconForCat(category)` (existant) |

Réutilise **`ParsedTx`** (`src/lib/parsers/ofx.ts`) et le pipeline d'import, donc
zéro nouveau format à maintenir. Le dating suit la règle du codebase : date
calendaire locale (`src/lib/dates.ts`), pas d'`toISOString()`.

## 8. Réconciliation de solde

Après import, comparer `GET /balances` (solde banque) au solde calculé QDQ :
- **égal** → rien.
- **écart** → l'afficher dans Réglages (« Écart 12,30 € — Boursorama »). L'écart
  vient typiquement de transactions plus vieilles que la fenêtre tirée. Option
  utilisateur : « Aligner le solde » → `rpc_set_balance` (déjà blindé).

## 9. Déclenchement

- **Manuel** : bouton « Synchroniser » dans Réglages (MVP).
- **Auto (phase 2)** : job `pg_cron` quotidien (comme `send-notifications`)
  appelant `bank-sync` pour chaque `bank_link` non expiré. Respecter les quotas
  Enable Banking (pas plus de N tirages/jour).

## 10. Gestion de l'expiration du consentement

- Stocker `consent_expires`. À J-7, notification push (infra déjà en place) +
  bandeau Réglages : « Reconnecte ta banque ».
- Ré-auth = rejouer §5.4–5.7. `bank_links` conservé, `session_id` rafraîchi.

## 11. Tests

- **Sandbox Enable Banking** : ASPSP mock pour dérouler auth→session→transactions
  sans vraie banque.
- **Unitaires** : mapping EB→`ParsedTx` (signe, dates, libellés réels), avec les
  cas tordus (montant crédit, remittance vide, date de valeur ≠ comptable).
- **Intégration** : `bank-sync` mocké (MSW) → vérifier l'appel `rpc_import_batch`
  avec le bon `operation_id` (idempotence) et la fenêtre `last_tx_date`.
- Respecter la règle repo : un test doit **échouer avant** le code.

## 12. Secrets & config

| Nom | Où | Rôle |
|---|---|---|
| `EB_APPLICATION_ID` | Edge Fn secret | id public de l'appli |
| `EB_PRIVATE_KEY` | Edge Fn secret | **clé privée RS256** (signe le JWT) |
| `EB_REDIRECT_URI` | Edge Fn secret + portail EB | URL de retour SCA |

## 13. Phases de livraison

- **Phase 0 (toi)** : créer le compte Enable Banking, l'application, la paire de
  clés ; confirmer Nickel via `/aspsps`. **Bloquant** — rien à coder avant.
- **Phase 1 (MVP)** : migration `bank_links` + Edge Fn (auth/callback/sync) +
  UI Réglages (connecter, lier comptes, synchroniser) + mapping + réconciliation.
  Boursorama d'abord, puis CM.
- **Phase 2** : cron quotidien, alerte expiration (push), dédup exacte par
  `external_id`.

## 14. Répartition toi / moi

- **Toi** : inscription + clés (Phase 0) ; **la redirection SCA sur la banque**
  (je ne peux pas, et c'est voulu) ; saisie des 3 secrets au dashboard.
- **Moi** : migration, Edge Function(s), mapping, UI, tests, doc. Revue Codex
  obligatoire (touche `supabase/**` + import).

## 15. Risques & limites

- **Nickel probablement non couvert** → reste manuel (impact faible).
- **Consentement 180 j** : ré-auth ~2×/an, incompressible (DSP2).
- **Quotas gratuits** : rafraîchissement limité (1–2×/jour largement suffisant).
- **Dépendance externe** : si Enable Banking change une intégration banque, la
  synchro d'une banque peut casser temporairement — l'import manuel reste le
  filet de secours (on ne le retire pas).
- **Coût** : nul tant que mono-utilisateur sur ses propres comptes ; facturation
  au volume seulement si on dépasse le cadre gratuit.

## 15 bis. Revue Codex — corrigé vs. gates pré-production

Revue adversariale passée le 2026-07-21 sur toute la tranche.

**Corrigé immédiatement (dans le code déployé) :**
- Pagination tronquée à 50 pages puis watermark avancé → perte de tx. La fonction
  renvoie désormais `complete`; le client n'avance le watermark **que** si la
  fenêtre est complète (garde portée à 500 pages). *(BLOQUANT)*
- `link` ne vérifiait pas la propriété du compte cible → contrôle
  `accounts.user_id = uid` ajouté (l'écriture par service_role ignore la RLS).
- Devise ignorée (100 USD importés comme 100 €) → `mapEbTx` rejette toute devise
  ≠ attendue (défaut EUR).
- Indicateur de sens inconnu traité comme débit → whitelist CRDT/DBIT/DBTO,
  tout le reste **rejeté** (on ne devine pas un mouvement d'argent).
- `parseFloat` permissif (« 12.34EUR » → 12.34) → parse strict par regex.
- Erreurs `mark_synced` / `list` / upsert callback masquées → remontées.

**Gates pré-production — LEVÉS (2026-07-21) :**
1. **Consent-phishing via `state`** → table `bank_auth_nonce` à **usage unique**
   (30 min) : `start_auth` insère un nonce, le callback le consomme par
   `DELETE ... RETURNING` (atomique, un seul callback réussit sous concurrence).
   Un `state` rejoué/périmé ne consomme rien → refus. Le fondamental cross-user
   reste couvert par le fait que l'app est **mono-utilisateur** (inscriptions
   fermées) — à réévaluer si on ouvre à plusieurs users.
2. **Dédup exacte par `external_id`** → `transactions.external_id` + index unique
   partiel **`(account_id, external_id)`** (pas `user_id` : un même
   `entry_reference` peut coexister sur les deux jambes d'un virement interne) +
   `rpc_import_ext` (dédup intra-batch par `distinct on`, cross-sync par
   `on conflict do nothing`, delta = insertion réelle). Validé en base : re-tirage
   → 0 recompté.
3. **Antidatage** → plutôt qu'un watermark glissant (qui reculait à l'infini sur
   les synchros vides et ratait les régularisations), **fenêtre de lecture FIXE
   de 90 jours** à chaque synchro. La dédup exacte rend le re-tirage gratuit et
   rattrape les antidatages jusqu'à 90 j. `last_tx_date` devient informatif.
   **Résiduel assumé** : un antidatage de plus de 90 j serait manqué (très rare).

## 15 ter. Modèle de solde — la banque fait foi (revue Codex #2)

Un premier jet « import (delta) puis override du solde » a été **bloqué par
Codex** : deux RPC séparés, non atomiques → si l'override échoue, le delta reste
(double-compte) ; si `/balances` renvoie null, le delta reste aussi. Corrigé par
un **unique RPC atomique `rpc_sync_account`** :

- Dédup exacte des transactions par `(account_id, external_id)`, **sans jamais
  toucher le solde par delta**.
- Pose du solde = **snapshot `/balances`**, dans la même transaction (compte
  verrouillé `FOR UPDATE`). Snapshot absent (`null`) → solde **inchangé** :
  jamais de faux solde silencieux.
- Validé en base : import 2 tx + snapshot 2500 → solde 2500 (pas 985) ; re-tirage
  + 2600 → 0 réimporté, solde 2600 ; snapshot null → solde inchangé.

**Politique de compte** : un compte relié est **autoritaire côté solde** (reflète
le dernier snapshot bancaire). Écritures manuelles/CSV sur un compte relié →
visibles dans le fil, mais le solde suit la banque (recouvert au prochain
snapshot). Ne pas piloter le solde d'un compte relié à la main.

**Résiduels assumés** : (a) deux synchros concurrentes sur le même compte — la
dernière `set_balance` gagne même si son snapshot est plus ancien (auto-corrigé
à la synchro suivante ; synchros déclenchées manuellement, concurrence rare) ;
(b) antidatage > 90 j (hors fenêtre).

## 16. Décision requise avant Phase 1

1. Confirmer le choix Enable Banking.
2. Réaliser la Phase 0 (compte + clés + secrets).
3. Trancher : cron auto dès la Phase 1, ou manuel d'abord ?

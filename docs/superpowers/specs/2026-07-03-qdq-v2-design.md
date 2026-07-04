# QDQ v2 — Design « niveau Bankin' »

**Date :** 2026-07-03
**Statut :** validé par Lory
**Référence marché :** Bankin' / Linxo (catégorisation auto, budgets, alertes, insights)

## Objectif

Amener QDQ au niveau des meilleurs outils de gestion de finances personnelles du marché : fiabilité, design soigné mobile + desktop, et fonctionnalités avancées (budgets par catégorie, objectifs d'épargne, prévisionnel, catégorisation apprenante, notifications push, exports).

## Contexte actuel

- PWA React 18 + TypeScript 5 + Vite, largeur fixe 375px, thème clair uniquement
- Supabase (auth, Postgres + RLS, realtime)
- 70 fichiers source, 130 tests (7 échouent : `indexedDB` absent de jsdom)
- Fichiers trop gros : `ExpEntry.tsx` 29 KB, `RecurringManager.tsx` 23 KB, 3 modales d'import ≈ 60 KB avec logique dupliquée
- Fonctionnel : comptes, dépenses avec scoring ARD, prélèvements récurrents, groupes, analyses, import 10 banques (CSV/OFX/PDF), offline sync IndexedDB, verrouillage PIN

---

## Phase 1 — Fondations

### 1.1 Tests réparés
- Ajouter `fake-indexeddb` en devDependency, l'importer dans `src/__tests__/setup.ts`
- Objectif : 130/130 verts

### 1.2 Refactor gros fichiers
- `ExpEntry.tsx` (29 KB) éclaté en sous-composants : `AmountPad`, `CategoryGrid`, `AccountPicker`, `ExpConfirm` sous `src/screens/modals/expentry/`
- Fusion des 3 modales d'import : `ImportUniversal` devient l'unique modale ; `ImportNickel` (parsing PDF) et `ImportCSV` (parseCM/parseQonto) deviennent des parsers dans `src/lib/parsers/` (`nickel.ts`, `cm.ts`, `qonto.ts`)
- `BankPicker` liste toutes les banques via `SUPPORTED_BANKS` uniquement (plus de section « legacy »)
- Suppression de `ImportNickel.tsx` et `ImportCSV.tsx` après migration
- Les fonctionnalités existantes sont conservées : multi-PDF Nickel, hash SHA-256 anti-doublon, création de compte depuis l'import, dédup transactions

### 1.3 Thème sombre
- Palette `T.dark` complète dans `src/lib/theme.ts` (fond #0E1116, cartes #171C24, texte #E8ECF1, mêmes accents mint/rose/amber ajustés pour contraste WCAG AA)
- Détection `prefers-color-scheme` au démarrage + toggle 3 états dans Réglages (Auto / Clair / Sombre), persisté dans `localStorage` clé `qdq-theme`
- `App.tsx` : `const t = resolveTheme()` au lieu de `T.light` en dur ; réactif au changement système via `matchMedia` listener

### 1.4 Responsive desktop
- Breakpoint 768px. En dessous : layout actuel 375px inchangé
- Au-dessus : sidebar navigation verticale à gauche (remplace la bottom nav), contenu max 1100px centré
- Home desktop : synthèse + graphiques en colonne gauche, feed transactions en colonne droite
- Comptes desktop : grille de cartes 2 colonnes
- Modales : centrées avec max-width 480px au lieu de plein écran bottom-sheet

---

## Phase 2 — UX niveau marché

### 2.1 Skeleton loaders
- Composant `Skeleton` réutilisable (shimmer CSS)
- Remplace tous les spinners de chargement : Home, Dépenses, Analyses, listes

### 2.2 Insights automatiques (Home)
- Module `src/lib/insights.ts` : fonctions pures qui prennent transactions + budgets et retournent des insights typés
- Types d'insights :
  - Variation catégorie vs mois précédent (> ±15%) : « Courses : +23% vs juin »
  - Plus grosse dépense de la semaine
  - Dépense inhabituelle (montant > 2× moyenne de la catégorie)
  - Rythme de dépense (« à ce rythme, vous dépasserez votre budget le 22 »)
- Affichage : carrousel de cartes swipables sous la synthèse Home, dismissables

### 2.3 Animations & micro-interactions
- Transitions écrans (fade/slide 200ms)
- Swipe-to-delete sur les lignes de transaction (avec confirmation)
- Pull-to-refresh sur Home et Dépenses
- Feedback visuel boutons (scale 0.97 au press)

### 2.4 Recherche améliorée
- `SearchScreen` : filtres combinables — plage de montant, plage de dates, multi-catégories, multi-comptes
- Chips de filtres actifs, résultat avec total agrégé

---

## Phase 3 — Fonctionnalités avancées

### 3.1 Budgets par catégorie
- Table `category_budgets` : `id, user_id, category, amount, period ('month'), rollover boolean, created_at` — RLS `user_id = auth.uid()`
- Écran dédié accessible depuis Home (« Budgets ») : liste catégories avec jauge dépensé/budget, code couleur (vert < 80%, amber 80-100%, rose > 100%)
- Alerte in-app + push à 80% et 100%
- `rollover` : le non-dépensé s'ajoute au budget du mois suivant (calculé, pas stocké)

### 3.2 Objectifs d'épargne
- Table `savings_goals` : `id, user_id, name, icon, target_amount, saved_amount, deadline date null, account_id null, created_at` — RLS
- Écran « Objectifs » : carte par objectif avec progression circulaire, suggestion de virement mensuel = `(target − saved) / mois_restants`
- Action « Verser » : crée un transfert vers le compte lié + incrémente `saved_amount`

### 3.3 Prévisionnel avancé
- Extension de `PrevisionelView` : projection solde à 30/60/90 jours
- Entrées : solde actuel + prélèvements confirmés (dates connues) + revenus récurrents + moyenne journalière des dépenses variables (moyenne 90 derniers jours, hors prélèvements)
- Courbe avec zone rouge sous 0, marqueurs aux dates de prélèvement
- Sélecteur horizon 30/60/90

### 3.4 Catégorisation apprenante
- Table `merchant_rules` : `id, user_id, pattern text, category, created_at` — RLS, unique `(user_id, pattern)`
- Quand l'utilisateur corrige la catégorie d'une transaction : upsert de la règle `pattern = merchant normalisé (uppercase, trim)`
- Pipeline import : `merchant_rules` de l'utilisateur prioritaire sur `catFromLabel()` mots-clés
- Écran Réglages > « Mes règles » : liste, suppression

### 3.5 Notifications push
- Table `push_subscriptions` : `id, user_id, endpoint, keys jsonb, created_at` — RLS
- Service worker : gestion `push` + `notificationclick`
- Supabase Edge Function `send-notifications` déclenchée par cron quotidien :
  - Rappel prélèvement J-2 (« Loyer 750 € prélevé après-demain »)
  - Dépassement budget (80% / 100%)
  - Résumé hebdo dimanche 18h (« Cette semaine : 234 € dépensés, top catégorie Courses »)
- Opt-in par type de notification dans Réglages

### 3.6 Exports & rapports
- Export CSV des transactions filtrées (généré client, download direct)
- Export Excel (.xlsx) via lib légère (SheetJS ou écriture XML manuelle)
- Rapport PDF mensuel : synthèse, donut par catégorie, top 10 dépenses, comparaison mois précédent — généré client (jsPDF ou impression print-CSS)

---

## Architecture des nouvelles tables

Toutes les tables ont RLS activé avec 4 policies simples (`select/insert/update/delete` sur `user_id = auth.uid()`), **sans sous-requête auto-référente** (leçon de la récursion `group_members`).

## Ordre d'exécution

Phase 1 → Phase 2 → Phase 3, chaque phase livrable et déployable indépendamment. Tests pour chaque module de logique pure (insights, projection, règles, budgets rollover).

## Hors périmètre (YAGNI)

- Open banking / DSP2 (agrément ACPR requis)
- Multi-devises simultanées (la devise unique configurable existe déjà)
- Applications natives / app stores
- IA/ML serveur pour la catégorisation (les règles apprises suffisent)

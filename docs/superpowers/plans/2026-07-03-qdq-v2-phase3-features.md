# QDQ v2 Phase 3 — Fonctionnalités avancées Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Budgets par catégorie, objectifs d'épargne, prévisionnel 30/60/90 j, catégorisation apprenante, notifications push, exports.

**Architecture:** 4 nouvelles tables Supabase (RLS simple `user_id = auth.uid()`, jamais de sous-requête auto-référente). Logique métier en modules purs testés (`src/lib/`), hooks CRUD (`src/hooks/`), écrans en modales suivant le pattern existant. Push via service worker + Edge Function.

**Tech Stack:** existant + `xlsx` (SheetJS) pour l'export Excel. PDF via print-CSS (pas de dépendance).

**Spec:** `docs/superpowers/specs/2026-07-03-qdq-v2-design.md` (Phase 3)

---

## Tables (Task 1, appliquées par le contrôleur via MCP Supabase)

```sql
-- category_budgets
create table category_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  amount numeric not null check (amount >= 0),
  rollover boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, category)
);
alter table category_budgets enable row level security;
create policy cb_select on category_budgets for select using (user_id = (select auth.uid()));
create policy cb_insert on category_budgets for insert with check (user_id = (select auth.uid()));
create policy cb_update on category_budgets for update using (user_id = (select auth.uid()));
create policy cb_delete on category_budgets for delete using (user_id = (select auth.uid()));

-- savings_goals
create table savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null default '🎯',
  target_amount numeric not null check (target_amount > 0),
  saved_amount numeric not null default 0,
  deadline date,
  account_id text,
  created_at timestamptz not null default now()
);
alter table savings_goals enable row level security;
-- 4 policies identiques (sg_select/insert/update/delete)

-- merchant_rules
create table merchant_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pattern text not null,
  category text not null,
  created_at timestamptz not null default now(),
  unique (user_id, pattern)
);
alter table merchant_rules enable row level security;
-- 4 policies identiques (mr_*)

-- push_subscriptions
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  prefs jsonb not null default '{"recurring": true, "budget": true, "weekly": true}',
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
-- 4 policies identiques (ps_*)
```

## Tasks

### Task 1 (contrôleur, inline): migrations DB ci-dessus via MCP `apply_migration`.

### Task 2: `src/lib/budgets.ts` + tests — calcul dépensé/catégorie/mois, statut (ok <80% / warn ≥80% / over ≥100%), rollover = budget + max(0, budget_prec − dépensé_prec).

### Task 3: hook `useBudgets` (CRUD category_budgets) + modale `BudgetsScreen` (liste jauges, ajout/édition/suppression, couleurs mint/amber/rose) + bouton d'accès sur Home près d'EditBudget existant + alerte in-app à 80/100% (réutiliser le pattern BudgetAlert).

### Task 4: hook `useGoals` (CRUD savings_goals) + modale `GoalsScreen` (progression circulaire, suggestion mensuelle `(target−saved)/mois restants`, bouton Verser → incrément saved_amount + transfert optionnel vers account_id) + entrée Réglages.

### Task 5: `src/lib/projection.ts` + tests — `projectBalance(balance, recurrings, txs90j, horizonJours)` → série quotidienne : prélèvements aux dates connues + moyenne journalière dépenses variables. Retourne `{ date, balance }[]` + `minPoint`.

### Task 6: PrevisionelView — sélecteur 30/60/90, courbe projection (réutiliser BalanceCurve si adaptable), zone rouge sous 0, marqueurs prélèvements.

### Task 7: catégorisation apprenante — hook `useMerchantRules` (CRUD merchant_rules) ; à la correction de catégorie d'une transaction (trouver le point d'édition existant) upsert `pattern = merchant.trim().toUpperCase()` ; pipeline import : dans ImportUniversal, avant `catFromLabel`, chercher une règle utilisateur qui matche (`label.toUpperCase().includes(pattern)`) ; section Réglages « Mes règles » (liste + suppression).

### Task 8: exports — `src/lib/exportCsv.ts` (CSV client, download Blob) + `xlsx` (SheetJS) pour `.xlsx` ; boutons dans SearchScreen (exporter les résultats filtrés) et Réglages (tout exporter).

### Task 9: rapport PDF mensuel — route/état `showReport`, composant `MonthlyReport` stylé print (`@media print`), bouton « Imprimer / PDF » → `window.print()`. Synthèse, top 10 dépenses, répartition par catégorie, comparaison mois précédent.

### Task 10: notifications push — SW `push`/`notificationclick` handlers dans `src/sw.ts` ; `src/lib/push.ts` (subscribe via `pushManager.subscribe` + VAPID public key env `VITE_VAPID_PUBLIC_KEY`, save subscription en DB) ; opt-in par type dans Réglages ; Edge Function `send-notifications` (deno) : rappels J-2, dépassement budget, résumé hebdo — déployée via MCP, cron Supabase. Si les clés VAPID n'existent pas : générer, stocker en secrets Supabase, documenter dans le README.

### Task 11: vérification finale — suite complète, tsc, build, push git.

## Ordre

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11. Chaque tâche : TDD pour les modules purs, `npm test -- --run && npx tsc --noEmit && npm run build` avant commit.

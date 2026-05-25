# Design : Migration Vite + TypeScript — QDQ PWA

**Date :** 2026-05-18  
**Statut :** Approuvé

---

## Contexte

L'application QDQ est actuellement une PWA React mono-fichier (`index.html`, 5 000+ lignes) qui utilise `@babel/standalone` (~1.5 MB) pour transpiler le JSX au runtime et des builds de développement React chargés via CDN. Cette architecture cause :
- ~2.5 MB de JavaScript inutile au premier chargement
- Transpilation JSX à chaque visite (~1–3 s de parsing)
- Impossible de tree-shaker ou code-splitter
- Un seul fichier de 5 000 lignes impossible à maintenir

**Objectif :** Migrer vers Vite + TypeScript, découper en fichiers par écran, déplacer les credentials en variables d'environnement.

---

## Approche retenue

**Vite + React + TypeScript** — migration directe, sans ajout de dépendances supplémentaires (pas de React Router, pas de Tailwind). Le comportement de l'app reste identique ; seul le tooling et la structure de fichiers changent.

---

## Architecture cible

```
qdq-pwa/
├── index.html                  (shell Vite minimal)
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── package.json
├── .env                        (VITE_SUPABASE_URL, VITE_SUPABASE_KEY — valeurs anon publiques)
├── .env.local                  (overrides locaux — dans .gitignore)
├── .gitignore
├── public/
│   ├── manifest.json
│   ├── sw.js
│   └── icons/
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── lib/
    │   ├── supabase.ts         (createClient avec import.meta.env)
    │   ├── theme.ts            (T dark/light, helpers sp())
    │   └── currency.ts         (CURRENCY, fmt, fmtS, setCurrency)
    ├── types/
    │   └── index.ts            (Account, Transaction, Group, Member, Recurring, AppData, Theme)
    ├── hooks/
    │   ├── useData.ts
    │   ├── useRecurring.ts
    │   └── useGroup.ts
    ├── components/
    │   ├── Nav.tsx
    │   ├── Donut.tsx
    │   ├── Icon.tsx
    │   ├── ConfirmDialog.tsx
    │   └── BudgetAlert.tsx
    └── screens/
        ├── Auth.tsx
        ├── Home.tsx
        ├── Comptes.tsx
        ├── Analyse.tsx
        ├── Groupe.tsx
        ├── Reglages.tsx
        └── modals/
            ├── ExpEntry.tsx
            ├── EditBudget.tsx
            ├── EditAccount.tsx
            ├── TransferEntry.tsx
            ├── RecurringManager.tsx
            ├── ImportNickel.tsx
            ├── ImportCSV.tsx
            ├── SearchScreen.tsx
            └── LockScreen.tsx
```

---

## Fichiers clés

### `src/lib/supabase.ts`
```ts
import { createClient } from '@supabase/supabase-js'
export const db = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
)
```

### `src/types/index.ts`
Types principaux exportés et utilisés par tous les composants :
- `Account` — id, name, bal, col, type, overdraft, isPro, debits[]
- `Transaction` — id, merchant, category, amount, tx_date, account_id, …
- `AppData` — complet retourné par useData
- `Theme` — objet de couleurs (dark / light)
- `Recurring` — next_debits row
- `Group`, `Member`

### `src/lib/theme.ts`
Exporte `T` (dark + light), `sp()`, et les animations CSS restent dans `index.html` ou un fichier `src/index.css`.

### `src/hooks/useData.ts`
Logique identique à l'actuelle — retourne `{ data, loading, error, reload, addTx, deleteTx, addTransfer }`. Typé avec `AppData`.

### `src/App.tsx`
Conserve tout l'état global : `session`, `tab`, `dark`, les états de modales. Importe et rend les écrans et les modales. Moins de 200 lignes (contre ~150 lignes de logique noyées dans 5 000).

---

## Data flow

```
App.tsx (état global)
  ├── hooks: useData, useRecurring, useGroup
  ├── screens/Home.tsx, Comptes.tsx, etc. (lecture seule via props)
  └── modals/ExpEntry.tsx, etc. (callbacks onSave, onClose)
```

Les hooks restent les seuls endroits qui écrivent en base. Les screens reçoivent data + callbacks, n'importent pas directement `db`.

---

## Variables d'environnement

| Variable | Usage | Source |
|----------|-------|--------|
| `VITE_SUPABASE_URL` | URL projet Supabase | Dashboard Supabase |
| `VITE_SUPABASE_KEY` | Anon key | Dashboard Supabase |

- `.env` : contient les valeurs (la clé anon est publique par conception, protégée par RLS)
- `.env.local` : dans `.gitignore`, pour overrides locaux
- Vercel : ajouter les deux variables dans Settings → Environment Variables

---

## Déploiement

Vercel détecte Vite automatiquement (framework preset "Vite"). Le `vercel.json` existant reste valide. Le `public/sw.js` reste un fichier statique non bundlé (comportement identique).

---

## Ce qui ne change pas

- Logique métier (hooks, calculs ARD, détection récurrents)
- Styles inline (conservés tels quels — pas de migration Tailwind)
- Service worker (`public/sw.js`)
- `manifest.json`
- Fonctionnement de la PWA
- Les corrections d'accessibilité déjà appliquées

---

## Hors scope

- React Router (navigation par URL)
- Tailwind CSS
- Tests automatisés (Vitest installé mais aucun test écrit)
- Refonte visuelle

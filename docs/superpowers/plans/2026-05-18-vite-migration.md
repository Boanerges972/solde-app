# Vite + TypeScript Migration — QDQ PWA

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrer l'app QDQ d'un mono-fichier HTML/Babel-runtime vers un projet Vite + React + TypeScript découpé en fichiers par écran.

**Architecture:** Vite build tool, React 18 + TypeScript strict, structure src/{lib,types,hooks,components,screens}. Le comportement et les styles de l'app restent inchangés — seul le tooling et la structure de fichiers changent.

**Tech Stack:** Vite 5, React 18, TypeScript 5, @supabase/supabase-js 2, @vitejs/plugin-react

---

## Patron de migration (répété à chaque tâche)

Chaque extraction depuis `index.html` suit ce patron :

1. Copier le corps de la fonction/const depuis `index.html`
2. Ajouter en tête du fichier :
```tsx
import { useState, useEffect, useCallback } from 'react'
import type { CSSProperties } from 'react'
import { db } from '../lib/supabase'      // adapter le chemin relatif
import { T, sp } from '../lib/theme'
import { fmt, fmtS } from '../lib/currency'
import type { Theme, AppData, Account, Transaction, Recurring, Group, Member } from '../types'
```
3. Retirer `const{useState,useEffect,useCallback}=React;`
4. Ajouter l'interface Props TypeScript avant la fonction
5. Ajouter `export` devant chaque `const` ou `function` exportée
6. Adapter les imports internes (ex: `<Ic` → `import { Icon as Ic }`)

---

## Task 1 — Scaffold projet Vite

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `index.html` (Vite shell — remplace l'actuel)
- Create: `src/main.tsx`
- Create: `src/index.css`
- Modify: `.gitignore`

- [ ] **Créer `package.json`**

```json
{
  "name": "qdq-pwa",
  "private": true,
  "version": "0.2.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.4.5",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Créer `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
})
```

- [ ] **Créer `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": false,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

> `strict: false` pour permettre la migration progressive. Activer après migration complète.

- [ ] **Créer `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Remplacer `index.html` par le shell Vite**

Sauvegarder l'actuel : `cp index.html index.html.bak`

Nouveau contenu de `index.html` :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
  <meta name="theme-color" content="#10E8C0"/>
  <meta name="mobile-web-app-capable" content="yes"/>
  <meta name="apple-mobile-web-app-capable" content="yes"/>
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
  <meta name="apple-mobile-web-app-title" content="QDQ"/>
  <title>QDQ — Qui Dépense Quoi</title>
  <link rel="manifest" href="/manifest.json"/>
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700&family=Outfit:wght@300;400;500;600&family=IBM+Plex+Mono:wght@300;400;500;600&display=swap" rel="stylesheet"/>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Créer `src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Créer `src/index.css`** (extraire le bloc `<style>` de `index.html.bak` lignes 25–38)

```css
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;min-height:100vh;background:#0A0C12;display:flex;justify-content:center;font-family:'Outfit',sans-serif}
#root{display:flex;justify-content:center;width:100%}
.safe-top{padding-top:env(safe-area-inset-top,0px)}
*{scrollbar-width:none}
:focus-visible{outline:2px solid #10E8C0;outline-offset:2px;border-radius:4px}
button:focus:not(:focus-visible){outline:none}
@keyframes slideUp{from{transform:translateY(110%)}to{transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes slideDown{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
```

- [ ] **Mettre à jour `.gitignore`**

```
node_modules
dist
.env.local
*.bak
```

- [ ] **Installer les dépendances**

```
npm install
```

Résultat attendu : `node_modules/` créé, pas d'erreur.

- [ ] **Commit**

```
git add package.json vite.config.ts tsconfig.json tsconfig.node.json index.html src/main.tsx src/index.css .gitignore
git commit -m "feat: scaffold Vite + TypeScript project"
```

---

## Task 2 — Variables d'environnement + client Supabase

**Files:**
- Create: `.env`
- Create: `.env.local` (ignoré git)
- Create: `src/lib/supabase.ts`

- [ ] **Créer `.env`** (valeurs de `index.html.bak` lignes 49–50)

```
VITE_SUPABASE_URL=https://icbwiokzovrauraddstq.supabase.co
VITE_SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljYndpb2t6b3ZyYXVyYWRkc3RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NTA5NjUsImV4cCI6MjA5NDMyNjk2NX0.htKyxfnKucoIKb4i17mI3L1bf1M59rc45iwIpK9P6BI
```

- [ ] **Créer `src/lib/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js'

export const db = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_KEY as string
)
```

- [ ] **Vérifier la compilation**

```
npx tsc --noEmit
```

Résultat attendu : 0 erreur (seul `src/main.tsx` et `src/lib/supabase.ts` existent pour l'instant).

- [ ] **Commit**

```
git add .env src/lib/supabase.ts
git commit -m "feat: add Supabase client with env vars"
```

---

## Task 3 — Types TypeScript

**Files:**
- Create: `src/types/index.ts`

- [ ] **Créer `src/types/index.ts`**

```ts
import type { CSSProperties } from 'react'

export interface Theme {
  bg: string; card: string; el: string
  tx: string; sub: string; muted: string
  bo: string
  mint: string; rose: string; amber: string
  mD: string; rD: string; aD: string; rB: string
}

export interface AccountDebit { n: string; d: string; a: number }

export interface Account {
  id: string; name: string; short: string
  bal: number; col: string; type: string
  isPro: boolean; overdraft: number
  debits: AccountDebit[]
  balance?: number; color?: string; short_name?: string
}

export interface Transaction {
  id: string; merchant: string; category: string
  icon: string; amount: number; tx_date: string
  account_id: string; group_id?: string | null; paid_by?: string | null
  // champs calculés
  acc: string; dt: string; m: string; cat: string; ico: string; amt: number
  isTransfer: boolean; isPro: boolean; isProPerso: boolean
}

export interface Cat { n: string; col: string; ico: string; amt: number; pct: number }

export interface AppData {
  user: string; week: number; wk: number
  budget: number; spent: number; rem: number
  accounts: Account[]; txs: Transaction[]; cats: Cat[]
  persoAccs: Account[]; proAccs: Account[]
  persoTxs: Transaction[]; proTxs: Transaction[]
  persoBal: number; proBal: number
  proMonthSpent: number; proMonthIncome: number; proNet: number
  monthBudget: number; monthSpent: number; monthIncome: number
  monthRem: number; monthLabel: string
}

export interface Recurring {
  id: string; user_id: string; account_id: string
  name: string; amount: string | number; date_label: string
}

export interface DetectedRecurring {
  name: string; key: string; nMonths: number
  avg: number; std: number; typicalDay: number; topAcc: string
  consecutive: number; consecutiveRate: number; isRegularAmt: boolean
  confidence: 'confirmed' | 'probable' | 'watching'
  lastDate: string; txs: Transaction[]
}

export interface Group {
  id: string; name: string; invite_code: string
  created_by?: string; myName: string
}

export interface Member { user_id: string; display_name: string }

export interface Currency {
  sym: string; pos: 'before' | 'after'; dec: string; code?: string
}

export interface Profile {
  name?: string; avatar?: string; currency?: string
}
```

- [ ] **Commit**

```
git add src/types/index.ts
git commit -m "feat: add TypeScript types"
```

---

## Task 4 — Bibliothèques utilitaires (theme, currency)

**Files:**
- Create: `src/lib/theme.ts`
- Create: `src/lib/currency.ts`

- [ ] **Créer `src/lib/theme.ts`** (source : `index.html.bak` lignes 54–79)

```ts
import type { CSSProperties } from 'react'
import type { Theme } from '../types'

export const T: { dark: Theme; light: Theme } = {
  dark: {
    bg: '#0F1117', card: '#191C26', el: '#22263A',
    tx: '#F0F2F7', sub: '#8B90A7', muted: '#4A4F66',
    bo: 'rgba(255,255,255,0.07)',
    mint: '#10E8C0', rose: '#FF6584', amber: '#F5A623',
    mD: 'rgba(16,232,192,0.12)', rD: 'rgba(255,101,132,0.12)', aD: 'rgba(245,166,35,0.12)',
    rB: 'rgba(255,101,132,0.25)',
  },
  light: {
    bg: '#F3F5FA', card: '#FFFFFF', el: '#E8EBF3',
    tx: '#0F1117', sub: '#5C6080', muted: '#9BA0B8',
    bo: 'rgba(0,0,0,0.07)',
    mint: '#08C8A8', rose: '#E8446A', amber: '#D4880A',
    mD: 'rgba(8,200,168,0.10)', rD: 'rgba(232,68,106,0.10)', aD: 'rgba(212,136,10,0.10)',
    rB: 'rgba(232,68,106,0.20)',
  },
}

type FontFamily = 'm' | 's' | 'o'
export const sp = (f: FontFamily = 'o', w = 400): CSSProperties => ({
  fontFamily: f === 'm' ? 'IBM Plex Mono' : f === 's' ? 'Sora' : 'Outfit',
  fontWeight: w,
})
```

- [ ] **Créer `src/lib/currency.ts`** (source : `index.html.bak` lignes 72–79)

```ts
import type { Currency } from '../types'

let CURRENCY: Currency = { sym: '€', pos: 'after', dec: ',' }

export const fmt = (n: number, d = 2): string => {
  const s = Math.abs(n).toFixed(d)
    .replace('.', CURRENCY.dec)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return CURRENCY.pos === 'before' ? CURRENCY.sym + s : s + ' ' + CURRENCY.sym
}

export const fmtS = (n: number, d = 2): string => (n < 0 ? '−' : '') + fmt(n, d)

export const setCurrency = (c: Currency): void => { CURRENCY = c }
```

- [ ] **Commit**

```
git add src/lib/theme.ts src/lib/currency.ts
git commit -m "feat: add theme and currency utilities"
```

---

## Task 5 — Composants partagés

**Files:**
- Create: `src/components/Icon.tsx`
- Create: `src/components/Donut.tsx`
- Create: `src/components/ConfirmDialog.tsx`
- Create: `src/components/Nav.tsx`
- Create: `src/components/BudgetAlert.tsx`
- Create: `src/components/RejectionAlert.tsx`
- Create: `src/components/IOSBanner.tsx`
- Create: `src/components/TxRow.tsx`
- Create: `src/components/Feed.tsx`

- [ ] **Créer `src/components/Icon.tsx`** (source : `index.html.bak` lignes 82–103)

```tsx
// IP = icon path map, Ic = Icon component
// Extraire IP et Ic depuis index.html.bak lignes 82-103
// Ajouter en tête :
import type { CSSProperties } from 'react'

export type IconName = 'home' | 'cards' | 'chart' | 'cog' | 'users' | 'plus' |
  'back' | 'warn' | 'sun' | 'moon' | 'logout' | 'eye' | 'eyeOff' | 'mic' | 'dots'

interface IconProps {
  n: IconName
  sz?: number
  c?: string
  label?: string | null
}

// Copier IP depuis index.html.bak et exporter :
export const IP: Record<IconName, string> = { /* copier depuis index.html.bak lignes 83-98 */ }

export const Icon = ({ n, sz = 20, c = 'currentColor', label = null }: IconProps) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={c}
    strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden={label ? undefined : 'true'}
    aria-label={label ?? undefined}
    role={label ? 'img' : undefined}>
    <path d={IP[n]} />
  </svg>
)
```

> Copier le dictionnaire `IP` complet depuis `index.html.bak` lignes 83–98.

- [ ] **Créer `src/components/Donut.tsx`** (source : `index.html.bak` lignes 108–123)

```tsx
import { fmt } from '../lib/currency'

interface DonutProps { spent: number; budget: number; col: string; sz?: number; sw?: number }

export const Donut = ({ spent, budget, col, sz = 72, sw = 6 }: DonutProps) => {
  const r = (sz - sw * 2) / 2, cx = sz / 2, cy = sz / 2
  const circ = 2 * Math.PI * r
  const pct = Math.min(budget > 0 ? spent / budget : 0, 1)
  const pctLabel = Math.round(pct * 100)
  return (
    <svg width={sz} height={sz} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}
      role="img"
      aria-label={`${pctLabel}% du budget utilisé (${fmt(spent, 0)} sur ${fmt(budget, 0)})`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={sw} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth={sw}
        strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray .7s ease' }} />
    </svg>
  )
}
```

- [ ] **Créer `src/components/ConfirmDialog.tsx`** (source : `index.html.bak` ~ligne 3115)

```tsx
import { sp } from '../lib/theme'
import type { Theme } from '../types'

interface Props { t: Theme; message: string; onConfirm: () => void; onCancel: () => void }

export const ConfirmDialog = ({ t, message, onConfirm, onCancel }: Props) => (
  <div role="dialog" aria-modal="true" aria-labelledby="cdlg-title"
    style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 32 }}>
    <div style={{ background: t.card, borderRadius: 20, padding: 24, width: '100%', maxWidth: 320 }}>
      <div id="cdlg-title" style={{ fontSize: 15, ...sp('s', 600), color: t.tx, textAlign: 'center', marginBottom: 20 }}>
        {message}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button autoFocus onClick={onCancel}
          style={{ flex: 1, padding: '13px', background: 'none', border: '1px solid ' + t.bo,
            borderRadius: 12, cursor: 'pointer', ...sp('o', 600), fontSize: 14, color: t.sub }}>
          Annuler
        </button>
        <button onClick={onConfirm}
          style={{ flex: 1, padding: '13px', background: t.rD, border: '1px solid ' + t.rose + '44',
            borderRadius: 12, cursor: 'pointer', ...sp('o', 700), fontSize: 14, color: t.rose }}>
          Supprimer
        </button>
      </div>
    </div>
  </div>
)
```

- [ ] **Créer `src/components/Nav.tsx`** (source : `index.html.bak` lignes 124–146)

Extraire Nav et appliquer ce header TypeScript :

```tsx
import { Icon } from './Icon'
import { sp } from '../lib/theme'
import type { Theme } from '../types'

type TabId = 'journal' | 'comptes' | 'analyse' | 'groupe' | 'reglages'
interface NavProps { tab: TabId; onTab: (id: TabId) => void; t: Theme }

export const Nav = ({ tab, onTab, t }: NavProps) => { /* corps depuis index.html.bak */ }
```

- [ ] **Créer `src/components/BudgetAlert.tsx`** (source : `index.html.bak` lignes 1408–1429)

```tsx
import { sp } from '../lib/theme'
import { fmtS } from '../lib/currency'
import type { Theme, AppData } from '../types'

interface Props { D: AppData; t: Theme; threshold: number; onDismiss: () => void }

export const BudgetAlert = ({ D, t, threshold, onDismiss }: Props) => { /* corps depuis index.html.bak */ }
```

- [ ] **Créer `src/components/RejectionAlert.tsx`** (source : `index.html.bak` lignes ~219–293)

Inclure aussi `calcARD` (lignes ~189–216) dans ce fichier (utilisé uniquement ici).

```tsx
import { useState } from 'react'
import { sp } from '../lib/theme'
import { fmt } from '../lib/currency'
import type { Theme, Account, Recurring } from '../types'

// calcARD et RejectionAlert
export const calcARD = (accounts: Account[], recurrings: Recurring[], days = 31) => { /* corps */ }

interface Props { t: Theme; accounts: Account[]; recurrings: Recurring[]; onManage: () => void }
export const RejectionAlert = ({ t, accounts, recurrings, onManage }: Props) => { /* corps */ }
```

- [ ] **Créer `src/components/IOSBanner.tsx`** (source : `index.html.bak` lignes ~4297–4322)

```tsx
import { sp } from '../lib/theme'
import type { Theme } from '../types'

interface Props { t: Theme; onDismiss: () => void }
export const IOSBanner = ({ t, onDismiss }: Props) => { /* corps depuis index.html.bak */ }
```

- [ ] **Créer `src/components/TxRow.tsx`** (source : `index.html.bak` lignes ~936–1002)

```tsx
import { useState } from 'react'
import { sp } from '../lib/theme'
import { fmtS } from '../lib/currency'
import type { Theme, Transaction } from '../types'

interface Props { tx: Transaction; t: Theme; onDelete: (id: string) => void }
export const TxRow = ({ tx, t, onDelete }: Props) => { /* corps depuis index.html.bak */ }
```

- [ ] **Créer `src/components/Feed.tsx`** (source : `index.html.bak` lignes ~1380–1404 + AddBtn ~1373)

```tsx
import { TxRow } from './TxRow'
import { Icon } from './Icon'
import { sp } from '../lib/theme'
import type { Theme, Transaction } from '../types'

interface FeedProps { txs: Transaction[]; t: Theme; onDelete: (id: string) => void }
export const Feed = ({ txs, t, onDelete }: FeedProps) => { /* corps */ }

interface AddBtnProps { t: Theme; onTap: () => void }
export const AddBtn = ({ t, onTap }: AddBtnProps) => { /* corps */ }
```

- [ ] **Vérifier que TypeScript compile**

```
npx tsc --noEmit
```

- [ ] **Commit**

```
git add src/components/
git commit -m "feat: add shared components (Icon, Donut, Nav, ConfirmDialog, Feed, TxRow, BudgetAlert, RejectionAlert, IOSBanner)"
```

---

## Task 6 — Hooks

**Files:**
- Create: `src/hooks/useData.ts`
- Create: `src/hooks/useRecurring.ts`
- Create: `src/hooks/useGroup.ts`

- [ ] **Créer `src/hooks/useData.ts`** (source : `index.html.bak` lignes ~1003–1206)

```ts
import { useState, useEffect, useCallback } from 'react'
import { db } from '../lib/supabase'
import type { AppData, Transaction, Account } from '../types'

export function useData(uid: string | null) {
  const [data, setData] = useState<AppData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // load, addTx, deleteTx, addTransfer : corps depuis index.html.bak

  return { data, loading, error, reload: load, addTx, deleteTx, addTransfer }
}
```

> Copier les corps de `load`, `addTx`, `deleteTx`, `addTransfer` depuis `index.html.bak` lignes 999–1206. Remplacer `db` par l'import, supprimer `useCallback` du destructuring global.

- [ ] **Créer `src/hooks/useRecurring.ts`** (source : `index.html.bak` lignes ~148–185)

```ts
import { useState, useEffect, useCallback } from 'react'
import { db } from '../lib/supabase'
import type { Recurring, Transaction } from '../types'

export function useRecurring(uid: string | null) {
  const [recurrings, setRecurrings] = useState<Recurring[]>([])
  const [allHistory, setAllHistory] = useState<Transaction[]>([])

  // load, addRecurring, deleteRecurring, updateRecurring : corps depuis index.html.bak

  return { recurrings, allHistory, reload: load, addRecurring, deleteRecurring, updateRecurring }
}
```

- [ ] **Créer `src/hooks/useGroup.ts`** (source : `index.html.bak` lignes ~1217–1270)

```ts
import { useState, useEffect, useCallback } from 'react'
import { db } from '../lib/supabase'
import type { Group, Member } from '../types'

export function useGroup(uid: string | null) {
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<Member[]>([])

  // load, createGroup, joinGroup, leaveGroup : corps depuis index.html.bak

  return { group, members, reload: load, createGroup, joinGroup, leaveGroup }
}
```

- [ ] **Vérifier TypeScript**

```
npx tsc --noEmit
```

- [ ] **Commit**

```
git add src/hooks/
git commit -m "feat: add hooks (useData, useRecurring, useGroup)"
```

---

## Task 7 — Écran Auth

**Files:**
- Create: `src/screens/Auth.tsx`

- [ ] **Créer `src/screens/Auth.tsx`** (source : `index.html.bak` lignes ~1271–1369)

```tsx
import { useState } from 'react'
import { db } from '../lib/supabase'
import { Icon as Ic } from '../components/Icon'
import { sp } from '../lib/theme'
import type { Theme } from '../types'

interface Props { t: Theme }
export const AuthScreen = ({ t }: Props) => { /* corps depuis index.html.bak */ }
```

- [ ] **Commit**

```
git add src/screens/Auth.tsx
git commit -m "feat: add Auth screen"
```

---

## Task 8 — Écran Home (Journal)

**Files:**
- Create: `src/screens/Home.tsx`

- [ ] **Créer `src/screens/Home.tsx`** (source : `index.html.bak` lignes ~1432–1772)

```tsx
import { useState } from 'react'
import { Donut } from '../components/Donut'
import { Feed } from '../components/Feed'
import { AddBtn } from '../components/Feed'
import { Icon as Ic } from '../components/Icon'
import { sp } from '../lib/theme'
import { fmt, fmtS } from '../lib/currency'
import type { Theme, AppData, Recurring, Group, Member } from '../types'

interface Props {
  D: AppData; t: Theme
  onAcc: () => void; onAdd: () => void; onEditBudget: () => void
  onDelete: (id: string) => void; rtConnected: boolean; profile: any
  onSearch: () => void; recurrings: Recurring[]; onManageRecurring: () => void
  onTransfer: () => void
}
export const Home = (props: Props) => { /* corps depuis index.html.bak */ }
```

- [ ] **Commit**

```
git add src/screens/Home.tsx
git commit -m "feat: add Home screen"
```

---

## Task 9 — Écrans Comptes et Analyse

**Files:**
- Create: `src/screens/Comptes.tsx`
- Create: `src/screens/Analyse.tsx`

- [ ] **Créer `src/screens/Comptes.tsx`** (source : `index.html.bak` lignes ~1773–1813)

```tsx
import { Icon as Ic } from '../components/Icon'
import { Donut } from '../components/Donut'
import { sp } from '../lib/theme'
import { fmt } from '../lib/currency'
import type { Theme, AppData, Account } from '../types'

interface Props { D: AppData; t: Theme; onEdit: (a: Account) => void; onNew: () => void; onImport: (bank: string) => void }
export const Comptes = ({ D, t, onEdit, onNew, onImport }: Props) => { /* corps */ }
```

- [ ] **Créer `src/screens/Analyse.tsx`** (source : `index.html.bak` lignes ~1814–2343)

Inclure `DonutCats` (composant interne) et `detectRecurrings` (déplacé ici depuis les lignes ~298–366) si non déjà déplacé dans RecurringManager.

```tsx
import { useState } from 'react'
import { sp } from '../lib/theme'
import { fmt } from '../lib/currency'
import type { Theme, AppData, Transaction } from '../types'

interface Props { D: AppData; t: Theme; allTxs: Transaction[]; allHistory: Transaction[] }
export const Analyse = ({ D, t, allTxs, allHistory }: Props) => { /* corps */ }
```

- [ ] **Commit**

```
git add src/screens/Comptes.tsx src/screens/Analyse.tsx
git commit -m "feat: add Comptes and Analyse screens"
```

---

## Task 10 — Écran Groupe

**Files:**
- Create: `src/screens/Groupe.tsx`

- [ ] **Créer `src/screens/Groupe.tsx`** (source : `index.html.bak` lignes ~2354–2649)

Inclure `CAT_COMMUNE` en constante locale, `ConfirmDialog` importé.

```tsx
import { useState } from 'react'
import { db } from '../lib/supabase'
import { Icon as Ic } from '../components/Icon'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { sp } from '../lib/theme'
import { fmt, fmtS } from '../lib/currency'
import type { Theme, Transaction, Group, Member } from '../types'

interface Props {
  t: Theme; uid: string; group: Group | null; members: Member[]
  createGroup: (name: string, myName: string) => Promise<any>
  joinGroup: (code: string, myName: string) => Promise<any>
  leaveGroup: () => Promise<void>
  txs: Transaction[]; reload?: () => void
}
export const Groupe = (props: Props) => { /* corps depuis index.html.bak */ }
```

- [ ] **Commit**

```
git add src/screens/Groupe.tsx
git commit -m "feat: add Groupe screen"
```

---

## Task 11 — Écran Réglages

**Files:**
- Create: `src/screens/Reglages.tsx`

- [ ] **Créer `src/screens/Reglages.tsx`** (source : `index.html.bak` lignes ~3257–4140)

Inclure dans ce fichier : `NotifSettings`, `Settings`. Importer `ProfileScreen`, `PinSetup`, `ResetModal` depuis les modales.

```tsx
import { useState } from 'react'
import { db } from '../lib/supabase'
import { Icon as Ic } from '../components/Icon'
import { sp } from '../lib/theme'
import { setCurrency } from '../lib/currency'
import type { Theme, Profile } from '../types'
import type { User } from '@supabase/supabase-js'

interface SettingsProps {
  t: Theme; dark: boolean; toggle: () => void; user: User
  onLogout: () => void; profile: Profile
  onProfile: () => void; onSecurity: () => void
  onRecurring: () => void; onReset: () => void
}
export const Settings = (props: SettingsProps) => { /* corps depuis index.html.bak */ }
```

- [ ] **Commit**

```
git add src/screens/Reglages.tsx
git commit -m "feat: add Reglages screen"
```

---

## Task 12 — Modales : ExpEntry, EditBudget, EditAccount

**Files:**
- Create: `src/screens/modals/ExpEntry.tsx`
- Create: `src/screens/modals/EditBudget.tsx`
- Create: `src/screens/modals/EditAccount.tsx`

- [ ] **Créer `src/screens/modals/ExpEntry.tsx`** (source : `index.html.bak` lignes ~2687–3010)

```tsx
import { useState } from 'react'
import { db } from '../../lib/supabase'
import { Icon as Ic } from '../../components/Icon'
import { sp } from '../../lib/theme'
import { fmt } from '../../lib/currency'
import type { Theme, AppData, Transaction, Recurring, Group, Member } from '../../types'

interface Props {
  D: AppData; t: Theme; onClose: () => void
  onSave: (payload: any) => Promise<any>
  group: Group | null; members: Member[]; uid: string
  recurrings: Recurring[]; allHistory: Transaction[]
}
export const ExpEntry = (props: Props) => { /* corps depuis index.html.bak */ }
```

- [ ] **Créer `src/screens/modals/EditBudget.tsx`** (source : `index.html.bak` lignes ~3011–3110)

```tsx
import { useState } from 'react'
import { db } from '../../lib/supabase'
import { sp } from '../../lib/theme'
import { fmt } from '../../lib/currency'
import type { Theme, AppData } from '../../types'

interface Props { D: AppData; t: Theme; uid: string; onClose: () => void; onSaved: () => void; defaultPeriod?: string }
export const EditBudget = (props: Props) => { /* corps depuis index.html.bak */ }
```

- [ ] **Créer `src/screens/modals/EditAccount.tsx`** (source : `index.html.bak` lignes ~3138–3256)

```tsx
import { useState } from 'react'
import { db } from '../../lib/supabase'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { sp } from '../../lib/theme'
import { fmt } from '../../lib/currency'
import type { Theme, Account } from '../../types'

interface Props { account: Account | null; isNew: boolean; t: Theme; uid: string; onClose: () => void; onSaved: () => void }
export const EditAccount = (props: Props) => { /* corps depuis index.html.bak */ }
```

- [ ] **Commit**

```
git add src/screens/modals/ExpEntry.tsx src/screens/modals/EditBudget.tsx src/screens/modals/EditAccount.tsx
git commit -m "feat: add ExpEntry, EditBudget, EditAccount modals"
```

---

## Task 13 — Modales : TransferEntry, RecurringManager

**Files:**
- Create: `src/screens/modals/TransferEntry.tsx`
- Create: `src/screens/modals/RecurringManager.tsx`

- [ ] **Créer `src/screens/modals/TransferEntry.tsx`** (source : `index.html.bak` lignes ~734–935)

```tsx
import { useState } from 'react'
import { sp } from '../../lib/theme'
import { fmt } from '../../lib/currency'
import type { Theme, AppData } from '../../types'

interface Props { D: AppData; t: Theme; onClose: () => void; onTransfer: (p: any) => Promise<any> }
export const TransferEntry = (props: Props) => { /* corps depuis index.html.bak */ }
```

- [ ] **Créer `src/screens/modals/RecurringManager.tsx`** (source : `index.html.bak` lignes ~374–724)

Inclure `detectRecurrings` (lignes ~298–366) en fonction locale ou importée depuis un utilitaire.

```tsx
import { useState, useMemo } from 'react'
import { sp } from '../../lib/theme'
import { fmt } from '../../lib/currency'
import type { Theme, Account, Recurring, Transaction, DetectedRecurring } from '../../types'

interface Props {
  t: Theme; accounts: Account[]; recurrings: Recurring[]
  allHistory: Transaction[]; onAdd: (r: any) => Promise<any>
  onDelete: (id: string) => Promise<void>; onUpdate: (id: string, fields: any) => Promise<void>
  onClose: () => void
}
export const RecurringManager = (props: Props) => { /* corps depuis index.html.bak */ }
```

- [ ] **Commit**

```
git add src/screens/modals/TransferEntry.tsx src/screens/modals/RecurringManager.tsx
git commit -m "feat: add TransferEntry and RecurringManager modals"
```

---

## Task 14 — Modales : Import, BankPicker

**Files:**
- Create: `src/screens/modals/ImportNickel.tsx`
- Create: `src/screens/modals/ImportCSV.tsx`
- Create: `src/screens/modals/BankPicker.tsx`

- [ ] **Créer `src/screens/modals/ImportNickel.tsx`** (source : `index.html.bak` lignes ~4323–4622)

Inclure `NICKEL_CATS`, `NICKEL_ICONS` en constantes locales.

```tsx
import { useState } from 'react'
import { db } from '../../lib/supabase'
import { sp } from '../../lib/theme'
import type { Theme, Account } from '../../types'

interface Props { t: Theme; uid: string; accounts: Account[]; onClose: () => void; onImported: () => void }
export const ImportNickel = (props: Props) => { /* corps depuis index.html.bak */ }
```

- [ ] **Créer `src/screens/modals/ImportCSV.tsx`** (source : `index.html.bak` lignes ~4623–4900)

```tsx
import { useState } from 'react'
import { db } from '../../lib/supabase'
import { sp } from '../../lib/theme'
import type { Theme, Account } from '../../types'

interface Props { t: Theme; uid: string; accounts: Account[]; bank: 'cm' | 'qonto'; onClose: () => void; onImported: () => void }
export const ImportCSV = (props: Props) => { /* corps depuis index.html.bak */ }
```

- [ ] **Créer `src/screens/modals/BankPicker.tsx`** (source : `index.html.bak` lignes ~4901–4927)

```tsx
import { sp } from '../../lib/theme'
import type { Theme } from '../../types'

interface Props { t: Theme; onPick: (bank: string) => void; onClose: () => void }
export const BankPicker = ({ t, onPick, onClose }: Props) => { /* corps depuis index.html.bak */ }
```

- [ ] **Commit**

```
git add src/screens/modals/ImportNickel.tsx src/screens/modals/ImportCSV.tsx src/screens/modals/BankPicker.tsx
git commit -m "feat: add Import and BankPicker modals"
```

---

## Task 15 — Modales : Search, Lock, Pin, Profile, Reset

**Files:**
- Create: `src/screens/modals/SearchScreen.tsx`
- Create: `src/screens/modals/LockScreen.tsx`
- Create: `src/screens/modals/PinSetup.tsx`
- Create: `src/screens/modals/ProfileScreen.tsx`
- Create: `src/screens/modals/ResetModal.tsx`

- [ ] **Créer `src/screens/modals/SearchScreen.tsx`** (source : `index.html.bak` lignes ~3448–3785)

```tsx
import { useState, useMemo } from 'react'
import { TxRow } from '../../components/TxRow'
import { Icon as Ic } from '../../components/Icon'
import { sp } from '../../lib/theme'
import { fmt } from '../../lib/currency'
import type { Theme, Transaction, Account } from '../../types'

interface Props { t: Theme; allTxs: Transaction[]; accounts: Account[]; onClose: () => void }
export const SearchScreen = (props: Props) => { /* corps depuis index.html.bak */ }
```

- [ ] **Créer `src/screens/modals/LockScreen.tsx`** (source : `index.html.bak` lignes ~3786–3874)

```tsx
import { useState } from 'react'
import { sp } from '../../lib/theme'
import type { Theme } from '../../types'

interface Props { t: Theme; onUnlock: () => void }
export const LockScreen = ({ t, onUnlock }: Props) => { /* corps depuis index.html.bak */ }
```

- [ ] **Créer `src/screens/modals/PinSetup.tsx`** (source : `index.html.bak` lignes ~3875–4017)

```tsx
import { useState } from 'react'
import { sp } from '../../lib/theme'
import type { Theme } from '../../types'
import type { User } from '@supabase/supabase-js'

interface Props { t: Theme; user: User | null; onClose: () => void }
export const PinSetup = ({ t, user, onClose }: Props) => { /* corps depuis index.html.bak */ }
```

- [ ] **Créer `src/screens/modals/ProfileScreen.tsx`** (source : `index.html.bak` lignes ~3302–3447)

```tsx
import { useState } from 'react'
import { sp } from '../../lib/theme'
import { setCurrency } from '../../lib/currency'
import type { Theme, Profile } from '../../types'
import type { User } from '@supabase/supabase-js'

interface Props { t: Theme; user: User | null; onClose: () => void; onSaved: (p: Profile) => void }
export const ProfileScreen = (props: Props) => { /* corps depuis index.html.bak */ }
```

- [ ] **Créer `src/screens/modals/ResetModal.tsx`** (source : `index.html.bak` lignes ~4141–4296)

```tsx
import { useState } from 'react'
import { db } from '../../lib/supabase'
import { sp } from '../../lib/theme'
import type { Theme } from '../../types'

interface Props { t: Theme; uid: string; onClose: () => void; onDone: () => void }
export const ResetModal = (props: Props) => { /* corps depuis index.html.bak */ }
```

- [ ] **Commit**

```
git add src/screens/modals/
git commit -m "feat: add Search, Lock, Pin, Profile, Reset modals"
```

---

## Task 16 — App.tsx principal

**Files:**
- Create: `src/App.tsx`

- [ ] **Créer `src/App.tsx`** (source : `index.html.bak` lignes ~4928–5087)

```tsx
import { useState, useEffect } from 'react'
import { db } from './lib/supabase'
import { T } from './lib/theme'
import { setCurrency } from './lib/currency'
import { useData } from './hooks/useData'
import { useRecurring } from './hooks/useRecurring'
import { useGroup } from './hooks/useGroup'
import { Nav } from './components/Nav'
import { BudgetAlert } from './components/BudgetAlert'
import { RejectionAlert } from './components/RejectionAlert'
import { IOSBanner } from './components/IOSBanner'
import { AuthScreen } from './screens/Auth'
import { Home } from './screens/Home'
import { Comptes } from './screens/Comptes'
import { Analyse } from './screens/Analyse'
import { Groupe } from './screens/Groupe'
import { Settings } from './screens/Reglages'
import { ExpEntry } from './screens/modals/ExpEntry'
import { EditBudget } from './screens/modals/EditBudget'
import { EditAccount } from './screens/modals/EditAccount'
import { TransferEntry } from './screens/modals/TransferEntry'
import { RecurringManager } from './screens/modals/RecurringManager'
import { SearchScreen } from './screens/modals/SearchScreen'
import { ResetModal } from './screens/modals/ResetModal'
import { LockScreen } from './screens/modals/LockScreen'
import { PinSetup } from './screens/modals/PinSetup'
import { ImportNickel } from './screens/modals/ImportNickel'
import { ImportCSV } from './screens/modals/ImportCSV'
import { BankPicker } from './screens/modals/BankPicker'
import { ProfileScreen } from './screens/modals/ProfileScreen'
import type { Profile } from './types'
import type { Session } from '@supabase/supabase-js'

// Extraire le corps de la fonction App depuis index.html.bak lignes 4928-5087
// Remplacer T.dark/T.light par import { T }
// La variable t = dark ? T.dark : T.light (inchangée)
// sp, fmt, fmtS : retirer (plus utilisés directement dans App)

export default function App() { /* corps depuis index.html.bak */ }
```

- [ ] **Vérifier la compilation**

```
npx tsc --noEmit
```

Résultat attendu : 0 erreur ou uniquement des avertissements mineurs.

- [ ] **Commit**

```
git add src/App.tsx
git commit -m "feat: add main App component"
```

---

## Task 17 — Build final + vérification

**Files:**
- Suppression : scripts CDN de l'ancien `index.html` (déjà remplacé à la Task 1)
- Cleanup : `index.html.bak` (optionnel)

- [ ] **Build de production**

```
npm run build
```

Résultat attendu : dossier `dist/` créé, pas d'erreur TypeScript ni Vite.

- [ ] **Prévisualiser localement**

```
npm run preview
```

Ouvrir `http://localhost:4173` et vérifier :
- Écran de connexion visible
- Aucune erreur console
- PWA installable (manifest présent)

- [ ] **Vérifier le service worker**

Ouvrir DevTools → Application → Service Workers : `sw.js` enregistré. Cache `qdq-v4` présent avec les 6 assets locaux.

- [ ] **Mettre à jour `vercel.json` si nécessaire**

Le `vercel.json` existant est compatible. Vérifier que le `outputDirectory` pointe bien sur `dist` :

```json
{
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  ...
}
```

- [ ] **Configurer les env vars sur Vercel**

Dans le dashboard Vercel → Settings → Environment Variables, ajouter :
- `VITE_SUPABASE_URL` = valeur de `.env`
- `VITE_SUPABASE_KEY` = valeur de `.env`

- [ ] **Supprimer le fichier de backup**

```
rm index.html.bak
```

- [ ] **Commit final**

```
git add .
git commit -m "feat: complete Vite + TypeScript migration"
```

---

## Résumé des fichiers créés

| Fichier | Source (index.html.bak) |
|---------|------------------------|
| `package.json`, `vite.config.ts`, `tsconfig*.json` | Nouveau |
| `index.html` | Nouveau (shell) |
| `src/main.tsx`, `src/index.css` | Extraits de `<head>` + `<body>` |
| `src/lib/supabase.ts` | Lignes 49–51 |
| `src/lib/theme.ts` | Lignes 54–71 |
| `src/lib/currency.ts` | Lignes 72–79 |
| `src/types/index.ts` | Nouveau |
| `src/components/Icon.tsx` | Lignes 82–103 |
| `src/components/Donut.tsx` | Lignes 108–123 |
| `src/components/Nav.tsx` | Lignes 124–146 |
| `src/components/ConfirmDialog.tsx` | ~Ligne 3115 |
| `src/components/BudgetAlert.tsx` | Lignes 1408–1429 |
| `src/components/RejectionAlert.tsx` | Lignes 186–293 |
| `src/components/IOSBanner.tsx` | Lignes 4297–4322 |
| `src/components/TxRow.tsx` | Lignes 936–1002 |
| `src/components/Feed.tsx` | Lignes 1373–1404 |
| `src/hooks/useData.ts` | Lignes 1003–1206 |
| `src/hooks/useRecurring.ts` | Lignes 148–185 |
| `src/hooks/useGroup.ts` | Lignes 1217–1270 |
| `src/screens/Auth.tsx` | Lignes 1271–1369 |
| `src/screens/Home.tsx` | Lignes 1432–1772 |
| `src/screens/Comptes.tsx` | Lignes 1773–1813 |
| `src/screens/Analyse.tsx` | Lignes 1814–2343 |
| `src/screens/Groupe.tsx` | Lignes 2354–2649 |
| `src/screens/Reglages.tsx` | Lignes 3257–4140 |
| `src/screens/modals/ExpEntry.tsx` | Lignes 2687–3010 |
| `src/screens/modals/EditBudget.tsx` | Lignes 3011–3110 |
| `src/screens/modals/EditAccount.tsx` | Lignes 3138–3256 |
| `src/screens/modals/TransferEntry.tsx` | Lignes 734–935 |
| `src/screens/modals/RecurringManager.tsx` | Lignes 298–724 |
| `src/screens/modals/ImportNickel.tsx` | Lignes 4323–4622 |
| `src/screens/modals/ImportCSV.tsx` | Lignes 4623–4900 |
| `src/screens/modals/BankPicker.tsx` | Lignes 4901–4927 |
| `src/screens/modals/SearchScreen.tsx` | Lignes 3448–3785 |
| `src/screens/modals/LockScreen.tsx` | Lignes 3786–3874 |
| `src/screens/modals/PinSetup.tsx` | Lignes 3875–4017 |
| `src/screens/modals/ProfileScreen.tsx` | Lignes 3302–3447 |
| `src/screens/modals/ResetModal.tsx` | Lignes 4141–4296 |
| `src/App.tsx` | Lignes 4928–5087 |

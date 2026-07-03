# QDQ v2 Phase 1 — Fondations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Base saine pour QDQ v2 — tests 100% verts, thème sombre auto, fichiers refactorés, imports unifiés, layout responsive desktop.

**Architecture:** Refactor sans changement fonctionnel visible (sauf thème + desktop). Les parsers Nickel/CM/Qonto rejoignent `src/lib/parsers/`, `ImportUniversal` devient l'unique modale d'import. Le thème est résolu par un hook `useTheme` (auto/clair/sombre). Le responsive s'appuie sur un hook `useBreakpoint` + composant `Sidebar` desktop.

**Tech Stack:** React 18, TypeScript 5, Vite, Vitest + jsdom + MSW, fake-indexeddb, Supabase. Aucune nouvelle dépendance runtime.

**Spec:** `docs/superpowers/specs/2026-07-03-qdq-v2-design.md` (sections Phase 1)

---

## File Structure

| Fichier | Action | Responsabilité |
|---|---|---|
| `src/__tests__/setup.ts` | Modify | + fake-indexeddb |
| `src/hooks/useTheme.ts` | Create | Résolution thème auto/light/dark + persistance |
| `src/hooks/__tests__/useTheme.test.ts` | Create | Tests résolution |
| `src/App.tsx` | Modify | useTheme, routing imports simplifié, layout responsive |
| `src/screens/Reglages.tsx` | Modify | Toggle thème 3 états |
| `src/lib/expenseCategories.ts` | Create | Constante CATS_E partagée |
| `src/lib/merchantMemory.ts` | Create | buildMerchantMemory + searchMerchants (pur) |
| `src/lib/__tests__/merchantMemory.test.ts` | Create | Tests logique pure |
| `src/screens/modals/ExpEntry.tsx` | Modify | Consomme les modules extraits |
| `src/lib/parsers/nickel.ts` | Create | parseNickelPDF + hashAB + getStoredHashes |
| `src/lib/parsers/cm.ts` | Create | parseCM (3 formats auto-détectés) |
| `src/lib/parsers/qonto.ts` | Create | parseQonto |
| `src/lib/parsers/index.ts` | Modify | + nickel/cm/qonto dans SUPPORTED_BANKS, detectAndParseFile async |
| `src/screens/modals/ImportUniversal.tsx` | Modify | Support PDF multi-fichiers + hash dedup |
| `src/screens/modals/ImportNickel.tsx` | Delete | Absorbé |
| `src/screens/modals/ImportCSV.tsx` | Delete | Absorbé |
| `src/screens/modals/BankPicker.tsx` | Modify | SUPPORTED_BANKS uniquement, plus de LEGACY |
| `src/hooks/useBreakpoint.ts` | Create | matchMedia ≥768px |
| `src/components/Sidebar.tsx` | Create | Nav verticale desktop |

---

### Task 1: Réparer les 7 tests IndexedDB

**Files:**
- Modify: `src/__tests__/setup.ts`
- Modify: `package.json` (devDependency)

- [ ] **Step 1: Installer fake-indexeddb**

```bash
npm install -D fake-indexeddb
```

- [ ] **Step 2: Vérifier que les tests échouent encore**

Run: `npm test -- --run src/hooks/__tests__/useOfflineSync.test.ts`
Expected: FAIL avec `ReferenceError: indexedDB is not defined`

- [ ] **Step 3: Importer le polyfill dans le setup**

`src/__tests__/setup.ts` — ajouter en **première ligne** :

```typescript
import 'fake-indexeddb/auto'
import { beforeAll, afterAll, afterEach } from 'vitest'
import { server } from './mocks/handlers'

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

- [ ] **Step 4: Vérifier que toute la suite passe**

Run: `npm test -- --run`
Expected: `Tests 130 passed (130)` — 0 failed

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/setup.ts package.json package-lock.json
git commit -m "fix(tests): fake-indexeddb pour les tests useOfflineSync — 130/130 verts"
```

---

### Task 2: Hook useTheme (auto / clair / sombre)

**Files:**
- Create: `src/hooks/useTheme.ts`
- Test: `src/hooks/__tests__/useTheme.test.ts`

Le type `Theme` existe dans `src/types/index.ts`. Les palettes `T.dark` et `T.light` existent déjà dans `src/lib/theme.ts` — ne pas les modifier.

- [ ] **Step 1: Écrire le test qui échoue**

`src/hooks/__tests__/useTheme.test.ts` :

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme } from '../useTheme'
import { T } from '../../lib/theme'

function mockMatchMedia(prefersDark: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = []
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('dark') ? prefersDark : false,
    media: query,
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.push(cb),
    removeEventListener: vi.fn(),
  }))
  return listeners
}

describe('useTheme', () => {
  beforeEach(() => localStorage.clear())

  it('mode auto + système clair → palette light', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    expect(result.current.mode).toBe('auto')
    expect(result.current.t).toBe(T.light)
  })

  it('mode auto + système sombre → palette dark', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useTheme())
    expect(result.current.t).toBe(T.dark)
  })

  it('setMode("dark") force la palette dark et persiste', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setMode('dark'))
    expect(result.current.t).toBe(T.dark)
    expect(localStorage.getItem('qdq-theme')).toBe('dark')
  })

  it('mode persisté relu au montage', () => {
    mockMatchMedia(false)
    localStorage.setItem('qdq-theme', 'dark')
    const { result } = renderHook(() => useTheme())
    expect(result.current.mode).toBe('dark')
    expect(result.current.t).toBe(T.dark)
  })

  it('changement système en mode auto met à jour la palette', () => {
    const listeners = mockMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    expect(result.current.t).toBe(T.light)
    act(() => listeners.forEach(cb => cb({ matches: true })))
    expect(result.current.t).toBe(T.dark)
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test -- --run src/hooks/__tests__/useTheme.test.ts`
Expected: FAIL — `Cannot find module '../useTheme'`

- [ ] **Step 3: Implémenter le hook**

`src/hooks/useTheme.ts` :

```typescript
import { useState, useEffect, useCallback } from 'react'
import { T } from '../lib/theme'
import type { Theme } from '../types'

export type ThemeMode = 'auto' | 'light' | 'dark'
const KEY = 'qdq-theme'

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function useTheme(): { t: Theme; mode: ThemeMode; setMode: (m: ThemeMode) => void } {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'auto'
  })
  const [sysDark, setSysDark] = useState(systemPrefersDark)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: { matches: boolean }) => setSysDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m)
    if (m === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, m)
  }, [])

  const dark = mode === 'dark' || (mode === 'auto' && sysDark)
  return { t: dark ? T.dark : T.light, mode, setMode }
}
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `npm test -- --run src/hooks/__tests__/useTheme.test.ts`
Expected: 5 passed

Note : si `@testing-library/react` n'est pas installé, `npm install -D @testing-library/react` d'abord.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTheme.ts src/hooks/__tests__/useTheme.test.ts package.json package-lock.json
git commit -m "feat(theme): hook useTheme — auto/clair/sombre avec persistance et suivi système"
```

---

### Task 3: Brancher useTheme dans App + toggle Réglages

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/screens/Reglages.tsx`

- [ ] **Step 1: App.tsx — remplacer le thème en dur**

Dans `src/App.tsx` :

1. Ajouter l'import : `import { useTheme } from './hooks/useTheme'`
2. Remplacer la ligne `const t = T.light;` par :

```typescript
const { t, mode: themeMode, setMode: setThemeMode } = useTheme();
```

3. Supprimer l'import `T` de `./lib/theme` s'il n'est plus utilisé ailleurs dans App.tsx (`sp` reste).
4. Passer le toggle aux Réglages — la ligne du render `tab === 'profil'` devient :

```tsx
if (tab === 'profil') return <Settings t={t} user={session.user} onLogout={logout} profile={profile} onProfile={() => setShowProfile(true)} onSecurity={() => setShowPinSetup(true)} onRecurring={() => setShowRecurring(true)} onReset={() => setShowReset(true)} onGroupe={() => setTab('groupe')} themeMode={themeMode} onThemeMode={setThemeMode} />;
```

- [ ] **Step 2: Reglages.tsx — ajouter le toggle**

Dans `src/screens/Reglages.tsx` :

1. Étendre l'interface des props :

```typescript
import type { ThemeMode } from '../hooks/useTheme'
// dans l'interface Props existante, ajouter :
themeMode: ThemeMode
onThemeMode: (m: ThemeMode) => void
```

2. Ajouter une section « Apparence » juste au-dessus de la section alertes budget, en suivant le pattern des boutons de seuil (70%/80%/90%/100%) déjà présents :

```tsx
{/* Apparence */}
<div style={{ background: t.card, borderRadius: 16, padding: 16, marginBottom: 12 }}>
  <div style={{ fontSize: 13, ...sp('s', 600), color: t.tx, marginBottom: 10 }}>🎨 Apparence</div>
  <div role="group" aria-label="Thème" style={{ display: 'flex', gap: 8 }}>
    {([['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']] as const).map(([m, lb]) => (
      <button key={m} onClick={() => onThemeMode(m)} aria-pressed={themeMode === m}
        style={{
          flex: 1, padding: '9px 0', borderRadius: 10, cursor: 'pointer', fontSize: 12,
          ...sp('o', themeMode === m ? 600 : 400),
          background: themeMode === m ? t.primary : t.el,
          color: themeMode === m ? '#fff' : t.sub,
          border: '1px solid ' + (themeMode === m ? t.primary : t.bo),
        }}>{lb}</button>
    ))}
  </div>
</div>
```

- [ ] **Step 3: Vérifier build + comportement**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 erreur.

Vérif manuelle : `npm run dev`, ouvrir l'app, Réglages → cliquer « Sombre » → fond passe à `#0D1B3E`. Recharger → sombre persiste. « Auto » → suit le système.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/screens/Reglages.tsx
git commit -m "feat(theme): toggle Auto/Clair/Sombre dans Réglages, App consomme useTheme"
```

---

### Task 4: Extraire la logique pure d'ExpEntry

**Files:**
- Create: `src/lib/expenseCategories.ts`
- Create: `src/lib/merchantMemory.ts`
- Test: `src/lib/__tests__/merchantMemory.test.ts`
- Modify: `src/screens/modals/ExpEntry.tsx`

`ExpEntry.tsx` (29 KB) contient la constante `CATS_E` (lignes 15-37) et deux fonctions pures `buildMerchantMemory` / `searchMerchants` (lignes 40-66). On les extrait avec typage propre.

- [ ] **Step 1: Écrire le test qui échoue**

`src/lib/__tests__/merchantMemory.test.ts` :

```typescript
import { describe, it, expect } from 'vitest'
import { buildMerchantMemory, searchMerchants } from '../merchantMemory'
import type { Transaction } from '../../types'

const tx = (m: string, amt: number, cat: string, acc = 'acc1', ico = '🛒'): Transaction =>
  ({ id: Math.random().toString(), m, amt, cat, acc, ico, dt: '2026-07-01' } as Transaction)

describe('buildMerchantMemory', () => {
  it('agrège par marchand avec catégorie et compte majoritaires', () => {
    const mem = buildMerchantMemory([
      tx('Carrefour', -20, 'Courses', 'acc1'),
      tx('Carrefour', -35, 'Courses', 'acc1'),
      tx('Carrefour', -12, 'Maison', 'acc2'),
    ])
    expect(mem['carrefour'].cat).toBe('Courses')
    expect(mem['carrefour'].accId).toBe('acc1')
    expect(mem['carrefour'].count).toBe(3)
  })

  it('ignore revenus et virements internes', () => {
    const mem = buildMerchantMemory([
      tx('Salaire', 2000, 'Salaire'),
      tx('Épargne', -100, 'Virement interne'),
    ])
    expect(Object.keys(mem)).toHaveLength(0)
  })
})

describe('searchMerchants', () => {
  const mem = buildMerchantMemory([
    tx('Carrefour', -20, 'Courses'),
    tx('Carrefour Market', -15, 'Courses'),
    tx('Amazon', -30, 'Loisirs'),
  ])

  it('retourne les marchands correspondants triés par fréquence', () => {
    const res = searchMerchants('carr', mem)
    expect(res.map(r => r.name)).toEqual(['Carrefour', 'Carrefour Market'])
  })

  it('requête < 2 caractères → vide', () => {
    expect(searchMerchants('c', mem)).toEqual([])
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test -- --run src/lib/__tests__/merchantMemory.test.ts`
Expected: FAIL — `Cannot find module '../merchantMemory'`

- [ ] **Step 3: Créer merchantMemory.ts**

`src/lib/merchantMemory.ts` — déplacer les fonctions depuis ExpEntry en les typant :

```typescript
import type { Transaction } from '../types'

export interface MerchantEntry {
  name: string
  cat: string
  accId: string
  ico: string
  count: number
}

export function buildMerchantMemory(history: Transaction[]): Record<string, MerchantEntry> {
  const map: Record<string, { name: string; catFreq: Record<string, number>; accFreq: Record<string, number>; ico: string; count: number }> = {}
  ;(history || []).filter(tx => tx.amt < 0 && tx.m && tx.cat !== 'Virement interne').forEach(tx => {
    const key = tx.m.trim().toLowerCase()
    if (!map[key]) map[key] = { name: tx.m, catFreq: {}, accFreq: {}, ico: tx.ico || '📦', count: 0 }
    map[key].count++
    map[key].catFreq[tx.cat || 'Autre'] = (map[key].catFreq[tx.cat || 'Autre'] || 0) + 1
    map[key].accFreq[tx.acc || ''] = (map[key].accFreq[tx.acc || ''] || 0) + 1
    if (tx.ico) map[key].ico = tx.ico
  })
  const result: Record<string, MerchantEntry> = {}
  Object.entries(map).forEach(([key, v]) => {
    const cat = Object.entries(v.catFreq).sort(([, a], [, b]) => b - a)[0]?.[0] || 'Autre'
    const accId = Object.entries(v.accFreq).sort(([, a], [, b]) => b - a)[0]?.[0] || ''
    result[key] = { name: v.name, cat, accId, ico: v.ico, count: v.count }
  })
  return result
}

export function searchMerchants(query: string, memory: Record<string, MerchantEntry>, limit = 4): MerchantEntry[] {
  if (!query || query.length < 2) return []
  const q = query.trim().toLowerCase()
  return Object.values(memory)
    .filter(m => m.name.toLowerCase().includes(q))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}
```

- [ ] **Step 4: Créer expenseCategories.ts**

`src/lib/expenseCategories.ts` — déplacer la constante `CATS_E` (contenu identique aux lignes 15-37 d'ExpEntry, 21 entrées de Courses à Autre) :

```typescript
export interface ExpenseCategory { n: string; ico: string; col: string }

export const CATS_E: ExpenseCategory[] = [
  { n: 'Courses',       ico: '🛒', col: '#10E8C0' },
  { n: 'Restaurant',    ico: '🍽️', col: '#F5A623' },
  { n: 'Transport',     ico: '🚗', col: '#6B7FD7' },
  { n: 'Loisirs',       ico: '🎮', col: '#EC4899' },
  { n: 'Santé',         ico: '💊', col: '#EF4444' },
  { n: 'Maison',        ico: '🏠', col: '#8B5CF6' },
  { n: 'Vêtements',     ico: '👗', col: '#F472B6' },
  { n: 'Épargne',       ico: '🏦', col: '#14B8A6' },
  { n: 'Abonnements',   ico: '📱', col: '#3B82F6' },
  { n: 'Énergie',       ico: '⚡', col: '#F59E0B' },
  { n: 'Banque',        ico: '🏛️', col: '#64748B' },
  { n: 'Voyage',        ico: '✈️', col: '#06B6D4' },
  { n: 'Sport',         ico: '🏋️', col: '#84CC16' },
  { n: 'Education',     ico: '📚', col: '#A78BFA' },
  { n: 'Animaux',       ico: '🐾', col: '#F97316' },
  { n: 'Cadeaux',       ico: '🎁', col: '#EC4899' },
  { n: 'Médias',        ico: '📰', col: '#8B5CF6' },
  { n: 'Impôts',        ico: '🏛️', col: '#94A3B8' },
  { n: 'Remboursement', ico: '💸', col: '#06B6D4' },
  { n: 'Salaire',       ico: '💰', col: '#84CC16' },
  { n: 'Autre',         ico: '📦', col: '#8B90A7' },
]
```

- [ ] **Step 5: Mettre à jour ExpEntry.tsx**

Dans `src/screens/modals/ExpEntry.tsx` :
1. Supprimer les lignes 15-66 (constante `CATS_E` + `buildMerchantMemory` + `searchMerchants`)
2. Ajouter les imports :

```typescript
import { CATS_E } from '../../lib/expenseCategories'
import { buildMerchantMemory, searchMerchants } from '../../lib/merchantMemory'
```

Le reste du composant est inchangé (les appels existants aux fonctions gardent la même signature).

- [ ] **Step 6: Vérifier tests + build**

Run: `npm test -- --run && npx tsc --noEmit`
Expected: tous les tests passent (dont les 4 nouveaux), 0 erreur TS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/expenseCategories.ts src/lib/merchantMemory.ts src/lib/__tests__/merchantMemory.test.ts src/screens/modals/ExpEntry.tsx
git commit -m "refactor(expentry): extraction CATS_E + merchantMemory en modules purs testés"
```

---

### Task 5: Parsers nickel.ts / cm.ts / qonto.ts

**Files:**
- Create: `src/lib/parsers/nickel.ts`
- Create: `src/lib/parsers/cm.ts`
- Create: `src/lib/parsers/qonto.ts`
- Test: `src/lib/parsers/__tests__/cm.test.ts`
- Test: `src/lib/parsers/__tests__/qonto.test.ts`

Le code source des parsers vit actuellement dans `src/screens/modals/ImportNickel.tsx` (fonctions `parsePDF`, `hashAB`, `getStoredHashes`) et `src/screens/modals/ImportCSV.tsx` (fonctions `parseCM`, `parseQonto`, `stripQuotes`, `parseCMDate`). **Lire ces deux fichiers avant de commencer** : le travail est un déplacement à l'identique, pas une réécriture. Les fonctions retournent des `ParsedTx` (interface définie dans `src/lib/parsers/ofx.ts`).

- [ ] **Step 1: Écrire les tests CM qui échouent**

`src/lib/parsers/__tests__/cm.test.ts` :

```typescript
import { describe, it, expect } from 'vitest'
import { parseCM } from '../cm'

describe('parseCM', () => {
  it('Format A — 5 colonnes montant signé', () => {
    const csv = 'Date;Valeur;Montant;Libellé;Solde\n02/06/2026;02/06/2026;-45,90;CARREFOUR CAYENNE;1204,60\n03/06/2026;03/06/2026;1500,00;VIR SALAIRE;2704,60'
    const res = parseCM(csv)
    expect(res).toHaveLength(2)
    expect(res[0]).toMatchObject({ dt: '2026-06-02', amount: -45.9 })
    expect(res[1].amount).toBe(1500)
  })

  it('Format B — colonnes débit/crédit', () => {
    const csv = 'Date;Date valeur;Libellé;Référence;Info;Débit;Crédit\n02/06/2026;02/06/2026;CARREFOUR;REF1;;45,90;\n03/06/2026;03/06/2026;VIR SALAIRE;REF2;;;1500,00'
    const res = parseCM(csv)
    expect(res[0].amount).toBe(-45.9)
    expect(res[1].amount).toBe(1500)
  })

  it('BOM et lignes vides ignorés', () => {
    const csv = '﻿Date;Valeur;Montant;Libellé;Solde\n\n02/06/2026;02/06/2026;-10,00;TEST;100,00\n'
    expect(parseCM(csv)).toHaveLength(1)
  })
})
```

`src/lib/parsers/__tests__/qonto.test.ts` — écrire 2 tests sur le même modèle en copiant le format attendu par le `parseQonto` existant (lire son code pour connaître les colonnes exactes avant d'écrire le test).

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test -- --run src/lib/parsers/__tests__/cm.test.ts`
Expected: FAIL — `Cannot find module '../cm'`

- [ ] **Step 3: Créer cm.ts et qonto.ts**

Déplacer depuis `ImportCSV.tsx` vers `src/lib/parsers/cm.ts` : `parseCM` + ses helpers `stripQuotes`, `parseCMDate`, avec `export function parseCM(text: string): ParsedTx[]`. Importer `ParsedTx` depuis `./ofx` et `catFromLabel`/`iconForCat` depuis `./categories` (comme le font `bnp.ts` / `boursorama.ts` — suivre exactement leur pattern d'imports).

Même opération pour `parseQonto` → `src/lib/parsers/qonto.ts`.

- [ ] **Step 4: Créer nickel.ts**

Déplacer depuis `ImportNickel.tsx` vers `src/lib/parsers/nickel.ts` :

```typescript
import type { ParsedTx } from './ofx'

// parsePDF renommée parseNickelPDF — corps identique à celui d'ImportNickel.tsx
export async function parseNickelPDF(ab: ArrayBuffer): Promise<ParsedTx[]> { /* déplacer le corps existant */ }

// hashAB — corps identique
export async function hashAB(ab: ArrayBuffer): Promise<string> { /* déplacer le corps existant */ }

// getStoredHashes / saveHashes — localStorage `qdq_nickel_${uid}`, corps identiques
export function getStoredHashes(uid: string): string[] { /* déplacer */ }
export function saveHashes(uid: string, hashes: string[]): void { /* déplacer */ }
```

Attention : si `parsePDF` retourne un type local à ImportNickel, mapper vers `ParsedTx` ( `{ dt, merchant, category, icon, amount }` ) dans `parseNickelPDF` pour uniformiser.

- [ ] **Step 5: Vérifier tests + build**

Run: `npm test -- --run src/lib/parsers && npx tsc --noEmit`
Expected: tous verts (les modales existantes ne sont pas encore touchées, elles gardent leur copie locale — la suppression vient en Task 6).

- [ ] **Step 6: Commit**

```bash
git add src/lib/parsers/nickel.ts src/lib/parsers/cm.ts src/lib/parsers/qonto.ts src/lib/parsers/__tests__/cm.test.ts src/lib/parsers/__tests__/qonto.test.ts
git commit -m "feat(parsers): nickel/cm/qonto extraits en modules parsers testés"
```

---

### Task 6: ImportUniversal absorbe Nickel + CM + Qonto

**Files:**
- Modify: `src/lib/parsers/index.ts`
- Modify: `src/screens/modals/ImportUniversal.tsx`
- Modify: `src/screens/modals/BankPicker.tsx`
- Modify: `src/App.tsx`
- Delete: `src/screens/modals/ImportNickel.tsx`
- Delete: `src/screens/modals/ImportCSV.tsx`

**Lire `ImportUniversal.tsx`, `ImportNickel.tsx` et `ImportCSV.tsx` en entier avant de commencer.** Fonctionnalités à préserver : multi-PDF Nickel, hash SHA-256 anti-réimport, création de compte depuis l'import (`doCreateAndImport`), dédup transactions vs DB.

- [ ] **Step 1: Étendre SUPPORTED_BANKS et le dispatch**

Dans `src/lib/parsers/index.ts` :

1. Ajouter 3 entrées à `SUPPORTED_BANKS` (mêmes champs que les entrées existantes) :

```typescript
{ id: 'nickel', name: 'Nickel',        icon: '📄', detail: 'Relevé PDF mensuel (multi-fichiers)', color: '#10E8C0', accept: '.pdf', encoding: 'binary' },
{ id: 'cm',     name: 'Crédit Mutuel', icon: '🏦', detail: 'Export CSV espace client',            color: '#E03030', accept: '.csv', encoding: 'utf-8' },
{ id: 'qonto',  name: 'Qonto',         icon: '⚡', detail: 'Export CSV transactions',             color: '#21BF73', accept: '.csv', encoding: 'utf-8' },
```

2. Ajouter le dispatch async fichier (PDF = binaire, reste = texte) :

```typescript
import { parseNickelPDF } from './nickel'
import { parseCM } from './cm'
import { parseQonto } from './qonto'

export async function detectAndParseFile(file: File, bankId: string): Promise<ParsedTx[]> {
  if (bankId === 'nickel' || file.name.toLowerCase().endsWith('.pdf')) {
    return parseNickelPDF(await file.arrayBuffer())
  }
  const text = await file.text()
  if (bankId === 'cm') return parseCM(text)
  if (bankId === 'qonto') return parseQonto(text)
  return detectAndParse(text, file.name)
}
```

- [ ] **Step 2: ImportUniversal — multi-fichiers + hash**

Dans `src/screens/modals/ImportUniversal.tsx` :

1. L'input fichier passe en `multiple` quand `bank.id === 'nickel'`
2. Remplacer l'appel à `detectAndParse(text, filename)` par une boucle `detectAndParseFile(file, bank.id)` sur `FileList`
3. Porter depuis ImportNickel : calcul `hashAB` par fichier, comparaison à `getStoredHashes(uid)`, bannière « fichier déjà importé » (état `dupFileNames`), sauvegarde des hashes après import réussi (`saveHashes`) — uniquement pour `bank.id === 'nickel'`
4. Le reste (préview, dédup DB, `doCreateAndImport`) est déjà dans ImportUniversal — inchangé

- [ ] **Step 3: BankPicker — une seule liste**

`src/screens/modals/BankPicker.tsx` : supprimer la constante `LEGACY`, le divider « EXISTANTS » et la boucle legacy. Il ne reste que la boucle `SUPPORTED_BANKS.map(...)` (qui contient maintenant les 10 banques) + bouton Annuler.

- [ ] **Step 4: App.tsx — routing unique**

Dans `src/App.tsx` :

1. Supprimer les imports `ImportNickel` et `ImportCSV`
2. Supprimer les deux lignes de rendu conditionnnel `importBank === 'nickel'` et `importBank === 'cm' || importBank === 'qonto'`
3. La ligne `SUPPORTED_BANKS.some(...)` couvre désormais tous les cas — la garder telle quelle

- [ ] **Step 5: Supprimer les fichiers absorbés**

```bash
git rm src/screens/modals/ImportNickel.tsx src/screens/modals/ImportCSV.tsx
```

- [ ] **Step 6: Vérifier build + tests + manuel**

Run: `npm test -- --run && npx tsc --noEmit && npm run build`
Expected: 0 erreur.

Vérif manuelle (`npm run dev`) : Comptes → Importer → les 10 banques listées sans section « Existants » → sélectionner Crédit Mutuel → uploader un CSV de test → préview OK. Sélectionner Nickel → input accepte plusieurs PDF.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(import): ImportUniversal absorbe Nickel/CM/Qonto — une seule modale, -40KB doublons"
```

---

### Task 7: Hook useBreakpoint + Sidebar desktop

**Files:**
- Create: `src/hooks/useBreakpoint.ts`
- Create: `src/components/Sidebar.tsx`
- Test: `src/hooks/__tests__/useBreakpoint.test.ts`

- [ ] **Step 1: Test qui échoue**

`src/hooks/__tests__/useBreakpoint.test.ts` :

```typescript
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useBreakpoint } from '../useBreakpoint'

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }))
}

describe('useBreakpoint', () => {
  it('≥768px → desktop', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current.isDesktop).toBe(true)
  })
  it('<768px → mobile', () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current.isDesktop).toBe(false)
  })
})
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npm test -- --run src/hooks/__tests__/useBreakpoint.test.ts`
Expected: FAIL — `Cannot find module '../useBreakpoint'`

- [ ] **Step 3: Implémenter**

`src/hooks/useBreakpoint.ts` :

```typescript
import { useState, useEffect } from 'react'

export function useBreakpoint(): { isDesktop: boolean } {
  const query = '(min-width: 768px)'
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window.matchMedia === 'function' && window.matchMedia(query).matches)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(query)
    const onChange = (e: { matches: boolean }) => setIsDesktop(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return { isDesktop }
}
```

- [ ] **Step 4: Sidebar**

`src/components/Sidebar.tsx` — mêmes onglets que `Nav.tsx` (lire Nav.tsx pour reprendre `Icon` et les ids) :

```tsx
import { Icon } from './Icon'
import { sp } from '../lib/theme'
import type { Theme } from '../types'

interface Props { tab: string; onTab: (id: string) => void; onAdd: () => void; t: Theme }

const ITEMS = [
  { id: 'accueil', ic: 'home', lb: 'Accueil' },
  { id: 'depenses', ic: 'bag', lb: 'Dépenses' },
  { id: 'analyses', ic: 'chart', lb: 'Analyses' },
  { id: 'profil', ic: 'person', lb: 'Profil' },
]

export const Sidebar = ({ tab, onTab, onAdd, t }: Props) => (
  <nav aria-label="Navigation principale" style={{
    width: 220, flexShrink: 0, minHeight: '100vh', background: '#0D1B3E',
    display: 'flex', flexDirection: 'column', padding: '24px 12px', gap: 4,
    position: 'sticky', top: 0,
  }}>
    <div style={{ fontSize: 22, ...sp('s', 700), color: '#fff', letterSpacing: -0.5, padding: '0 12px 20px' }}>QDQ</div>
    {ITEMS.map(i => {
      const active = tab === i.id
      return (
        <button key={i.id} onClick={() => onTab(i.id)} aria-current={active ? 'page' : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px',
            borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left',
            background: active ? 'rgba(255,255,255,0.10)' : 'none',
            color: active ? '#fff' : 'rgba(255,255,255,0.55)',
          }}>
          <Icon n={i.ic} sz={20} c={active ? '#fff' : 'rgba(255,255,255,0.55)'} />
          <span style={{ fontSize: 14, ...sp('o', active ? 600 : 400) }}>{i.lb}</span>
        </button>
      )
    })}
    <button onClick={onAdd} aria-label="Nouvelle dépense"
      style={{
        marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer',
        background: t.primary, color: '#fff', fontSize: 14, ...sp('o', 600),
      }}>
      <Icon n="plus" sz={18} c="#fff" /> Nouvelle dépense
    </button>
  </nav>
)
```

- [ ] **Step 5: Vérifier tests**

Run: `npm test -- --run src/hooks/__tests__/useBreakpoint.test.ts && npx tsc --noEmit`
Expected: 2 passed, 0 erreur TS.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useBreakpoint.ts src/hooks/__tests__/useBreakpoint.test.ts src/components/Sidebar.tsx
git commit -m "feat(responsive): hook useBreakpoint + Sidebar navigation desktop"
```

---

### Task 8: Layout responsive dans App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Brancher le breakpoint**

Dans `src/App.tsx` :

1. Imports :

```typescript
import { useBreakpoint } from './hooks/useBreakpoint'
import { Sidebar } from './components/Sidebar'
```

2. Dans le composant : `const { isDesktop } = useBreakpoint();`

3. Remplacer le conteneur racine du return principal. Avant :

```tsx
<div style={{ width: 375, minHeight: '100vh', position: 'relative', background: t.bg, ... }}>
```

Après :

```tsx
<div style={{
  width: isDesktop ? '100%' : 375,
  minHeight: '100vh', position: 'relative', background: t.bg,
  display: isDesktop ? 'flex' : 'block',
  boxShadow: isDesktop ? 'none' : '0 0 80px rgba(0,0,0,.6)',
  transition: 'background .3s',
  paddingTop: isDesktop ? 0 : 'env(safe-area-inset-top,0px)',
}}>
  {isDesktop && <Sidebar tab={tab} onTab={id => setTab(id)} onAdd={() => setShowEntry(true)} t={t} />}
  <div style={{ flex: 1, maxWidth: isDesktop ? 1100 : undefined, margin: isDesktop ? '0 auto' : undefined, width: '100%' }}>
    {/* contenu existant : StatusBar, banners, main, modales */}
  </div>
  {!isDesktop && <Nav tab={tab} onTab={id => setTab(id)} onAdd={() => setShowEntry(true)} t={t} />}
</div>
```

Le `<main>` existant garde son style mobile ; en desktop remplacer sa hauteur :

```tsx
<main style={{ height: isDesktop ? '100vh' : 'calc(100vh - 64px - env(safe-area-inset-top,0px))', overflowY: 'auto', paddingBottom: isDesktop ? 24 : 80 }}>
```

4. Écrans plein-écran hors session (chargement, auth) : appliquer `width: isDesktop ? '100%' : 375` de la même façon sur leurs conteneurs.

- [ ] **Step 2: Modales centrées desktop**

Les modales sont des overlays `position: fixed, inset: 0` avec contenu bottom-sheet. Desktop : le contenu doit être centré avec `maxWidth: 480`. Approche minimale sans toucher chaque modale : ajouter dans `index.html` (ou le CSS global existant) :

```css
@media (min-width: 768px) {
  [role="dialog"] {
    max-width: 480px;
    margin: auto;
    border-radius: 22px !important;
    align-self: center;
  }
}
```

Vérifier visuellement les principales modales (ExpEntry, BankPicker, EditAccount) ; si une modale n'a pas `role="dialog"`, l'ajouter.

- [ ] **Step 3: Vérification manuelle**

Run: `npm run dev`
- Fenêtre < 768px : layout mobile identique à avant (bottom nav, 375px)
- Fenêtre ≥ 768px : sidebar gauche, contenu centré max 1100px, pas de bottom nav
- Redimensionner en direct : bascule fluide

- [ ] **Step 4: Tests + build**

Run: `npm test -- --run && npx tsc --noEmit && npm run build`
Expected: 0 erreur.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx index.html
git commit -m "feat(responsive): layout desktop — sidebar, contenu 1100px, modales centrées"
```

---

### Task 9: Vérification finale Phase 1

- [ ] **Step 1: Suite complète**

Run: `npm test -- --run && npx tsc --noEmit && npm run build`
Expected: ~139 tests verts (130 + useTheme×5 + useBreakpoint×2 + merchantMemory×4 + cm×3 + qonto×2, moins les éventuels tests supprimés avec ImportCSV), 0 erreur TS, build OK.

- [ ] **Step 2: Parcours manuel complet**

`npm run dev` puis :
1. Thème : Réglages → Sombre → tout l'UI passe en navy, recharge persiste
2. Import : Comptes → Importer → 10 banques → CM CSV → préview → import OK
3. Import Nickel : plusieurs PDF d'un coup, réimport du même fichier → bannière doublon
4. Dépense : saisie complète → confirmation → solde mis à jour
5. Desktop : élargir la fenêtre → sidebar apparaît, layout correct

- [ ] **Step 3: Push**

```bash
git push
```

Vercel déploie. Vérifier l'URL de prod.

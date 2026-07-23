# Projection des revenus récurrents — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La projection du solde tient compte des revenus récurrents (salaire) détectés dans l'historique et confirmés par l'utilisateur.

**Architecture:** Modèle récurrent unifié dans la table `next_debits` avec une colonne `kind` (`debit`|`credit`). La détection existante est extraite en lib, testée, et symétrisée côté crédit. La projection crédite les revenus à leur jour d'échéance. Tous les consommateurs « débits seuls » filtrent sur `kind`.

**Tech Stack:** React + TypeScript, Vite, Vitest, Supabase (Postgres, RLS row-level, edge functions Deno).

**Règle projet :** ce lot touche `src/lib/**`, `src/hooks/**`, `supabase/migrations/**` → **revue Codex obligatoire** (`/codex-review`) avant tout commit, findings triés. Vérif avant chaque commit : `npx tsc --noEmit && npx vitest run`.

---

## File Structure

| Fichier | Responsabilité | Action |
|---------|----------------|--------|
| `supabase/migrations/20260723_recurring_kind.sql` | Colonne `kind` sur `next_debits` | Créer |
| `src/types/index.ts` | `Recurring.kind`, `ProjRecurring.kind`, `DetectedRecurring.kind` | Modifier |
| `src/lib/detectRecurrings.ts` | Détection récurrente (débit **et** crédit), testable | Créer (extraction) |
| `src/lib/__tests__/detectRecurrings.test.ts` | Tests détection crédit | Créer |
| `src/lib/projection.ts` | Créditer les `kind==='credit'` | Modifier |
| `src/lib/__tests__/projection.test.ts` | Test crédit ajouté au jour dû | Modifier |
| `src/components/ProjectionChart.tsx` | Mapper `kind` dans `projRecs` | Modifier |
| `src/lib/scoreAccounts.ts` | `committed` = débits seulement | Modifier |
| `src/lib/__tests__/scoreAccounts.test.ts` | Test committed exclut crédits | Modifier |
| `src/hooks/useRecurring.ts` | `addRecurring` accepte `kind` | Modifier |
| `src/screens/modals/ExpEntry.tsx` | Liste prélèvements = débits seulement | Modifier |
| `src/screens/modals/RecurringManager.tsx` | Section « Revenus récurrents », import détection extraite | Modifier |
| `supabase/functions/send-notifications/index.ts` | Notifier « prélevé » seulement pour débits | Modifier |

---

## Task 1 : Migration — colonne `kind` sur `next_debits`

**Files:**
- Create: `supabase/migrations/20260723_recurring_kind.sql`

Contexte : `next_debits` n'est défini dans aucun fichier de migration (table créée hors repo). Sa RLS est row-level (`user_id`), non affectée par un ajout de colonne. Cette migration est la première du repo à la toucher.

- [ ] **Step 1 : Écrire le fichier de migration**

Create `supabase/migrations/20260723_recurring_kind.sql` :

```sql
-- Revenus récurrents : distinguer prélèvements (debit) et revenus (credit).
-- next_debits ne stockait que des débits (amount toujours positif). La colonne
-- kind porte désormais la direction ; amount reste positif.
-- Les lignes existantes deviennent 'debit' → aucun changement de comportement.
alter table next_debits
  add column if not exists kind text not null default 'debit'
  check (kind in ('debit', 'credit'));
```

- [ ] **Step 2 : Appliquer sur la base**

Appliquer via MCP `apply_migration` (name: `recurring_kind`, query = contenu du fichier). Le fichier reste la source de vérité reproductible (règle projet : toute RPC/DDL appliquée via MCP est répercutée dans le fichier — ici le fichier existe déjà, vérifier qu'il correspond exactement à ce qui est appliqué).

- [ ] **Step 3 : Vérifier la colonne**

Via MCP `execute_sql` : `select column_name, data_type, column_default from information_schema.columns where table_name = 'next_debits' and column_name = 'kind';`
Expected : une ligne `kind | text | 'debit'::text`.

- [ ] **Step 4 : Commit**

```bash
git add supabase/migrations/20260723_recurring_kind.sql
git commit -m "feat(db): colonne kind sur next_debits (debit|credit)"
```

---

## Task 2 : Types — ajouter `kind`

**Files:**
- Modify: `src/types/index.ts:62-74`

- [ ] **Step 1 : Ajouter `kind` aux trois interfaces**

Dans `src/types/index.ts`, modifier `Recurring` :

```ts
export interface Recurring {
  id: string; user_id: string; account_id: string
  name: string; amount: string | number; date_label: string
  icon?: string
  kind?: 'debit' | 'credit'
}
```

Et `DetectedRecurring` (ajouter `kind` en fin) :

```ts
export interface DetectedRecurring {
  name: string; key: string; nMonths: number
  avg: number; std: number; typicalDay: number; topAcc: string
  consecutive: number; consecutiveRate: number; isRegularAmt: boolean
  confidence: 'confirmed' | 'probable' | 'watching'
  lastDate: string; txs: Transaction[]
  kind: 'debit' | 'credit'
}
```

`ProjRecurring` est défini dans `src/lib/projection.ts` (Task 3), pas ici.

- [ ] **Step 2 : Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected : erreurs UNIQUEMENT là où `DetectedRecurring` est construit sans `kind` (`RecurringManager.tsx`, corrigé en Task 5) et éventuellement les tests. C'est attendu à ce stade — ne pas committer seul. Passer à Task 3.

*(Pas de commit isolé : ce changement de type est complété par Tasks 3 et 5. Committer ensemble en fin de Task 5 si tsc n'est pas vert avant.)*

---

## Task 3 : Projection — créditer les revenus

**Files:**
- Modify: `src/lib/projection.ts:4-8` (interface) et `:99-110` (boucle)
- Test: `src/lib/__tests__/projection.test.ts`

- [ ] **Step 1 : Écrire les tests d'abord**

Ajouter dans `src/lib/__tests__/projection.test.ts`, à l'intérieur du `describe('projectBalance', ...)` (après le test ligne 45) :

```ts
  it('ajoute un revenu (kind credit) à sa date', () => {
    const recs: ProjRecurring[] = [{ name: 'Salaire', amount: 1650, day: 2, kind: 'credit' }]
    const pts = projectBalance(1000, recs, [], 30, NOW)
    const before = pts.find(p => p.date === '2026-08-01')!
    const after = pts.find(p => p.date === '2026-08-02')!
    expect(after.balance - before.balance).toBe(1650)
  })

  it('mélange débit et crédit sur le même horizon', () => {
    const recs: ProjRecurring[] = [
      { name: 'Loyer', amount: 750, day: 5, kind: 'debit' },
      { name: 'Salaire', amount: 1650, day: 2, kind: 'credit' },
    ]
    const pts = projectBalance(1000, recs, [], 30, NOW)
    // Sur l'horizon 15 juil → 14 août : salaire le 2 août (+1650), loyer le 5 août (−750)
    const last = pts[pts.length - 1]
    expect(last.balance).toBe(1000 + 1650 - 750)
  })

  it('un récurrent sans kind est traité comme un débit (rétrocompat)', () => {
    const recs: ProjRecurring[] = [{ name: 'Loyer', amount: 750, day: 20 }]
    const pts = projectBalance(1000, recs, [], 30, NOW)
    const before = pts.find(p => p.date === '2026-07-19')!
    const after = pts.find(p => p.date === '2026-07-20')!
    expect(before.balance - after.balance).toBe(750)
  })
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run: `npx vitest run src/lib/__tests__/projection.test.ts`
Expected : les deux premiers nouveaux tests ÉCHOUENT (le crédit est soustrait au lieu d'être ajouté → `after.balance - before.balance` = −1650, pas +1650). Le 3e (rétrocompat) passe déjà.

- [ ] **Step 3 : Ajouter `kind` à l'interface**

Dans `src/lib/projection.ts`, modifier `ProjRecurring` :

```ts
export interface ProjRecurring {
  name: string
  amount: number   // valeur positive = montant du flux
  day: number      // jour du mois (1-31)
  kind?: 'debit' | 'credit'  // défaut debit
}
```

- [ ] **Step 4 : Créditer dans la boucle**

Dans `src/lib/projection.ts`, remplacer la ligne 106 (`recurrings.forEach(r => { if (dueDay(r.day, d) === dayOfMonth) bal -= r.amount })`) par :

```ts
      recurrings.forEach(r => {
        if (dueDay(r.day, d) === dayOfMonth) {
          bal += r.kind === 'credit' ? r.amount : -r.amount
        }
      })
```

- [ ] **Step 5 : Lancer les tests, vérifier le succès**

Run: `npx vitest run src/lib/__tests__/projection.test.ts`
Expected : PASS (tous, y compris les anciens).

- [ ] **Step 6 : Commit**

```bash
git add src/lib/projection.ts src/lib/__tests__/projection.test.ts src/types/index.ts
git commit -m "feat(projection): crediter les revenus recurrents (kind credit)"
```

---

## Task 4 : ProjectionChart — mapper `kind`

**Files:**
- Modify: `src/components/ProjectionChart.tsx:31-35`

- [ ] **Step 1 : Mapper `kind` dans `projRecs`**

Dans `src/components/ProjectionChart.tsx`, remplacer le `useMemo` `projRecs` (lignes 31-35) par :

```ts
  const projRecs: ProjRecurring[] = useMemo(() =>
    (recurrings || [])
      .map(r => ({
        name: r.name,
        amount: Math.abs(parseFloat(String(r.amount)) || 0),
        day: dayFromLabel(r.date_label),
        kind: r.kind === 'credit' ? 'credit' as const : 'debit' as const,
      }))
      .filter(r => r.amount > 0),
    [recurrings])
```

- [ ] **Step 2 : Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected : PASS (pas d'erreur dans ProjectionChart).

- [ ] **Step 3 : Commit**

```bash
git add src/components/ProjectionChart.tsx
git commit -m "feat(projection): ProjectionChart transmet kind a la projection"
```

---

## Task 5 : Détection — extraire en lib + symétriser côté crédit

**Files:**
- Create: `src/lib/detectRecurrings.ts`
- Create: `src/lib/__tests__/detectRecurrings.test.ts`
- Modify: `src/screens/modals/RecurringManager.tsx:1-13` (retirer la fonction locale, importer depuis lib)

- [ ] **Step 1 : Écrire les tests d'abord**

Create `src/lib/__tests__/detectRecurrings.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { detectRecurrings } from '../detectRecurrings'
import type { Transaction } from '../../types'

const tx = (date: string, amt: number, m: string): Transaction =>
  ({ id: Math.random().toString(), tx_date: date, dt: date, amt, m,
     cat: 'Salaire', ico: '💰', acc: 'acc1' } as Transaction)

// 6 mois de salaire régulier, ~le 2 du mois, montant stable
const salaire: Transaction[] = [
  tx('2026-02-02', 1650, 'VIR SALAIRE ACME'),
  tx('2026-03-02', 1650, 'VIR SALAIRE ACME'),
  tx('2026-04-02', 1650, 'VIR SALAIRE ACME'),
  tx('2026-05-02', 1650, 'VIR SALAIRE ACME'),
  tx('2026-06-02', 1650, 'VIR SALAIRE ACME'),
  tx('2026-07-02', 1650, 'VIR SALAIRE ACME'),
]

describe('detectRecurrings — crédits', () => {
  it('détecte un salaire mensuel régulier avec kind credit', () => {
    const res = detectRecurrings(salaire, 2, 'credit')
    expect(res).toHaveLength(1)
    expect(res[0].kind).toBe('credit')
    expect(res[0].typicalDay).toBe(2)
    expect(res[0].avg).toBeCloseTo(1650, 0)
    expect(res[0].confidence).toBe('confirmed') // 6 mois consécutifs, montant stable
  })

  it('en mode debit, ignore les crédits', () => {
    const res = detectRecurrings(salaire, 2, 'debit')
    expect(res).toHaveLength(0)
  })

  it('en mode credit, ignore les débits', () => {
    const debits: Transaction[] = [
      tx('2026-05-05', -750, 'LOYER'),
      tx('2026-06-05', -750, 'LOYER'),
      tx('2026-07-05', -750, 'LOYER'),
    ]
    const res = detectRecurrings(debits, 2, 'credit')
    expect(res).toHaveLength(0)
  })
})
```

- [ ] **Step 2 : Lancer les tests, vérifier l'échec**

Run: `npx vitest run src/lib/__tests__/detectRecurrings.test.ts`
Expected : FAIL — `Cannot find module '../detectRecurrings'`.

- [ ] **Step 3 : Créer la lib (extraction + paramètre direction)**

Create `src/lib/detectRecurrings.ts` — copie de la fonction de `RecurringManager.tsx` (lignes 13-80), rendue exportée, avec un paramètre `direction` et le champ `kind` :

```ts
import type { Transaction, DetectedRecurring } from '../types'

/** Détecte les flux récurrents mensuels dans l'historique.
 *  direction='debit' → dépenses (amt<0) ; 'credit' → revenus (amt>0).
 *  Montants toujours manipulés en valeur absolue ; `kind` porte le sens. */
export function detectRecurrings(
  txs: Transaction[],
  minMonths = 2,
  direction: 'debit' | 'credit' = 'debit',
): DetectedRecurring[] {
  // Ne garder que le sens demandé (hors virements internes)
  const flows = direction === 'credit'
    ? txs.filter(tx => tx.amt > 0 && tx.cat !== 'Virement interne' && tx.m)
    : txs.filter(tx => tx.amt < 0 && tx.cat !== 'Virement interne' && tx.m)

  // Normaliser le nom du marchand (upper, tronqué à 25 chars)
  const norm = (s: string) => s.toUpperCase().replace(/\s+/g, ' ').trim().substring(0, 25)

  // Regrouper par marchand normalisé
  const map: Record<string, { name: string; key: string; txs: Transaction[]; months: Set<string>; accounts: Record<string, number> }> = {}
  flows.forEach(tx => {
    const key = norm(tx.m)
    if (!map[key]) map[key] = { name: tx.m, key, txs: [], months: new Set(), accounts: {} }
    const ym = tx.tx_date ? tx.tx_date.substring(0, 7) : ''
    if (ym) map[key].months.add(ym)
    map[key].txs.push(tx)
    const aid = tx.acc || ''
    map[key].accounts[aid] = (map[key].accounts[aid] || 0) + 1
  })

  return Object.values(map)
    .filter(g => g.months.size >= minMonths)
    .map(g => {
      const months = [...g.months].sort()
      const nMonths = g.months.size
      const amts = g.txs.map(tx => Math.abs(tx.amt))
      const avg = amts.reduce((s, a) => s + a, 0) / amts.length
      const std = Math.sqrt(amts.map(a => (a - avg) ** 2).reduce((s, v) => s + v, 0) / amts.length)
      const isRegularAmt = std / avg < 0.15

      const days = g.txs.map(tx => tx.tx_date ? parseInt(tx.tx_date.split('-')[2]) : 1)
      const dayFreq: Record<number, number> = {}
      days.forEach(d => dayFreq[d] = (dayFreq[d] || 0) + 1)
      const typicalDay = parseInt(Object.entries(dayFreq).sort(([, a], [, b]) => b - a)[0][0])

      const topAcc = Object.entries(g.accounts).sort(([, a], [, b]) => b - a)[0][0]

      let consecutive = 0
      for (let i = 1; i < months.length; i++) {
        const [y1, m1] = months[i - 1].split('-').map(Number)
        const [y2, m2] = months[i].split('-').map(Number)
        const diff = (y2 - y1) * 12 + (m2 - m1)
        if (diff === 1) consecutive++
      }
      const consecutiveRate = months.length > 1 ? consecutive / (months.length - 1) : 0

      let confidence: 'confirmed' | 'probable' | 'watching'
      if (nMonths >= 6 && consecutiveRate >= 0.8 && isRegularAmt) confidence = 'confirmed'
      else if (nMonths >= 6 || (nMonths >= 3 && consecutiveRate >= 0.6)) confidence = 'probable'
      else confidence = 'watching'

      return {
        name: g.name, key: g.key, nMonths, avg, std, typicalDay,
        topAcc, consecutive, consecutiveRate, isRegularAmt, confidence,
        lastDate: months[months.length - 1], txs: g.txs,
        kind: direction,
      }
    })
    .filter(g => g.confidence !== 'watching' || g.nMonths >= 3)
    .sort((a, b) => {
      const rank: Record<string, number> = { confirmed: 0, probable: 1, watching: 2 }
      return rank[a.confidence] - rank[b.confidence] || b.nMonths - a.nMonths
    })
}
```

- [ ] **Step 4 : Retirer la fonction locale de RecurringManager, importer depuis lib**

Dans `src/screens/modals/RecurringManager.tsx` : supprimer la fonction `detectRecurrings` locale (lignes 13-80) et ajouter l'import en tête (après la ligne 4 `import type ...`) :

```ts
import { detectRecurrings } from '../../lib/detectRecurrings'
```

- [ ] **Step 5 : Lancer les tests + compilation**

Run: `npx vitest run src/lib/__tests__/detectRecurrings.test.ts && npx tsc --noEmit`
Expected : tests PASS ; tsc PASS (RecurringManager utilise l'import ; `DetectedRecurring.kind` désormais fourni).

- [ ] **Step 6 : Commit**

```bash
git add src/lib/detectRecurrings.ts src/lib/__tests__/detectRecurrings.test.ts src/screens/modals/RecurringManager.tsx
git commit -m "refactor(detection): extraire detectRecurrings en lib + sens credit"
```

---

## Task 6 : useRecurring — paramètre `kind`

**Files:**
- Modify: `src/hooks/useRecurring.ts:26-39`

- [ ] **Step 1 : Ajouter `kind` à `addRecurring`**

Dans `src/hooks/useRecurring.ts`, remplacer `addRecurring` (lignes 26-39) par :

```ts
  const addRecurring = async (r: {
    account_id: string; name: string; amount: number | string; date_label: string
    kind?: 'debit' | 'credit'
  }) => {
    // Colonnes next_debits : user_id, account_id, name, amount, date_label, kind
    const { error } = await db.from('next_debits').insert({
      user_id: uid,
      account_id: r.account_id,
      name: r.name,
      amount: Math.abs(parseFloat(String(r.amount))),
      date_label: r.date_label,
      kind: r.kind || 'debit',
    })
    if (!error) await load()
    return error
  }
```

- [ ] **Step 2 : Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected : PASS.

- [ ] **Step 3 : Commit**

```bash
git add src/hooks/useRecurring.ts
git commit -m "feat(recurring): addRecurring accepte kind (defaut debit)"
```

---

## Task 7 : scoreAccounts — `committed` = débits seulement

**Files:**
- Modify: `src/lib/scoreAccounts.ts:58-59`
- Test: `src/lib/__tests__/scoreAccounts.test.ts`

- [ ] **Step 1 : Écrire le test d'abord**

Ouvrir `src/lib/__tests__/scoreAccounts.test.ts`. Repérer le helper `mkAcc` et la façon dont `scoreAccounts` est appelé (signature `scoreAccounts(accounts, recurrings, amount, D, allHistory)`). Ajouter un test qui vérifie qu'un `recurring` `kind:'credit'` n'entre PAS dans `committed` :

```ts
  it('committed exclut les revenus (kind credit)', () => {
    const acc = mkAcc({ bal: 1000 })
    const salaire = { id: 'r1', user_id: 'u', account_id: acc.id, name: 'Salaire',
      amount: 1650, date_label: '02', kind: 'credit' as const }
    const scored = scoreAccounts([acc], [salaire], 100, {} as any, [])
    expect(scored[0].committed).toBe(0)
  })
```

*(Adapter `mkAcc`/l'appel exact aux conventions du fichier de test : reprendre la forme des tests voisins, notamment les arguments `D` et `allHistory`.)*

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `npx vitest run src/lib/__tests__/scoreAccounts.test.ts`
Expected : FAIL — `committed` vaut 1650 (le salaire est compté comme prélèvement).

- [ ] **Step 3 : Filtrer les crédits**

Dans `src/lib/scoreAccounts.ts`, remplacer la ligne 59 (`.filter(r => r.account_id === acc.id)`) par :

```ts
      .filter(r => r.account_id === acc.id && r.kind !== 'credit')
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `npx vitest run src/lib/__tests__/scoreAccounts.test.ts`
Expected : PASS (tous).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/scoreAccounts.ts src/lib/__tests__/scoreAccounts.test.ts
git commit -m "fix(scoring): committed exclut les revenus recurrents"
```

---

## Task 8 : ExpEntry — liste prélèvements = débits seulement

**Files:**
- Modify: `src/screens/modals/ExpEntry.tsx:407-431`

- [ ] **Step 1 : Filtrer les crédits dans la liste**

Dans `src/screens/modals/ExpEntry.tsx`, la section « Lien prélèvements » (à partir de la ligne 407) itère `recurrings.slice(0, 6)`. Introduire une liste filtrée juste avant le rendu et l'utiliser partout. Remplacer la condition d'ouverture (ligne 407) :

```tsx
        {scores.length > 0 && recurrings && recurrings.length > 0 && (
```

par un calcul filtré, puis l'utiliser. Concrètement, au-dessus du bloc, dans le corps du composant (près des autres `const`), ajouter :

```tsx
  const debitRecurrings = (recurrings || []).filter(r => r.kind !== 'credit')
```

Puis, dans la section, remplacer les trois usages de `recurrings` :
- ligne 407 condition → `debitRecurrings.length > 0`
- ligne 418 `recurrings.slice(0, 6)` → `debitRecurrings.slice(0, 6)`
- ligne 421 `recurrings.slice(0, 6).length` → `debitRecurrings.slice(0, 6).length`

- [ ] **Step 2 : Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected : PASS.

- [ ] **Step 3 : Commit**

```bash
git add src/screens/modals/ExpEntry.tsx
git commit -m "fix(depense): liste prelevements exclut les revenus recurrents"
```

---

## Task 9 : send-notifications — notifier « prélevé » pour les débits

**Files:**
- Modify: `supabase/functions/send-notifications/index.ts:65-72`

- [ ] **Step 1 : Sélectionner `kind` et sauter les crédits**

Dans `supabase/functions/send-notifications/index.ts`, remplacer la ligne 65 :

```ts
    const { data: recs } = await db.from('next_debits').select('name,amount,date_label,kind').eq('user_id', uid)
```

Puis dans la boucle (juste après `if (dayFromLabel(r.date_label) !== targetDay) continue`, ligne 67), ajouter :

```ts
      if (r.kind === 'credit') continue   // v1 : pas de notif pour les revenus
```

- [ ] **Step 2 : Vérifier (typecheck Deno best-effort)**

Ce fichier est une edge function Deno, hors du `tsc` du projet. Relire le diff : le `select` inclut `kind`, la boucle saute `kind === 'credit'`. Pas de test unitaire (fonction serveur).

- [ ] **Step 3 : Commit**

```bash
git add supabase/functions/send-notifications/index.ts
git commit -m "fix(notif): ne pas notifier prelevement pour les revenus recurrents"
```

*(Déploiement de l'edge function hors périmètre de ce plan : le déploiement Supabase se fait séparément.)*

---

## Task 10 : RecurringManager — section « Revenus récurrents »

**Files:**
- Modify: `src/screens/modals/RecurringManager.tsx`

Objectif : (a) le calcul des détectés utilise les deux sens ; (b) l'onglet « Confirmés » sépare prélèvements (débits) et revenus (crédits) ; (c) confirmer un revenu détecté persiste `kind:'credit'`.

- [ ] **Step 1 : Détecter les deux sens**

Dans `RecurringManager.tsx`, remplacer la ligne 93 (`const detected=useMemo(()=>detectRecurrings(allHistory||[],2),[allHistory]);`) par :

```ts
  const detectedDebits=useMemo(()=>detectRecurrings(allHistory||[],2,'debit'),[allHistory]);
  const detectedIncome=useMemo(()=>detectRecurrings(allHistory||[],2,'credit'),[allHistory]);
  const detected=useMemo(()=>[...detectedDebits,...detectedIncome],[detectedDebits,detectedIncome]);
```

Le reste du calcul `newDetected`/`confirmedDetected`/etc. (lignes 96-100) continue de fonctionner sur `detected` combiné. Le badge « Détectés » couvre alors débits + revenus.

- [ ] **Step 2 : Séparer confirmés débits / revenus**

Remplacer la ligne 103 (`const sorted=[...recurrings].sort(...)`) par deux listes :

```ts
  const debitsConfirmes=[...recurrings].filter(r=>r.kind!=='credit')
    .sort((a,b)=>parseInt(String(a.date_label||0))-parseInt(String(b.date_label||0)));
  const revenusConfirmes=[...recurrings].filter(r=>r.kind==='credit')
    .sort((a,b)=>parseInt(String(a.date_label||0))-parseInt(String(b.date_label||0)));
  const sorted=debitsConfirmes; // les prélèvements gardent le rendu existant
```

`totalMonthly` (ligne 102) doit ne sommer que les débits pour rester cohérent avec « Engagé chaque mois » :

```ts
  const totalMonthly=debitsConfirmes.reduce((s,r)=>s+parseFloat(String(r.amount||0)),0);
```

- [ ] **Step 3 : `confirmDetected` transmet `kind`**

Remplacer `confirmDetected` (lignes 118-125) :

```ts
  const confirmDetected=async(d: DetectedRecurring)=>{
    const accExists=accounts.find(a=>a.id===d.topAcc);
    await save({
      name:d.name,amount:parseFloat(d.avg.toFixed(2)),
      dayOfMonth:d.typicalDay,accId:accExists?d.topAcc:accounts[0]?.id||'',
      kind:d.kind,
    });
  };
```

Et `save` (lignes 105-116) doit passer `kind` à `onAdd` :

```ts
  const save=async(overrides: any={})=>{
    const n=overrides.name||name.trim();
    const a=overrides.amount||parseFloat((amount||'0').replace(',','.'));
    const d=overrides.dayOfMonth||dayOfMonth;
    const acc=overrides.accId||accId;
    if(!n||!a||!acc){setErr('Remplis tous les champs');return;}
    setSaving(true);setErr('');
    const e=await onAdd({name:n,amount:a,date_label:String(d).padStart(2,'0'),account_id:acc,kind:overrides.kind||'debit'});
    setSaving(false);
    if(e){setErr(e.message);}
    else{setTab('confirmed');setName('');setAmount('');setAddingKey(null);}
  };
```

Vérifier que le type de `onAdd` dans `Props` (haut du fichier) accepte `kind`. Repérer la déclaration de `Props` et étendre la signature de `onAdd` pour inclure `kind?: 'debit' | 'credit'` (elle correspond à `addRecurring` de Task 6).

- [ ] **Step 4 : Rendre la section « Revenus récurrents » dans l'onglet Confirmés**

Dans l'onglet `tab==='confirmed'`, après la liste des prélèvements (`sorted.map(...)` se termine vers la ligne ~250), insérer un bloc listant `revenusConfirmes`. Réutiliser exactement le style d'une ligne de prélèvement, avec l'icône 💰 et le montant en `t.mintText` précédé de `+`. Modèle (à placer juste avant la fermeture du bloc `tab==='confirmed'`) :

```tsx
            {revenusConfirmes.length>0&&(
              <>
                <div style={{fontSize:11,...sp('s',600),color:t.sub,letterSpacing:.6,
                  textTransform:'uppercase',margin:'18px 0 8px'}}>Revenus récurrents</div>
                {revenusConfirmes.map((r)=>{
                  const acc=accounts.find(a=>a.id===r.account_id);
                  return(
                    <div key={r.id} style={{display:'flex',alignItems:'center',gap:12,
                      padding:'12px 14px',background:t.el,borderRadius:14,marginBottom:8}}>
                      <div style={{width:38,height:38,borderRadius:12,flexShrink:0,
                        background:t.mint+'22',display:'flex',alignItems:'center',
                        justifyContent:'center',fontSize:17}}>💰</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,...sp('o',600),color:t.tx,overflow:'hidden',
                          textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</div>
                        <div style={{fontSize:11,...sp('o'),color:t.sub}}>
                          le {r.date_label} du mois{acc?' · '+acc.name:''}
                        </div>
                      </div>
                      <span style={{fontSize:13,...sp('m',600),color:t.mintText}}>
                        +{parseFloat(String(r.amount)).toLocaleString('fr-FR',{minimumFractionDigits:2})} €
                      </span>
                      <button onClick={()=>onDelete(r.id)}
                        style={{background:'none',border:'none',cursor:'pointer',
                          fontSize:15,color:t.muted,padding:0,flexShrink:0}}>✕</button>
                    </div>
                  )
                })}
              </>
            )}
```

- [ ] **Step 5 : Vérifier la compilation**

Run: `npx tsc --noEmit`
Expected : PASS. Si erreur sur `onAdd`/`onDelete` types, corriger la signature de `Props` en conséquence.

- [ ] **Step 6 : Commit**

```bash
git add src/screens/modals/RecurringManager.tsx
git commit -m "feat(recurring): section Revenus recurrents (detection + confirmation)"
```

---

## Task 11 : Vérification finale + revue Codex

- [ ] **Step 1 : Suite complète**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected : tsc PASS, 270+ tests PASS, build OK.

- [ ] **Step 2 : Revue croisée Codex (obligatoire)**

Le lot touche `src/lib`, `src/hooks`, `supabase/migrations`. Lancer `/codex-review` sur le diff cumulé, trier les findings (vérifier chacun contre le code réel, dire ce qu'on écarte et pourquoi).

- [ ] **Step 3 : Vérification manuelle en prod (après déploiement)**

Ouvrir Analyse → Prélèvements. Dans RecurringManager, onglet Détectés : le salaire apparaît. Le confirmer. Vérifier que la courbe de projection remonte au jour du salaire et que le solde à 30j reflète l'entrée.

---

## Self-Review (auteur du plan)

**Couverture spec :**
- Migration `kind` → Task 1 ✓
- Détection symétrisée → Task 5 ✓
- Projection crédite → Task 3 ✓
- ProjectionChart mappe kind → Task 4 ✓
- Consommateurs (scoreAccounts, ExpEntry, send-notifications, useRecurring) → Tasks 6-9 ✓
- UI section Revenus → Task 10 ✓
- Tests projection/détection/scoreAccounts → Tasks 3,5,7 ✓
- Revue Codex → Task 11 ✓

**Cohérence des types :** `kind: 'debit' | 'credit'` uniforme (Recurring, ProjRecurring, DetectedRecurring, addRecurring, onAdd). `ProjRecurring.kind` optionnel (rétrocompat), les autres selon usage. `detectRecurrings(txs, minMonths, direction)` — même signature partout (Tasks 5, 10).

**Placeholders :** deux endroits demandent d'« adapter aux conventions du fichier » (Task 7 appel `scoreAccounts`, Task 10 signature `Props.onAdd`) — justifiés car dépendants de code non intégralement cité ; l'intention et la cible sont explicites.

**Scope :** un seul sous-système (récurrents/projection), cohérent pour un plan unique.

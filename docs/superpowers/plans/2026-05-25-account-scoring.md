# Account Scoring & Recommandation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrichir ExpEntry avec un moteur de scoring qui évalue chaque compte sur 100 pts et recommande automatiquement le meilleur compte, avec score numérique, badges colorés et chiffres clés intégrés dans la saisie.

**Architecture:** Fonction pure `scoreAccounts` (testable isolément) → composant `AccountScoreCard` (selected/compact) → modification de `ExpEntry` pour remplacer le bloc "Payer avec…" par les cartes de scoring avec auto-sélection + override.

**Tech Stack:** React 18, TypeScript 5, Vite 5, Vitest — aucune nouvelle dépendance npm.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/scoreAccounts.ts` | Create | Fonction pure de scoring, types `AccountScore`/`ScoreStatus` |
| `src/lib/__tests__/scoreAccounts.test.ts` | Create | 10 tests unitaires de l'algorithme |
| `src/components/AccountScoreCard.tsx` | Create | Carte compte : selected (expanded) + non-selected (compact) |
| `src/screens/modals/ExpEntry.tsx` | Modify | Remplace bloc "Payer avec…", ajoute useMemo scores + useEffect auto-select |

---

### Task 1: `scoreAccounts.ts` — fonction pure + tests TDD

**Files:**
- Create: `src/lib/__tests__/scoreAccounts.test.ts`
- Create: `src/lib/scoreAccounts.ts`

- [ ] **Step 1: Créer le fichier de tests**

Créer `src/lib/__tests__/scoreAccounts.test.ts` :

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { scoreAccounts } from '../scoreAccounts'
import type { Account, Recurring, AppData, Transaction } from '../../types'

// Pin date to 2026-05-25
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-05-25T12:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

function mkAcc(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a1', name: 'Compte Principal', short: 'CP',
    bal: 1000, col: '#10E8C0', type: 'Courant',
    isPro: false, overdraft: 0, debits: [],
    ...overrides,
  } as Account
}

function mkD(overrides: Partial<AppData> = {}): AppData {
  const base = mkAcc(overrides.accounts?.[0] ? {} : {})
  return {
    user: 'U', week: 1, wk: 1,
    budget: 400, spent: 100, rem: 300,
    accounts: [base], txs: [], cats: [],
    persoAccs: [base], proAccs: [],
    persoTxs: [], proTxs: [],
    persoBal: 1000, proBal: 0,
    proMonthSpent: 0, proMonthIncome: 0, proNet: 0,
    monthBudget: 1600, monthSpent: 400, monthIncome: 2000,
    monthRem: 1200, monthLabel: 'Mai 2026',
    ...overrides,
  } as AppData
}

function mkTx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 't1', merchant: 'Test', category: 'Test',
    icon: '📦', amount: 0, tx_date: '2026-05-01',
    account_id: 'a1', acc: 'a1', dt: 'today', m: 'Test', cat: 'Test',
    ico: '📦', amt: 0, isTransfer: false, isPro: false, isProPerso: false,
    ...overrides,
  } as Transaction
}

describe('scoreAccounts', () => {
  it('returns [] when amount is 0', () => {
    const acc = mkAcc()
    const D = mkD({ accounts: [acc], persoAccs: [acc] })
    expect(scoreAccounts([acc], [], 0, D, [])).toEqual([])
  })

  it('returns [] when amount is negative', () => {
    const acc = mkAcc()
    const D = mkD({ accounts: [acc], persoAccs: [acc] })
    expect(scoreAccounts([acc], [], -5, D, [])).toEqual([])
  })

  it('returns [] when accounts array is empty', () => {
    const D = mkD({ accounts: [], persoAccs: [] })
    expect(scoreAccounts([], [], 50, D, [])).toEqual([])
  })

  it('high-balance account gets score 90 and recommended status', () => {
    // bal=2000, amount=85, no recurrings, monthSpent=400/1600=25%<80%
    // previsionnel=1915>0 → 40pts | marge=1915/2000=95.7%≥30% → 20pts
    // prelevements: 1915>0 → 15pts | revenus: 0pts | budget: 10pts | pref: 5pts = 90
    const acc = mkAcc({ bal: 2000 })
    const D = mkD({ accounts: [acc], persoAccs: [acc], monthBudget: 1600, monthSpent: 400 })
    const results = scoreAccounts([acc], [], 85, D, [])
    expect(results).toHaveLength(1)
    expect(results[0].score).toBe(90)
    expect(results[0].status).toBe('recommended')
  })

  it('tight balance account gets score 60 and acceptable status', () => {
    // bal=200, amount=195: soldeApres=5, marge=5/200=2.5%<10% → 0pts
    // previsionnel=5>0 → 40pts | prelevements: 5>0 → 15pts
    // revenus: 0pts | budget: monthSpent=1400/1600=87.5%≥80% → 0pts | pref: 5pts = 60
    const acc = mkAcc({ bal: 200 })
    const D = mkD({ accounts: [acc], persoAccs: [acc], monthBudget: 1600, monthSpent: 1400 })
    const results = scoreAccounts([acc], [], 195, D, [])
    expect(results[0].score).toBe(60)
    expect(results[0].status).toBe('acceptable')
  })

  it('criterion c = 0 when soldeApres <= committed', () => {
    // bal=300, amount=50 → soldeApres=250
    // rec=400 due in 3 days → committed=400 → 250<=400 → criterion c=0
    // previsionnel=250-400=-150≤0 and overdraft=0 → criterion a=0
    // marge=250/300=83.3%≥30% → 20pts | budget: 400/1600=25%<80% → 10pts | pref: 5pts = 35
    const acc = mkAcc({ bal: 300, overdraft: 0 })
    const rec: Recurring = {
      id: 'r1', user_id: 'u', account_id: 'a1',
      name: 'Loyer', amount: '400', date_label: '28',
    }
    const D = mkD({ accounts: [acc], persoAccs: [acc], monthBudget: 1600, monthSpent: 400 })
    const results = scoreAccounts([acc], [rec], 50, D, [])
    expect(results[0].breakdown.prelevements).toBe(0)
    expect(results[0].score).toBe(35)
    expect(results[0].status).toBe('risky')
  })

  it('soldeApres within overdraft earns partial previsionnel 20pts', () => {
    // bal=100, overdraft=200, amount=150 → soldeApres=-50, previsionnel=-50>-200 → 20pts
    // marge=-50/100<0 → 0pts | prelevements: -50≤0 → 0pts
    // revenus: 0pts | budget: 0pts (overspent) | pref: 5pts = 25
    const acc = mkAcc({ bal: 100, overdraft: 200 })
    const D = mkD({ accounts: [acc], persoAccs: [acc], monthBudget: 1600, monthSpent: 1400 })
    const results = scoreAccounts([acc], [], 150, D, [])
    expect(results[0].breakdown.previsionnel).toBe(20)
    expect(results[0].score).toBe(25)
    expect(results[0].status).toBe('risky')
  })

  it('sorts results by score descending', () => {
    const acc1 = mkAcc({ id: 'a1', bal: 2000 })
    const acc2 = mkAcc({ id: 'a2', bal: 100 })
    const D = mkD({ accounts: [acc1, acc2], persoAccs: [acc1, acc2] })
    const results = scoreAccounts([acc1, acc2], [], 50, D, [])
    expect(results[0].score).toBeGreaterThan(results[1].score)
    expect(results[0].accountId).toBe('a1')
  })

  it('excludes Pro accounts when persoAccs is set', () => {
    const persoAcc = mkAcc({ id: 'a1', isPro: false })
    const proAcc = mkAcc({ id: 'a2', isPro: true })
    const D = mkD({ accounts: [persoAcc, proAcc], persoAccs: [persoAcc], proAccs: [proAcc] })
    const results = scoreAccounts([persoAcc, proAcc], [], 50, D, [])
    expect(results).toHaveLength(1)
    expect(results[0].accountId).toBe('a1')
  })

  it('marge >= 30% earns 20pts on breakdown.marge', () => {
    // bal=1000, amount=300 → soldeApres=700, marge=700/1000=70%≥30% → 20pts
    const acc = mkAcc({ bal: 1000 })
    const D = mkD({ accounts: [acc], persoAccs: [acc] })
    const results = scoreAccounts([acc], [], 300, D, [])
    expect(results[0].breakdown.marge).toBe(20)
  })

  it('recent income within 60 days earns 10pts on breakdown.revenus', () => {
    const acc = mkAcc({ bal: 500 })
    const incomeTx = mkTx({ account_id: 'a1', acc: 'a1', amt: 2000, tx_date: '2026-05-01' })
    const D = mkD({ accounts: [acc], persoAccs: [acc] })
    const results = scoreAccounts([acc], [], 50, D, [incomeTx])
    expect(results[0].breakdown.revenus).toBe(10)
  })

  it('budget over 80% earns 0pts on breakdown.budget', () => {
    const acc = mkAcc({ bal: 1000 })
    const D = mkD({
      accounts: [acc], persoAccs: [acc],
      monthBudget: 1600, monthSpent: 1400, // 87.5% > 80%
    })
    const results = scoreAccounts([acc], [], 50, D, [])
    expect(results[0].breakdown.budget).toBe(0)
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```
npx vitest run src/lib/__tests__/scoreAccounts.test.ts
```

Expected: FAIL — `Cannot find module '../scoreAccounts'`

- [ ] **Step 3: Créer `src/lib/scoreAccounts.ts`**

```ts
import type { Account, Recurring, AppData, Transaction } from '../types'

export type ScoreStatus = 'recommended' | 'acceptable' | 'risky' | 'discouraged'

export interface AccountScore {
  accountId: string
  score: number           // 0–100
  status: ScoreStatus
  previsionnel: number    // acc.bal - amount - committed
  soldeApres: number      // acc.bal - amount
  committed: number       // prélèvements restants dans 31j
  finDeMois: number       // alias de previsionnel
  breakdown: {
    previsionnel: number  // pts earned (0|20|40)
    marge: number         // pts earned (0|10|20)
    prelevements: number  // pts earned (0|15)
    revenus: number       // pts earned (0|10)
    budget: number        // pts earned (0|10)
    preference: number    // toujours 5
  }
}

export function scoreAccounts(
  accounts: Account[],
  recurrings: Recurring[],
  amount: number,
  D: AppData,
  allHistory: Transaction[]
): AccountScore[] {
  if (amount <= 0 || accounts.length === 0) return []

  // Filtrer aux comptes perso si disponibles
  const eligible = D.persoAccs && D.persoAccs.length > 0
    ? accounts.filter(a => D.persoAccs.some(p => p.id === a.id))
    : accounts
  const targets = eligible.length > 0 ? eligible : accounts

  // Date cutoff pour revenus récents (60 jours)
  const today = new Date()
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - 60)
  const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`

  // Critère budget : identique pour tous les comptes
  const budgetPts = D.monthBudget > 0 && D.monthSpent / D.monthBudget < 0.80 ? 10 : 0

  const results: AccountScore[] = targets.map(acc => {
    // Calcul committed : prélèvements récurrents dus dans 31j
    const committed = recurrings
      .filter(r => r.account_id === acc.id)
      .reduce((sum, r) => {
        const dayOfMonth = parseInt(String(r.date_label || '1'), 10)
        const next = new Date(today.getFullYear(), today.getMonth(), dayOfMonth)
        if (next < today) next.setMonth(next.getMonth() + 1)
        const daysUntil = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        return daysUntil <= 31 ? sum + parseFloat(String(r.amount)) : sum
      }, 0)

    const soldeApres = acc.bal - amount
    const previsionnel = soldeApres - committed
    const overdraft = parseFloat(String(acc.overdraft || 0))

    // a) Solde prévisionnel (40 pts)
    let prevPts = 0
    if (previsionnel > 0) prevPts = 40
    else if (previsionnel > -overdraft) prevPts = 20

    // b) Marge de sécurité (20 pts)
    let margePts = 0
    if (acc.bal > 0) {
      const marge = soldeApres / acc.bal
      if (marge >= 0.30) margePts = 20
      else if (marge >= 0.10) margePts = 10
    }

    // c) Prélèvements couverts (15 pts)
    const prelevPts = soldeApres > committed ? 15 : 0

    // d) Revenus récents sur ce compte dans 60j (10 pts)
    const hasRecentIncome = allHistory.some(tx =>
      (tx.acc === acc.id || tx.account_id === acc.id) &&
      tx.amt > 0 &&
      tx.tx_date >= cutoffStr
    )
    const revenusPts = hasRecentIncome ? 10 : 0

    // e) Budget mensuel (10 pts) — calculé avant la boucle
    // f) Préférence utilisateur (5 pts) — toujours 5

    const score = prevPts + margePts + prelevPts + revenusPts + budgetPts + 5

    let status: ScoreStatus
    if (score >= 70) status = 'recommended'
    else if (score >= 45) status = 'acceptable'
    else if (score >= 20) status = 'risky'
    else status = 'discouraged'

    return {
      accountId: acc.id,
      score,
      status,
      previsionnel,
      soldeApres,
      committed,
      finDeMois: previsionnel,
      breakdown: {
        previsionnel: prevPts,
        marge: margePts,
        prelevements: prelevPts,
        revenus: revenusPts,
        budget: budgetPts,
        preference: 5,
      },
    }
  })

  return results.sort((a, b) => b.score - a.score)
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

```
npx vitest run src/lib/__tests__/scoreAccounts.test.ts
```

Expected: 10 tests PASS

- [ ] **Step 5: Vérifier TypeScript**

```
npx tsc --noEmit
```

Expected: 0 erreurs

- [ ] **Step 6: Commit**

```bash
git add src/lib/scoreAccounts.ts src/lib/__tests__/scoreAccounts.test.ts
git commit -m "feat: add scoreAccounts pure function with 10 tests"
```

---

### Task 2: `AccountScoreCard.tsx` — composant carte compte

**Files:**
- Create: `src/components/AccountScoreCard.tsx`

- [ ] **Step 1: Créer `src/components/AccountScoreCard.tsx`**

```tsx
import { sp } from '../lib/theme'
import { fmt } from '../lib/currency'
import type { Theme, Account } from '../types'
import type { AccountScore, ScoreStatus } from '../lib/scoreAccounts'

interface AccountScoreCardProps {
  acc: Account
  score: AccountScore
  selected: boolean
  onSelect: (accountId: string) => void
  t: Theme
}

const STATUS_LABEL: Record<ScoreStatus, string> = {
  recommended: 'RECOMMANDÉ',
  acceptable: 'ACCEPTABLE',
  risky: 'RISQUÉ',
  discouraged: 'DÉCONSEILLÉ',
}

function statusColors(status: ScoreStatus, t: Theme) {
  switch (status) {
    case 'recommended': return { border: t.mint, bg: t.mD, badgeBg: t.mD, text: t.mint }
    case 'acceptable':  return { border: t.amber, bg: t.aD, badgeBg: t.aD, text: t.amber }
    case 'risky':       return { border: t.rose + '88', bg: t.rD + '88', badgeBg: t.rD + '88', text: t.rose }
    case 'discouraged': return { border: t.rose, bg: t.rD, badgeBg: t.rD, text: t.rose }
  }
}

export const AccountScoreCard = ({ acc, score, selected, onSelect, t }: AccountScoreCardProps) => {
  const cols = statusColors(score.status, t)
  const barPct = `${score.score}%`

  if (selected) {
    return (
      <button
        onClick={() => onSelect(acc.id)}
        style={{
          display: 'block', width: '100%', padding: '12px 14px',
          borderRadius: 14, background: cols.bg,
          border: `1.5px solid ${cols.border}`,
          cursor: 'pointer', textAlign: 'left', marginBottom: 8,
        }}
      >
        {/* Header: nom + badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 5, background: acc.col, flexShrink: 0 }} />
            <span style={{ fontSize: 13, ...sp('s', 600), color: cols.border }}>{acc.name}</span>
          </div>
          <div style={{
            background: cols.badgeBg, color: cols.text,
            fontSize: 8, ...sp('o', 700), padding: '2px 7px', borderRadius: 5,
          }}>
            {STATUS_LABEL[score.status]}
          </div>
        </div>

        {/* Barre score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <div style={{ flex: 1, height: 5, background: t.el, borderRadius: 3 }}>
            <div style={{
              width: barPct, height: '100%', background: cols.border,
              borderRadius: 3, transition: 'width .3s ease',
            }} />
          </div>
          <span style={{ fontSize: 10, ...sp('m', 700), color: cols.text, minWidth: 38 }}>
            {score.score}/100
          </span>
        </div>

        {/* 3 mini-cartes : Solde après / Prélèvements / Fin mois */}
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 1, background: t.card, borderRadius: 8, padding: '5px 7px' }}>
            <div style={{ fontSize: 9, ...sp('o'), color: t.muted, marginBottom: 2 }}>Solde après</div>
            <div style={{ fontSize: 11, ...sp('m', 600), color: score.soldeApres >= 0 ? t.tx : t.rose }}>
              {score.soldeApres < 0 ? '−' : ''}{fmt(Math.abs(score.soldeApres), 0)}
            </div>
          </div>
          <div style={{ flex: 1, background: t.card, borderRadius: 8, padding: '5px 7px' }}>
            <div style={{ fontSize: 9, ...sp('o'), color: t.muted, marginBottom: 2 }}>Prélèvements</div>
            <div style={{ fontSize: 11, ...sp('m', 600), color: score.committed > 0 ? t.amber : t.muted }}>
              {score.committed > 0 ? `−${fmt(score.committed, 0)}` : '— €'}
            </div>
          </div>
          <div style={{ flex: 1, background: t.card, borderRadius: 8, padding: '5px 7px' }}>
            <div style={{ fontSize: 9, ...sp('o'), color: t.muted, marginBottom: 2 }}>Fin mois</div>
            <div style={{ fontSize: 11, ...sp('m', 600), color: score.finDeMois >= 0 ? t.tx : t.rose }}>
              {score.finDeMois < 0 ? '−' : ''}{fmt(Math.abs(score.finDeMois), 0)}
            </div>
          </div>
        </div>
      </button>
    )
  }

  // Non-selected : compact
  return (
    <button
      onClick={() => onSelect(acc.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '10px 12px', borderRadius: 12,
        background: t.el, border: `1px solid ${t.bo}`,
        cursor: 'pointer', textAlign: 'left', marginBottom: 6,
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: 4, background: acc.col, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, ...sp('o', 500), color: t.sub }}>{acc.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
          <div style={{ flex: 1, height: 3, background: t.bo, borderRadius: 2 }}>
            <div style={{ width: barPct, height: '100%', background: cols.border, borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 9, ...sp('m', 600), color: cols.text, minWidth: 30 }}>
            {score.score}/100
          </span>
        </div>
      </div>
      <div style={{
        background: cols.badgeBg, color: cols.text,
        fontSize: 8, ...sp('o', 700), padding: '2px 6px', borderRadius: 5, flexShrink: 0,
      }}>
        {STATUS_LABEL[score.status]}
      </div>
    </button>
  )
}
```

- [ ] **Step 2: Vérifier TypeScript**

```
npx tsc --noEmit
```

Expected: 0 erreurs

- [ ] **Step 3: Commit**

```bash
git add src/components/AccountScoreCard.tsx
git commit -m "feat: add AccountScoreCard component (selected/compact variants)"
```

---

### Task 3: Modifier `ExpEntry.tsx` — intégrer le scoring

**Files:**
- Modify: `src/screens/modals/ExpEntry.tsx`

Context: ExpEntry se trouve dans `src/screens/modals/ExpEntry.tsx`. Il a déjà un bloc "ASSISTANT PAYER AVEC..." (lignes ~239–335) qui affiche les comptes avec une logique ARD basique. Ce bloc sera entièrement remplacé. L'état `acc` (string accountId) sera renommé `selectedAccId`.

- [ ] **Step 1: Mettre à jour les imports**

Trouver la ligne :
```ts
import { useState, useMemo } from 'react'
```

Remplacer par :
```ts
import { useState, useMemo, useEffect } from 'react'
```

Ajouter après la ligne `import type { Theme, AppData, Transaction, Recurring, Group, Member } from '../../types'` :
```ts
import { scoreAccounts } from '../../lib/scoreAccounts'
import { AccountScoreCard } from '../../components/AccountScoreCard'
```

- [ ] **Step 2: Renommer l'état `acc` → `selectedAccId`**

Trouver :
```ts
  const [acc, setAcc] = useState(D.accounts[0] ? D.accounts[0].id : '')
```

Remplacer par :
```ts
  const [selectedAccId, setSelectedAccId] = useState(D.accounts[0] ? D.accounts[0].id : '')
```

- [ ] **Step 3: Mettre à jour `applySuggestion`**

Trouver dans `applySuggestion` :
```ts
    if (accExists) setAcc(s.accId)
```

Remplacer par :
```ts
    if (accExists) setSelectedAccId(s.accId)
```

- [ ] **Step 4: Ajouter `scores` useMemo et `useEffect` auto-sélection**

Trouver la ligne :
```ts
  const suggestions = showSuggestions ? searchMerchants(note, memory, 4) : []
```

Ajouter APRÈS cette ligne :

```ts
  const scores = useMemo(() => {
    const n = parseFloat((amount || '0').replace(',', '.'))
    if (n <= 0) return []
    return scoreAccounts(D.accounts, recurrings, n, D, allHistory)
  }, [amount, D, recurrings, allHistory])

  useEffect(() => {
    if (scores.length > 0) setSelectedAccId(scores[0].accountId)
  }, [scores])
```

- [ ] **Step 5: Remplacer le bloc "Payer avec…" par la zone scoring**

Trouver et supprimer tout le bloc suivant (du commentaire jusqu'à la fin du IIFE) :
```tsx
        {/* ASSISTANT "PAYER AVEC..." */}
        {D.accounts.length>0&&(()=>{
          const n=parseFloat((amount||'0').replace(',','.'))
          const ardMap=calcARD(D.accounts,recurrings||[])
          return(
            <div style={{marginBottom:20}}>
              ...
            </div>
          )
        })()}
```

Remplacer par :

```tsx
        {/* SCORING — QUEL COMPTE UTILISER ? */}
        {D.accounts.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, ...sp('s', 700), color: t.sub, letterSpacing: 1,
              textTransform: 'uppercase', marginBottom: 8 }}>
              {scores.length > 0 ? 'Quel compte utiliser ?' : 'Payer avec…'}
            </div>
            {scores.length > 0 ? (
              scores.map(s => {
                const a = D.accounts.find(ac => ac.id === s.accountId)
                if (!a) return null
                return (
                  <AccountScoreCard
                    key={s.accountId}
                    acc={a}
                    score={s}
                    selected={selectedAccId === s.accountId}
                    onSelect={setSelectedAccId}
                    t={t}
                  />
                )
              })
            ) : (
              D.accounts.map(a => (
                <button key={a.id} onClick={() => setSelectedAccId(a.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                    padding: '13px 14px', borderRadius: 16, marginBottom: 8,
                    background: selectedAccId === a.id ? a.col + '18' : t.el,
                    border: '1.5px solid ' + (selectedAccId === a.id ? a.col + '88' : t.bo),
                    cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 5, background: a.col, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, ...sp('s', 600),
                    color: selectedAccId === a.id ? a.col : t.tx, flex: 1 }}>
                    {a.name}
                  </span>
                  <span style={{ fontSize: 13, ...sp('m', 500), color: t.sub }}>
                    {fmt(a.bal, 0)}
                  </span>
                  {selectedAccId === a.id && (
                    <div style={{ width: 22, height: 22, borderRadius: 11, background: a.col,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>✓</div>
                  )}
                </button>
              ))
            )}
          </div>
        )}
```

- [ ] **Step 6: Mettre à jour le toggle Pro/Perso**

Trouver dans le toggle Pro/Perso :
```ts
          const selAcc=D.accounts.find(a=>a.id===acc)
```

Remplacer par :
```ts
          const selAcc=D.accounts.find(a=>a.id===selectedAccId)
```

- [ ] **Step 7: Mettre à jour le bouton valider**

Trouver et remplacer le bouton submit entier :

```tsx
        <button onClick={async()=>{
          const selAcc=D.accounts.find(a=>a.id===acc)
          const finalCat=selAcc?.isPro&&isProPerso?'Dépense perso':cat
          const n=parseFloat(amount.replace(',','.'))
          if(!n||n<=0||!acc)return
          setSaving(true)
          const catO2=CATS_E.find(c=>c.n===finalCat)||catO
          await onSave({merchant:note||finalCat,category:finalCat,icon:catO2.ico,
            amount:n,account_id:acc,group_id:isGroup&&group?group.id:null,paid_by:isGroup?paidBy:null})
          setSaving(false);onClose()
        }} disabled={saving||!amount||!acc}
          style={{width:'100%',padding:'15px',border:'none',borderRadius:16,
            cursor:saving||!amount||!acc?'default':'pointer',...sp('o',700),fontSize:15,
            background:saving||!amount||!acc?t.el:'linear-gradient(135deg,'+t.mint+',#08C4A0)',
            color:saving||!amount||!acc?t.sub:'#0F1117'}}>
          {saving?'Enregistrement…':'Ajouter'}
        </button>
```

Remplacer par :

```tsx
        <button onClick={async()=>{
          const selAcc=D.accounts.find(a=>a.id===selectedAccId)
          const finalCat=selAcc?.isPro&&isProPerso?'Dépense perso':cat
          const n=parseFloat(amount.replace(',','.'))
          if(!n||n<=0||!selectedAccId)return
          setSaving(true)
          const catO2=CATS_E.find(c=>c.n===finalCat)||catO
          await onSave({merchant:note||finalCat,category:finalCat,icon:catO2.ico,
            amount:n,account_id:selectedAccId,group_id:isGroup&&group?group.id:null,paid_by:isGroup?paidBy:null})
          setSaving(false);onClose()
        }} disabled={saving||!amount||!selectedAccId}
          style={{width:'100%',padding:'15px',border:'none',borderRadius:16,
            cursor:saving||!amount||!selectedAccId?'default':'pointer',...sp('o',700),fontSize:15,
            background:saving||!amount||!selectedAccId?t.el:'linear-gradient(135deg,'+t.mint+',#08C4A0)',
            color:saving||!amount||!selectedAccId?t.sub:'#0F1117'}}>
          {saving?'Enregistrement…':selectedAccId
            ?`✓ ${D.accounts.find(a=>a.id===selectedAccId)?.name||'Enregistrer'}`
            :'Ajouter'}
        </button>
```

- [ ] **Step 8: Vérifier TypeScript**

```
npx tsc --noEmit
```

Expected: 0 erreurs

- [ ] **Step 9: Lancer la suite de tests complète**

```
npx vitest run
```

Expected: tous les tests passent (38+ existants + 10 nouveaux scoreAccounts = 48+)

- [ ] **Step 10: Build de production**

```
npm run build
```

Expected: build ✅ (warning chunk size OK, 0 erreurs)

- [ ] **Step 11: Commit**

```bash
git add src/screens/modals/ExpEntry.tsx
git commit -m "feat: integrate account scoring into ExpEntry with auto-select and override"
```

---

## Self-Review

**Spec coverage:**
- ✅ `scoreAccounts` : types `AccountScore`/`ScoreStatus` exportés, signature correcte
- ✅ Algorithme 6 critères : 40+20+15+10+10+5 pts
- ✅ Statuts : recommended/acceptable/risky/discouraged avec seuils 70/45/20
- ✅ Tri par score décroissant
- ✅ Filtre comptes Pro si persoAccs disponible
- ✅ Edge cases : amount≤0 → [], accounts vide → []
- ✅ `AccountScoreCard` : selected (barre large + 3 mini-cartes) + non-selected (compact)
- ✅ Badge colors par status
- ✅ ExpEntry : useMemo scores, useEffect auto-select, zone scoring remplace "Payer avec…"
- ✅ Fallback : amount=0 → liste comptes simple sans scoring
- ✅ Bouton valider : nom du compte sélectionné
- ✅ 10 tests couvrant les 10 cas du spec

**Placeholder scan:** Aucun TBD/TODO — tout le code est complet.

**Type consistency:**
- `AccountScore` défini dans `scoreAccounts.ts`, importé dans `AccountScoreCard.tsx` et `ExpEntry.tsx` ✅
- `ScoreStatus` défini dans `scoreAccounts.ts`, utilisé dans `statusColors` et `STATUS_LABEL` ✅
- `selectedAccId` renommé partout dans `ExpEntry.tsx` (4 occurrences) ✅
- `fmt(value, 0)` — deuxième argument pour zéro décimales, cohérent avec usage existant dans `ExpEntry.tsx` ligne 285 ✅

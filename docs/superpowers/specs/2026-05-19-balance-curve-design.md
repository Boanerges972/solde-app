# Balance Evolution Curve — Design Spec

**Date:** 2026-05-19  
**Status:** Approved

## Goal

Replace the "Semaines" tab in the Analyse screen with an "Évolution" tab showing a per-account balance evolution curve over a selectable period (7d / 1m / 3m), with a touch tooltip and minimum balance highlight.

## Architecture

### New file
- `src/components/BalanceCurve.tsx` — isolated SVG chart component

### Modified file
- `src/screens/Analyse.tsx` — add `buildBalanceHistory`, state for period/account, replace "Semaines" tab content with "Évolution"

### No new dependencies — SVG pur, same pattern as existing `DonutCats`

---

## Component: `BalanceCurve`

**Location:** `src/components/BalanceCurve.tsx`

**Props:**
```ts
interface BalanceCurveProps {
  points: { date: string; bal: number }[]  // sorted ascending by date
  color: string                             // account color (acc.col)
  t: Theme
  height?: number                           // default 160
}
```

**Renders:**
- SVG with viewBox scaled to container width (375px - 32px margins = 343px)
- Background: 3 horizontal dashed gridlines at 25%, 50%, 75% of Y range
- Y axis labels: 3 amounts (min, mid, max) on left edge
- X axis labels: 4 evenly-spaced dates at bottom
- Area fill: vertical gradient from `color + '33'` at top to `color + '00'` at bottom
- Curve: `<path>` with cubic bezier smoothing, `stroke=color`, `strokeWidth=2`, `fill=none`
- Min point: circle `r=5`, `fill=t.rose`, at the lowest balance point; label `★ min: {fmt(bal)}` below
- Touch interaction: `onTouchStart`/`onTouchMove` on SVG → compute nearest point index → show tooltip
- Tooltip: absolutely positioned `<div>` above touched point, `background=t.card`, shows `{date} · {fmt(bal)}`
- Vertical touch line: thin `stroke=t.sub` line from top to bottom at touched X

**State (internal):**
```ts
const [touchIdx, setTouchIdx] = useState<number | null>(null)
```

**Empty state:** if `points.length < 2`, render centered text "Pas assez de données"

---

## Function: `buildBalanceHistory`

**Location:** Inside `src/screens/Analyse.tsx` (top-level function, before component)

**Signature:**
```ts
function buildBalanceHistory(
  account: Account,
  allTxs: Transaction[],
  days: number
): { date: string; bal: number }[]
```

**Algorithm:**
1. Filter transactions: `tx.account_id === account.id || tx.acc === account.id`
2. Filter to date range: only transactions within last `days` days
3. Sort filtered txs by `tx_date` descending
4. Start from `currentBal = account.bal` (today's balance)
5. Walk backwards: for each tx (newest first), `currentBal -= tx.amt` to undo it → records `{ date: tx.tx_date, bal: currentBal }` as the balance BEFORE that transaction (expense tx.amt=-50 → currentBal +=50, deposit tx.amt=+500 → currentBal -=500)
6. Add today's point: `{ date: today, bal: account.bal }`
7. Sort all points ascending by date
8. Fill gaps: for each calendar day in range with no transaction, copy previous day's balance (step interpolation)
9. Downsample to max 60 points if range is large (take every Nth point)
10. Return array sorted ascending

**Edge cases:**
- No transactions in range → returns `[{ date: today, bal: account.bal }]` (single point → empty state)
- Negative balances → supported (Y axis adapts)
- `allHistory` preferred, `allTxs` as fallback

---

## UI in Analyse.tsx

### Tab rename
`['semaines', 'Semaines']` → `['evolution', 'Évolution']`

### New state
```ts
const [evoPeriod, setEvoPeriod] = useState<7 | 30 | 90>(30)
const [evoAccId, setEvoAccId] = useState<string>(() => D.accounts[0]?.id ?? '')
```

### Tab content layout
```
┌─────────────────────────────────────────┐
│ [Compte Principal ▾]   [7j] [1m] [3m]  │  ← account dropdown + period pills
├─────────────────────────────────────────┤
│ 1 234 €    ↑ +234 € sur la période     │  ← KPI: current bal + delta
├─────────────────────────────────────────┤
│                                         │
│     SVG BalanceCurve                    │  ← height=160
│                                         │
└─────────────────────────────────────────┘
```

### KPI delta
```ts
const delta = points.length >= 2 
  ? account.bal - points[0].bal 
  : 0
```
Color: `delta >= 0 ? t.mint : t.rose`  
Arrow: `delta >= 0 ? '↑' : '↓'`

### Account dropdown
Native `<select>` styled to match app theme (background: `t.el`, border: `t.bo`, color: `t.tx`).  
Lists all `D.accounts` by name.

### Period pills
3 buttons: `7j`, `1m`, `3m` → set `evoPeriod` to `7`, `30`, `90`.  
Active: `background: t.mD, color: t.mint, border: t.mint+'44'`  
Inactive: `background: t.el, color: t.sub`

---

## Visual Details

| Element | Style |
|---------|-------|
| Curve stroke | `acc.col` or `t.mint` fallback |
| Area fill | gradient `acc.col+'33'` → `acc.col+'00'` |
| Min point | `fill: t.rose`, radius 5 |
| Gridlines | dashed, `t.bo` color |
| Tooltip | `background: t.card`, `border: t.bo`, `borderRadius: 10` |
| Vertical touch line | `stroke: t.sub+'66'`, `strokeWidth: 1` |

---

## Error / Empty States

| Condition | Display |
|-----------|---------|
| `points.length < 2` | "Pas assez de données pour cette période" |
| `D.accounts.length === 0` | "Aucun compte — ajoutez un compte d'abord" |
| `allHistory` empty, `allTxs` empty | Same as < 2 points |

---

## What Is NOT in Scope

- No library dependency (recharts, chart.js, etc.)
- No multi-account overlay
- No export of the chart
- No animation beyond CSS transition on mount
- No changes to other tabs (Aperçu, Abonnements, Prévisions)

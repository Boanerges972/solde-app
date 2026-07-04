# Balance Evolution Curve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Semaines" tab in Analyse with an "Évolution" tab showing a per-account balance curve (7d/1m/3m) with touch tooltip and minimum balance highlight.

**Architecture:** Pure SVG chart (no new dependencies). `buildBalanceHistory` extracted to `src/lib/buildBalanceHistory.ts` for testability. `BalanceCurve` is an isolated SVG component. Analyse.tsx wired to use both.

**Tech Stack:** React 18, TypeScript 5, SVG, Vitest (for buildBalanceHistory tests)

---

### Task 1: `buildBalanceHistory` utility + tests

**Files:**
- Create: `src/lib/buildBalanceHistory.ts`
- Create: `src/lib/__tests__/buildBalanceHistory.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/buildBalanceHistory.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildBalanceHistory } from '../buildBalanceHistory'
import type { Account, Transaction } from '../../types'

// Pin date to 2026-05-19
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-05-19T12:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

const ACC: Account = { id: 'acc1', name: 'Test', bal: 1000, col: '#0f0', type: 'Courant', overdraft: 0 } as Account

function tx(date: string, amt: number, accId = 'acc1'): Transaction {
  return { id: date + amt, tx_date: date, amt, acc: accId, cat: 'Test', m: 'Merchant', account_id: accId } as unknown as Transaction
}

describe('buildBalanceHistory', () => {
  it('no transactions → all days have account.bal', () => {
    const pts = buildBalanceHistory(ACC, [], 7)
    expect(pts).toHaveLength(8) // 7 past days + today
    pts.forEach(p => expect(p.bal).toBe(1000))
    expect(pts[pts.length - 1].date).toBe('2026-05-19')
    expect(pts[0].date).toBe('2026-05-12')
  })

  it('expense -50 on May 18 → May 18 bal=1000 (end-of-day after deduction), May 17 bal=1050', () => {
    const pts = buildBalanceHistory(ACC, [tx('2026-05-18', -50)], 7)
    const may18 = pts.find(p => p.date === '2026-05-18')!
    const may17 = pts.find(p => p.date === '2026-05-17')!
    expect(may18.bal).toBe(1000)   // today's bal=1000 includes this expense already
    expect(may17.bal).toBe(1050)   // before the expense
  })

  it('deposit +500 on May 17 → May 17 bal=1000 (end-of-day), May 16 bal=500', () => {
    const pts = buildBalanceHistory(ACC, [tx('2026-05-17', 500)], 7)
    const may17 = pts.find(p => p.date === '2026-05-17')!
    const may16 = pts.find(p => p.date === '2026-05-16')!
    expect(may17.bal).toBe(1000)
    expect(may16.bal).toBe(500)
  })

  it('filters out transactions from other accounts', () => {
    const pts = buildBalanceHistory(ACC, [tx('2026-05-18', -200, 'other-acc')], 7)
    pts.forEach(p => expect(p.bal).toBe(1000))
  })

  it('filters out transactions outside date range', () => {
    const pts = buildBalanceHistory(ACC, [tx('2026-05-01', -300)], 7)
    // May 1 is outside 7-day window (cutoff = May 12)
    pts.forEach(p => expect(p.bal).toBe(1000))
  })

  it('gap fill: tx on May 15 (-100) → May 16+ show 1000, May 14 and before show 1100', () => {
    const pts = buildBalanceHistory(ACC, [tx('2026-05-15', -100)], 7)
    const may16 = pts.find(p => p.date === '2026-05-16')!
    const may15 = pts.find(p => p.date === '2026-05-15')!
    const may14 = pts.find(p => p.date === '2026-05-14')!
    expect(may16.bal).toBe(1000)
    expect(may15.bal).toBe(1000)  // end-of-day on May 15 includes the -100
    expect(may14.bal).toBe(1100) // before the -100 was applied
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run src/lib/__tests__/buildBalanceHistory.test.ts
```

Expected: FAIL with "Cannot find module '../buildBalanceHistory'"

- [ ] **Step 3: Implement `buildBalanceHistory`**

Create `src/lib/buildBalanceHistory.ts`:

```ts
import type { Account, Transaction } from '../types'

export function buildBalanceHistory(
  account: Account,
  allTxs: Transaction[],
  days: number
): { date: string; bal: number }[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().slice(0, 10)
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  // Filter to this account and this date range
  const accountTxs = allTxs.filter(tx =>
    (tx.account_id === account.id || tx.acc === account.id) &&
    tx.tx_date >= cutoffStr &&
    tx.tx_date <= todayStr
  )

  // Net balance change per date
  const netByDate: Record<string, number> = {}
  for (const tx of accountTxs) {
    netByDate[tx.tx_date] = (netByDate[tx.tx_date] || 0) + tx.amt
  }

  // Generate all calendar days in range (cutoff → today inclusive)
  const dates: string[] = []
  const cursor = new Date(cutoff)
  while (cursor <= today) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() + 1)
  }

  // Walk backwards: end-of-day balance for each date
  // Start from today's current balance (account.bal = balance after all txs today)
  const result: { date: string; bal: number }[] = []
  let bal = account.bal
  for (let i = dates.length - 1; i >= 0; i--) {
    const date = dates[i]
    result.unshift({ date, bal: parseFloat(bal.toFixed(2)) })
    // Undo this day's net change to get balance at start of day (= end of previous day)
    bal -= (netByDate[date] || 0)
  }

  // Downsample to max 60 points for large ranges
  if (result.length <= 60) return result
  const step = Math.ceil(result.length / 60)
  return result.filter((_, i) => i % step === 0 || i === result.length - 1)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run src/lib/__tests__/buildBalanceHistory.test.ts
```

Expected: 6/6 PASS

- [ ] **Step 5: Run full test suite to verify no regression**

```
npx vitest run
```

Expected: all tests PASS (27 existing + 6 new = 33 total)

- [ ] **Step 6: Commit**

```bash
git add src/lib/buildBalanceHistory.ts src/lib/__tests__/buildBalanceHistory.test.ts
git commit -m "feat: add buildBalanceHistory utility with 6 tests"
```

---

### Task 2: `BalanceCurve` SVG component

**Files:**
- Create: `src/components/BalanceCurve.tsx`

No unit tests — pure rendering, tested visually in Task 3 integration.

- [ ] **Step 1: Create the component**

Create `src/components/BalanceCurve.tsx`:

```tsx
import { useState } from 'react'
import { fmt } from '../lib/currency'
import type { Theme } from '../types'

interface BalanceCurveProps {
  points: { date: string; bal: number }[]
  color: string
  t: Theme
  height?: number
}

const PAD = { top: 20, right: 8, bottom: 24, left: 52 }
const W = 303 // 375 - 2×16 page padding - 2×20 card padding

export const BalanceCurve = ({ points, color, t, height = 160 }: BalanceCurveProps) => {
  const [touchIdx, setTouchIdx] = useState<number | null>(null)

  if (points.length < 2) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.sub, fontSize: 13 }}>
        Pas assez de données pour cette période
      </div>
    )
  }

  const innerW = W - PAD.left - PAD.right
  const innerH = height - PAD.top - PAD.bottom
  const bals = points.map(p => p.bal)
  const minBal = Math.min(...bals)
  const maxBal = Math.max(...bals)
  const range = maxBal - minBal || 1

  const xOf = (i: number) => PAD.left + (i / (points.length - 1)) * innerW
  const yOf = (bal: number) => PAD.top + (1 - (bal - minBal) / range) * innerH

  // Cubic bezier path
  const pathD = points.reduce((acc, p, i) => {
    const x = xOf(i), y = yOf(p.bal)
    if (i === 0) return `M ${x} ${y}`
    const px = xOf(i - 1), py = yOf(points[i - 1].bal)
    const cp = (x - px) * 0.4
    return `${acc} C ${px + cp} ${py}, ${x - cp} ${y}, ${x} ${y}`
  }, '')

  // Area fill path (close below the curve)
  const areaD = `${pathD} L ${xOf(points.length - 1)} ${height - PAD.bottom} L ${xOf(0)} ${height - PAD.bottom} Z`

  // Min point
  const minIdx = bals.indexOf(minBal)

  // Gridlines at 25%, 50%, 75%
  const gridBals = [0.25, 0.5, 0.75].map(r => minBal + r * range)

  // X-axis labels: 4 evenly spaced
  const xLabelIdxs = [0, Math.floor(points.length / 3), Math.floor(2 * points.length / 3), points.length - 1]

  const handleTouch = (e: React.TouchEvent<SVGSVGElement>) => {
    e.preventDefault()
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    const touchX = e.touches[0].clientX - rect.left
    // Find nearest point index
    let bestIdx = 0
    let bestDist = Infinity
    points.forEach((_, i) => {
      const dist = Math.abs(xOf(i) - touchX)
      if (dist < bestDist) { bestDist = dist; bestIdx = i }
    })
    setTouchIdx(bestIdx)
  }

  const gradId = `bcGrad-${color.replace('#', '')}`
  const touchPt = touchIdx !== null ? points[touchIdx] : null

  return (
    <div style={{ position: 'relative', width: W, height }}>
      <svg
        width={W}
        height={height}
        viewBox={`0 0 ${W} ${height}`}
        style={{ overflow: 'visible', touchAction: 'none' }}
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        onTouchEnd={() => setTouchIdx(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color + '33'} />
            <stop offset="100%" stopColor={color + '00'} />
          </linearGradient>
        </defs>

        {/* Gridlines */}
        {gridBals.map((bal, i) => (
          <line
            key={i}
            x1={PAD.left} y1={yOf(bal)} x2={W - PAD.right} y2={yOf(bal)}
            stroke={t.bo} strokeWidth={1} strokeDasharray="4 4"
          />
        ))}

        {/* Y-axis labels */}
        {[minBal, minBal + range / 2, maxBal].map((bal, i) => (
          <text key={i} x={PAD.left - 4} y={yOf(bal) + 4}
            textAnchor="end" fontSize={9} fill={t.sub}
            fontFamily="system-ui, sans-serif"
          >
            {fmt(bal)}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabelIdxs.map((idx, i) => (
          <text key={i} x={xOf(idx)} y={height - 4}
            textAnchor={i === 0 ? 'start' : i === xLabelIdxs.length - 1 ? 'end' : 'middle'}
            fontSize={9} fill={t.sub} fontFamily="system-ui, sans-serif"
          >
            {points[idx].date.slice(5)} {/* MM-DD */}
          </text>
        ))}

        {/* Area fill */}
        <path d={areaD} fill={`url(#${gradId})`} />

        {/* Curve */}
        <path d={pathD} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />

        {/* Min point */}
        <circle cx={xOf(minIdx)} cy={yOf(minBal)} r={5} fill={t.rose} />
        <text
          x={xOf(minIdx)} y={yOf(minBal) + 16}
          textAnchor="middle" fontSize={9} fill={t.rose}
          fontFamily="system-ui, sans-serif"
        >
          ★ min: {fmt(minBal)}
        </text>

        {/* Touch vertical line */}
        {touchIdx !== null && (
          <line
            x1={xOf(touchIdx)} y1={PAD.top}
            x2={xOf(touchIdx)} y2={height - PAD.bottom}
            stroke={t.sub + '66'} strokeWidth={1}
          />
        )}
      </svg>

      {/* Touch tooltip */}
      {touchPt && (
        <div style={{
          position: 'absolute',
          left: Math.min(Math.max(xOf(touchIdx!) - 50, 0), W - 110),
          top: Math.max(yOf(touchPt.bal) - 36, 0),
          background: t.card,
          border: '1px solid ' + t.bo,
          borderRadius: 10,
          padding: '4px 10px',
          fontSize: 12,
          color: t.tx,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          fontFamily: 'system-ui, sans-serif',
        }}>
          {touchPt.date} · {fmt(touchPt.bal)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors related to BalanceCurve.tsx

- [ ] **Step 3: Commit**

```bash
git add src/components/BalanceCurve.tsx
git commit -m "feat: add BalanceCurve SVG component"
```

---

### Task 3: Wire into `Analyse.tsx`

**Files:**
- Modify: `src/screens/Analyse.tsx`

**What to change:**

1. Add imports at top
2. Add state for `evoPeriod` and `evoAccId`
3. Rename tab `'semaines'` → `'evolution'`, `'Semaines'` → `'Évolution'`
4. Replace the entire `{view === 'semaines' && (...)}` block (lines 363–439) with the evolution tab content

- [ ] **Step 1: Add imports**

In `src/screens/Analyse.tsx`, modify the import block at the top. Current line 1–4:

```ts
import { useState } from 'react'
import { sp } from '../lib/theme'
import { fmt, fmtS } from '../lib/currency'
import type { Theme, AppData, Transaction } from '../types'
```

Replace with:

```ts
import { useState } from 'react'
import { sp } from '../lib/theme'
import { fmt, fmtS } from '../lib/currency'
import { buildBalanceHistory } from '../lib/buildBalanceHistory'
import { BalanceCurve } from '../components/BalanceCurve'
import type { Theme, AppData, Transaction } from '../types'
```

- [ ] **Step 2: Add evolution state**

After line 115 (`const [view, setView] = useState('apercu')`), add:

```ts
  const [evoPeriod, setEvoPeriod] = useState<7 | 30 | 90>(30)
  const [evoAccId, setEvoAccId] = useState<string>(() => D.accounts[0]?.id ?? '')
```

- [ ] **Step 3: Rename the tab**

On line 212, change:

```ts
  const tabItems: [string, string][] = [
    ['apercu', 'Aperçu'], ['semaines', 'Semaines'], ['abonnements', 'Abonnements'], ['previsions', 'Prévisions']
  ]
```

To:

```ts
  const tabItems: [string, string][] = [
    ['apercu', 'Aperçu'], ['evolution', 'Évolution'], ['abonnements', 'Abonnements'], ['previsions', 'Prévisions']
  ]
```

- [ ] **Step 4: Replace the semaines block**

Find this block (lines 363–439 in the original file):

```tsx
        {/* ════════ SEMAINES ════════ */}
        {view === 'semaines' && (
          <div>
            ...entire semaines content...
          </div>
        )}
```

Replace with:

```tsx
        {/* ════════ ÉVOLUTION ════════ */}
        {view === 'evolution' && (() => {
          const evoAcc = D.accounts.find(a => a.id === evoAccId) ?? D.accounts[0]
          if (!evoAcc) return (
            <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: t.muted }}>
              Aucun compte — ajoutez un compte d'abord
            </div>
          )
          const evoPoints = buildBalanceHistory(evoAcc, allTxs, evoPeriod)
          const evoDelta = evoPoints.length >= 2 ? evoAcc.bal - evoPoints[0].bal : 0
          const deltaColor = evoDelta >= 0 ? t.mint : t.rose
          const deltaArrow = evoDelta >= 0 ? '↑' : '↓'
          const periodDays: { label: string; value: 7 | 30 | 90 }[] = [
            { label: '7j', value: 7 },
            { label: '1m', value: 30 },
            { label: '3m', value: 90 },
          ]
          return (
            <div style={{ background: t.card, borderRadius: 20, border: '1px solid ' + t.bo, padding: '20px', marginBottom: 12 }}>
              {/* Controls row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                {/* Account dropdown */}
                <select
                  value={evoAccId}
                  onChange={e => setEvoAccId(e.target.value)}
                  style={{
                    background: t.el, border: '1px solid ' + t.bo, color: t.tx,
                    borderRadius: 10, padding: '6px 10px', fontSize: 13,
                    ...sp('o', 500), cursor: 'pointer', outline: 'none', maxWidth: 160,
                  }}
                >
                  {D.accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                {/* Period pills */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {periodDays.map(({ label, value }) => (
                    <button
                      key={value}
                      onClick={() => setEvoPeriod(value)}
                      style={{
                        padding: '5px 10px', borderRadius: 8, border: '1px solid',
                        cursor: 'pointer', fontSize: 12, ...sp('o', 600),
                        background: evoPeriod === value ? t.mD : t.el,
                        color: evoPeriod === value ? t.mint : t.sub,
                        borderColor: evoPeriod === value ? t.mint + '44' : t.bo,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* KPI row */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
                <span style={{ fontSize: 22, ...sp('m', 600), color: t.tx }}>{fmtS(evoAcc.bal)}</span>
                <span style={{ fontSize: 13, ...sp('o', 500), color: deltaColor }}>
                  {deltaArrow} {evoDelta >= 0 ? '+' : ''}{fmtS(evoDelta)} sur la période
                </span>
              </div>

              {/* Curve */}
              <BalanceCurve
                points={evoPoints}
                color={evoAcc.col || t.mint}
                t={t}
                height={160}
              />
            </div>
          )
        })()}
```

- [ ] **Step 5: Verify TypeScript compiles**

```
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Run full test suite**

```
npx vitest run
```

Expected: 33/33 PASS

- [ ] **Step 7: Commit**

```bash
git add src/screens/Analyse.tsx
git commit -m "feat: replace Semaines tab with Évolution balance curve"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ `buildBalanceHistory` signature matches spec
- ✅ Algorithm: net-by-date aggregation, backwards iteration, end-of-day semantics
- ✅ Downsample to max 60 points
- ✅ Edge case: no txs → all days = account.bal (single point would fail, but 7d range gives 8 points → fine)
- ✅ `BalanceCurve`: gradient fill, bezier path, 3 gridlines, 4 X labels, Y labels, min circle+label
- ✅ Touch: `onTouchStart`/`onTouchMove` → nearest idx → vertical line + tooltip
- ✅ Empty state: `points.length < 2`
- ✅ Analyse: tab renamed `evolution`/`Évolution`
- ✅ State: `evoPeriod` (30 default), `evoAccId` (first account)
- ✅ KPI: current bal + delta with arrow + color
- ✅ Account dropdown with theme styling
- ✅ Period pills 7j/1m/3m with active styling
- ✅ No new npm dependencies

**Placeholder scan:** None found — all code is complete.

**Type consistency:** `Account`, `Transaction`, `Theme` from `'../types'` used consistently. `buildBalanceHistory` signature matches between test file and implementation. `BalanceCurve` props consistent between definition and usage.
